"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { inr } from "@/lib/format";
import { dateTimeLocal, num, text } from "@/lib/validate";

// Totals are computed by the database (ROUND(qty × rate, 2)) — the same formula its CHECK rule enforces.

export const createOrder = guarded("createOrder", async (_prev, formData) => {
  const user = await requireUser();
  const customerId = Number(formData.get("customer_id"));
  const orderedQty = num(formData.get("ordered_qty"));
  const rate = num(formData.get("rate"));

  if (!customerId) return { error: "Choose a customer (or add a new one)." };
  if (!(orderedQty > 0)) return { error: "Quantity must be more than 0." };
  if (!(rate > 0)) return { error: "Rate must be more than 0." };

  return transaction(async (tx) => {
    const [customer] = await tx.query("SELECT name FROM customers WHERE id = ?", [customerId]);
    if (!customer) return { error: "That customer no longer exists." };
    const res = await tx.query(
      `INSERT INTO orders (customer_id, ordered_qty, rate, total_amount, booked_by, request_id)
       VALUES (?, ?, ?, ROUND(? * ?, 2), ?, ?)`,
      [customerId, orderedQty, rate, orderedQty, rate, user.id, requestId(formData)],
    );
    const [{ total_amount: total }] = await tx.query("SELECT total_amount FROM orders WHERE id = ?", [res.insertId]);
    await audit(tx, user, "order.book", "order", res.insertId, { customerId, orderedQty, rate, total });
    revalidatePath("/", "layout");
    return { ok: true, message: `Order #${res.insertId} booked for ${customer.name} — ${inr(total)}`, id: res.insertId };
  });
});

export const deliverOrder = guarded("deliverOrder", async (_prev, formData) => {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const vehicle = text(formData.get("vehicle_number"), 20).toUpperCase().replace(/\s+/g, " ");
  const arrival = dateTimeLocal(formData.get("arrival_time"));
  const dispatch = dateTimeLocal(formData.get("dispatch_time"));
  const deliveredQty = num(formData.get("delivered_qty"));
  const paid = num(formData.get("paid_amount") || 0);

  if (!vehicle) return { error: "Enter the vehicle number." };
  if (!arrival || !dispatch) return { error: "Enter both vehicle arrival and dispatch time." };
  if (dispatch < arrival) return { error: "Dispatch time can't be before arrival time." };
  if (!(deliveredQty > 0)) return { error: "Delivered quantity must be more than 0." };
  if (!(paid >= 0)) return { error: "Paid amount can't be negative." };

  const result = await transaction(async (tx) => {
    // Lock the row so two people can't complete the same order at once.
    const [order] = await tx.query("SELECT status FROM orders WHERE id = ? FOR UPDATE", [id]);
    if (!order) return { error: "Order not found." };
    if (order.status !== "pending") return { error: "This order has already been completed or cancelled." };

    await tx.query(
      `UPDATE orders SET status = 'delivered', vehicle_number = ?, arrival_time = ?, dispatch_time = ?,
         delivered_qty = ?, total_amount = ROUND(? * rate, 2), paid_amount = ?,
         balance_amount = ROUND(? * rate, 2) - ?, delivered_by = ?, delivered_at = NOW()
       WHERE id = ?`,
      [vehicle, arrival, dispatch, deliveredQty, deliveredQty, paid, deliveredQty, paid, user.id, id],
    );
    const [after] = await tx.query("SELECT total_amount, balance_amount FROM orders WHERE id = ?", [id]);
    await audit(tx, user, "order.deliver", "order", id, {
      vehicle, arrival, dispatch, deliveredQty, paid, total: after.total_amount, balance: after.balance_amount,
    });
    return { ok: true };
  });
  if (!result.ok) return result;

  revalidatePath("/", "layout");
  redirect(`/deliveries?done=${id}`);
});

export const cancelOrder = guarded("cancelOrder", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [id]);
    if (res.affectedRows) await audit(tx, user, "order.cancel", "order", id);
  });
  revalidatePath("/", "layout");
  redirect("/deliveries");
});

// Undo a delivery entered by mistake: the order goes back to pending, the customer's balance
// reverses automatically, and the old values are kept in the activity log.
export const reopenOrder = guarded("reopenOrder", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const [o] = await tx.query("SELECT * FROM orders WHERE id = ? FOR UPDATE", [id]);
    if (!o || o.status !== "delivered") return;
    await tx.query(
      `UPDATE orders SET status = 'pending', vehicle_number = NULL, arrival_time = NULL, dispatch_time = NULL,
         delivered_qty = NULL, paid_amount = NULL, balance_amount = NULL, delivered_by = NULL, delivered_at = NULL,
         total_amount = ROUND(ordered_qty * rate, 2)
       WHERE id = ?`,
      [id],
    );
    await audit(tx, user, "order.reopen", "order", id, {
      previous: {
        vehicle: o.vehicle_number, arrival: o.arrival_time, dispatch: o.dispatch_time,
        deliveredQty: o.delivered_qty, total: o.total_amount, paid: o.paid_amount, balance: o.balance_amount,
        deliveredAt: o.delivered_at,
      },
    });
  });
  revalidatePath("/", "layout");
  redirect(`/deliveries/${id}`);
});
