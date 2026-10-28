import crypto from "node:crypto";
import { unstable_rethrow } from "next/navigation";

// Wraps every server action so an unexpected failure (database down, network blip, a rule the
// database rejects) becomes a clear message instead of a crash. Writes run in transactions,
// so "nothing was saved" is always true when this fires.
export function guarded(name, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      unstable_rethrow(err); // let redirect()/notFound() through
      if (err?.code === "ER_DUP_ENTRY" && /request/i.test(err.message)) {
        return { ok: true, message: "Already saved — that was a repeat of the same submission." };
      }
      if (err?.code === "ER_CHECK_CONSTRAINT_VIOLATED" || err?.code === "ER_CONSTRAINT_FAILED") {
        console.error(`[${name}] rejected by database rule:`, err.message);
        return { error: "Those numbers don't add up, so nothing was saved. Please check and try again." };
      }
      const ref = crypto.randomUUID().slice(0, 8);
      console.error(`[${name}] ref=${ref}`, err);
      const offline = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST", "ECONNRESET"].includes(err?.code);
      return {
        error: offline
          ? "Can't reach the database right now. Nothing was saved — please try again in a moment."
          : `Something went wrong and nothing was saved. Please try again. (ref ${ref})`,
      };
    }
  };
}

// Client-generated id that makes a submission safe to repeat (double-tap, retry after a timeout).
export function requestId(formData) {
  const v = String(formData?.get?.("request_id") ?? formData?.request_id ?? "");
  return /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null;
}
