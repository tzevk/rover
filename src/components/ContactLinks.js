import { phoneLabel, SITE, telHref } from "@/lib/site";

// Shown once CONTACT_PHONE or CONTACT_EMAIL is set, so a blank address is never displayed.
export default function ContactLinks() {
  if (!SITE.phone && !SITE.email) return null;
  return (
    <span className="contact-links">
      {SITE.phone && <a href={telHref(SITE.phone)}>{phoneLabel(SITE.phone)}</a>}
      {SITE.phone && SITE.email && " · "}
      {SITE.email && <a href={`mailto:${SITE.email}`}>{SITE.email}</a>}
    </span>
  );
}
