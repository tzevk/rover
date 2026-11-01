import Link from "next/link";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { Section } from "@/components/ui";
import { query } from "@/lib/db";

// Worked out from the records themselves, so it disappears once the company is under way.
export default async function GettingStarted({ user, t }) {
  if (user.plan !== "trial") return null;
  const id = user.company_id;
  const [[customers], [materials], [logins], [orders]] = await Promise.all([
    query("SELECT COUNT(*) AS n FROM customers WHERE company_id = ?", [id]),
    query("SELECT COUNT(*) AS n FROM materials WHERE company_id = ?", [id]),
    query("SELECT COUNT(*) AS n FROM users WHERE company_id = ?", [id]),
    query("SELECT COUNT(*) AS n FROM orders WHERE company_id = ?", [id]),
  ]);
  const steps = [
    { href: "/customers", label: t("start.customer"), done: customers.n > 0 },
    { href: "/stock", label: t("start.material"), done: materials.n > 0 },
    { href: "/users", label: t("start.login"), done: logins.n > 1 },
    { href: "/orders/new", label: t("start.order"), done: orders.n > 0 },
  ];
  const finished = steps.filter((s) => s.done).length;
  if (finished === steps.length) return null;
  return (
    <Section icon={Rocket} title={t("start.title")} subtitle={`${finished} / ${steps.length}`}>
      <ul className="start-list">
        {steps.map((s) => (
          <li key={s.href} data-done={s.done ? "1" : undefined}>
            <Link href={s.href}>{s.done ? <CheckCircle2 size={18} /> : <Circle size={18} />} {s.label}</Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
