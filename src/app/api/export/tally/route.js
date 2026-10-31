import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { STATES } from "@/lib/gst.mjs";
import { mastersXml, utf16, vouchersXml } from "@/lib/tally.mjs";
import { tallyData } from "@/lib/tally-data";
import { isDate } from "@/lib/validate";

const download = (name, xml) => new Response(utf16(xml), {
  headers: { "Content-Type": "application/xml; charset=utf-16", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
});

export async function GET(req) {
  const user = await getUser();
  if (!user || user.role !== "admin" || !user.has_access) return new Response(null, { status: 403 });
  const { searchParams: sp } = new URL(req.url);
  const from = sp.get("from");
  const to = sp.get("to");
  if (!isDate(from) || !isDate(to) || to < from) return new Response(null, { status: 400 });
  const data = await tallyData(user.company_id, from, to, sp.get("all") !== "1");
  if (sp.get("kind") === "masters") {
    const parties = await query("SELECT name, gstin, state_code, address, pincode, phone FROM customers WHERE company_id = ? ORDER BY name", [user.company_id]);
    const customers = parties.map((c) => ({ ...c, state: STATES[c.state_code || String(c.gstin ?? "").slice(0, 2)] }));
    return download("tally-ledgers.xml", mastersXml({ company: data.company, ledgers: data.ledgers, customers }));
  }
  return download(`tally-vouchers-${from}-to-${to}.xml`, vouchersXml(data));
}
