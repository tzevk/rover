import { getUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { gstReport, isMonth } from "@/lib/gst-report";

const SHEETS = {
  b2b: [["GSTIN of recipient", "Receiver name", "Invoice number", "Invoice date", "Invoice value", "Place of supply", "Reverse charge", "Rate", "Taxable value", "CGST", "SGST", "IGST"],
    (r) => r.b2b.map((x) => [x.buyer_gstin, x.buyer_name, x.number, x.invoice_date, x.total, `${x.place_of_supply}-${x.state}`, "N", x.gst_rate, x.taxable_value, x.cgst, x.sgst, x.igst])],
  b2cl: [["Invoice number", "Invoice date", "Invoice value", "Place of supply", "Rate", "Taxable value", "IGST"],
    (r) => r.b2cLarge.map((x) => [x.number, x.invoice_date, x.total, `${x.place_of_supply}-${x.state}`, x.gst_rate, x.taxable_value, x.igst])],
  b2cs: [["Place of supply", "Rate", "Taxable value", "CGST", "SGST", "IGST"],
    (r) => r.b2cSmall.map((x) => [`${x.place_of_supply}-${x.state}`, x.gst_rate, x.taxable_value, x.cgst, x.sgst, x.igst])],
  hsn: [["HSN", "Description", "UQC", "Total quantity", "Total value", "Rate", "Taxable value", "CGST", "SGST", "IGST"],
    (r) => r.hsn.map((x) => [x.hsn_code, x.item_name, x.uqc, x.qty, x.total, x.gst_rate, x.taxable_value, x.cgst, x.sgst, x.igst])],
  docs: [["GSTIN", "From", "To", "Total numbers", "Cancelled", "Net issued"],
    (r) => r.docs.map((x) => [x.gstin, x.from, x.to, x.total, x.cancelled, x.total - x.cancelled])],
};

export async function GET(req) {
  const user = await getUser();
  if (!user || user.role !== "admin" || !user.has_access) return new Response(null, { status: 403 });
  const { searchParams: sp } = new URL(req.url);
  const month = sp.get("month");
  const sheet = SHEETS[sp.get("kind")];
  if (!isMonth(month) || !sheet) return new Response(null, { status: 400 });
  return csvResponse(`gstr1-${sp.get("kind")}-${month}.csv`, sheet[0], sheet[1](await gstReport(user.company_id, month)));
}
