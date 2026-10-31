import { getUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { query } from "@/lib/db";
import { isDate } from "@/lib/validate";

const COLUMNS = ["Order", "Status", "Booked", "Delivered", "Customer", "Material", "Vehicle", "Pass no", "Gross kg", "Tare kg", "Net kg", "Ordered qty", "Delivered qty", "Rate", "Tax", "Total", "Paid", "Paid by", "Balance"];

export async function GET(req) {
  const user = await getUser();
  if (!user || user.role !== "admin" || !user.has_access) return new Response(null, { status: 403 });
  const { searchParams: sp } = new URL(req.url);
  const from = isDate(sp.get("from")) ? sp.get("from") : "2000-01-01";
  const to = isDate(sp.get("to")) ? sp.get("to") : "2100-01-01";
  const rows = await query(
    `SELECT o.id, o.status, o.booked_at, o.delivered_at, c.name AS customer, m.name AS material, o.vehicle_number, o.pass_no,
            o.gross_kg, o.tare_kg, o.net_kg, o.ordered_qty, o.delivered_qty, o.rate, o.tax_amount, o.total_amount, o.paid_amount, o.paid_mode, o.balance_amount
     FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN materials m ON m.id = o.material_id
     WHERE o.company_id = ${user.company_id} AND DATE(o.booked_at) BETWEEN ? AND ?
     ORDER BY o.id LIMIT 50000`,
    [from, to],
  );
  return csvResponse(`orders-${from}-to-${to}.csv`, COLUMNS, rows.map(Object.values));
}
