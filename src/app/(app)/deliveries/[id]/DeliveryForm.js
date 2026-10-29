"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import SubmitButton from "@/components/SubmitButton";
import { deliverOrder } from "@/app/actions/orders";
import { useI18n } from "@/components/I18n";
import { inr } from "@/lib/format";

// Current local time as a datetime-local value.
function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function DeliveryForm({ order }) {
  const { t } = useI18n();
  const [state, formAction] = useActionState(deliverOrder, null);
  const [deliveredQty, setDeliveredQty] = useState(String(order.ordered_qty));
  const [paid, setPaid] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [arrival, setArrival] = useState("");
  const [dispatch, setDispatch] = useState("");

  // Fill in "now" after mount so server and browser clocks/time zones don't disagree.
  useEffect(() => {
    const now = nowLocal();
    setArrival((v) => v || now);
    setDispatch((v) => v || now);
  }, []);

  const total = (Number(deliveredQty) || 0) * order.rate;
  const balance = total - (Number(paid) || 0);

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="id" value={order.id} />

      <label className="field">
        <span>{t("deliver.vehicleNumber")}</span>
        <input className="input" name="vehicle_number" required placeholder="MH 12 AB 1234"
          autoCapitalize="characters" style={{ textTransform: "uppercase" }}
          value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
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
          <span>{t("deliver.deliveredQuantity")}</span>
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

      <div className="calc">
        <div><span>{t("deliver.totalCalc", { qty: deliveredQty || 0, rate: inr(order.rate) })}</span><strong>{inr(total)}</strong></div>
        <div><span>{t("common.paid")}</span><strong>{inr(Number(paid) || 0)}</strong></div>
        <div className="hl"><span>{t(balance < 0 ? "deliver.advance" : "common.balance")}</span><strong>{inr(Math.abs(balance))}</strong></div>
      </div>

      {state?.error && <div className="alert alert-error"><AlertCircle size={18} />{state.error}</div>}

      <SubmitButton className="btn btn-accent btn-lg"><CheckCircle2 size={18} /> {t("deliver.complete")}</SubmitButton>
    </form>
  );
}
