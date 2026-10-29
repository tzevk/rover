// Checks that English and Marathi have the same keys and the same {placeholders}:  npm run i18n:check
import en from "../src/lib/i18n/en.js";
import mr from "../src/lib/i18n/mr.js";

const vars = (s) => [...(s.match(/\{\w+\}/g) ?? [])].sort().join(",");
const problems = [
  ...Object.keys(en).filter((k) => !(k in mr)).map((k) => `missing in mr.js: ${k}`),
  ...Object.keys(mr).filter((k) => !(k in en)).map((k) => `not in en.js: ${k}`),
  ...Object.keys(en).filter((k) => k in mr && vars(en[k]) !== vars(mr[k])).map((k) => `placeholders differ: ${k}`),
];
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`✓ ${Object.keys(en).length} strings, English and Marathi in sync`);
