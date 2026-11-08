// The page-1 machinery the 2018/2020 excise returns 2200-M v2018 and 2200-P v2020 share verbatim (same ids under the
// form's own prefix, same functions): the identity block, items 12 / Part II radios, and partThreeComputation.
//   partThreeComputation, NumWithComma floats printed through formatCurrency(x.toFixed(2)):
//     16 = the Schedule 1 total (or 0.00 while it is "") ; 17C = 17A+17B ; 18 = 16−17C ; 20 = 18−19 ;
//     21D = 21A+21B+21C ; 22 = 20+21D ; 23B = 21D ; 23C = 23A+23B ; 24 = 22−23C.
//   isAmended (on load and on item 2): No zeroes item 19 → gate. availTaxRelief: No blanks 12A. modeOfPayment: Actual
//   or Prepayment blanks the "Others" description. The onload sequence upper-cases both address lines and copies item 6
//   into page 2's name; capitalize() (`$.trim(value.toUpperCase())`) runs on blur of every free-text box.
import { parseMoney, type Centavo } from "./money.ts";
import type { FieldSpec } from "./schema.ts";

type Read = (id: string) => string;
const money = { kind: "money" as const };
/** BIR's capitalize(): `$.trim(value.toUpperCase())`. */
export const capitalize = (_r: Read, value: string): string => value.toUpperCase().trim();
/** BIR's formatCurrency for an exact centavo amount. */
export const formatCentavo = (cents: Centavo): string => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(abs % 100).toString().padStart(2, "0")}`;
};

/** Overrides for the shared page-1 fields of prefix `P`; `item16` is Σ the Schedule 1 tax-due column. */
export function excisePage1(P: string, item16: (r: Read) => Centavo): Record<string, Partial<FieldSpec>> {
  const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
  return {
    [`${P}txtPg1I1Year`]: { required: true },
    [`${P}txtPg1TIN1`]: { required: true },
    [`${P}txtPg1TIN2`]: { required: true },
    [`${P}txtPg1TIN3`]: { required: true },
    [`${P}txtPg1TIN4`]: { required: true },
    [`${P}txtPg1I5RDO`]: { required: true },
    [`${P}txtPg1Pt1I6RegisteredName`]: { required: true },
    // saveXML escapes only the name and the first address line; the field tool's regex also caught these two
    [`${P}txtPg1Pt1I7RegisteredAddress`]: { derive: (_r, v) => v.toUpperCase() },
    [`${P}txtPg1Pt1I7RegisteredAddress2`]: { escaped: false, derive: (_r, v) => v.toUpperCase() },
    [`${P}txtPg1Pt1I9Email`]: { escaped: false },
    [`${P}txtPg2RegisteredName`]: { derive: (r) => r(`${P}txtPg1Pt1I6RegisteredName`) },
    [`${P}txtPg1I12TaxReliefSpecify`]: { gate: { when: (r) => r(`${P}rdoPg1I12TaxReliefNo`) !== "true" }, derive: capitalize },
    [`${P}txtPg1Pt2MOPOtherDesc`]: {
      gate: { when: (r) => r(`${P}rdoPg1Pt2MOPPaymentActual`) !== "true" && r(`${P}rdoPg1Pt2MOPPrepayment`) !== "true" },
      derive: capitalize,
    },
    [`${P}txtPg1P3I16ExciseTaxDue`]: { ...money, compute: item16 },
    [`${P}txtPg1P3I17ABalCarriedOver`]: money,
    [`${P}txtPg1P3I17BCredExciseTax`]: money,
    [`${P}txtPg1P3I17CTotal`]: { ...money, compute: (r) => m(r, "txtPg1P3I17ABalCarriedOver") + m(r, "txtPg1P3I17BCredExciseTax") },
    [`${P}txtPg1P3I18NetTaxDue`]: { ...money, compute: (r) => m(r, "txtPg1P3I16ExciseTaxDue") - m(r, "txtPg1P3I17CTotal") },
    [`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]: { ...money, gate: { on: `${P}rdoPg1I2AmendedYes`, equals: "true" } },
    [`${P}txtPg1P3I20TaxStillDue`]: { ...money, compute: (r) => m(r, "txtPg1P3I18NetTaxDue") - m(r, "txtPg1P3I19PmntOnRtrnPrevFiled") },
    [`${P}txtPg1P3I21ASurcharge`]: money,
    [`${P}txtPg1P3I21BInterest`]: money,
    [`${P}txtPg1P3I21CCompromise`]: money,
    [`${P}txtPg1P3I21DTotPenalties`]: { ...money, compute: (r) => m(r, "txtPg1P3I21ASurcharge") + m(r, "txtPg1P3I21BInterest") + m(r, "txtPg1P3I21CCompromise") },
    [`${P}txtPg1P3I22AmountPayable`]: { ...money, compute: (r) => m(r, "txtPg1P3I20TaxStillDue") + m(r, "txtPg1P3I21DTotPenalties") },
    [`${P}txtPg1P3I23ATaxPmntDposit`]: money,
    [`${P}txtPg1P3I23BPenalties`]: { ...money, compute: (r) => m(r, "txtPg1P3I21DTotPenalties") },
    [`${P}txtPg1P3I23CTotPmntMade`]: { ...money, compute: (r) => m(r, "txtPg1P3I23ATaxPmntDposit") + m(r, "txtPg1P3I23BPenalties") },
    [`${P}txtPg1P3I24BalToCarryOver`]: { ...money, compute: (r) => m(r, "txtPg1P3I22AmountPayable") - m(r, "txtPg1P3I23CTotPmntMade") },
  };
}

