"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, CloudOff, Printer, RefreshCw, Trash2, Truck, Wifi } from "lucide-react";
import Logo from "@/components/Logo";
import { useI18n } from "@/components/I18n";
import WeighButton, { ScaleSpeed } from "@/components/WeighButton";
import { inr, PAY_MODES, qty } from "@/lib/format";
import { computeTax } from "@/lib/gst.mjs";
import { discard, enqueue, getSnapshot, OFFLINE_EVENT, queued, refreshSnapshot, syncQueue } from "@/lib/offline";
import { newRequestId } from "@/lib/request-id";

const BLANK = { orderId: "", customer: "", materialId: "", rate: "", vehicle: "", tare: "", gross: "", qty: "", passNo: "", paid: "", paidMode: "cash" };

function stamp(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return `${d.toISOString().slice(0, 19).replace("T", " ").slice(0, 16)}:00`;
}

// A load weighed and sent out with or without a connection. Nothing here touches the server until
// it can: the entry is written to the device first, then sent.
export default function GateApp() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState(undefined);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [arrival, setArrival] = useState(null);
  const [error, setError] = useState("");
  const [slip, setSlip] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reloadQueue = useCallback(() => queued().then((q) => setQueue(q.sort((a, b) => a.saved_at - b.saved_at))), []);

  const send = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const outcome = await syncQueue();
      setSignIn(outcome.signIn);
      const fresh = await refreshSnapshot();
      if (fresh) setSnapshot(fresh);
    } catch {
      // Stays queued; the next connection or tap tries again.
    }
    setSyncing(false);
    reloadQueue();
  }, [reloadQueue]);

  useEffect(() => {
    getSnapshot().then((s) => setSnapshot(s ?? null)).catch(() => setSnapshot(null));
    reloadQueue();
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) send();
    };
    update();
    setArrival(stamp());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(OFFLINE_EVENT, reloadQueue);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(OFFLINE_EVENT, reloadQueue);
    };
  }, [reloadQueue, send]);

  const order = useMemo(() => snapshot?.pending.find((o) => String(o.id) === form.orderId), [snapshot, form.orderId]);
  const materialId = order ? String(order.material_id ?? "") : form.materialId;
  const material = snapshot?.materials.find((m) => String(m.id) === materialId);
  const rate = order ? order.rate : Number(form.rate) || 0;
  const net = Number(form.gross) > Number(form.tare) && Number(form.tare) > 0 ? Number(form.gross) - Number(form.tare) : null;
  const unit = material ? t(`unit.${material.unit}`) : "";

  function pickOrder(e) {
    const picked = snapshot.pending.find((o) => String(o.id) === e.target.value);
    setForm((f) => ({
      ...f, orderId: e.target.value,
      vehicle: picked?.vehicle_number ?? f.vehicle,
      tare: picked?.tare_kg ? String(picked.tare_kg) : f.tare,
      qty: picked ? String(picked.ordered_qty) : f.qty,
    }));
  }

  function pickMaterial(e) {
    const m = snapshot.materials.find((x) => String(x.id) === e.target.value);
    setForm((f) => ({ ...f, materialId: e.target.value, rate: m?.rate > 0 ? String(m.rate) : f.rate }));
  }

  function pickVehicle(e) {
    const value = e.target.value;
    const known = snapshot.vehicles.find((v) => v.number === value.trim().toUpperCase().replace(/\s+/g, " "));
    setForm((f) => ({ ...f, vehicle: value, tare: known?.tare_kg && !f.tare ? String(known.tare_kg) : f.tare }));
  }

  // Weights decide the quantity; it can still be overtyped afterwards.
  useEffect(() => {
    if (net !== null) setForm((f) => ({ ...f, qty: String(Math.round((net / (material?.kg_per_unit || 1000)) * 100) / 100) }));
  }, [net, material]);

  const amount = Math.round((Number(form.qty) || 0) * rate * 100) / 100;
  const tax = snapshot?.gst.enabled && material ? computeTax({ amount, gstRate: material.gst_rate, inclusive: snapshot.gst.inclusive }) : null;
  const total = tax ? tax.total : amount;

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!order && !form.customer.trim()) return setError(t("action.chooseCustomer"));
    if (!order && snapshot.materials.length && !material) return setError(t("action.chooseMaterial"));
    if (!(rate > 0)) return setError(t("action.ratePositive"));
    if (!form.vehicle.trim()) return setError(t("action.vehicle"));
    if (form.gross && net === null) return setError(t("deliver.grossRule"));
    if (!(Number(form.qty) > 0)) return setError(t("action.deliveredPositive"));

    const known = snapshot.customers.find((c) => c.name === form.customer.trim());
    const entry = {
      id: newRequestId(),
      saved_at: Date.now(),
      site_id: snapshot.site.id,
      order_id: order?.id ?? null,
      customer_id: known?.id ?? null,
      customer_name: order ? order.customer : form.customer.trim(),
      material_id: material?.id ?? null,
      rate,
      vehicle_number: form.vehicle,
      arrival_time: arrival,
      dispatch_time: stamp(),
      delivered_qty: form.qty,
      tare_kg: form.tare,
      gross_kg: form.gross,
      pass_no: form.passNo,
      paid_amount: form.paid,
      paid_mode: form.paidMode,
    };
    await enqueue(entry);
    setSlip({ ...entry, material: material?.name, unit, total });
    setForm(BLANK);
    setArrival(stamp());
    reloadQueue();
    send();
  }

  async function retry(entry) {
    const { rejected: _gone, ...clean } = entry;
    await enqueue(clean);
    send();
  }

  if (snapshot === undefined) {
    return <main className="gate"><header className="gate-head"><Logo size={30} /><div><h1>{t("gate.title")}</h1></div></header></main>;
  }

  return (
    <main className="gate">
      <header className="gate-head no-print">
        <Logo size={30} />
        <div>
          <h1>{t("gate.title")}</h1>
          {snapshot && <span>{snapshot.company} · {snapshot.site.name}</span>}
        </div>
        <span className={`gate-status${online ? " on" : ""}`}>{online ? <Wifi size={14} /> : <CloudOff size={14} />} {t(online ? "gate.online" : "gate.offline")}</span>
      </header>

      {!snapshot ? (
        <section className="card card-pad no-print">
          <h1 className="gate-title">{t("gate.notReadyTitle")}</h1>
          <p className="muted">{t("gate.notReadyText")}</p>
          {online && <a className="btn btn-primary" href="/login">{t("login.title")}</a>}
        </section>
      ) : (
        <>
          {!online && <div className="alert alert-info no-print"><CloudOff size={18} /><span>{t("gate.offlineNote", { when: snapshot.saved_at.slice(0, 10) })}</span></div>}
          {signIn && <div className="alert alert-error no-print"><AlertCircle size={18} /><span>{t("gate.signIn")} <a className="inline-link" href="/login">{t("login.title")}</a></span></div>}

          {slip ? (
            <section className="stack">
              <div className="alert alert-ok no-print"><CheckCircle2 size={18} /><span>{t(online ? "gate.savedOnline" : "gate.savedOffline")}</span></div>
              <article className="challan">
                <header>
                  <div><h1>{snapshot.company}</h1><p>{snapshot.site.name}</p></div>
                  <div className="challan-no"><span>{t("gate.slip")}</span><strong>{slip.id.slice(0, 8).toUpperCase()}</strong></div>
                </header>
                <dl>
                  <div><dt>{t("common.customer")}</dt><dd>{slip.customer_name}</dd></div>
                  {slip.material && <div><dt>{t("production.material")}</dt><dd>{slip.material}</dd></div>}
                  <div><dt>{t("common.vehicle")}</dt><dd>{slip.vehicle_number.toUpperCase()}</dd></div>
                  {slip.pass_no && <div><dt>{t("deliver.passNo")}</dt><dd>{slip.pass_no}</dd></div>}
                  <div><dt>{t("deliver.dispatched")}</dt><dd>{slip.dispatch_time.slice(0, 16)}</dd></div>
                  {slip.gross_kg && <><div><dt>{t("deliver.gross")}</dt><dd>{qty(slip.gross_kg)} kg</dd></div><div><dt>{t("deliver.tare")}</dt><dd>{qty(slip.tare_kg)} kg</dd></div></>}
                </dl>
                <p className="challan-qty"><span>{t("deliver.deliveredQty")}</span><strong>{qty(slip.delivered_qty)} {slip.unit}</strong></p>
                <p className="muted gate-slip-note">{t(snapshot.gst.enabled ? "gate.slipInvoice" : "gate.slipNote")}</p>
                <footer><span>{t("challan.driver")}</span><span>{t("challan.receiver")}</span></footer>
              </article>
              <div className="row no-print">
                <button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> {t("challan.print")}</button>
                <button type="button" className="btn" onClick={() => setSlip(null)}><Truck size={16} /> {t("gate.next")}</button>
              </div>
            </section>
          ) : (
            <form className="card card-pad form no-print" onSubmit={save}>
              {snapshot.pending.length > 0 && (
                <label className="field">
                  <span>{t("gate.booked")}</span>
                  <select className="select" value={form.orderId} onChange={pickOrder}>
                    <option value="">{t("gate.newSale")}</option>
                    {snapshot.pending.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.customer} · {qty(o.ordered_qty)}</option>)}
                  </select>
                </label>
              )}

              {!order && (
                <>
                  <label className="field">
                    <span>{t("common.customer")}</span>
                    <input className="input" value={form.customer} onChange={set("customer")} list="gate-customers" autoComplete="off" required maxLength={120} />
                    <datalist id="gate-customers">{snapshot.customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                    <small>{t("gate.customerHint")}</small>
                  </label>
                  <div className="fields fields-pair">
                    {snapshot.materials.length > 0 && (
                      <label className="field">
                        <span>{t("production.material")}</span>
                        <select className="select" value={form.materialId} onChange={pickMaterial} required>
                          <option value="" disabled>{t("expenses.choose")}</option>
                          {snapshot.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="field">
                      <span>{t("newOrder.ratePerUnit")}</span>
                      <input className="input num" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.rate} onChange={set("rate")} required />
                    </label>
                  </div>
                </>
              )}

              <label className="field">
                <span>{t("deliver.vehicleNumber")}</span>
                <input className="input" required value={form.vehicle} onChange={pickVehicle} list="gate-vehicles" autoCapitalize="characters" style={{ textTransform: "uppercase" }} maxLength={20} />
                <datalist id="gate-vehicles">{snapshot.vehicles.map((v) => <option key={v.number} value={v.number} />)}</datalist>
              </label>

              <div className="fields fields-pair">
                <label className="field">
                  <span>{t("deliver.tare")}</span>
                  <input className="input num" type="number" inputMode="numeric" min="1" step="1" value={form.tare} onChange={set("tare")} placeholder="kg" />
                  <WeighButton onWeight={(kg) => setForm((f) => ({ ...f, tare: String(kg) }))} />
                </label>
                <label className="field">
                  <span>{t("deliver.gross")}</span>
                  <input className="input num" type="number" inputMode="numeric" min="1" step="1" value={form.gross} onChange={set("gross")} placeholder="kg" />
                  <WeighButton onWeight={(kg) => setForm((f) => ({ ...f, gross: String(kg) }))} />
                </label>
              </div>
              <ScaleSpeed />
              {net !== null && <p className="net-line">{t("deliver.net")}: <strong>{qty(net)} kg</strong></p>}

              <div className="fields fields-pair">
                <label className="field">
                  <span>{unit ? `${t("deliver.deliveredQuantity")} (${unit})` : t("deliver.deliveredQuantity")}</span>
                  <input className="input num" type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.qty} onChange={set("qty")} />
                </label>
                <label className="field">
                  <span>{t("deliver.passNo")}</span>
                  <input className="input" maxLength={40} value={form.passNo} onChange={set("passNo")} />
                </label>
              </div>

              <div className="fields fields-pair">
                <label className="field">
                  <span>{t("deliver.paidAmount")}</span>
                  <input className="input num" type="number" inputMode="decimal" min="0" step="0.01" value={form.paid} onChange={set("paid")} placeholder="0.00" />
                </label>
                <label className="field">
                  <span>{t("cash.paidBy")}</span>
                  <select className="select" value={form.paidMode} onChange={set("paidMode")}>
                    {PAY_MODES.map((m) => <option key={m} value={m}>{t(`pay.${m}`)}</option>)}
                  </select>
                </label>
              </div>

              <div className="calc">
                {tax && <div><span>{t("gate.gstEstimate")}</span><strong>{inr(tax.tax)}</strong></div>}
                <div className="hl"><span>{t("common.total")}</span><strong>{inr(total)}</strong></div>
              </div>

              {error && <div className="alert alert-error"><AlertCircle size={18} />{error}</div>}
              <div className="row"><button type="submit" className="btn btn-accent btn-lg"><CheckCircle2 size={18} /> {t("gate.save")}</button></div>
            </form>
          )}

          {queue.length > 0 && (
            <section className="card no-print gate-queue">
              <div className="gate-queue-head">
                <strong>{t("gate.waiting", { n: queue.length })}</strong>
                {online && <button type="button" className="btn btn-sm" onClick={send} disabled={syncing}><RefreshCw size={14} /> {t(syncing ? "gate.sendingNow" : "gate.sendNow")}</button>}
              </div>
              <ul>
                {queue.map((e) => (
                  <li key={e.id} className={e.rejected ? "rejected" : undefined}>
                    <div>
                      <strong>{e.customer_name}</strong>
                      <span>{String(e.vehicle_number).toUpperCase()} · {qty(e.delivered_qty)} · {e.dispatch_time.slice(0, 16)}</span>
                      {e.rejected && <span className="due">{e.rejected}</span>}
                    </div>
                    {e.rejected && (
                      <div className="row">
                        <button type="button" className="btn btn-sm" onClick={() => retry(e)}><RefreshCw size={14} /> {t("gate.retry")}</button>
                        <button type="button" className="btn btn-ghost btn-sm btn-danger" aria-label={t("gate.discard")} title={t("gate.discard")}
                          onClick={() => { if (confirm(t("gate.discardConfirm"))) discard(e.id); }}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <a className="btn btn-ghost btn-sm no-print gate-back" href="/"><ArrowLeft size={14} /> {t("gate.backToApp")}</a>
        </>
      )}
    </main>
  );
}
