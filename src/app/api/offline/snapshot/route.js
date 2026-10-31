import { getUser } from "@/lib/auth";
import { getStock, query } from "@/lib/db";
import { billingProfile } from "@/lib/dispatch";
import { stateOfGstin } from "@/lib/gst.mjs";
import { currentSite } from "@/lib/sites";

// What the gate screen needs to work without a connection. Names and rates only, the same things
// gate staff already see: no balances, and never anyone else's company.
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "signin" }, { status: 401 });
  if (!user.has_access) return Response.json({ error: "access" }, { status: 403 });
  const cid = user.company_id;
  const site = await currentSite(user);
  const [customers, stock, vehicles, pending, profile] = await Promise.all([
    query("SELECT id, name, phone FROM customers WHERE company_id = ? ORDER BY name LIMIT 5000", [cid]),
    getStock(cid, site),
    query("SELECT number, tare_kg FROM vehicles WHERE company_id = ? AND active = 1 ORDER BY number LIMIT 5000", [cid]),
    query(
      `SELECT o.id, o.ordered_qty, o.rate, o.material_id, o.vehicle_number, o.tare_kg, c.name AS customer
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.company_id = ? AND o.site_id = ? AND o.status = 'pending' ORDER BY o.booked_at LIMIT 500`,
      [cid, site.id],
    ),
    billingProfile({ query }, cid, site.id),
  ]);
  return Response.json({
    user: { id: user.id, name: user.full_name },
    company: user.company_name,
    site: { id: site.id, name: site.name },
    gst: { enabled: Boolean(profile.gst_enabled && profile.gstin), inclusive: Boolean(profile.rates_include_gst), state: stateOfGstin(profile.gstin) },
    customers,
    materials: stock.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, unit: m.unit, rate: m.default_rate, kg_per_unit: m.kg_per_unit, gst_rate: m.gst_rate })),
    vehicles,
    pending,
    saved_at: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
