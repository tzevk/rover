import { audit, saveVehicleNumber } from "./db";
import { PAY_MODES } from "./format";
import { computeTax, financialYear, invoiceNumber, stateOfGstin, STATES, UQC } from "./gst.mjs";

// The registered details a site bills under: its own where it has them, else the company's.
export async function billingProfile(tx, companyId, siteId) {
  const [c] = await tx.query(
    `SELECT c.name, c.phone, c.gst_enabled, c.rates_include_gst, c.invoice_prefix, c.bank_details, c.invoice_terms, c.pass_required,
            COALESCE(s.gstin, c.gstin) AS gstin, COALESCE(s.address, c.address) AS address,
            COALESCE(s.place, c.place) AS place, COALESCE(s.pincode, c.pincode) AS pincode
     FROM companies c JOIN sites s ON s.company_id = c.id WHERE c.id = ? AND s.id = ?`,
    [companyId, siteId],
  );
  return c;
}

// Taken inside the delivery's transaction: the row stays locked until it commits, so two deliveries
// can't share a number, and a failed save rolls its number back so the series has no gaps.
async function nextInvoiceNumber(tx, companyId, gstin, fy, prefix) {
  const key = [companyId, gstin, fy];
  await tx.query("INSERT INTO invoice_counters (company_id, gstin, fy, last_no) VALUES (?, ?, ?, 0) ON DUPLICATE KEY UPDATE last_no = last_no", key);
  const [{ last_no: last }] = await tx.query("SELECT last_no FROM invoice_counters WHERE company_id = ? AND gstin = ? AND fy = ? FOR UPDATE", key);
  await tx.query("UPDATE invoice_counters SET last_no = ? WHERE company_id = ? AND gstin = ? AND fy = ?", [last + 1, ...key]);
  return invoiceNumber(prefix, fy, last + 1);
}

