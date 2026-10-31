import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Route, Save, TriangleAlert } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import { Section } from "@/components/ui";
import { saveEwayBill, saveTransport } from "@/app/actions/invoices";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ewayProblems } from "@/lib/ewaybill.mjs";
import { inr, qty, todayISO } from "@/lib/format";
import { amountInWords, needsEwayBill, stateOfGstin, STATES } from "@/lib/gst.mjs";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("invoice.title");

const money = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const place = (code) => `${STATES[code] ?? code} (${code})`;

// Printed in English: this document is read by tax officers and buyers' accountants as well as staff.
export default async function InvoicePage({ params }) {
  const user = await requireUser();
  const { t, fmtDate } = await getI18n();
  const id = Number((await params).id);
  const [[inv], [company]] = await Promise.all([
    query("SELECT * FROM invoices WHERE id = ? AND company_id = ?", [id, user.company_id]),
    query("SELECT ewb_intra_limit FROM companies WHERE id = ?", [user.company_id]),
  ]);
  const isAdmin = user.role === "admin";
  // Gate staff print what they've just sent out; older invoices are for the owner.
  if (!inv || (!isAdmin && inv.invoice_date !== todayISO())) notFound();

  const interState = stateOfGstin(inv.supplier_gstin) !== inv.place_of_supply;
  const half = inv.gst_rate / 2;
  const cancelled = inv.status === "cancelled";
  const needed = !cancelled && needsEwayBill({ total: inv.total, interState, intraLimit: company.ewb_intra_limit });
  const problems = ewayProblems(inv);

  return (
    <>
      <div className="row no-print" style={{ marginBottom: 14 }}>
        <Link href={isAdmin ? "/invoices" : "/deliveries"} className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> {t(isAdmin ? "nav.invoices" : "nav.deliveries")}</Link>
        <PrintButton>{t("invoice.print")}</PrintButton>
      </div>

      <article className={`invoice${cancelled ? " void" : ""}`}>
        <header>
          <div>
            <h1>{inv.supplier_name}</h1>
            {inv.supplier_address && <p>{inv.supplier_address}</p>}
            <p>{[inv.supplier_place, inv.supplier_pincode].filter(Boolean).join(" ")}</p>
            <p><strong>GSTIN</strong> {inv.supplier_gstin} · {place(stateOfGstin(inv.supplier_gstin))}</p>
            {inv.supplier_phone && <p>Phone {inv.supplier_phone}</p>}
          </div>
          <div className="invoice-head">
            <strong>{cancelled ? "CANCELLED" : "TAX INVOICE"}</strong>
            <dl>
              <dt>Invoice no.</dt><dd>{inv.number}</dd>
              <dt>Date</dt><dd>{fmtDate(inv.invoice_date)}</dd>
              <dt>Place of supply</dt><dd>{place(inv.place_of_supply)}</dd>
              <dt>Reverse charge</dt><dd>No</dd>
            </dl>
          </div>
        </header>

        <section className="invoice-parties">
          <div>
            <h2>Billed to</h2>
            <p><strong>{inv.buyer_name}</strong></p>
            {inv.buyer_address && <p>{inv.buyer_address}</p>}
            {(inv.buyer_place || inv.buyer_pincode) && <p>{[inv.buyer_place, inv.buyer_pincode].filter(Boolean).join(" ")}</p>}
            <p>{inv.buyer_gstin ? <><strong>GSTIN</strong> {inv.buyer_gstin}</> : "Unregistered"}</p>
          </div>
          <div>
            <h2>Dispatch</h2>
            <p>Vehicle {inv.vehicle_number || "—"}</p>
            {inv.pass_no && <p>Royalty pass {inv.pass_no}</p>}
            {inv.ewb_no && <p>E-way bill {inv.ewb_no}{inv.ewb_date ? `, ${fmtDate(inv.ewb_date)}` : ""}</p>}
          </div>
        </section>

        <div className="invoice-lines">
          <table>
            <thead><tr><th>Description</th><th>HSN</th><th className="n">Qty</th><th className="n">Rate</th><th className="n">Taxable value</th></tr></thead>
            <tbody>
              <tr>
                <td>{inv.item_name}</td><td>{inv.hsn_code}</td><td className="n">{qty(inv.qty)} {inv.unit}</td>
                <td className="n">{money(inv.rate)}{inv.rate_inclusive ? " incl. GST" : ""}</td><td className="n">{money(inv.taxable_value)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className="invoice-totals">
          <p className="invoice-words">{amountInWords(inv.total)}</p>
          <dl>
            <dt>Taxable value</dt><dd>{money(inv.taxable_value)}</dd>
            {interState ? <><dt>IGST @ {inv.gst_rate}%</dt><dd>{money(inv.igst)}</dd></> : <><dt>CGST @ {half}%</dt><dd>{money(inv.cgst)}</dd><dt>SGST @ {half}%</dt><dd>{money(inv.sgst)}</dd></>}
            <dt className="grand">Total</dt><dd className="grand">₹ {money(inv.total)}</dd>
          </dl>
        </section>

        {(inv.bank_details || inv.invoice_terms) && (
          <section className="invoice-notes">
            {inv.bank_details && <p><strong>Bank</strong> {inv.bank_details}</p>}
            {inv.invoice_terms && <p><strong>Terms</strong> {inv.invoice_terms}</p>}
          </section>
        )}

        <footer><span>Customer's signature</span><span>For {inv.supplier_name}<br />Authorised signatory</span></footer>
      </article>

      {cancelled && <div className="alert alert-error no-print" style={{ marginTop: 16 }}><TriangleAlert size={18} /><span>{t("invoice.cancelledNote")}</span></div>}

      {isAdmin && !cancelled && (
        <Section icon={Route} title={t("invoice.ewb")} subtitle={t(needed ? "invoice.ewbRequired" : "invoice.ewbOptional")} className="no-print" style={{ marginTop: 20 }}>
          <div className="card-pad stack">
            <ActionForm action={saveTransport}>
              <input type="hidden" name="id" value={inv.id} />
              <div className="fields">
                <label className="field"><span>{t("customer.place")}</span><input className="input" name="buyer_place" maxLength={60} defaultValue={inv.buyer_place ?? ""} /></label>
                <label className="field"><span>{t("company.pincode")}</span><input className="input" name="buyer_pincode" inputMode="numeric" maxLength={6} defaultValue={inv.buyer_pincode ?? ""} /></label>
                <label className="field"><span>{t("invoice.distance")}</span><input className="input num" type="number" name="distance_km" min="0" max="4000" step="1" inputMode="numeric" defaultValue={inv.distance_km ?? ""} /><small>{t("invoice.distanceHint")}</small></label>
              </div>
              <div><SubmitButton className="btn"><Save size={16} /> {t("action.save")}</SubmitButton></div>
            </ActionForm>

            {problems.length > 0 ? (
              <div className="alert alert-info"><TriangleAlert size={18} /><span>{t("invoice.ewbMissing", { list: problems.map((p) => t(`invoice.missing.${p}`)).join(", ") })}</span></div>
            ) : (
              <div className="row">
                <a className="btn btn-primary" href={`/api/export/ewaybill?id=${inv.id}`} download><Download size={16} /> {t("invoice.ewbDownload")}</a>
                <span className="muted" style={{ fontSize: 13 }}>{t("invoice.ewbSteps")}</span>
              </div>
            )}

            <ActionForm action={saveEwayBill}>
              <input type="hidden" name="id" value={inv.id} />
              <div className="fields fields-pair">
                <label className="field"><span>{t("invoice.ewbNumber")}</span><input className="input" name="ewb_no" inputMode="numeric" maxLength={14} defaultValue={inv.ewb_no ?? ""} required /></label>
                <label className="field"><span>{t("invoice.ewbDate")}</span><input className="input" type="date" name="ewb_date" defaultValue={inv.ewb_date ?? inv.invoice_date} required /></label>
              </div>
              <div><SubmitButton className="btn"><Save size={16} /> {t("invoice.ewbSave")}</SubmitButton></div>
            </ActionForm>
          </div>
        </Section>
      )}
    </>
  );
}
