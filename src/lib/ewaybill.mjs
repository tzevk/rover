// The file the e-way bill portal accepts under "Generate Bulk". Key names and format version follow
// the upload format, which differs in places from the portal's API (actualFromStateCode, OthValue…).
import { isGstin, isPincode, stateOfGstin } from "./gst.mjs";

const FORMAT_VERSION = "1.0.0621";

// The portal rejects other characters in these fields.
const safeDoc = (v) => String(v ?? "").replace(/[^\w/. -]/g, "");
const safeText = (v) => String(v ?? "").replace(/[^\w@#/,&. -]/g, " ").replace(/\s+/g, " ").trim();
const ddmmyyyy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const lines = (address) => {
  const a = safeText(address);
  return [a.slice(0, 120), a.slice(120, 240)];
};

// What's missing before the portal would accept this invoice, as translation-key suffixes.
export function ewayProblems(inv) {
  const problems = [];
  if (!isPincode(inv.supplier_pincode)) problems.push("fromPincode");
  if (!isPincode(inv.buyer_pincode)) problems.push("toPincode");
  if (!safeText(inv.supplier_place)) problems.push("fromPlace");
  if (!safeText(inv.buyer_place)) problems.push("toPlace");
  if (!inv.vehicle_number) problems.push("vehicle");
  if (inv.distance_km == null) problems.push("distance");
  return problems;
}

export function ewayBill(inv) {
  const fromState = Number(stateOfGstin(inv.supplier_gstin));
  const toState = Number(inv.place_of_supply);
  const buyerGstin = isGstin(inv.buyer_gstin) ? inv.buyer_gstin : "URP"; // URP: unregistered person
  const [fromAddr1, fromAddr2] = lines(inv.supplier_address);
  const [toAddr1, toAddr2] = lines(inv.buyer_address);
  const half = Number(inv.gst_rate) / 2;
  const interState = Number(inv.igst) > 0 || fromState !== toState;
  return {
    userGstin: inv.supplier_gstin,
    supplyType: "O",
    subSupplyType: 1,
    subSupplyDesc: "",
    docType: "INV",
    docNo: safeDoc(inv.number),
    docDate: ddmmyyyy(inv.invoice_date),
    transType: 1,
    fromTrdName: safeDoc(inv.supplier_name),
    fromGstin: inv.supplier_gstin,
    fromAddr1,
    fromAddr2,
    fromPlace: safeText(inv.supplier_place),
    fromPincode: Number(inv.supplier_pincode),
    fromStateCode: fromState,
    actualFromStateCode: fromState,
    toTrdName: safeDoc(inv.buyer_name),
    toGstin: buyerGstin,
    toAddr1,
    toAddr2,
    toPlace: safeText(inv.buyer_place),
    toPincode: Number(inv.buyer_pincode),
    toStateCode: toState,
    actualToStateCode: toState,
    totalValue: Number(inv.taxable_value),
    cgstValue: Number(inv.cgst),
    sgstValue: Number(inv.sgst),
    igstValue: Number(inv.igst),
    cessValue: 0,
    TotNonAdvolVal: 0,
    OthValue: 0,
    totInvValue: Number(inv.total),
    transMode: 1, // road
    transDistance: Number(inv.distance_km),
    transporterName: "",
    transporterId: "",
    transDocNo: "",
    transDocDate: "",
    vehicleNo: String(inv.vehicle_number).replace(/[^A-Z0-9]/gi, "").toUpperCase(),
    vehicleType: "R",
    mainHsnCode: Number(inv.hsn_code),
    itemList: [{
      itemNo: 1,
      productName: "",
      productDesc: safeText(inv.item_name),
      hsnCode: Number(inv.hsn_code),
      qtyUnit: inv.uqc,
      quantity: Number(inv.qty),
      taxableAmount: Number(inv.taxable_value),
      sgstRate: interState ? 0 : half,
      cgstRate: interState ? 0 : half,
      igstRate: interState ? Number(inv.gst_rate) : 0,
      cessRate: 0,
      cessNonAdvol: 0,
    }],
  };
}

export const ewayFile = (invoices) => ({ version: FORMAT_VERSION, billLists: invoices.map(ewayBill) });