// Everything printed on the invoice is copied in, so later edits can't change an issued document.
async function issueInvoice(tx, user, { order, co, customer, material, d, tax, placeOfSupply, unit }) {
  const invoiceDate = d.dispatch.slice(0, 10);
  const fy = financialYear(invoiceDate);
  const number = await nextInvoiceNumber(tx, user.company_id, co.gstin, fy, co.invoice_prefix);
  const res = await tx.query(
    `INSERT INTO invoices (company_id, site_id, order_id, customer_id, number, fy, invoice_date,
       supplier_name, supplier_gstin, supplier_address, supplier_place, supplier_pincode, supplier_phone,
       buyer_name, buyer_gstin, buyer_address, buyer_place, buyer_pincode, place_of_supply,
       item_name, hsn_code, qty, unit, uqc, rate, rate_inclusive, taxable_value, gst_rate, cgst, sgst, igst, total,
       vehicle_number, pass_no, bank_details, invoice_terms, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.company_id, order.site_id, order.id, order.customer_id, number, fy, invoiceDate,
      co.name, co.gstin, co.address, co.place, co.pincode, co.phone,
      customer.name, customer.gstin, customer.address, customer.place, customer.pincode, placeOfSupply,
      material.name, material.hsn_code, d.deliveredQty, unit, UQC[material.unit], order.rate, co.rates_include_gst ? 1 : 0,
      tax.taxable, material.gst_rate, tax.cgst, tax.sgst, tax.igst, tax.total,
      d.vehicle, d.passNo || null, co.bank_details, co.invoice_terms, user.id,
    ],
  );
  return { id: res.insertId, number };
}

// Finishes one delivery. Runs inside the caller's transaction and is the only place this happens,
// so a load weighed at the gate and one synced from an offline device are treated identically.
// d: { id, vehicle, arrival, dispatch, deliveredQty, paid, paidMode, gross, tare, net, passNo,
//      materialId, placeOfSupply, deliveredAt, offlineRef }
export async function completeDelivery(tx, user, d, t) {
  // Lock the row so two people can't complete the same order at once.
  const [order] = await tx.query("SELECT * FROM orders WHERE id = ? AND company_id = ? FOR UPDATE", [d.id, user.company_id]);
  if (!order) return { error: t("action.orderNotFound") };
  if (order.status !== "pending") return { error: t("action.orderClosed") };

  const co = await billingProfile(tx, user.company_id, order.site_id);
  const materialId = order.material_id ?? d.materialId ?? null;
  const [material] = materialId ? await tx.query("SELECT * FROM materials WHERE id = ? AND company_id = ?", [materialId, user.company_id]) : [];
  if (materialId && !material) return { error: t("stock.notFound") };

  if (d.passNo) {
    const [used] = await tx.query("SELECT id FROM orders WHERE company_id = ? AND pass_no = ? AND id <> ?", [user.company_id, d.passNo, d.id]);
    if (used) return { error: t("deliver.passUsed", { id: used.id }) };
  } else if (co.pass_required && material?.royalty_per_unit > 0) {
    return { error: t("deliver.passRequired") };
  }

  const billing = Boolean(co.gst_enabled && co.gstin);
  if (billing && !material) return { error: t("deliver.materialForInvoice") };

  const [customer] = await tx.query("SELECT name, gstin, address, place, pincode, state_code FROM customers WHERE id = ?", [order.customer_id]);
  const supplierState = stateOfGstin(co.gstin);
  const placeOfSupply = billing
    ? (STATES[d.placeOfSupply] ? d.placeOfSupply : customer.state_code || stateOfGstin(customer.gstin) || supplierState)
    : null;
  const [{ amount }] = await tx.query("SELECT ROUND(? * rate, 2) AS amount FROM orders WHERE id = ?", [d.deliveredQty, d.id]);
  const tax = billing
    ? computeTax({ amount, gstRate: material.gst_rate, inclusive: Boolean(co.rates_include_gst), interState: placeOfSupply !== supplierState })
    : { total: amount, tax: 0 };
  const paidMode = d.paid > 0 ? (PAY_MODES.includes(d.paidMode) ? d.paidMode : "cash") : null;

  const vehicleId = await saveVehicleNumber(tx, user.company_id, d.vehicle, d.tare);
  await tx.query(
    `UPDATE orders SET status = 'delivered', vehicle_number = ?, vehicle_id = ?, arrival_time = ?, dispatch_time = ?, delivered_qty = ?,
       material_id = ?, total_amount = ?, tax_amount = ?, tax_inclusive = ?, place_of_supply = ?, paid_amount = ?, paid_mode = ?,
       balance_amount = ROUND(? - ?, 2), gross_kg = ?, tare_kg = ?, net_kg = ?, pass_no = ?,
       royalty_amount = IF(? > 0, ROUND(? * ?, 2), NULL), offline_ref = ?,
       delivered_by = ?, delivered_at = COALESCE(?, NOW())
     WHERE id = ?`,
    [
      d.vehicle, vehicleId, d.arrival, d.dispatch, d.deliveredQty,
      materialId, tax.total, tax.tax, billing && co.rates_include_gst ? 1 : 0, placeOfSupply, d.paid, paidMode,
      tax.total, d.paid, d.gross, d.tare, d.net, d.passNo || null,
      material?.royalty_per_unit ?? 0, d.deliveredQty, material?.royalty_per_unit ?? 0, d.offlineRef ?? null,
      user.id, d.deliveredAt ?? null, d.id,
    ],
  );
  const invoice = billing
    ? await issueInvoice(tx, user, { order, co, customer, material, d, tax, placeOfSupply, unit: t(`unit.${material.unit}`) })
    : null;
  const [after] = await tx.query("SELECT total_amount, balance_amount FROM orders WHERE id = ?", [d.id]);
  await audit(tx, user, "order.deliver", "order", d.id, {
    vehicle: d.vehicle, arrival: d.arrival, dispatch: d.dispatch, deliveredQty: d.deliveredQty, gross: d.gross, tare: d.tare, net: d.net,
    passNo: d.passNo, paid: d.paid, paidMode, total: after.total_amount, balance: after.balance_amount, invoice: invoice?.number, offline: Boolean(d.offlineRef),
  });
  return { ok: true, invoice };
}
