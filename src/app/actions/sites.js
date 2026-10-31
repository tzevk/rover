"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/action";
import { requireAdmin, requireUser } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, transaction } from "@/lib/db";
import { isGstin, isPincode } from "@/lib/gst.mjs";
import { getI18n } from "@/lib/i18n/server";
import { getSites } from "@/lib/sites";
import { SITE_COOKIE } from "@/lib/ui-prefs";
import { text } from "@/lib/validate";

function readSite(formData) {
  return {
    name: text(formData.get("name"), 80),
    address: text(formData.get("address")),
    place: text(formData.get("place"), 60),
    pincode: text(formData.get("pincode"), 6),
    gstin: text(formData.get("gstin"), 15).toUpperCase(),
  };
}

function siteProblem(s, t) {
  if (!s.name) return t("action.nameRequired");
  if (s.gstin && !isGstin(s.gstin)) return t("company.gstinRule");
  if (s.pincode && !isPincode(s.pincode)) return t("company.pincodeRule");
  return null;
}

export const addSite = guarded("addSite", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const s = readSite(formData);
  const problem = siteProblem(s, t);
  if (problem) return { error: problem };
  const result = await transaction(async (tx) => {
    const [taken] = await tx.query("SELECT id FROM sites WHERE company_id = ? AND name = ?", [user.company_id, s.name]);
    if (taken) return { error: t("stock.nameTaken", { name: s.name }) };
    const res = await tx.query(
      "INSERT INTO sites (company_id, name, address, place, pincode, gstin) VALUES (?, ?, ?, ?, ?, ?)",
      [user.company_id, s.name, s.address || null, s.place || null, s.pincode || null, s.gstin || null],
    );
    await audit(tx, user, "site.add", "site", res.insertId, s);
    return { ok: true, message: t("common.added", { name: s.name }) };
  });
  if (result.ok) {
    invalidate(TAGS.sites);
    revalidatePath("/", "layout");
  }
  return result;
});

export const updateSite = guarded("updateSite", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const s = readSite(formData);
  const active = formData.get("active") === "on" ? 1 : 0;
  const problem = siteProblem(s, t);
  if (problem) return { error: problem };
  const result = await transaction(async (tx) => {
    const [before] = await tx.query("SELECT * FROM sites WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
    if (!before) return { error: t("sites.notFound") };
    const [taken] = await tx.query("SELECT id FROM sites WHERE company_id = ? AND name = ? AND id <> ?", [user.company_id, s.name, id]);
    if (taken) return { error: t("stock.nameTaken", { name: s.name }) };
    if (!active) {
      const [{ n }] = await tx.query("SELECT COUNT(*) AS n FROM sites WHERE company_id = ? AND active = 1 AND id <> ?", [user.company_id, id]);
      if (!n) return { error: t("sites.lastActive") };
    }
    await tx.query("UPDATE sites SET name = ?, address = ?, place = ?, pincode = ?, gstin = ?, active = ? WHERE id = ? AND company_id = ?",
      [s.name, s.address || null, s.place || null, s.pincode || null, s.gstin || null, active, id, user.company_id]);
    await audit(tx, user, "site.update", "site", id, { before, after: { ...s, active } });
    return { ok: true, message: t("action.saved") };
  });
  if (result.ok) {
    invalidate(TAGS.sites);
    revalidatePath("/", "layout");
  }
  return result;
});

// Pin a login to one site, or leave it free to choose.
export const setUserSite = guarded("setUserSite", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const userId = Number(formData.get("user_id"));
  const siteId = Number(formData.get("site_id")) || null;
  const sites = await getSites(user.company_id);
  if (siteId && !sites.some((s) => s.id === siteId)) return { error: t("sites.notFound") };
  await transaction(async (tx) => {
    const res = await tx.query("UPDATE users SET site_id = ? WHERE id = ? AND company_id = ?", [siteId, userId, user.company_id]);
    if (res.affectedRows) await audit(tx, user, "user.site", "user", userId, { siteId });
  });
  invalidate(TAGS.users);
  revalidatePath("/users");
  return { ok: true, message: t("action.saved") };
});

export const chooseSite = guarded("chooseSite", async (id) => {
  const user = await requireUser();
  const sites = await getSites(user.company_id);
  const site = sites.find((s) => s.id === Number(id) && s.active);
  if (!site || user.site_id) return;
  (await cookies()).set(SITE_COOKIE, String(site.id), { path: "/", maxAge: 31536000, sameSite: "lax" });
  revalidatePath("/", "layout");
});
