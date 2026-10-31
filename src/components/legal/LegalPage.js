import Link from "next/link";
import Logo from "@/components/Logo";
import ContactLinks from "@/components/ContactLinks";
import { SITE } from "@/lib/site";

// Draft wording: the notice stays until a lawyer has reviewed the text.
export default function LegalPage({ title, children }) {
  return (
    <main className="legal">
      <div className="backdrop" aria-hidden="true" />
      <Link href="/" className="legal-brand"><Logo size={30} /> {SITE.name}</Link>
      <article className="card card-pad">
        <h1>{title}</h1>
        <p className="legal-draft">Draft: this document has not yet been reviewed by a lawyer.</p>
        {children}
        <h2>Contact</h2>
        <p>{SITE.email || SITE.phone ? <ContactLinks /> : "Contact us through your account owner or the details on our website."}</p>
      </article>
    </main>
  );
}
