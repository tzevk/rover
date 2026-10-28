import { ClipboardPen, Info, PlusCircle } from "lucide-react";
import { PageHead, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import NewOrderForm from "./NewOrderForm";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  await requireUser();
  // Workers see names and phones only — never balances.
  const customers = await query("SELECT id, name, phone FROM customers ORDER BY name");
  return (
    <>
      <PageHead icon={PlusCircle} title="Book a new order" subtitle="Pick the customer, enter quantity and rate. The total works itself out." />
      <div className="split">
        <Section icon={ClipboardPen} title="Order details" subtitle="All three fields are required">
          <div className="card-pad"><NewOrderForm customers={customers} /></div>
        </Section>
        <Section icon={Info} title="How booking works" className="aside-card">
          <ol className="steps">
            <li><strong>Choose the customer.</strong> Type a name or phone. New customer? Add them right from the list.</li>
            <li><strong>Enter quantity and rate.</strong> The total is calculated as you type.</li>
            <li><strong>Book it.</strong> The order appears under Pending deliveries until its vehicle is dispatched.</li>
          </ol>
        </Section>
      </div>
    </>
  );
}
