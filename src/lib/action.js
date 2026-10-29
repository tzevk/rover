import crypto from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { getI18n } from "./i18n/server";

// Wraps every server action so an unexpected failure (database down, network blip, a rule the
// database rejects) becomes a clear message instead of a crash. Writes run in transactions,
// so "nothing was saved" is always true when this fires.
export function guarded(name, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      unstable_rethrow(err); // let redirect()/notFound() through
      const { t } = await getI18n();
      if (err?.code === "ER_DUP_ENTRY" && /request/i.test(err.message)) {
        return { ok: true, message: t("action.repeat") };
      }
      if (err?.code === "ER_CHECK_CONSTRAINT_VIOLATED" || err?.code === "ER_CONSTRAINT_FAILED") {
        console.error(`[${name}] rejected by database rule:`, err.message);
        return { error: t("action.constraint") };
      }
      const ref = crypto.randomUUID().slice(0, 8);
      console.error(`[${name}] ref=${ref}`, err);
      const offline = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST", "ECONNRESET"].includes(err?.code);
      return {
        error: offline ? t("action.offline") : t("action.failed", { ref }),
      };
    }
  };
}

// Client-generated id that makes a submission safe to repeat (double-tap, retry after a timeout).
export function requestId(formData) {
  const v = String(formData?.get?.("request_id") ?? formData?.request_id ?? "");
  return /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null;
}
