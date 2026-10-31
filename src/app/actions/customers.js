"use server";

import { revalidatePath } from "next/cache";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { inr, todayISO } from "@/lib/format";
import { isDate, num, text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

function readCustomer(input) {
  const get = (k) => (input instanceof FormData ? input.get(k) : input?.[k]);
  return {
    name: text(get("name"), 120),
    phone: text(get("phone"), 20),
    address: text(get("address"), 255),
    creditLimit: get("credit_limit") ? num(get("credit_limit")) : null,
  };
}

async function insertCustomer(user, input) {
  const c = readCustomer(input);
  if (!c.name) return { error: (await getI18n()).t("action.customerName") };
  if (c.creditLimit !== null && !(c.creditLimit >= 0)) return { error: (await getI18n()).t("customer.limitRule") };
  const rid = requestId(input);
  return transaction(async (tx) => {
    // A repeat of the same submission returns the customer created the first time.
    if (rid) {
      const [existing] = await tx.query("SELECT id, name, phone FROM customers WHERE request_id = ? AND company_id = ?", [rid, user.company_id]);
      if (existing) return { customer: existing };
    }
    const res = await tx.query(
      "INSERT INTO customers (company_id, name, phone, address, credit_limit, created_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, c.name, c.phone || null, c.address || null, c.creditLimit, user.id, rid],
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
  return { ok: true, message: (await getI18n()).t("common.added", { name: res.customer.name }) };
});

export const updateCustomer = guarded("updateCustomer", async (_prev, formData) => {
  const user = await requireAdmin();
  const id = Number(formData.get("id"));
  const c = readCustomer(formData);
  if (!c.name) return { error: (await getI18n()).t("action.customerName") };
  if (c.creditLimit !== null && !(c.creditLimit >= 0)) return { error: (await getI18n()).t("customer.limitRule") };
  await transaction(async (tx) => {
    const [before] = await tx.query("SELECT name, phone, address, credit_limit FROM customers WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
    if (!before) return;
    await tx.query("UPDATE customers SET name = ?, phone = ?, address = ?, credit_limit = ? WHERE id = ? AND company_id = ?", [
      c.name, c.phone || null, c.address || null, c.creditLimit, id, user.company_id,
    ]);
    await audit(tx, user, "customer.update", "customer", id, { before, after: c });
  });
  invalidate(TAGS.customers);
  revalidatePath(`/customers/${id}`);
  return { ok: true, message: (await getI18n()).t("action.detailsSaved") };
});

export const recordPayment = guarded("recordPayment", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const customerId = Number(formData.get("customer_id"));
  const amount = num(formData.get("amount"));
  const paidOn = String(formData.get("paid_on") || todayISO());
  const note = text(formData.get("note"));
  if (!(amount > 0)) return { error: t("common.amountPositive") };
  if (!isDate(paidOn) || paidOn > todayISO()) return { error: t("common.pickValidDate") };

  const saved = await transaction(async (tx) => {
    const [customer] = await tx.query("SELECT id FROM customers WHERE id = ? AND company_id = ?", [customerId, user.company_id]);
    if (!customer) return false;
    const res = await tx.query(
      "INSERT INTO customer_payments (company_id, customer_id, amount, paid_on, note, recorded_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, customerId, amount, paidOn, note || null, user.id, requestId(formData)],
    );
    await audit(tx, user, "payment.record", "customer", customerId, { paymentId: res.insertId, amount, paidOn, note });
    return true;
  });
  if (!saved) return { error: t("action.customerGone") };
  invalidate(TAGS.payments);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true, message: t("action.paymentRecorded", { amount: inr(amount) }) };
});

// Soft delete: the row stays in the database (and the activity log) but stops counting.
export const deletePayment = guarded("deletePayment", async (customerId, paymentId) => {
  const user = await requireAdmin();
  await transaction(async (tx) => {
    const res = await tx.query(
      "UPDATE customer_payments SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND customer_id = ? AND company_id = ? AND deleted_at IS NULL",
      [user.id, paymentId, customerId, user.company_id],
    );
    if (res.affectedRows) await audit(tx, user, "payment.delete", "customer", customerId, { paymentId });
  });
  invalidate(TAGS.payments);
  revalidatePath(`/customers/${customerId}`);
}, { inPage: true });
