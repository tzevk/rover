"use server";

import { headers } from "next/headers";
import { guarded } from "@/lib/action";
import { clientIp } from "@/lib/client-ip";
import { query } from "@/lib/db";
import { text } from "@/lib/validate";

const WINDOW_MS = 10 * 60 * 1000, MAX_PER_IP = 5;
const seen = (globalThis.__rkEnquiries ??= new Map());
const MESSAGES = {
  en: { missing: "Please fill in your name, company, business type, location, phone and email.", email: "Please enter a valid email address.", phone: "Please enter a valid phone number.", busy: "Too many requests just now. Please try again later.", ok: "Thank you. We'll contact you to arrange your demo." },
  mr: { missing: "कृपया नाव, कंपनी, व्यवसायाचा प्रकार, ठिकाण, फोन आणि ईमेल भरा.", email: "कृपया योग्य ईमेल भरा.", phone: "कृपया योग्य फोन नंबर भरा.", busy: "सध्या खूप विनंत्या आल्या आहेत. कृपया नंतर प्रयत्न करा.", ok: "धन्यवाद. डेमो ठरवण्यासाठी आम्ही तुमच्याशी संपर्क साधू." },
};

export const submitEnquiry = guarded("submitEnquiry", async (_prev, formData) => {
  const m = MESSAGES[formData.get("lang")] ?? MESSAGES.en;
  // Bots fill every field; people never see this one.
  if (formData.get("website")) return { ok: true, message: m.ok };

  const v = {
    name: text(formData.get("name"), 100), company: text(formData.get("company"), 120),
    type: text(formData.get("business_type"), 60), location: text(formData.get("location"), 120),
    phone: text(formData.get("phone"), 20), email: text(formData.get("email"), 120),
    employees: text(formData.get("employees"), 20), requirements: text(formData.get("requirements"), 2000),
  };
  if (!v.name || !v.company || !v.type || !v.location || !v.phone || !v.email) return { error: m.missing };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { error: m.email };
  if (!/^[+\d][\d\s-]{6,19}$/.test(v.phone)) return { error: m.phone };

  const ip = clientIp(await headers()), now = Date.now(), rec = seen.get(ip);
  if (seen.size > 10_000) for (const [k, r] of seen) if (now - r.at > WINDOW_MS) seen.delete(k);
  if (rec && now - rec.at < WINDOW_MS && rec.count >= MAX_PER_IP) return { error: m.busy };
  seen.set(ip, { at: rec && now - rec.at < WINDOW_MS ? rec.at : now, count: rec && now - rec.at < WINDOW_MS ? rec.count + 1 : 1 });

  await query(
    "INSERT INTO enquiries (name, company, business_type, location, phone, email, employees, requirements) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [v.name, v.company, v.type, v.location, v.phone, v.email, v.employees || null, v.requirements || null],
  );
  return { ok: true, message: m.ok };
});
