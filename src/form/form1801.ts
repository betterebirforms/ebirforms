// BIR Form 1801 (Estate Tax Return — pre-TRAIN, superseded by 1801v2018), P3. Five dynamic modal schedules
// with CONJUGAL and EXCLUSIVE columns, each rebuilt on reopen by counting its UPPERCASE `chxSched*<i>` marker
// records (first_index 0), plus the fixed 8-row Schedule 5:
//   Sched 1  real property          → totalSch1AmountExc/Conj  → item 17 A/B (getSched1Modal)
//   Sched 1X (a second real-property list, BIR's "1b")         → item 19 A/B (getSched1XModal)
//   Sched 2  shares of stock  ┐ summed together by addsched2and3 → item 18 A/B
//   Sched 3  other personal   ┘
//   Sched 4  taxable transfers / business interest             → item 20 A/B (getSched4Modal)
//   Sched 5  deductions (8 fixed rows)                         → item 22 A/B (computesched5*)
// Row stems are BIR's, inconsistent by schedule: txtOCTSched1<i> / txtSched1XLocation<i> / txtClassX<i> /
// txtFMVConjugal2<i> / txtParticulars4<i> …  Chain (compute17c … compute35):
//   C = A + B ; 21 = 17 + 18 + 19 + 20 ; 23 = 21 − 22 ; 28 = 23C − (24 + 25 + 26 + 27A + 27B) ; 30 = 28 − 29
//   31 = pre-TRAIN graduated estate tax on 30 (0 under ₱200k; 5% / 15k + 8% / 135k + 11% / 465k + 15% /
//        1.215M + 20% over 200k / 500k / 2M / 5M / 10M) ; 32C = 32A + 32B ; 33 = 31 − 32C ; 35 = 33 + 34D
// ⚠ Schedule 5's ids are swapped against its headers: `txtSc5Conjugal<n>` sit under EXCLUSIVE and sum to
//   txtSc5TotalConjugal → 22A (exclusive); `txtSc5Exclusive<n>` sit under CONJUGAL → 22B. Values follow the
//   headers, so the return is right; only the ids lie. Kept verbatim.
// ⚠ A row's id is `<stem><i>`, and stems nest: Schedule 1 row 20's `txtFMVConjugal20` is ALSO Schedule 2 row 0's
//   id (stem `txtFMVConjugal2`), likewise Sched 1 row 3x vs Sched 3, Sched 3 row 4x vs Sched 4. A real BIR id
//   collision past 20 / 30 / 40 rows; we emit BIR's ids unchanged.
// Every compute derives from base inputs (injected schedule totals + entered amounts): Schedule 5 and the
// schedule totals sit AFTER items 17–35 in the DOM, i.e. later in computeAll's single pass.
// BIR's string-util formatCurrency rounds floor(|n|·100 + 0.50000000001) — parseMoney(number) is the same rule,
// applied to the same float expressions, so item 31's bracket math matches BIR to the centavo.

import fieldJson from "./fields/1801.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1801:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));

const exc = (r: Read, s: string): Centavo => m(r, `totalSch${s}AmountExc`);
const conj = (r: Read, s: string): Centavo => m(r, `totalSch${s}AmountConj`);
const ROW5 = [1, 2, 3, 4, 5, 6, 7, 8];
const sc5A = (r: Read): Centavo => ROW5.reduce((t, n) => t + m(r, `txtSc5Conjugal${n}`), 0); // under EXCLUSIVE
const sc5B = (r: Read): Centavo => ROW5.reduce((t, n) => t + m(r, `txtSc5Exclusive${n}`), 0); // under CONJUGAL
const t18A = (r: Read): Centavo => exc(r, "2") + exc(r, "3");
const t18B = (r: Read): Centavo => conj(r, "2") + conj(r, "3");
const t21A = (r: Read): Centavo => exc(r, "1") + t18A(r) + exc(r, "1X") + exc(r, "4");
const t21B = (r: Read): Centavo => conj(r, "1") + t18B(r) + conj(r, "1X") + conj(r, "4");
const t23A = (r: Read): Centavo => t21A(r) - sc5A(r);
const t23B = (r: Read): Centavo => t21B(r) - sc5B(r);
const t28 = (r: Read): Centavo =>
  t23A(r) + t23B(r) - (m(r, "txt24") + m(r, "txt25") + m(r, "txt26") + m(r, "txt27A") + m(r, "txt27B"));
const t30 = (r: Read): Centavo => t28(r) - m(r, "txt29");
/** compute31, BIR's float expressions verbatim (tax30 = NumWithComma(item 30)). */
export function estateTax1801(net: Centavo): Centavo {
  const tax30 = net / 100;
  if (tax30 < 200000) return 0;
  if (tax30 <= 500000) return parseMoney((1 * tax30 - 200000) * 0.05);
  if (tax30 <= 2000000) return parseMoney(15000 + (1 * tax30 - 500000) * 0.08);
  if (tax30 <= 5000000) return parseMoney(135000 + (1 * tax30 - 2000000) * 0.11);
  if (tax30 <= 10000000) return parseMoney(465000 + (1 * tax30 - 5000000) * 0.15);
  return parseMoney(1215000 + (1 * tax30 - 10000000) * 0.2);
}
const t31 = (r: Read): Centavo => estateTax1801(t30(r));
const t32C = (r: Read): Centavo => m(r, "txt32A") + m(r, "txt32B");
const t33 = (r: Read): Centavo => t31(r) - t32C(r);
const penalty = (r: Read): Centavo => m(r, "txtSurcharge") + m(r, "txtInterest") + m(r, "txtCompromise");

