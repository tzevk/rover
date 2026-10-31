"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Truck } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import WeighButton, { ScaleSpeed } from "@/components/WeighButton";
import { deliverOrder } from "@/app/actions/orders";
import { useI18n } from "@/components/I18n";
import { inr, PAY_MODES, qty } from "@/lib/format";
import { computeTax, STATES } from "@/lib/gst.mjs";
import { safeAction } from "@/lib/safe-action";

// Current local time as a datetime-local value.
function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function DeliveryForm({ order, vehicles = [], materials = [], gst = null }) {
  const { t } = useI18n();
  const [state, formAction] = useActionState(safeAction(deliverOrder, t("common.networkError")), null);
  const [deliveredQty, setDeliveredQty] = useState(String(order.ordered_qty));
  const [paid, setPaid] = useState("");
  const [vehicle, setVehicle] = useState(order.vehicle_number ?? "");
  const [arrival, setArrival] = useState(order.arrival_time ? order.arrival_time.slice(0, 16).replace(" ", "T") : "");
  const [dispatch, setDispatch] = useState("");
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState(order.tare_kg ? String(order.tare_kg) : "");
  const [materialId, setMaterialId] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState(gst?.buyerState ?? "");
  const picked = materials.find((m) => String(m.id) === materialId);
  const material = order.material ? order : picked;
  const kgPerUnit = material?.kg_per_unit || 1000;
  const unit = material?.unit ? t(`unit.${material.unit}`) : "";
  const net = Number(gross) > 0 && Number(tare) > 0 && Number(gross) > Number(tare) ? Number(gross) - Number(tare) : null;

  // Weights decide the quantity; it can still be overtyped afterwards.
  useEffect(() => {
    if (net !== null) setDeliveredQty(String(Math.round((net / kgPerUnit) * 100) / 100));
  }, [net, kgPerUnit]);

  // A known truck brings its stored empty weight.
  function pickVehicle(value) {
    setVehicle(value);
    const known = vehicles.find((v) => v.number === value.trim().toUpperCase().replace(/\s+/g, " "));
    if (known?.tare_kg && !tare) setTare(String(known.tare_kg));
  }

  // Fill in "now" after mount so server and browser clocks/time zones don't disagree.
  useEffect(() => {
    const now = nowLocal();
    setArrival((v) => v || now);
    setDispatch((v) => v || now);
  }, []);

  const amount = Math.round((Number(deliveredQty) || 0) * order.rate * 100) / 100;
  // A preview only: the server works the tax out again when the delivery is saved.
  const tax = gst && material ? computeTax({ amount, gstRate: material.gst_rate, inclusive: gst.inclusive, interState: placeOfSupply !== gst.state }) : null;
  const total = tax ? tax.total : amount;
  const balance = total - (Number(paid) || 0);

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="id" value={order.id} />

      {!order.material && materials.length > 0 && (
        <label className="field">
          <span>{t("production.material")}</span>
          <select className="select" name="material_id" required={Boolean(gst)} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            <option value="">{t("expenses.choose")}</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}

      <label className="field">
        <span>{t("deliver.vehicleNumber")}</span>
        <input className="input" name="vehicle_number" required placeholder="MH 12 AB 1234"
          autoCapitalize="characters" style={{ textTransform: "uppercase" }} list="known-vehicles"
          value={vehicle} onChange={(e) => pickVehicle(e.target.value)} />
        <datalist id="known-vehicles">{vehicles.map((v) => <option key={v.number} value={v.number} />)}</datalist>
      </label>

      <div className="fields">
        <label className="field">
          <span>{t("deliver.arrivalTime")}</span>
          <input className="input" type="datetime-local" name="arrival_time" required
            value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("deliver.dispatchTime")}</span>
          <input className="input" type="datetime-local" name="dispatch_time" required
            value={dispatch} onChange={(e) => setDispatch(e.target.value)} />
        </label>
      </div>

      <div className="fields fields-pair">
        <label className="field">
          <span>{t("deliver.tare")}</span>
          <input className="input num" type="number" name="tare_kg" inputMode="numeric" min="1" step="1"
            value={tare} onChange={(e) => setTare(e.target.value)} placeholder="kg" />
          <WeighButton onWeight={(kg) => setTare(String(kg))} />
        </label>
        <label className="field">
          <span>{t("deliver.gross")}</span>
          <input className="input num" type="number" name="gross_kg" inputMode="numeric" min="1" step="1"
            value={gross} onChange={(e) => setGross(e.target.value)} placeholder="kg" />
          <WeighButton onWeight={(kg) => setGross(String(kg))} />
        </label>
      </div>
      <ScaleSpeed />
      {net !== null && <p className="net-line">{t("deliver.net")}: <strong>{qty(net)} kg</strong></p>}

      <label className="field">
        <span>{t("deliver.passNo")}</span>
        <input className="input" name="pass_no" maxLength={40} />
      </label>

      <div className="fields fields-pair">
        <label className="field">
          <span>{unit ? `${t("deliver.deliveredQuantity")} (${unit})` : t("deliver.deliveredQuantity")}</span>
          <input className="input num" type="number" name="delivered_qty" inputMode="decimal" min="0.01" step="0.01"
            required value={deliveredQty} onChange={(e) => setDeliveredQty(e.target.value)} />
          <small>{t("deliver.orderedHint", { qty: order.ordered_qty })}</small>
        </label>
        <label className="field">
          <span>{t("deliver.paidAmount")}</span>
          <input className="input num" type="number" name="paid_amount" inputMode="decimal" min="0" step="0.01"
            value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0.00" />
          <small>{t("deliver.paidHint")}</small>
        </label>
      </div>

      <div className="fields fields-pair">
        <label className="field">
          <span>{t("cash.paidBy")}</span>
          <select className="select" name="paid_mode" defaultValue="cash">
            {PAY_MODES.map((m) => <option key={m} value={m}>{t(`pay.${m}`)}</option>)}
          </select>
        </label>
        {gst && (
          <label className="field">
            <span>{t("deliver.placeOfSupply")}</span>
            <select className="select" name="place_of_supply" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)}>
              {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="calc">
        <div><span>{t("deliver.totalCalc", { qty: deliveredQty || 0, rate: inr(order.rate) })}</span><strong>{inr(tax ? tax.taxable : amount)}</strong></div>
        {tax && <div><span>{t("deliver.gstCalc", { rate: material.gst_rate })}</span><strong>{inr(tax.tax)}</strong></div>}
        <div><span>{t("common.paid")}</span><strong>{inr(Number(paid) || 0)}</strong></div>
        <div className="hl"><span>{t(balance < 0 ? "deliver.advance" : "common.balance")}</span><strong>{inr(Math.abs(balance))}</strong></div>
      </div>

      {state?.error && <div className="alert alert-error"><AlertCircle size={18} />{state.error}</div>}
      {state?.ok && <div className="alert alert-ok"><CheckCircle2 size={18} />{state.message}</div>}

      <div className="row">
        <SubmitButton className="btn btn-accent btn-lg" name="intent" value="complete"><CheckCircle2 size={18} /> {t("deliver.complete")}</SubmitButton>
        <SubmitButton className="btn btn-lg" name="intent" value="arrive"><Truck size={18} /> {t("deliver.saveArrival")}</SubmitButton>
      </div>
    </form>
  );
}
