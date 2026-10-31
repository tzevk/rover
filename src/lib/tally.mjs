// Files for TallyPrime's Import screen, following Tally's published XML samples. A server in the
// cloud can't reach Tally on the office computer, so this is file-based: ledgers first, then
// vouchers. Tally signs debits negative and marks them ISDEEMEDPOSITIVE Yes, and every voucher here
// adds up to exactly zero. Party entries carry bill allocations, which Tally's samples require.

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

const DUTY_HEADS = { cgst: "CGST", sgst: "SGST/UTGST", igst: "IGST" };

const ledgerXml = (name, parent, extra = "") => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(name)}" Action="Create"><NAME.LIST TYPE="String"><NAME>${xml(name)}</NAME></NAME.LIST><PARENT>${xml(parent)}</PARENT>${extra}</LEDGER></TALLYMESSAGE>`;

// Tally only shows a GSTIN when the ledger also has its country and State.
function partyExtra({ gstin, state, address, pincode, phone }) {
  return [
    "<ISBILLWISEON>Yes</ISBILLWISEON>",
    address ? `<ADDRESS.LIST TYPE="String"><ADDRESS>${xml(address)}</ADDRESS></ADDRESS.LIST>` : "",
    "<COUNTRYNAME>India</COUNTRYNAME>",
    state ? `<LEDSTATENAME>${xml(state)}</LEDSTATENAME>` : "",
    pincode ? `<PINCODE>${xml(pincode)}</PINCODE>` : "",
    phone ? `<LEDGERPHONE>${xml(phone)}</LEDGERPHONE>` : "",
    `<GSTREGISTRATIONTYPE>${gstin ? "Regular" : "Unregistered"}</GSTREGISTRATIONTYPE>`,
    gstin ? `<PARTYGSTIN>${xml(gstin)}</PARTYGSTIN>` : "",
  ].join("");
}

// customers: [{ name, gstin, state, address, pincode, phone }]
export function mastersXml({ company, ledgers, customers }) {
  const ours = Object.entries(ledgers).map(([key, name]) => ledgerXml(name, GROUPS[key],
    DUTY_HEADS[key] ? `<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>${DUTY_HEADS[key]}</GSTDUTYHEAD>` : ""));
  const parties = customers.map((c) => ledgerXml(c.name, "Sundry Debtors", partyExtra(c)));
  return envelope("All Masters", company, [...ours, ...parties].join("\n"));
}

// entries: [{ ledger, debit, paise, bill }], where bill = { name, type } marks the party entry.
// id stays the same for the same record, so re-importing overwrites a voucher instead of adding it.
function voucherXml({ id, type, date, number, party, narration, gstin, placeOfSupply, entries }) {
  const sum = entries.reduce((s, e) => s + (e.debit ? -e.paise : e.paise), 0);
  if (sum !== 0) throw new Error(`Voucher ${number} doesn't balance by ${sum} paise`);
  const signed = (e) => `${e.debit ? "-" : ""}${money(e.paise)}`;
  const lines = entries.map((e) => `<LEDGERENTRIES.LIST><LEDGERNAME>${xml(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${e.debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><ISPARTYLEDGER>${e.bill ? "Yes" : "No"}</ISPARTYLEDGER><AMOUNT>${signed(e)}</AMOUNT>${e.bill ? `<BILLALLOCATIONS.LIST><NAME>${xml(e.bill.name)}</NAME><BILLTYPE>${e.bill.type}</BILLTYPE><AMOUNT>${signed(e)}</AMOUNT></BILLALLOCATIONS.LIST>` : ""}</LEDGERENTRIES.LIST>`).join("");
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="${xml(id)}" VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><GUID>${xml(id)}</GUID><DATE>${tallyDate(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(number)}</VOUCHERNUMBER>${party ? `<PARTYLEDGERNAME>${xml(party)}</PARTYLEDGERNAME>` : ""}${gstin ? `<PARTYGSTIN>${xml(gstin)}</PARTYGSTIN>` : ""}${placeOfSupply ? `<PLACEOFSUPPLY>${xml(placeOfSupply)}</PLACEOFSUPPLY>` : ""}<NARRATION>${xml(narration)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>${lines}</VOUCHER></TALLYMESSAGE>`;
}

const moneyLedger = (ledgers, mode) => (mode === "cash" ? ledgers.cash : ledgers.bank);

// sales: [{ id, date, number, party, gstin, placeOfSupply, narration, taxable, cgst, sgst, igst, total }]
// receipts: [{ id, date, number, party, mode, amount, narration, bill }]
// payments: [{ id, date, number, category, from, amount, narration }]
export function vouchersXml({ company, ledgers, sales, receipts, payments }) {
  const out = [];
  for (const s of sales) {
    const entries = [
      { ledger: s.party, debit: true, paise: toPaise(s.total), bill: { name: s.number, type: "New Ref" } },
      { ledger: ledgers.sales, paise: toPaise(s.taxable) },
    ];
    for (const key of ["cgst", "sgst", "igst"]) if (toPaise(s[key]) > 0) entries.push({ ledger: ledgers[key], paise: toPaise(s[key]) });
    out.push(voucherXml({ id: s.id, type: "Sales", date: s.date, number: s.number, party: s.party, gstin: s.gstin, placeOfSupply: s.placeOfSupply, narration: s.narration, entries }));
  }
  for (const r of receipts) {
    const amount = toPaise(r.amount);
    out.push(voucherXml({
      id: r.id, type: "Receipt", date: r.date, number: r.number, party: r.party, narration: r.narration,
      entries: [{ ledger: moneyLedger(ledgers, r.mode), debit: true, paise: amount }, { ledger: r.party, paise: amount, bill: r.bill }],
    }));
  }
  for (const p of payments) {
    const amount = toPaise(p.amount);
    out.push(voucherXml({
      id: p.id, type: "Payment", date: p.date, number: p.number, narration: p.narration,
      entries: [{ ledger: ledgers[p.category] ?? ledgers.other, debit: true, paise: amount }, { ledger: moneyLedger(ledgers, p.from), paise: amount }],
    }));
  }
  return envelope("Vouchers", company, out.join("\n"));
}

// Tally's own export format; it also keeps Marathi names intact.
export const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
