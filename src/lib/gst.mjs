// GST rules with no database or framework in them, so the browser, the server and the tests all
// work from the same arithmetic. Money is worked out in whole paise to avoid floating-point drift.

export const STATES = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The last character of a GSTIN is a check digit, so a mistyped number is caught here.
export function isGstin(value) {
  const v = String(value ?? "").toUpperCase();
  if (!/^[0-9]{2}[0-9A-Z]{13}$/.test(v) || !STATES[v.slice(0, 2)]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(v[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === v[14];
}

export const stateOfGstin = (gstin) => String(gstin ?? "").slice(0, 2);
export const isPincode = (v) => /^[1-9][0-9]{5}$/.test(String(v ?? ""));
export const isHsn = (v) => /^[0-9]{4}([0-9]{2}){0,2}$/.test(String(v ?? ""));

const paise = (n) => Math.round(Number(n) * 100);
const rupees = (p) => p / 100;

// amount is qty × rate as the database rounds it. With an inclusive rate the tax is carved out of
// it; otherwise it's added on top. CGST and SGST are always equal, so the split has to be even.
export function computeTax({ amount, gstRate, inclusive = false, interState = false }) {
  const base = paise(amount);
  const r = Number(gstRate) || 0;
  let tax = Math.round(inclusive ? (base * r) / (100 + r) : (base * r) / 100);
  if (!interState) tax = Math.round(inclusive ? tax / 2 : (base * r) / 200) * 2;
  const taxable = inclusive ? base - tax : base;
  return {
    taxable: rupees(taxable),
    cgst: interState ? 0 : rupees(tax / 2),
    sgst: interState ? 0 : rupees(tax / 2),
    igst: interState ? rupees(tax) : 0,
    tax: rupees(tax),
    total: rupees(taxable + tax),
  };
}

// "2026-27" for any date from 1 April 2026 to 31 March 2027.
export function financialYear(dateISO) {
  const y = Number(dateISO.slice(0, 4));
  const start = Number(dateISO.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// Rule 46: at most 16 characters, unique in the financial year. "RK/26-27/00001" is 14.
export function invoiceNumber(prefix, fy, n) {
  const number = `${prefix}/${fy.slice(2)}/${String(n).padStart(5, "0")}`;
  if (number.length > 16) throw new Error(`Invoice number too long: ${number}`);
  return number;
}

export const cleanPrefix = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

// Unit codes used on GST returns and e-way bills. Brass and cft have none of their own.
export const UQC = { tonne: "MTS", cum: "CBM", brass: "OTH", cft: "OTH" };

export const EWB_INTER_STATE_LIMIT = 50000;

// A consignment worth more than the limit needs an e-way bill; States set their own intra-state limit.
export const needsEwayBill = ({ total, interState, intraLimit = EWB_INTER_STATE_LIMIT }) =>
  Number(total) > (interState ? EWB_INTER_STATE_LIMIT : Number(intraLimit));

// Inter-state sales above this to unregistered buyers are reported invoice by invoice in GSTR-1.
export const B2C_LARGE_LIMIT = 100000;

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n) {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tens = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", tens].filter(Boolean).join(" ");
}

// Indian grouping: crore, lakh, thousand.
export function amountInWords(amount) {
  const total = paise(amount);
  let n = Math.floor(total / 100);
  const p = total % 100;
  const parts = [];
  for (const [size, name] of [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]]) {
    const count = Math.floor(n / size);
    if (count) parts.push(`${count >= 1000 ? amountInWords(count).replace(/^Rupees | Only$/g, "") : under1000(count)} ${name}`);
    n %= size;
  }
  if (n) parts.push(under1000(n));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${p ? ` and ${under1000(p)} Paise` : ""} Only`;
}
