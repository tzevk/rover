"use client";

import { useContext } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { PendingContext } from "./ActionForm";

export default function SubmitButton({ children, className = "btn btn-primary", pendingText = "Saving…", disabled, ...rest }) {
  const status = useFormStatus();
  const actionFormPending = useContext(PendingContext);
  const pending = status.pending || actionFormPending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} {...rest}>
      {pending ? <><Loader2 size={16} className="spin" /> {pendingText}</> : children}
    </button>
  );
}
