"use server";

import { revalidatePath } from "next/cache";
import { invalidate, TAGS } from "@/lib/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { audit, transaction } from "@/lib/db";
import { flash } from "@/lib/flash";
import { inr, PAY_MODES, todayISO } from "@/lib/format";
import { isGstin, isPincode, stateOfGstin, STATES } from "@/lib/gst.mjs";
import { currentSite } from "@/lib/sites";
import { isDate, num, text } from "@/lib/validate";
import { getI18n } from "@/lib/i18n/server";

function readCustomer(input) {
  const get = (k) => (input instanceof FormData ? input.get(k) : input?.[k]);
  return {
    name: text(get("name"), 120),
    phone: text(get("phone"), 20),
    address: text(get("address"), 255),
    creditLimit: get("credit_limit") ? num(get("credit_limit")) : null,
    gstin: text(get("gstin"), 15).toUpperCase(),
    stateCode: text(get("state_code"), 2),
    place: text(get("place"), 60),
    pincode: text(get("pincode"), 6),
  };
}

// A registered buyer's State comes from their GSTIN, so the two can't disagree.
function customerProblem(c, t) {
  if (!c.name) return t("action.customerName");
  if (c.creditLimit !== null && !(c.creditLimit >= 0)) return t("customer.limitRule");
  if (c.gstin && !isGstin(c.gstin)) return t("company.gstinRule");
  if (c.stateCode && !STATES[c.stateCode]) return t("customer.stateRule");
  if (c.pincode && !isPincode(c.pincode)) return t("company.pincodeRule");
  return null;
}

async function insertCustomer(user, input) {
  const c = readCustomer(input);
  const problem = customerProblem(c, (await getI18n()).t);
  if (problem) return { error: problem };
  const stateCode = c.gstin ? stateOfGstin(c.gstin) : c.stateCode;
  const rid = requestId(input);
  return transaction(async (tx) => {
    // A repeat of the same submission returns the customer created the first time.
    if (rid) {
      const [existing] = await tx.query("SELECT id, name, phone FROM customers WHERE request_id = ? AND company_id = ?", [rid, user.company_id]);
      if (existing) return { customer: existing };
    }
    const res = await tx.query(
      "INSERT INTO customers (company_id, name, phone, address, credit_limit, gstin, state_code, place, pincode, created_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, c.name, c.phone || null, c.address || null, c.creditLimit, c.gstin || null, stateCode || null, c.place || null, c.pincode || null, user.id, rid],
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
  const problem = customerProblem(c, (await getI18n()).t);
  if (problem) return { error: problem };
  const stateCode = c.gstin ? stateOfGstin(c.gstin) : c.stateCode;
  await transaction(async (tx) => {
    const [before] = await tx.query("SELECT name, phone, address, credit_limit, gstin, state_code, place, pincode FROM customers WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
    if (!before) return;
    await tx.query("UPDATE customers SET name = ?, phone = ?, address = ?, credit_limit = ?, gstin = ?, state_code = ?, place = ?, pincode = ? WHERE id = ? AND company_id = ?", [
      c.name, c.phone || null, c.address || null, c.creditLimit, c.gstin || null, stateCode || null, c.place || null, c.pincode || null, id, user.company_id,
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
  const mode = String(formData.get("mode") || "cash");
  if (!(amount > 0)) return { error: t("common.amountPositive") };
  if (!isDate(paidOn) || paidOn > todayISO()) return { error: t("common.pickValidDate") };
  if (!PAY_MODES.includes(mode)) return { error: t("cash.modeRule") };
  const site = await currentSite(user);

  const saved = await transaction(async (tx) => {
    const [customer] = await tx.query("SELECT id FROM customers WHERE id = ? AND company_id = ?", [customerId, user.company_id]);
    if (!customer) return false;
    const res = await tx.query(
      "INSERT INTO customer_payments (company_id, site_id, customer_id, amount, paid_on, mode, note, recorded_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, site.id, customerId, amount, paidOn, mode, note || null, user.id, requestId(formData)],
    );
    await audit(tx, user, "payment.record", "customer", customerId, { paymentId: res.insertId, amount, paidOn, mode, note });
    return true;
  });
  if (!saved) return { error: t("action.customerGone") };
  invalidate(TAGS.payments);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/cash");
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
  await flash("flash.paymentDeleted");
  revalidatePath(`/customers/${customerId}`);
}, { inPage: true });
