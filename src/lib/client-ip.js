// The address a proxy recorded is the LAST x-forwarded-for entry: anything before it was sent
// by the client and can be forged. Limits keyed on this also need a limit that ignores the IP,
// because with no proxy in front the whole header is client-controlled.
export function clientIp(headers) {
  return headers.get("x-forwarded-for")?.split(",").pop().trim() || "local";
}
