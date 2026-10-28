"use server";

import { revalidatePath } from "next/cache";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { inr, todayISO } from "@/lib/format";
import { isDate, num, text } from "@/lib/validate";

function readCustomer(input) {
  const get = (k) => (input instanceof FormData ? input.get(k) : input?.[k]);
  return {
    name: text(get("name"), 120),
    phone: text(get("phone"), 20),
    address: text(get("address"), 255),
  };
}

async function insertCustomer(user, input) {
  const c = readCustomer(input);
  if (!c.name) return { error: "Customer name is required." };
  const rid = requestId(input);
  return transaction(async (tx) => {
    // A repeat of the same submission returns the customer created the first time.
    if (rid) {
      const [existing] = await tx.query("SELECT id, name, phone FROM customers WHERE request_id = ?", [rid]);
      if (existing) return { customer: existing };
    }
    const res = await tx.query(
      "INSERT INTO customers (name, phone, address, created_by, request_id) VALUES (?, ?, ?, ?, ?)",
      [c.name, c.phone || null, c.address || null, user.id, rid],
    );
    await audit(tx, user, "customer.create", "customer", res.insertId, c);
    return { customer: { id: res.insertId, name: c.name, phone: c.phone } };
  });
}

// Called directly from the order-booking screen (any signed-in user).
export const quickAddCustomer = guarded("quickAddCustomer", async (data) => {
  const user = await requireUser();
  const res = await insertCustomer(user, data);
  invalidate(TAGS.customers);
  revalidatePath("/customers");
  return res;
});

export const createCustomer = guarded("createCustomer", async (_prev, formData) => {
  const user = await requireAdmin();
  const res = await insertCustomer(user, formData);
  if (res.error) return res;
  invalidate(TAGS.customers);
  revalidatePath("/customers");
  return { ok: true, message: `Added ${res.customer.name}.` };
});

export const updateCustomer = guarded("updateCustomer", async (_prev, formData) => {
  const user = await requireAdmin();
  const id = Number(formData.get("id"));
  const c = readCustomer(formData);
  if (!c.name) return { error: "Customer name is required." };
  await transaction(async (tx) => {
    const [before] = await tx.query("SELECT name, phone, address FROM customers WHERE id = ? FOR UPDATE", [id]);
    await tx.query("UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ?", [
      c.name, c.phone || null, c.address || null, id,
    ]);
    await audit(tx, user, "customer.update", "customer", id, { before, after: c });
  });
  invalidate(TAGS.customers);
  revalidatePath(`/customers/${id}`);
  return { ok: true, message: "Details saved." };
});

export const recordPayment = guarded("recordPayment", async (_prev, formData) => {
  const user = await requireAdmin();
  const customerId = Number(formData.get("customer_id"));
  const amount = num(formData.get("amount"));
  const paidOn = String(formData.get("paid_on") || todayISO());
  const note = text(formData.get("note"));
  if (!(amount > 0)) return { error: "Amount must be more than 0." };
  if (!isDate(paidOn) || paidOn > todayISO()) return { error: "Pick a valid date (not in the future)." };

  await transaction(async (tx) => {
    const res = await tx.query(
      "INSERT INTO customer_payments (customer_id, amount, paid_on, note, recorded_by, request_id) VALUES (?, ?, ?, ?, ?, ?)",
      [customerId, amount, paidOn, note || null, user.id, requestId(formData)],
    );
    await audit(tx, user, "payment.record", "customer", customerId, { paymentId: res.insertId, amount, paidOn, note });
  });
  invalidate(TAGS.payments);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true, message: `Payment of ${inr(amount)} recorded.` };
});

// Soft delete: the row stays in the database (and the activity log) but stops counting.
export const deletePayment = guarded("deletePayment", async (customerId, paymentId) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query(
      "UPDATE customer_payments SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND customer_id = ? AND deleted_at IS NULL",
      [user.id, paymentId, customerId],
    );
    if (res.affectedRows) await audit(tx, user, "payment.delete", "customer", customerId, { paymentId });
  });
  invalidate(TAGS.payments);
  revalidatePath(`/customers/${customerId}`);
});
