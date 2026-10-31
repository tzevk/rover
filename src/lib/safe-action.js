// A server action can fail before it runs (connection lost, request refused). Turn that into the
// same { error } shape forms already show. NEXT_* errors are Next's own redirects: let them pass.
export function safeAction(action, message) {
  return async (...args) => {
    try {
      return await action(...args);
    } catch (err) {
      if (String(err?.digest ?? "").startsWith("NEXT_")) throw err;
      return { error: message };
    }
  };
}
