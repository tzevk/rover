"use client";

import { createContext, startTransition, useActionState, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n } from "./I18n";
import { newRequestId } from "@/lib/request-id";
import { safeAction } from "@/lib/safe-action";

export const PendingContext = createContext(false);

// Wraps a server action of shape (prevState, formData) => { error } | { ok, message }.
// Submits via onSubmit so typed values survive a validation error (React would otherwise reset the form).
export default function ActionForm({ action, children, className = "form", resetOnSuccess = false }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(safeAction(action, t("common.networkError")), null);
  const ref = useRef(null);
  // Same id until the server confirms the save, so a retry can never be stored twice.
  const requestIdRef = useRef(null);

  useEffect(() => {
    if (state?.ok) {
      requestIdRef.current = null;
      if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget, e.nativeEvent.submitter);
        requestIdRef.current ??= newRequestId();
        data.set("request_id", requestIdRef.current);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext value={pending}>{children}</PendingContext>
      {state?.error && <div className="alert alert-error"><AlertCircle size={18} />{state.error}</div>}
      {state?.ok && state.message && <div className="alert alert-ok"><CheckCircle2 size={18} />{state.message}</div>}
    </form>
  );
}
