import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import { PLAN_DAYS, TRIAL_DAYS } from "@/lib/billing";

export const metadata = {
  title: { absolute: "Help | R.K. Enterprises" },
  description: "How to set up your company, manage logins, renew your plan and download your records.",
  alternates: { canonical: "/help" },
};

export default function Help() {
  return (
    <LegalPage title="Help" draft={false}>
      <h2>Getting started</h2>
      <p>Your dashboard lists the first steps: add a customer, add what you sell or make, create a login for your staff, and book your first order. The list goes away once they are done.</p>
      <h2>Owners and staff</h2>
      <p>An owner sees everything. Staff book orders, complete deliveries, enter expenses and mark attendance, and can't see balances or reports. Add or disable logins under Users.</p>
      <h2>A forgotten password</h2>
      <p>Owners reset staff passwords under Users. If you are the owner and can't sign in, contact us below.</p>
      <h2>Your trial and plan</h2>
      <p>A new company gets {TRIAL_DAYS} days free. Each payment then adds {PLAN_DAYS} days, and paying early adds to the time left. Nothing is charged automatically. If access ends, your screens close until you renew, and your records stay in place.</p>
      <h2>Downloading your records</h2>
      <p>An owner can download everything as spreadsheets under Plan &amp; billing, at any time, including after access ends. Orders, GST sheets and Tally files have their own downloads on those pages.</p>
      <h2>Working without internet</h2>
      <p>The gate screen keeps working offline on a device that has opened it once. Entries are saved on the device and sent when the connection returns. Every other screen needs internet.</p>
      <p><Link href="/#demo">Send us a message</Link></p>
    </LegalPage>
  );
}
