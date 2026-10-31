import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ewayFile, ewayProblems } from "@/lib/ewaybill.mjs";

// One invoice, for upload to the portal's Generate Bulk screen. Refused until it's complete,
// because the portal rejects the whole file over one missing pincode.
export async function GET(req) {
  const user = await getUser();
  if (!user || user.role !== "admin" || !user.has_access) return new Response(null, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const [invoice] = await query("SELECT * FROM invoices WHERE id = ? AND company_id = ? AND status = 'issued'", [id, user.company_id]);
  if (!invoice || ewayProblems(invoice).length) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(ewayFile([invoice]), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ewaybill-${invoice.number.replaceAll("/", "-")}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
