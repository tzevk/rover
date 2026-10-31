"use server";

import { revalidatePath } from "next/cache";
import { guarded, requestId } from "@/lib/action";
import { requireAdmin } from "@/lib/auth";
import { invalidate, TAGS } from "@/lib/cache";
import { audit, query, stockLevels, transaction } from "@/lib/db";
import { todayISO, UNITS } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { num, text } from "@/lib/validate";

const positiveOrZero = (v) => { const n = v === "" || v == null ? 0 : num(v); return n >= 0 ? n : NaN; };

function readMaterial(formData) {
  const unit = String(formData.get("unit") || "tonne");
  return {
    name: text(formData.get("name"), 80),
    unit: UNITS.includes(unit) ? unit : "tonne",
    kgPerUnit: num(formData.get("kg_per_unit") || 1000),
    rate: positiveOrZero(formData.get("default_rate")),
    opening: positiveOrZero(formData.get("opening_stock")),
    low: positiveOrZero(formData.get("low_stock")),
  };
}

function materialError(m, t) {
  if (!m.name) return t("action.nameRequired");
  if (!(m.kgPerUnit > 0)) return t("stock.kgPerUnitRule");
  if (Number.isNaN(m.rate) || Number.isNaN(m.opening) || Number.isNaN(m.low)) return t("stock.numbersRule");
  return null;
}

export const addMaterial = guarded("addMaterial", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const m = readMaterial(formData);
  const problem = materialError(m, t);
  if (problem) return { error: problem };
  const result = await transaction(async (tx) => {
    const [taken] = await tx.query("SELECT id FROM materials WHERE company_id = ? AND name = ?", [user.company_id, m.name]);
    if (taken) return { error: t("stock.nameTaken", { name: m.name }) };
    const res = await tx.query(
      "INSERT INTO materials (company_id, name, unit, kg_per_unit, default_rate, opening_stock, low_stock) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, m.name, m.unit, m.kgPerUnit, m.rate, m.opening, m.low],
    );
    await audit(tx, user, "material.add", "material", res.insertId, m);
    return { ok: true, message: t("common.added", { name: m.name }) };
  });
  if (result.ok) {
    invalidate(TAGS.stock);
    revalidatePath("/stock");
  }
  return result;
});

export const updateMaterial = guarded("updateMaterial", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("id"));
  const m = readMaterial(formData);
  const problem = materialError(m, t);
  if (problem) return { error: problem };
  const active = formData.get("active") === "on" ? 1 : 0;
  const result = await transaction(async (tx) => {
    const [before] = await tx.query("SELECT * FROM materials WHERE id = ? AND company_id = ? FOR UPDATE", [id, user.company_id]);
    if (!before) return { error: t("stock.notFound") };
    const [taken] = await tx.query("SELECT id FROM materials WHERE company_id = ? AND name = ? AND id <> ?", [user.company_id, m.name, id]);
    if (taken) return { error: t("stock.nameTaken", { name: m.name }) };
    await tx.query(
      "UPDATE materials SET name = ?, unit = ?, kg_per_unit = ?, default_rate = ?, opening_stock = ?, low_stock = ?, active = ? WHERE id = ? AND company_id = ?",
      [m.name, m.unit, m.kgPerUnit, m.rate, m.opening, m.low, active, id, user.company_id],
    );
    await audit(tx, user, "material.update", "material", id, { before, after: { ...m, active } });
    return { ok: true, message: t("action.saved") };
  });
  if (result.ok) {
    invalidate(TAGS.stock);
    revalidatePath("/stock");
    revalidatePath(`/stock/${id}`);
  }
  return result;
});

// A physical count sets the book figure to what's really there, and keeps the gap on record.
export const recordCount = guarded("recordCount", async (_prev, formData) => {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const id = Number(formData.get("material_id"));
  const counted = num(formData.get("counted_qty"));
  const note = text(formData.get("note"));
  if (!(counted >= 0)) return { error: t("stock.countRule") };
  const rows = await query(`SELECT * FROM (${stockLevels(user.company_id)}) s WHERE s.id = ?`, [id]);
  if (!rows[0]) return { error: t("stock.notFound") };
  const book = rows[0].on_hand;
  const difference = Math.round((counted - book) * 100) / 100;
  await transaction(async (tx) => {
    const res = await tx.query(
      "INSERT INTO stock_counts (company_id, material_id, count_date, book_qty, counted_qty, difference, note, created_by, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [user.company_id, id, todayISO(), book, counted, difference, note || null, user.id, requestId(formData)],
    );
    await audit(tx, user, "stock.count", "material", id, { countId: res.insertId, book, counted, difference });
  });
  invalidate(TAGS.stock);
  revalidatePath("/stock");
  revalidatePath(`/stock/${id}`);
  return { ok: true, message: t("stock.countSaved") };
});
