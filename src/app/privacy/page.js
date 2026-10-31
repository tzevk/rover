import LegalPage from "@/components/legal/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Privacy Policy",
  description: "What R.K. Enterprises stores, why it's stored and who handles it, including under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what {SITE.name} stores and why, including under India's Digital Personal Data Protection Act, 2023.</p>
      <h2>What we store</h2>
      <p>Your company name; login names and hashed passwords; and the records your team enters, such as customers and their phone numbers and addresses, orders, payments, expenses, staff, attendance and wages. We also keep a log of who changed what.</p>
      <h2>Why we store it</h2>
      <p>Only to provide the service: showing your records to your team, keeping you signed in, and taking payment. We don't sell personal data.</p>
      <h2>Cookies</h2>
      <p>We use cookies to keep you signed in and to remember your language, theme and sidebar choices. We don't use advertising cookies.</p>
      <h2>On your device</h2>
      <p>So the gate screen can work without a connection, the browser keeps customer names and phone numbers, material rates, vehicle numbers and booked orders on that device, along with any entries waiting to be sent. Signing out removes the stored names and rates. Entries not yet sent stay on the device until they've been sent or discarded.</p>
      <h2>Who else handles data</h2>
      <p>Our hosting and database providers store the data. Our payment provider processes payments and we never see your card details.</p>
      <h2>Your records about other people</h2>
      <p>Your company is responsible for having a proper reason to store details of its customers and staff.</p>
      <h2>Your choices</h2>
      <p>You can ask us for a copy of your data, or ask us to correct or delete it. Some records may need to be kept for legal or accounting reasons.</p>
      <h2>Security</h2>
      <p>Passwords are stored as hashes, each company's data is kept separate, and only your owner login can see balances and reports.</p>
    </LegalPage>
  );
}
