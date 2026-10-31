// Reading a weighbridge indicator. Indicators send a stream of text such as "ST,GS,+00012340kg",
// many times a second, including while the truck is still moving. Only a weight that holds
// steady is usable. Shared by the browser and the tests, hence .mjs.

// The weight in kg from one line of output, or null if the line isn't a usable reading.
export function parseWeight(line) {
  const s = String(line ?? "").trim();
  if (!s || /\bUS\b/i.test(s)) return null; // the indicator itself says "unstable"
  const matches = [...s.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(kg|t)?/gi)];
  const last = matches.at(-1);
  if (!last) return null;
  const n = Number(last[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return last[2]?.toLowerCase() === "t" ? Math.round(n * 1000 * 100) / 100 : n;
}

// Feed it readings; it returns the weight once the same value has repeated `needed` times.
export function stableReader(needed = 5) {
  let last = null, run = 0;
  return (kg) => {
    if (kg == null) { last = null; run = 0; return null; }
    run = kg === last ? run + 1 : 1;
    last = kg;
    return run >= needed ? kg : null;
  };
}
