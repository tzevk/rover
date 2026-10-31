// Checks that English and Marathi have the same keys and the same {placeholders}:  npm run i18n:check
import fs from "node:fs";
import path from "node:path";
import en from "../src/lib/i18n/en.js";
import mr from "../src/lib/i18n/mr.js";

const vars = (s) => [...(s.match(/\{\w+\}/g) ?? [])].sort().join(",");
const problems = [
  ...Object.keys(en).filter((k) => !(k in mr)).map((k) => `missing in mr.js: ${k}`),
  ...Object.keys(mr).filter((k) => !(k in en)).map((k) => `not in en.js: ${k}`),
  ...Object.keys(en).filter((k) => k in mr && vars(en[k]) !== vars(mr[k])).map((k) => `placeholders differ: ${k}`),
];
// Keys written in full in the code, including inside t(a ? "x.one" : "x.two"), must exist.
const root = new URL("../src/", import.meta.url).pathname;
const namespaces = new Set(Object.keys(en).map((k) => k.split(".")[0]));
const files = fs.readdirSync(root, { recursive: true }).filter((f) => /\.m?js$/.test(f) && !f.includes("i18n") && !f.includes("landing"));
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const [, inside] of source.matchAll(/\bt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    for (const [, key] of inside.matchAll(/["']([a-z][A-Za-z]*(?:\.[A-Za-z_]+)+)["']/g)) {
      if (namespaces.has(key.split(".")[0]) && !(key in en) && !(`${key}_one` in en)) problems.push(`used but not defined: ${key} (${file})`);
    }
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`✓ ${Object.keys(en).length} strings, English and Marathi in sync`);