// The row's delete-selection box: BIR saves its `checked`, so an untouched box is "false" — and that record is
// the marker the reload counts.
const marker = (id: string) => ({ id, kind: "checkbox" as const, derive: (_r: Read, v: string) => v || "false" });
const money = (id: string) => ({ id, kind: "money" as const });
const text = (id: string) => ({ id, kind: "text" as const });
const totals = (s: string, excStem: string, conjStem: string) => [
  { into: `${P}totalSch${s}AmountExc`, of: excStem },
  { into: `${P}totalSch${s}AmountConj`, of: conjStem },
];

export const SCHED1_1801: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    marker("chxSched1"), text("txtOCTSched1"), text("txtSched1TaxDeclaration"), text("txtSched1Location"), text("txtClass"),
    text("txtArea"), money("txtZV"), money("txtFMV"), money("txtFMVConjugal"), money("txtFMVExclusive"),
  ],
  total: totals("1", "txtFMVExclusive", "txtFMVConjugal"),
};
export const SCHED1X_1801: GroupSpec = {
  name: "sched1X",
  first_index: 0,
  row: [
    marker("chxSched1X"), text("txtOCTSched1X"), text("txtSched1XTaxDeclaration"), text("txtSched1XLocation"), text("txtClassX"),
    text("txtAreaX"), money("txtZVX"), money("txtFMVX"), money("txtFMVConjugalX"), money("txtFMVExclusiveX"),
  ],
  total: totals("1X", "txtFMVExclusiveX", "txtFMVConjugalX"),
};
export const SCHED2_1801: GroupSpec = {
  name: "sched2",
  first_index: 0,
  row: [
    marker("chxSched2"), text("txtNameCorp"), text("txtStockCert"), text("txtShares"), money("txtFMVS"),
    money("txtFMVConjugal2"), money("txtFMVExclusive2"),
  ],
  total: totals("2", "txtFMVExclusive2", "txtFMVConjugal2"),
};
export const SCHED3_1801: GroupSpec = {
  name: "sched3",
  first_index: 0,
  row: [marker("chxSched3"), text("txtParticulars"), money("txtFMVExclusive3"), money("txtFMVConjugal3")],
  total: totals("3", "txtFMVExclusive3", "txtFMVConjugal3"),
};
export const SCHED4_1801: GroupSpec = {
  name: "sched4",
  first_index: 0,
  row: [marker("chxSched4"), text("txtParticulars4"), money("txtFMVExclusive4"), money("txtFMVConjugal4")],
  total: totals("4", "txtFMVExclusive4", "txtFMVConjugal4"),
};

const amended = { on: `${P}amendedRtn_1`, equals: "true" };

