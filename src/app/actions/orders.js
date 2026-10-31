"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit, cleanVehicle, saveVehicleNumber, transaction } from "@/lib/db";
import { completeDelivery } from "@/lib/dispatch";
import { flash } from "@/lib/flash";
import { inr } from "@/lib/format";
import { currentSite } from "@/lib/sites";
import { dateTimeLocal, num, round2, text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

// Totals are computed by the database (ROUND(qty × rate, 2)), the same formula its CHECK rule enforces.

export const createOrder = guarded("createOrder", async (_prev, formData) => {
  const user = await requireUser();
  const { t } = await getI18n();
  const customerId = Number(formData.get("customer_id"));
  const orderedQty = num(formData.get("ordered_qty"));
  const rate = num(formData.get("rate"));
  const materialId = Number(formData.get("material_id")) || null;

  if (!customerId) return { error: t("action.chooseCustomer") };
  if (!(orderedQty > 0)) return { error: t("action.qtyPositive") };
  if (!(rate > 0)) return { error: t("action.ratePositive") };
  const site = await currentSite(user);

  const result = await transaction(async (tx) => {
    const [customer] = await tx.query("SELECT name FROM customers WHERE id = ? AND company_id = ?", [customerId, user.company_id]);
    if (!customer) return { error: t("action.customerGone") };
    // Once a company lists its materials, every order names one, so stock stays complete.
    const materials = await tx.query("SELECT id FROM materials WHERE company_id = ? AND active = 1", [user.company_id]);
    if (materials.length && !materials.some((m) => m.id === materialId)) return { error: t("action.chooseMaterial") };
    const res = await tx.query(
      `INSERT INTO orders (company_id, site_id, customer_id, material_id, ordered_qty, rate, total_amount, booked_by, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ROUND(? * ?, 2), ?, ?)`,
      [user.company_id, site.id, customerId, materialId, orderedQty, rate, orderedQty, rate, user.id, requestId(formData)],
    );
    const [{ total_amount: total }] = await tx.query("SELECT total_amount FROM orders WHERE id = ?", [res.insertId]);
    await audit(tx, user, "order.book", "order", res.insertId, { customerId, materialId, orderedQty, rate, total });
    return { ok: true, message: t("action.orderBooked", { id: res.insertId, name: customer.name, total: inr(total) }), id: res.insertId };
  });
  // Only after the transaction has committed, so no reader can re-cache the old state.
  if (result.ok) {
    invalidate(TAGS.orders);
    revalidatePath("/", "layout");
  }
  return result;
});

export const deliverOrder = guarded("deliverOrder", async (_prev, formData) => {
  const user = await requireUser();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const vehicle = cleanVehicle(formData.get("vehicle_number"));
  const arrival = dateTimeLocal(formData.get("arrival_time"));
  const dispatch = dateTimeLocal(formData.get("dispatch_time"));
  const deliveredQty = num(formData.get("delivered_qty"));
  const paid = num(formData.get("paid_amount") || 0);
  const gross = formData.get("gross_kg") ? num(formData.get("gross_kg")) : null;
  const tare = formData.get("tare_kg") ? num(formData.get("tare_kg")) : null;
  const passNo = text(formData.get("pass_no"), 40);

  if (!vehicle) return { error: t("action.vehicle") };
  if (tare !== null && !(tare > 0)) return { error: t("deliver.tareRule") };

  // First weighing: the empty truck is at the gate. Saved now so the next person can carry on.
  if (formData.get("intent") === "arrive") {
    if (!arrival) return { error: t("action.times") };
    const saved = await transaction(async (tx) => {
      const [order] = await tx.query("SELECT status FROM orders WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
      if (!order) return { error: t("action.orderNotFound") };
      if (order.status !== "pending") return { error: t("action.orderClosed") };
      const vehicleId = await saveVehicleNumber(tx, user.company_id, vehicle, tare);
      await tx.query("UPDATE orders SET vehicle_number = ?, vehicle_id = ?, arrival_time = ?, tare_kg = ? WHERE id = ? AND company_id = ?", [vehicle, vehicleId, arrival, tare, id, user.company_id]);
      await audit(tx, user, "order.arrive", "order", id, { vehicle, arrival, tare });
      return { ok: true, message: t("deliver.arrivalSaved", { vehicle }) };
    });
    if (saved.ok) {
      invalidate(TAGS.vehicles);
      revalidatePath("/deliveries");
    }
    return saved;
  }

  if (!arrival || !dispatch) return { error: t("action.times") };
  if ((gross === null) !== (tare === null) && gross !== null) return { error: t("deliver.weightsBoth") };
  if (gross !== null && !(gross > tare)) return { error: t("deliver.grossRule") };
  if (dispatch < arrival) return { error: t("action.dispatchBeforeArrival") };
  if (!(deliveredQty > 0)) return { error: t("action.deliveredPositive") };
  if (!(paid >= 0)) return { error: t("action.paidNegative") };

  const result = await transaction((tx) => completeDelivery(tx, user, {
    id, vehicle, arrival, dispatch, deliveredQty, paid, gross, tare, passNo,
    paidMode: String(formData.get("paid_mode") || "cash"),
    net: gross === null ? null : round2(gross - tare),
    materialId: Number(formData.get("material_id")) || null,
    placeOfSupply: String(formData.get("place_of_supply") || ""),
  }, t));
  if (!result.ok) return result;

  invalidate(TAGS.orders, TAGS.vehicles);

  revalidatePath("/", "layout");
  redirect(`/deliveries?done=${id}${result.invoice ? `&invoice=${result.invoice.id}` : ""}`);
});

export const cancelOrder = guarded("cancelOrder", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query("UPDATE orders SET status = 'cancelled' WHERE id = ? AND company_id = ? AND status = 'pending'", [id, user.company_id]);
    if (res.affectedRows) await audit(tx, user, "order.cancel", "order", id);
  });
  invalidate(TAGS.orders);
  await flash("flash.orderCancelled", { id });
  revalidatePath("/", "layout");
  redirect("/deliveries");
}, { inPage: true });

