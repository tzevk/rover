// Files for TallyPrime's Import Data screen. A server in the cloud can't reach Tally on the office
// computer, so this is file-based: ledgers first, then vouchers. Tally signs debits negative and
// marks them ISDEEMEDPOSITIVE Yes; every voucher here adds up to exactly zero.

export const DEFAULT_LEDGERS = {
  sales: "Sales",
  cgst: "Output CGST",
  sgst: "Output SGST",
  igst: "Output IGST",
  cash: "Cash",
  bank: "Bank",
  fuel: "Fuel Expenses",
  maintenance: "Repairs and Maintenance",
  transport: "Transport Expenses",
  food_tea: "Staff Welfare",
  other: "Miscellaneous Expenses",
};

// Which Tally group each of our ledgers lives under.
const GROUPS = {
  sales: "Sales Accounts",
  cgst: "Duties & Taxes",
  sgst: "Duties & Taxes",
  igst: "Duties & Taxes",
  cash: "Cash-in-Hand",
  bank: "Bank Accounts",
  fuel: "Indirect Expenses",
  maintenance: "Indirect Expenses",
  transport: "Indirect Expenses",
  food_tea: "Indirect Expenses",
  other: "Indirect Expenses",
};

export function ledgerNames(saved) {
  let custom = {};
  try { custom = saved ? JSON.parse(saved) : {}; } catch { custom = {}; }
  return { ...DEFAULT_LEDGERS, ...Object.fromEntries(Object.entries(custom).filter(([k, v]) => DEFAULT_LEDGERS[k] && v)) };
}

const xml = (v) => String(v ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const money = (paise) => (paise / 100).toFixed(2);
const toPaise = (n) => Math.round(Number(n) * 100);
const tallyDate = (iso) => iso.slice(0, 10).replaceAll("-", "");

function envelope(report, company, body) {
  const target = company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${xml(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : "";
  return `<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY><IMPORTDATA>
<REQUESTDESC><REPORTNAME>${report}</REPORTNAME>${target}</REQUESTDESC>
<REQUESTDATA>
${body}
</REQUESTDATA>
</IMPORTDATA></BODY>
</ENVELOPE>
`;
}

const ledgerXml = (name, parent, gstin) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(name)}" ACTION="Create"><NAME.LIST><NAME>${xml(name)}</NAME></NAME.LIST><PARENT>${xml(parent)}</PARENT><ISBILLWISEON>No</ISBILLWISEON>${gstin ? `<PARTYGSTIN>${xml(gstin)}</PARTYGSTIN>` : ""}</LEDGER></TALLYMESSAGE>`;

// customers: [{ name, gstin }]
export function mastersXml({ company, ledgers, customers }) {
  const ours = Object.entries(ledgers).map(([key, name]) => ledgerXml(name, GROUPS[key]));
  const parties = customers.map((c) => ledgerXml(c.name, "Sundry Debtors", c.gstin));
  return envelope("All Masters", company, [...ours, ...parties].join("\n"));
}

// entries: [{ ledger, debit, paise }]. A voucher that doesn't balance is a bug here, not in Tally.
function voucherXml({ type, date, number, party, narration, gstin, placeOfSupply, entries }) {
  const sum = entries.reduce((s, e) => s + (e.debit ? -e.paise : e.paise), 0);
  if (sum !== 0) throw new Error(`Voucher ${number} doesn't balance by ${sum} paise`);
  const lines = entries.map((e) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${e.debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${e.debit ? "-" : ""}${money(e.paise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("");
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${tallyDate(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(number)}</VOUCHERNUMBER>${party ? `<PARTYLEDGERNAME>${xml(party)}</PARTYLEDGERNAME>` : ""}${gstin ? `<PARTYGSTIN>${xml(gstin)}</PARTYGSTIN>` : ""}${placeOfSupply ? `<PLACEOFSUPPLY>${xml(placeOfSupply)}</PLACEOFSUPPLY>` : ""}<NARRATION>${xml(narration)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>${lines}</VOUCHER></TALLYMESSAGE>`;
}

const moneyLedger = (ledgers, mode) => (mode === "cash" ? ledgers.cash : ledgers.bank);

// sales: [{ date, number, party, gstin, placeOfSupply, narration, taxable, cgst, sgst, igst, total }]
// receipts: [{ date, number, party, mode, amount, narration }]
// payments: [{ date, number, category, from, amount, narration }]
export function vouchersXml({ company, ledgers, sales, receipts, payments }) {
  const out = [];
  for (const s of sales) {
    const entries = [
      { ledger: s.party, debit: true, paise: toPaise(s.total) },
      { ledger: ledgers.sales, paise: toPaise(s.taxable) },
    ];
    for (const key of ["cgst", "sgst", "igst"]) if (toPaise(s[key]) > 0) entries.push({ ledger: ledgers[key], paise: toPaise(s[key]) });
    out.push(voucherXml({ type: "Sales", date: s.date, number: s.number, party: s.party, gstin: s.gstin, placeOfSupply: s.placeOfSupply, narration: s.narration, entries }));
  }
  for (const r of receipts) {
    const amount = toPaise(r.amount);
    out.push(voucherXml({
      type: "Receipt", date: r.date, number: r.number, party: r.party, narration: r.narration,
      entries: [{ ledger: moneyLedger(ledgers, r.mode), debit: true, paise: amount }, { ledger: r.party, paise: amount }],
    }));
  }
  for (const p of payments) {
    const amount = toPaise(p.amount);
    out.push(voucherXml({
      type: "Payment", date: p.date, number: p.number, narration: p.narration,
      entries: [{ ledger: ledgers[p.category] ?? ledgers.other, debit: true, paise: amount }, { ledger: moneyLedger(ledgers, p.from), paise: amount }],
    }));
  }
  return envelope("Vouchers", company, out.join("\n"));
}

// Tally's own export format; it also keeps Marathi names intact.
export const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
