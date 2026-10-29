"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Plus, Search, UserPlus, X } from "lucide-react";
import { createOrder } from "@/app/actions/orders";
import { quickAddCustomer } from "@/app/actions/customers";
import { useI18n } from "@/components/I18n";
import { inr } from "@/lib/format";
import { newRequestId } from "@/lib/request-id";

export default function NewOrderForm({ customers: initialCustomers }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(createOrder, null);
  const requestIdRef = useRef(null);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customer, setCustomer] = useState(null);
  const [orderedQty, setOrderedQty] = useState("");
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (state?.ok) {
      requestIdRef.current = null;
      setCustomer(null);
      setOrderedQty("");
      setRate("");
    }
  }, [state]);

  const total = (Number(orderedQty) || 0) * (Number(rate) || 0);

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        requestIdRef.current ??= newRequestId();
        data.set("request_id", requestIdRef.current);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="customer_id" value={customer?.id ?? ""} />

      <div className="field">
        <span>{t("newOrder.customerName")}</span>
        <CustomerPicker
          customers={customers}
          value={customer}
          onChange={setCustomer}
          onCreated={(c) => {
            setCustomers((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
            setCustomer(c);
          }}
        />
      </div>

      <div className="fields fields-pair">
        <label className="field">
          <span>{t("newOrder.orderedQty")}</span>
          <input className="input num" name="ordered_qty" type="number" inputMode="decimal" min="0.01" step="0.01"
            required value={orderedQty} onChange={(e) => setOrderedQty(e.target.value)} placeholder="0" />
        </label>
        <label className="field">
          <span>{t("newOrder.ratePerUnit")}</span>
          <input className="input num" name="rate" type="number" inputMode="decimal" min="0.01" step="0.01"
            required value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
        </label>
      </div>

      <div className="calc">
        <div><span>{t("newOrder.qtyTimesRate")}</span><strong>{orderedQty || 0} × {rate || 0}</strong></div>
        <div className="hl"><span>{t("newOrder.totalAmount")}</span><strong>{inr(total)}</strong></div>
      </div>

      {state?.error && <div className="alert alert-error"><AlertCircle size={18} />{state.error}</div>}
      {state?.ok && (
        <div className="alert alert-ok">
          <CheckCircle2 size={18} />
          <span>{state.message}. <Link href="/deliveries" className="inline-link">{t("newOrder.viewPending")} <ArrowRight size={13} /></Link></span>
        </div>
      )}

      <div className="row">
        <button type="submit" className="btn btn-accent btn-lg" disabled={!customer || pending}>
          {pending ? t("newOrder.booking") : <><CheckCircle2 size={18} /> {t("newOrder.book")}</>}
        </button>
      </div>
    </form>
  );
}

function CustomerPicker({ customers, value, onChange, onCreated }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const boxRef = useRef(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? customers.filter((c) => c.name.toLowerCase().includes(s) || (c.phone || "").includes(s))
      : customers;
    return list.slice(0, 50);
  }, [q, customers]);

  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (value) {
    return (
      <div className="picked">
        <div>
          <strong>{value.name}</strong>
          {value.phone && <span className="muted"> · {value.phone}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(null); setQ(""); }}>
          <X size={14} /> {t("newOrder.change")}
        </button>
      </div>
    );
  }

  if (adding) {
    return (
      <NewCustomer
        initialName={q}
        onCancel={() => setAdding(false)}
        onCreated={(c) => { setAdding(false); setQ(""); onCreated(c); }}
      />
    );
  }

  return (
    <div className="picker" ref={boxRef}>
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 14, color: "var(--muted)" }} />
        <input
          className="input"
          style={{ paddingLeft: 36 }}
          placeholder={t("newOrder.searchPlaceholder")}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) { onChange(matches[0]); setOpen(false); }
            }
          }}
        />
      </div>
      {open && (
        <div className="picker-list" role="listbox">
          {matches.map((c) => (
            <button type="button" key={c.id} className="picker-item" onClick={() => { onChange(c); setOpen(false); }}>
              <span>{c.name}</span>
              <small>{c.phone}</small>
            </button>
          ))}
          {matches.length === 0 && <div className="muted" style={{ padding: "8px 10px" }}>{t("newOrder.noCustomer")}</div>}
          <button type="button" className="picker-item picker-new" onClick={() => { setAdding(true); setOpen(false); }}>
            <Plus size={16} /> {q.trim() ? t("newOrder.addNewNamed", { name: q.trim() }) : t("newOrder.addNew")}
          </button>
        </div>
      )}
    </div>
  );
}

function NewCustomer({ initialName, onCancel, onCreated }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: initialName, phone: "", address: "" });
  const [error, setError] = useState("");
  const [pending, startSaving] = useTransition();
  const [requestId] = useState(newRequestId);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    if (pending) return;
    startSaving(async () => {
      const res = await quickAddCustomer({ ...form, request_id: requestId });
      if (res.error) setError(res.error);
      else onCreated(res.customer);
    });
  }

  return (
    // This sits inside the order form, so Enter must save the customer, not submit the order.
    <div className="inset form" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}>
      <strong className="row" style={{ gap: 8 }}><UserPlus size={17} /> {t("newOrder.newCustomer")}</strong>
      <div className="fields">
        <label className="field"><span>{t("common.nameRequired")}</span><input className="input" autoFocus value={form.name} onChange={set("name")} /></label>
        <label className="field"><span>{t("common.phone")}</span><input className="input" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} /></label>
      </div>
      <label className="field"><span>{t("common.address")}</span><input className="input" value={form.address} onChange={set("address")} /></label>
      {error && <div className="alert alert-error"><AlertCircle size={18} />{error}</div>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? t("common.saving") : <><CheckCircle2 size={16} /> {t("newOrder.saveCustomer")}</>}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}