export const FORM_1801 = buildSchema("1801", "Estate Tax Return", fieldJson as FieldJson[], {
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateDay`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTINE1`]: { required: true },
  [`${P}txtTINE2`]: { required: true },
  [`${P}txtTINE3`]: { required: true },
  [`${P}txtBranchCodeE`]: { required: true },
  [`${P}txtTaxpayer`]: { required: true },
  [`${P}txtExecutor`]: { required: true },
  [`${P}txtZip`]: { required: true },
  [`${P}txtTelephone`]: { required: true },
  [`${P}txtRAddress`]: { required: true },
  // disableSelTreaty (item 15 = No) resets the treaty picker to its first option, value "0"
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty:_1`) === "true" ? v : "0") },
  [`${P}txt17A`]: { compute: (r) => exc(r, "1") },
  [`${P}txt17B`]: { compute: (r) => conj(r, "1") },
  [`${P}txt17C`]: { compute: (r) => exc(r, "1") + conj(r, "1") },
  [`${P}txt18A`]: { compute: (r) => t18A(r) },
  [`${P}txt18B`]: { compute: (r) => t18B(r) },
  [`${P}txt18C`]: { compute: (r) => t18A(r) + t18B(r) },
  [`${P}txt19A`]: { compute: (r) => exc(r, "1X") },
  [`${P}txt19B`]: { compute: (r) => conj(r, "1X") },
  [`${P}txt19C`]: { compute: (r) => exc(r, "1X") + conj(r, "1X") },
  [`${P}txt20A`]: { compute: (r) => exc(r, "4") },
  [`${P}txt20B`]: { compute: (r) => conj(r, "4") },
  [`${P}txt20C`]: { compute: (r) => exc(r, "4") + conj(r, "4") },
  [`${P}txt21A`]: { compute: (r) => t21A(r) },
  [`${P}txt21B`]: { compute: (r) => t21B(r) },
  [`${P}txt21C`]: { compute: (r) => t21A(r) + t21B(r) },
  [`${P}txt22A`]: { compute: (r) => sc5A(r) },
  [`${P}txt22B`]: { compute: (r) => sc5B(r) },
  [`${P}txt22C`]: { compute: (r) => sc5A(r) + sc5B(r) },
  [`${P}txt23A`]: { compute: (r) => t23A(r) },
  [`${P}txt23B`]: { compute: (r) => t23B(r) },
  [`${P}txt23C`]: { compute: (r) => t23A(r) + t23B(r) },
  [`${P}txt28`]: { compute: (r) => t28(r) },
  [`${P}txt30`]: { compute: (r) => t30(r) },
  [`${P}txt31`]: { compute: (r) => t31(r) },
  // item 32B (tax paid on the return previously filed) is live only on an amended return: amendedRtn_2's
  // onclick zeroes it
  [`${P}txt32B`]: { gate: amended },
  [`${P}txt32C`]: { compute: (r) => t32C(r) },
  [`${P}txt33`]: { compute: (r) => t33(r) },
  [`${P}txtTotalPenalties`]: { compute: (r) => penalty(r) },
  [`${P}txt35`]: { compute: (r) => t33(r) + penalty(r) },
  [`${P}txtSc5TotalConjugal`]: { compute: (r) => sc5A(r) },
  [`${P}txtSc5TotalExclusive`]: { compute: (r) => sc5B(r) },
});
FORM_1801.group = [SCHED1_1801, SCHED1X_1801, SCHED2_1801, SCHED3_1801, SCHED4_1801];

const positive = (v: string | undefined): boolean => parseMoney(v ?? "") > 0;

export function validate1801(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1801, state);
  const s = (id: string) => state[`${P}${id}`] ?? "";
  const tin = `${s("txtTIN1")}${s("txtTIN2")}${s("txtTIN3")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  if (s("txtRDOCode") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Select the taxpayer's RDO code." });
  if (`${tin}${s("txtBranchCode")}` === `${s("txtTINE1")}${s("txtTINE2")}${s("txtTINE3")}${s("txtBranchCodeE")}`)
    problem.push({ id: `${P}txtTINE1`, message: "The executor/administrator's TIN must differ from the estate's." });
  if (s("optTreaty:_1") === "true" && (s("lstTaxTreaty") === "" || s("lstTaxTreaty") === "0"))
    problem.push({ id: `${P}lstTaxTreaty`, message: "Item 15A: specify the treaty or special rate." });
  if (parseMoney(s("txt26")) > 50_000_000) problem.push({ id: `${P}txt26`, message: "Medical expenses (item 26) can't exceed ₱500,000." });
  for (const [label, amt] of [["txtOthers27a", "txt27A"], ["txtOthers27b", "txt27B"]] as const) {
    if (s(label).trim() !== "" && parseMoney(s(amt)) === 0) problem.push({ id: `${P}${amt}`, message: `Enter the amount for item ${amt.slice(3)}.` });
    if (s(label).trim() === "" && parseMoney(s(amt)) !== 0) problem.push({ id: `${P}${label}`, message: `Specify the other deduction for item ${amt.slice(3)}.` });
  }
  // checkifEmptyFieldSched*: the required cells of each row, and a positive amount in at least one column
  const need: Record<string, { cell: string[]; amount: string[]; pair: [string, string] }> = {
    sched1: { cell: ["txtSched1TaxDeclaration", "txtSched1Location", "txtClass"], amount: ["txtZV", "txtFMV"], pair: ["txtFMVConjugal", "txtFMVExclusive"] },
    sched1X: { cell: ["txtSched1XTaxDeclaration", "txtSched1XLocation", "txtClassX"], amount: ["txtZVX", "txtFMVX"], pair: ["txtFMVConjugalX", "txtFMVExclusiveX"] },
    sched2: { cell: ["txtNameCorp", "txtStockCert", "txtShares"], amount: ["txtFMVS"], pair: ["txtFMVConjugal2", "txtFMVExclusive2"] },
    sched3: { cell: ["txtParticulars"], amount: [], pair: ["txtFMVConjugal3", "txtFMVExclusive3"] },
    sched4: { cell: ["txtParticulars4"], amount: [], pair: ["txtFMVConjugal4", "txtFMVExclusive4"] },
  };
  for (const [name, rule] of Object.entries(need)) {
    (groups[name] ?? []).forEach((row, i) => {
      const bad = rule.cell.some((c) => !(row[c] ?? "").trim()) || rule.amount.some((c) => !positive(row[c])) || !rule.pair.some((c) => positive(row[c]));
      if (bad) problem.push({ id: `${(rule.cell[0] ?? rule.pair[0])}${i}`, message: `Complete row ${i + 1} of ${name}: empty fields and zero amounts are not allowed.` });
    });
  }
  return problem;
}
