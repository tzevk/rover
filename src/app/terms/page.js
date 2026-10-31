import LegalPage from "@/components/legal/LegalPage";
import { PLAN_DAYS, TRIAL_DAYS } from "@/lib/billing";
import { SITE } from "@/lib/site";

export const metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>These terms apply when a company uses {SITE.name} software. By creating an account you accept them on your company's behalf.</p>
      <h2>Your account</h2>
      <p>You are responsible for your logins, for what your staff do with them, and for keeping passwords private. You must give accurate details when you sign up.</p>
      <h2>Trial and payment</h2>
      <p>New companies get a {TRIAL_DAYS}-day free trial. After that, access continues for {PLAN_DAYS} days for each payment. If access ends, your company's screens stay closed until it is renewed. Payments are handled by our payment provider.</p>
      <h2>Your data</h2>
      <p>The business records you enter belong to your company. We use them only to run the service. See the Privacy Policy for details.</p>
      <h2>Acceptable use</h2>
      <p>Do not try to reach another company's data, disrupt the service, or use it for anything unlawful. We may suspend accounts that do.</p>
      <h2>Your records are your responsibility</h2>
      <p>The software helps you keep records, but it is not accounting, tax or legal advice. Please check important figures yourself. The service is provided as it is, and we can't promise it will never be interrupted.</p>
      <h2>Changes</h2>
      <p>We may update the service and these terms. If you keep using the service after a change, the new terms apply.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India.</p>
    </LegalPage>
  );
}
