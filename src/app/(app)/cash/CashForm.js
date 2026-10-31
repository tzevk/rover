"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { useI18n } from "@/components/I18n";
import SubmitButton from "@/components/SubmitButton";
import { closeCash } from "@/app/actions/cash";
import { inr } from "@/lib/format";

const NOTES = [500, 200, 100, 50, 20, 10];

// Counting by note is how a cash box is really counted, and it saves adding up on paper. The figures
// here are only a guide while typing: the server works everything out again from the records.
export default function CashForm({ date, needsOpening, opening, cashIn, cashOut, closing }) {
  const { t } = useI18n();
  const [start, setStart] = useState(String(opening || ""));
  const [deposited, setDeposited] = useState(closing ? String(closing.deposited) : "");
  const [notes, setNotes] = useState({});
  const [coins, setCoins] = useState("");
  const [counted, setCounted] = useState(closing ? String(closing.counted) : "");
  const [note, setNote] = useState(closing?.note ?? "");

  function setCount(value, n) {
    const next = { ...notes, [value]: n };
    setNotes(next);
    add(next, coins);
  }

  function add(all, loose) {
    const sum = NOTES.reduce((s, v) => s + v * (Number(all[v]) || 0), 0) + (Number(loose) || 0);
    setCounted(sum ? String(sum) : "");
  }

  const expected = Math.round(((Number(start) || 0) + cashIn - cashOut - (Number(deposited) || 0)) * 100) / 100;
  const difference = Math.round(((Number(counted) || 0) - expected) * 100) / 100;

  return (
    <ActionForm action={closeCash}>
      <input type="hidden" name="close_date" value={date} />
      {needsOpening && (
        <label className="field">
          <span>{t("cash.opening")}</span>
          <input className="input num" type="number" name="opening" min="0" step="0.01" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
          <small>{t("cash.openingHint")}</small>
        </label>
      )}

      <div className="cash-notes" role="group" aria-label={t("cash.byNote")}>
        {NOTES.map((v) => (
          <label key={v}>
            <span>₹{v} ×</span>
            <input className="input num" type="number" min="0" step="1" inputMode="numeric" value={notes[v] ?? ""} onChange={(e) => setCount(v, e.target.value)} />
          </label>
        ))}
        <label>
          <span>{t("cash.coins")}</span>
          <input className="input num" type="number" min="0" step="0.01" inputMode="decimal" value={coins} onChange={(e) => { setCoins(e.target.value); add(notes, e.target.value); }} />
        </label>
      </div>

      <div className="fields fields-pair">
        <label className="field">
          <span>{t("cash.counted")}</span>
          <input className="input num" type="number" name="counted" min="0" step="0.01" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("cash.deposited")}</span>
          <input className="input num" type="number" name="deposited" min="0" step="0.01" inputMode="decimal" value={deposited} onChange={(e) => setDeposited(e.target.value)} />
        </label>
      </div>

      <div className="calc">
        <div><span>{t("cash.expected")}</span><strong>{inr(expected)}</strong></div>
        <div className="hl"><span>{t("cash.difference")}</span><strong>{inr(counted === "" ? 0 : difference)}</strong></div>
      </div>

      <label className="field">
        <span>{t("common.note")}</span>
        <input className="input" name="note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} required={counted !== "" && difference !== 0} />
        {counted !== "" && difference !== 0 && <small>{t("cash.noteHint")}</small>}
      </label>
      <div><SubmitButton className="btn btn-accent"><Lock size={16} /> {t(closing ? "cash.recount" : "cash.close")}</SubmitButton></div>
    </ActionForm>
  );
}