// Undo a delivery entered by mistake: the order goes back to pending, the customer's balance
// reverses automatically, and the old values are kept in the activity log. Its invoice is
// cancelled but keeps its number, because a tax invoice can't simply vanish from the series.
export const reopenOrder = guarded("reopenOrder", async (id) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const [o] = await tx.query("SELECT * FROM orders WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
    if (!o || o.status !== "delivered") return;
    await tx.query(
      `UPDATE orders SET status = 'pending', vehicle_number = NULL, vehicle_id = NULL, arrival_time = NULL, dispatch_time = NULL,
         delivered_qty = NULL, paid_amount = NULL, balance_amount = NULL, delivered_by = NULL, delivered_at = NULL,
         gross_kg = NULL, tare_kg = NULL, net_kg = NULL, pass_no = NULL, royalty_amount = NULL, paid_mode = NULL,
         tax_amount = 0, tax_inclusive = 0, place_of_supply = NULL, offline_ref = NULL, tally_exported_at = NULL,
         total_amount = ROUND(ordered_qty * rate, 2)
       WHERE id = ?`,
      [id],
    );
    await tx.query(
      "UPDATE invoices SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ? WHERE order_id = ? AND company_id = ? AND status = 'issued'",
      [user.id, id, user.company_id],
    );
    await audit(tx, user, "order.reopen", "order", id, {
      previous: {
        vehicle: o.vehicle_number, arrival: o.arrival_time, dispatch: o.dispatch_time,
        deliveredQty: o.delivered_qty, gross: o.gross_kg, tare: o.tare_kg, net: o.net_kg, passNo: o.pass_no, total: o.total_amount, paid: o.paid_amount, balance: o.balance_amount,
        deliveredAt: o.delivered_at,
      },
    });
  });
  invalidate(TAGS.orders);
  await flash("flash.orderReopened", { id });
  revalidatePath("/", "layout");
  redirect(`/deliveries/${id}`);
}, { inPage: true });