/** The shared NativeForm labels for the page-1 block of prefix `P`. */
export function excisePage1Label(P: string): Record<string, string> {
  const item = (id: string, label: string): [string, string] => [`${P}txtPg1P3I${id}`, label];
  return {
    [`${P}txtPg1I1Month`]: "1 — Date of return: month (MM)", [`${P}txtPg1I1Day`]: "day (DD)", [`${P}txtPg1I1Year`]: "year (YYYY)",
    [`${P}rdoPg1I2AmendedYes`]: "2 — Amended return: Yes", [`${P}rdoPg1I2AmendedNo`]: "No", [`${P}txtPg1I3NoSheets`]: "3 — No. of sheets attached",
    [`${P}txtPg1I5RDO`]: "5 — RDO code", [`${P}txtPg1Pt1I6RegisteredName`]: "6 — Taxpayer / registered name",
    [`${P}txtPg1Pt1I7RegisteredAddress`]: "7 — Registered address", [`${P}txtPg1Pt1I7RegisteredAddress2`]: "Registered address (cont.)",
    [`${P}txPg1I7ZipCode`]: "7A — ZIP", [`${P}txtPg1Pt1I8ContactNumber`]: "8 — Contact number", [`${P}txtPg1Pt1I9Email`]: "9 — Email",
    [`${P}txtPg1Pt1I10Region`]: "10 — Place of production: region", [`${P}txtPg1Pt1I10Province`]: "province", [`${P}txtPg1Pt1I10City`]: "city / municipality",
    [`${P}txtPg1Pt1I11Region`]: "11 — Place of removal: region", [`${P}txtPg1Pt1I11Province`]: "province", [`${P}txtPg1Pt1I11City`]: "city / municipality",
    [`${P}rdoPg1I12TaxReliefYes`]: "12 — Availing of tax relief: Yes", [`${P}rdoPg1I12TaxReliefNo`]: "No", [`${P}txtPg1I12TaxReliefSpecify`]: "12A — Specify",
    [`${P}rdoPg1Pt2MOPPaymentActual`]: "Part II — Payment upon actual removal", [`${P}rdoPg1Pt2MOPPrepayment`]: "Prepayment",
    [`${P}rdoPg1Pt2MOPOther`]: "Others", [`${P}txtPg1Pt2MOPOtherDesc`]: "Others — specify",
    ...Object.fromEntries([
      item("16ExciseTaxDue", "16 — Total excise tax due (Schedule 1)"), item("17ABalCarriedOver", "17A — Balance carried over from previous return"),
      item("17BCredExciseTax", "17B — Excise tax credits"), item("17CTotal", "17C — Total credits"), item("18NetTaxDue", "18 — Net excise tax due"),
      item("19PmntOnRtrnPrevFiled", "19 — Paid in the return being amended"), item("20TaxStillDue", "20 — Tax still due"),
      item("21ASurcharge", "21A — Surcharge"), item("21BInterest", "21B — Interest"), item("21CCompromise", "21C — Compromise"),
      item("21DTotPenalties", "21D — Total penalties"), item("22AmountPayable", "22 — Total amount payable"),
      item("23ATaxPmntDposit", "23A — Tax payment / deposit"), item("23BPenalties", "23B — Penalties"), item("23CTotPmntMade", "23C — Total payment made"),
      item("24BalToCarryOver", "24 — Balance / (excess) to carry over"),
    ]),
  };
}

/** The shared profile prefill for prefix `P` (no email: loadData always overwrites item 9 with the profile's email). */
export function excisePage1Prefill(P: string): Record<string, "tin1" | "tin2" | "tin3" | "tin4" | "rdo" | "fn" | "regAddr" | "zip" | "telNo" | "lob"> {
  return {
    [`${P}txtPg1TIN1`]: "tin1", [`${P}txtPg1TIN2`]: "tin2", [`${P}txtPg1TIN3`]: "tin3", [`${P}txtPg1TIN4`]: "tin4",
    [`${P}txtPg2TinC1`]: "tin1", [`${P}txtPg2TinC2`]: "tin2", [`${P}txtPg2TinC3`]: "tin3", [`${P}txtPg2TinC4`]: "tin4",
    [`${P}txtPg1I5RDO`]: "rdo", [`${P}rdoPg1Pt1I6RDO`]: "rdo", [`${P}txtPg1Pt1I6RegisteredName`]: "fn",
    [`${P}txtPg1Pt1I7RegisteredAddress`]: "regAddr", [`${P}txPg1I7ZipCode`]: "zip", [`${P}txtPg1Pt1I8ContactNumber`]: "telNo", [`${P}txtLOB`]: "lob",
  };
}
