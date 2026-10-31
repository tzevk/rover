import { getUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { isMonth } from "@/lib/gst-report";
import { royaltyRegister } from "@/lib/royalty";

const COLUMNS = ["Dispatched", "Pass no", "Vehicle", "Material", "Quantity", "Unit", "Royalty", "Customer", "Site", "Order"];

export async function GET(req) {
  const user = await getUser();
  if (!user || user.role !== "admin" || !user.has_access) return new Response(null, { status: 403 });
  const month = new URL(req.url).searchParams.get("month");
  if (!isMonth(month)) return new Response(null, { status: 400 });
  const [y, m] = month.split("-").map(Number);
  const rows = await royaltyRegister(user.company_id, `${month}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  return csvResponse(`royalty-${month}.csv`, COLUMNS, rows.map((r) => [
    r.dispatch_time, r.pass_no, r.vehicle_number, r.material, r.delivered_qty, r.unit, r.royalty_amount, r.customer, r.site, r.id,
  ]));
}
