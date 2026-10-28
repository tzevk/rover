"use client";

import { useFormStatus } from "react-dom";

// Submit button for small server-action forms that asks before doing something destructive.
export default function ConfirmButton({ message, children, className = "btn btn-sm btn-danger" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
