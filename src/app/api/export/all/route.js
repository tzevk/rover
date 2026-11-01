import { getUser } from "@/lib/auth";
import { csvText } from "@/lib/csv";
import { audit, query, transaction } from "@/lib/db";
import { todayISO } from "@/lib/format";
import { zip } from "@/lib/zip";

// Business records only: logins stay out, because they hold password hashes.
const TABLES = [
  "sites", "customers", "orders", "customer_payments", "expenses", "staff", "attendance", "materials", "production_entries",
  "stock_counts", "vehicles", "fuel_logs", "maintenance_logs", "invoices", "royalty_permits", "cash_closings",
];

const flat = (v) => (v && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

// Open to an owner even after access ends: a company can always take its records with it.
export async function GET() {
  const user = await getUser();
  if (!user || user.role !== "admin") return new Response(null, { status: 403 });
  const files = await Promise.all(TABLES.map(async (table) => {
    const rows = await query(`SELECT * FROM ${table} WHERE company_id = ?`, [user.company_id]);
    return { name: `${table}.csv`, text: csvText(Object.keys(rows[0] ?? {}), rows.map((r) => Object.values(r).map(flat))) };
  }));
  await transaction((tx) => audit(tx, user, "company.export", "company", user.company_id, { tables: TABLES.length }));
  return new Response(zip(files), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="records-${todayISO()}.zip"`, "Cache-Control": "no-store" },
  });
}
