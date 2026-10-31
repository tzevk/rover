"use client";

import ActionForm from "@/components/ActionForm";
import SubmitButton from "@/components/SubmitButton";
import { submitEnquiry } from "@/app/actions/enquiries";

export default function DemoForm({ demo, lang }) {
  const f = demo.fields;
  return (
    <ActionForm action={submitEnquiry} className="demo-form" resetOnSuccess>
      <input type="hidden" name="lang" value={lang} />
      <input className="demo-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label><span>{f.name}</span><input name="name" required maxLength={100} autoComplete="name" /></label>
      <label><span>{f.company}</span><input name="company" required maxLength={120} autoComplete="organization" /></label>
      <label><span>{f.type}</span>
        <select name="business_type" required defaultValue=""><option value="" disabled>{demo.choose}</option>{demo.types.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label><span>{f.location}</span><input name="location" required maxLength={120} /></label>
      <label><span>{f.phone}</span><input name="phone" type="tel" required maxLength={20} autoComplete="tel" /></label>
      <label><span>{f.email}</span><input name="email" type="email" required maxLength={120} autoComplete="email" /></label>
      <label><span>{f.employees}</span><input name="employees" maxLength={20} inputMode="numeric" /></label>
      <label className="wide"><span>{f.needs}</span><textarea name="requirements" rows={4} maxLength={2000} /></label>
      <SubmitButton className="act wide" pendingText="…">{demo.submit}</SubmitButton>
    </ActionForm>
  );
}
