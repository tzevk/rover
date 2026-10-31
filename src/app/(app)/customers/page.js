import Link from "next/link";
import { BadgeIndianRupee, Contact, HandCoins, Search, Users, UserPlus, Wallet } from "lucide-react";
import Phone from "@/components/Phone";
import ActionForm from "@/components/ActionForm";
import { EmptyState, HeadLink, PageHead, Section, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { createCustomer } from "@/app/actions/customers";
import { requireAdmin } from "@/lib/auth";
import { cached, TAGS } from "@/lib/cache";
import { customerBalances, query } from "@/lib/db";
import { inr } from "@/lib/format";
import { getI18n, pageTitle } from "@/lib/i18n/server";

export const generateMetadata = pageTitle("nav.customers");

export default async function CustomersPage({ searchParams }) {
  const { company_id: cid } = await requireAdmin();
  const { t } = await getI18n();
  const { q = "", show = "all" } = await searchParams;
  const like = `%${q.trim()}%`;
  const customers = await cached(`balances:${cid}:${show}:${q.trim()}`, { tags: [TAGS.customers, TAGS.orders, TAGS.payments], ttl: 60 }, () => query(
    `SELECT * FROM (${customerBalances(cid)}) b
     WHERE (name LIKE ? OR phone LIKE ?) ${show === "due" ? "AND outstanding > 0" : ""}
     ORDER BY outstanding DESC, name`,
    [like, like],
  ));
  const totals = customers.reduce(
    (t, c) => ({ billed: t.billed + c.billed, paid: t.paid + c.paid, outstanding: t.outstanding + Math.max(c.outstanding, 0) }),
    { billed: 0, paid: 0, outstanding: 0 },
  );

  return (
    <>
      <PageHead icon={Contact} title={t("nav.customers")} subtitle={t("customers.subtitle")} />

      <div className="stats">
        <Stat accent icon={Wallet} label={t("customers.outstanding")} value={inr(totals.outstanding)} />
        <Stat icon={BadgeIndianRupee} label={t("customers.totalBilled")} value={inr(totals.billed)} />
        <Stat icon={HandCoins} tone="ok" label={t("customers.totalReceived")} value={inr(totals.paid)} />
        <Stat icon={Users} tone="brown" label={t("common.customers")} value={customers.length} />
      </div>

      <details className="card" style={{ marginBottom: 20 }}>
        <summary><UserPlus size={18} /> {t("customers.addSummary")}</summary>
        <div className="card-pad">
          <ActionForm action={createCustomer} resetOnSuccess>
            <div className="fields">
              <label className="field"><span>{t("common.nameRequired")}</span><input className="input" name="name" required /></label>
              <label className="field"><span>{t("common.phone")}</span><input className="input" name="phone" type="tel" /></label>
              <label className="field"><span>{t("common.address")}</span><input className="input" name="address" /></label>
            </div>
            <div><SubmitButton><UserPlus size={16} /> {t("customers.add")}</SubmitButton></div>
          </ActionForm>
        </div>
      </details>

      <Section icon={Contact} title={t("home.balanceReport")} subtitle={t("customers.highestFirst")}>
        <form className="filters">
          <label className="field" style={{ flex: 1 }}>
            <span>{t("common.search")}</span>
            <input className="input" name="q" defaultValue={q} placeholder={t("customers.searchPlaceholder")} />
          </label>
          <label className="field">
            <span>{t("customers.show")}</span>
            <select className="select" name="show" defaultValue={show}>
              <option value="all">{t("customers.showAll")}</option>
              <option value="due">{t("customers.showDue")}</option>
            </select>
          </label>
          <button className="btn"><Search size={16} /> {t("common.apply")}</button>
        </form>
        {customers.length === 0 ? (
          <EmptyState icon={Users} title={t("customers.none")}>{t("customers.noneText")}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("common.customer")}</th><th>{t("common.phone")}</th><th>{t("common.address")}</th>
                  <th className="num">{t("customers.deliveries")}</th><th className="num">{t("customers.billed")}</th><th className="num">{t("customers.received")}</th><th className="num">{t("customers.outstanding")}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="cell-link" href={`/customers/${c.id}`}>{c.name}</Link></td>
                    <td className="nowrap">{c.phone ? <Phone number={c.phone} /> : "—"}</td>
                    <td className="muted">{c.address || "—"}</td>
                    <td className="num">{c.orders}</td>
                    <td className="num">{inr(c.billed)}</td>
                    <td className="num">{inr(c.paid)}</td>
                    <td className={`num ${c.outstanding > 0 ? "due" : c.outstanding < 0 ? "credit" : ""}`}>
                      {c.outstanding < 0 ? t("customers.advance", { amount: inr(-c.outstanding) }) : inr(c.outstanding)}
                    </td>
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
