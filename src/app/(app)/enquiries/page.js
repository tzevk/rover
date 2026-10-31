import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { EmptyState, PageHead, Section } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.enquiries");

// Demo requests from the website belong to R.K. Enterprises (company 1), not to customer companies.
export default async function EnquiriesPage() {
  const me = await requireAdmin();
  if (me.company_id !== 1) notFound();
  const { t, fmtDateTime } = await getI18n();
  const rows = await query("SELECT * FROM enquiries ORDER BY id DESC LIMIT 200");
  return (
    <>
      <PageHead icon={Inbox} title={t("nav.enquiries")} subtitle={t("enquiries.subtitle")} />
      <Section icon={Inbox} title={t("nav.enquiries")}>
        {rows.length === 0 ? <EmptyState icon={Inbox} title={t("enquiries.none")} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>{t("enquiries.company")}</th><th>{t("enquiries.contact")}</th><th>{t("enquiries.business")}</th><th>{t("enquiries.needs")}</th><th>{t("common.date")}</th>
              </tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.company}</strong><br /><span className="muted">{e.location}</span></td>
                    <td>{e.name}<br /><a href={`tel:${e.phone}`}>{e.phone}</a><br /><a href={`mailto:${e.email}`}>{e.email}</a></td>
                    <td>{e.business_type}{e.employees ? ` · ${e.employees}` : ""}</td>
                    <td>{e.requirements || "-"}</td>
                    <td className="nowrap">{fmtDateTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
