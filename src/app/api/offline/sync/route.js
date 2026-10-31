import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, cleanVehicle, transaction } from "@/lib/db";
import { completeDelivery } from "@/lib/dispatch";
import { getI18n } from "@/lib/i18n/server";
import { currentSite, getSites } from "@/lib/sites";
import { num, round2, text } from "@/lib/validate";

const MAX_RECORDS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const OLDEST_DAYS = 30; // a device clock or queue older than this needs a person to look at it

class Rejected extends Error {}

// Cookies alone can't prove the request came from this site, so the browser's own Origin must match.
function sameOrigin(req) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return origin && new URL(origin).host === host; } catch { return false; }
}

function istNow(offsetMs = 0) {
  return new Date(Date.now() + offsetMs + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function read(r, t) {
  const vehicle = cleanVehicle(r.vehicle_number);
  const d = {
    vehicle,
    arrival: String(r.arrival_time ?? ""),
    dispatch: String(r.dispatch_time ?? ""),
    deliveredQty: num(r.delivered_qty),
    paid: r.paid_amount === "" || r.paid_amount == null ? 0 : num(r.paid_amount),
    paidMode: String(r.paid_mode ?? "cash"),
    gross: r.gross_kg ? num(r.gross_kg) : null,
    tare: r.tare_kg ? num(r.tare_kg) : null,
    passNo: text(r.pass_no, 40),
  };
  if (!vehicle) throw new Rejected(t("action.vehicle"));
  if (!STAMP.test(d.arrival) || !STAMP.test(d.dispatch)) throw new Rejected(t("action.times"));
  if (d.dispatch < d.arrival) throw new Rejected(t("action.dispatchBeforeArrival"));
  if (d.dispatch > istNow(10 * 60 * 1000)) throw new Rejected(t("gate.clockAhead"));
  if (d.dispatch < istNow(-OLDEST_DAYS * 86400 * 1000)) throw new Rejected(t("gate.tooOld", { days: OLDEST_DAYS }));
  if (!(d.deliveredQty > 0)) throw new Rejected(t("action.deliveredPositive"));
  if (!(d.paid >= 0)) throw new Rejected(t("action.paidNegative"));
  if (d.gross !== null && !(d.tare > 0 && d.gross > d.tare)) throw new Rejected(t("deliver.grossRule"));
  return { ...d, net: d.gross === null ? null : round2(d.gross - d.tare), deliveredAt: d.dispatch };
}

// A name typed at the gate joins the existing customer if there is one, so a walk-in who came
// before isn't created twice.
async function customerFor(tx, user, r, t) {
  if (r.customer_id) {
    const [c] = await tx.query("SELECT id FROM customers WHERE id = ? AND company_id = ?", [Number(r.customer_id), user.company_id]);
    if (!c) throw new Rejected(t("action.customerGone"));
    return c.id;
  }
  const name = text(r.customer_name, 120);
  if (!name) throw new Rejected(t("action.chooseCustomer"));
  const [known] = await tx.query("SELECT id FROM customers WHERE company_id = ? AND name = ? LIMIT 1", [user.company_id, name]);
  if (known) return known.id;
  const res = await tx.query("INSERT INTO customers (company_id, name, created_by) VALUES (?, ?, ?)", [user.company_id, name, user.id]);
  await audit(tx, user, "customer.create", "customer", res.insertId, { name, via: "offline" });
  return res.insertId;
}

// One record, one transaction. A refusal rolls back whatever it had started, including a new order.
async function apply(user, siteId, r, t) {
  if (!UUID.test(String(r?.id ?? ""))) return { id: r?.id, status: "rejected", reason: t("action.failed") };
  const ref = r.id.toLowerCase();
  try {
    return await transaction(async (tx) => {
      // Already here: the device never heard back last time. Tell it so, and do nothing.
      const [seen] = await tx.query("SELECT id FROM orders WHERE offline_ref = ? AND company_id = ?", [ref, user.company_id]);
      if (seen) return { id: r.id, status: "done", orderId: seen.id };

      const d = read(r, t);
      let orderId = Number(r.order_id) || null;
      if (!orderId) {
        const rate = num(r.rate);
        const materialId = Number(r.material_id) || null;
        if (!(rate > 0)) throw new Rejected(t("action.ratePositive"));
        const materials = await tx.query("SELECT id FROM materials WHERE company_id = ? AND active = 1", [user.company_id]);
        if (materials.length && !materials.some((m) => m.id === materialId)) throw new Rejected(t("action.chooseMaterial"));
        const customerId = await customerFor(tx, user, r, t);
        const res = await tx.query(
          `INSERT INTO orders (company_id, site_id, customer_id, material_id, ordered_qty, rate, total_amount, booked_by, booked_at)
           VALUES (?, ?, ?, ?, ?, ?, ROUND(? * ?, 2), ?, ?)`,
          [user.company_id, siteId, customerId, materialId, d.deliveredQty, rate, d.deliveredQty, rate, user.id, d.arrival],
        );
        orderId = res.insertId;
        await audit(tx, user, "order.book", "order", orderId, { customerId, materialId, rate, via: "offline" });
      }
      const done = await completeDelivery(tx, user, { ...d, id: orderId, offlineRef: ref }, t);
      if (done.error) throw new Rejected(done.error);
      return { id: r.id, status: "done", orderId, invoice: done.invoice?.number ?? null };
    });
  } catch (err) {
    if (err instanceof Rejected) return { id: r.id, status: "rejected", reason: err.message };
    // Two devices sending the same entry at once: the other one won, which is the right outcome.
    if (err?.code === "ER_DUP_ENTRY" && /offline/i.test(err.message)) return { id: r.id, status: "done" };
    if (err?.code === "ER_DUP_ENTRY" && /pass/i.test(err.message)) return { id: r.id, status: "rejected", reason: t("deliver.passUsedShort") };
    console.error("[offline.sync]", err);
    return { id: r.id, status: "retry" };
  }
}

export async function POST(req) {
  if (!sameOrigin(req)) return Response.json({ error: "origin" }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (!user.has_access) return Response.json({ error: "access" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const records = Array.isArray(body?.records) ? body.records : null;
  if (!records || records.length > MAX_RECORDS) return Response.json({ error: "records" }, { status: 400 });

  const { t } = await getI18n();
  const site = await currentSite(user);
  const sites = await getSites(user.company_id);
  const results = [];
  // In order, one at a time, so invoice numbers follow the order entries were made in.
  for (const r of records) {
    const wanted = sites.find((s) => s.id === Number(r?.site_id) && s.active);
    const siteId = user.site_id ? site.id : wanted?.id ?? site.id;
    results.push(await apply(user, siteId, r, t));
  }
  if (results.some((r) => r.status === "done")) {
    invalidate(TAGS.orders, TAGS.vehicles, TAGS.customers, TAGS.stock);
    revalidatePath("/", "layout");
  }
  return Response.json({ results });
}
