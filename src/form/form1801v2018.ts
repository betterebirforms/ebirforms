// BIR Form 1801 v2018 (Estate Tax Return — TRAIN), P3. Flat 6% on the net taxable estate (RA 10963 §84).
// Six dynamic schedules, each with an EXCLUSIVE and a CONJUGAL/COMMUNAL column, plus the fixed Schedule 5:
//   Sched 1  real property (two side tables, one row index)  → sched1Exc/Conj_Total  → item 29 (txtRealProp)
//   Sched 1A family home                                      → sched1AExc/Conj_Total → item 30 (txtFam)
//   Sched 2  shares of stock  ┐                               → sched2Exc/Conj_Total  ┐
//   Sched 2A other personal   ┘ both                          → sched2AExc/Conj_Total ┘ item 31 (txtPersonalProp)
//   Sched 3  taxable transfers                                → sched3Exc/Conj_Total  → item 32 (txtTaxable)
//   Sched 4  business interest                                → sched4Exc/Conj_Total  → item 33 (txtBusiness)
//   Sched 5  ordinary deductions (7 fixed rows)               → sched5Exc/Conj_Total  → item 35 (txtOrdDed)
// Part IV chain (calculate_Part4), column A = exclusive, B = conjugal, C = A + B:
//   34 GrossEst = 29+30+31+32+33 ; 36 EstAfterDed = 34 − 35 ; 37 TotalDed_C = 37A standard + 37B family home + 37C other
//   38 NetEst_C = 36C − 37 ; 39 ShareSpouse_C = 36B ÷ 2 ; 40 NetTaxEst_C = 38 − 39 → item 16 txtTaxableEstate
// Part II (computeNo18 + calculate_Part2):
//   18 EstTaxDue = 16 > 0 ? 16 × txtTaxRate ("6.0%") : 0 ; 19C = 19A + 19B ; 20 TaxPayable = 18 − 19C
//   22 TaxPayable_1st = 20 − 21 installment ; 23D = surcharge + interest + compromise
//   24 TotPayable = (22 < 0 && 23D > 0) ? 23D : 22 + 23D          (BIR's penalty-only quirk on an overpayment)
// The standard deduction (≤ ₱5M, ≤ ₱500k for a non-resident alien) and the family-home deduction (≤ ₱10M) are
// ENTERED by the filer — BIR's form never fills or caps them, it only refuses them in validateForm. Same here.
// Part II sits on page 1, BEFORE Part IV and the schedules in the DOM, so every compute derives from base inputs
// (injected schedule totals + entered amounts), never from a later sibling not yet computed in the one DOM pass.
// BIR float arithmetic kept where it can change a saved centavo (this form's own formatCurrency is toFixed(2)):
//   item 39 = parseFloat(36B) / 2 and item 18 = parseFloat(16) × (6 / 100), each rounded by Number.toFixed(2).
// Reload (loadData): each schedule's row count is the number of `<DIV>…sched<N>Exc_<i>` records, minimum 2.

import fieldJson from "./fields/1801v2018.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1801v2018:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
/** BIR's formatCurrency: `number.toFixed(2)` on a binary float (not string-util's round-half-up). */
const fixed2 = (x: number): Centavo => (Number.isFinite(x) ? parseMoney(x.toFixed(2)) : 0);

// each schedule's column totals, injected by the group aggregates below
const ex = (r: Read, s: string): Centavo => m(r, `sched${s}Exc_Total`);
const cj = (r: Read, s: string): Centavo => m(r, `sched${s}Conj_Total`);
const SCHED5 = ["Estate", "Insolvent", "Unpaid", "Losses", "Vanishing", "Transfer", "Others"];
const ordA = (r: Read): Centavo => SCHED5.reduce((t, k) => t + m(r, `sched5${k}Exc`), 0);
const ordB = (r: Read): Centavo => SCHED5.reduce((t, k) => t + m(r, `sched5${k}Conj`), 0);
const personalA = (r: Read): Centavo => ex(r, "2") + ex(r, "2A");
const personalB = (r: Read): Centavo => cj(r, "2") + cj(r, "2A");
const grossA = (r: Read): Centavo => ex(r, "1") + ex(r, "1A") + personalA(r) + ex(r, "3") + ex(r, "4");
const grossB = (r: Read): Centavo => cj(r, "1") + cj(r, "1A") + personalB(r) + cj(r, "3") + cj(r, "4");
const afterA = (r: Read): Centavo => grossA(r) - ordA(r);
const afterB = (r: Read): Centavo => grossB(r) - ordB(r);
const totalDed = (r: Read): Centavo => m(r, "txtStandardDed_C") + m(r, "txtFamDed_C") + m(r, "txtOtherDed_C");
const netEst = (r: Read): Centavo => afterA(r) + afterB(r) - totalDed(r);
// item 39: formatCurrency(NumWithComma(36B) / 2) — a half centavo rounds by the float's toFixed, not half-up
const shareSpouse = (r: Read): Centavo => fixed2(afterB(r) / 100 / 2);
const taxable = (r: Read): Centavo => netEst(r) - shareSpouse(r);
// getNumericValue: strip "%" and blanks, parseFloat. The rate field is BIR's "6.0%" (taxRate.xml 0.06, init ×100).
const rate = (r: Read): number => parseFloat((r(`${P}txtTaxRate`) || "6.0%").replace("%", "").trim());
// computeNo18: no tax on a zero or negative estate; otherwise formatCurrency(estate × rate / 100)
const taxDue = (r: Read): Centavo => (taxable(r) > 0 ? fixed2((taxable(r) / 100) * (rate(r) / 100)) : 0);
const creditTot = (r: Read): Centavo => m(r, "txtCredits_ForeignEst") + m(r, "txtCredits_TaxPrev");
const taxPayable = (r: Read): Centavo => taxDue(r) - creditTot(r);
const payable1st = (r: Read): Centavo => taxPayable(r) - m(r, "txtInstallment");
const penalty = (r: Read): Centavo => m(r, "txtPen_Surcharge") + m(r, "txtPen_Interest") + m(r, "txtPen_Compromise");
const totPayable = (r: Read): Centavo => (payable1st(r) < 0 && penalty(r) > 0 ? penalty(r) : payable1st(r) + penalty(r));

const money = (stem: string) => ({ id: `${P}${stem}_{i}`, kind: "money" as const });
const text = (stem: string) => ({ id: `${P}${stem}_{i}`, kind: "text" as const });
const totals = (s: string) => [
  { into: `${P}sched${s}Exc_Total`, of: `${P}sched${s}Exc_{i}` },
  { into: `${P}sched${s}Conj_Total`, of: `${P}sched${s}Conj_{i}` },
];

// ⚠ addRow_RealProp / addRow_Fam write `<select id= frm1801v2018:sched1Class_N' …>` — the unquoted id swallows
// the stray quote, so BIR's element id, and its savefile key, end in an apostrophe. Kept verbatim.
export const SCHED1_1801V2018: GroupSpec = {
  name: "sched1",
  first_index: 1,
  row: [
    text("sched1Oct"), text("sched1Td"), text("sched1Loc"), text("sched1Lot"), text("sched1Area"),
    { id: `${P}sched1Class_{i}'`, kind: "select" },
    text("sched1Fmv"), text("sched1Zonal"), money("sched1Exc"), money("sched1Conj"),
  ],
  total: totals("1"),
};
export const SCHED1A_1801V2018: GroupSpec = {
  name: "sched1A",
  first_index: 1,
  row: [
    text("sched1AOct"), text("sched1ATd"), text("sched1ALoc"), text("sched1AArea"),
    { id: `${P}sched1AClass_{i}'`, kind: "select" },
    text("sched1AFmv"), text("sched1AZonal"), money("sched1AExc"), money("sched1AConj"),
  ],
  total: totals("1A"),
};
export const SCHED2_1801V2018: GroupSpec = {
  name: "sched2",
  first_index: 1,
  row: [
    text("sched2Corp"), { id: `${P}sched2Class_{i}`, kind: "select" }, text("sched2Stock"), text("sched2Shares"),
    text("sched2FmvPerShare"), money("sched2Exc"), money("sched2Conj"),
  ],
  total: totals("2"),
};
export const SCHED2A_1801V2018: GroupSpec = {
  name: "sched2A",
  first_index: 1,
  row: [text("sched2AParticulars"), money("sched2AExc"), money("sched2AConj")],
  total: totals("2A"),
};
export const SCHED3_1801V2018: GroupSpec = {
  name: "sched3",
  first_index: 1,
  row: [text("sched3Particulars"), money("sched3Exc"), money("sched3Conj")],
  total: totals("3"),
};
export const SCHED4_1801V2018: GroupSpec = {
  name: "sched4",
  first_index: 1,
  row: [
    text("sched4Name"), text("sched4Address"),
    // addRow_Business: the RDO picker's blank option is '000', so an untouched row saves "000", not ""
    { id: `${P}sched4Rdo_{i}`, kind: "select", derive: (_r, v) => v || "000" },
    money("sched4Exc"), money("sched4Conj"),
  ],
  total: totals("4"),
};

const copy = (from: string) => ({ derive: (r: Read) => r(`${P}${from}`) });

export const FORM_1801V2018 = buildSchema("1801v2018", "Estate Tax Return (TRAIN)", fieldJson as FieldJson[], {
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateDay`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  [`${P}tinA_1`]: { required: true },
  [`${P}tinB_1`]: { required: true },
  [`${P}tinC_1`]: { required: true },
  [`${P}branchCode_1`]: { required: true },
  [`${P}txtRDOCode_1`]: { required: true },
  [`${P}registeredName_1`]: { required: true },
  [`${P}registeredAddress_1`]: { required: true },
  [`${P}telephoneNumber`]: { required: true },
  // Part II
  [`${P}txtTaxableEstate`]: { compute: (r) => taxable(r) },
  [`${P}txtEstTaxDue`]: { compute: (r) => taxDue(r) },
  [`${P}txtCredits_Tot`]: { compute: (r) => creditTot(r) },
  [`${P}txtTaxPayable`]: { compute: (r) => taxPayable(r) },
  [`${P}txtTaxPayable_1st`]: { compute: (r) => payable1st(r) },
  [`${P}txtPen_Tot`]: { compute: (r) => penalty(r) },
  [`${P}txtTotPayable`]: { compute: (r) => totPayable(r) },
  // Part IV header: setInfoP2 copies the item 5/7 TIN and name onto page 2 on every blur of the page-1 fields
  [`${P}tinA_2`]: copy("tinA_1"),
  [`${P}tinB_2`]: copy("tinB_1"),
  [`${P}tinC_2`]: copy("tinC_1"),
  [`${P}branchCode_2`]: copy("branchCode_1"),
  [`${P}registeredName_2`]: copy("registeredName_1"),
  // Part IV
  [`${P}txtRealProp_A`]: { compute: (r) => ex(r, "1") },
  [`${P}txtRealProp_B`]: { compute: (r) => cj(r, "1") },
  [`${P}txtRealProp_C`]: { compute: (r) => ex(r, "1") + cj(r, "1") },
  [`${P}txtFam_A`]: { compute: (r) => ex(r, "1A") },
  [`${P}txtFam_B`]: { compute: (r) => cj(r, "1A") },
  [`${P}txtFam_C`]: { compute: (r) => ex(r, "1A") + cj(r, "1A") },
  [`${P}txtPersonalProp_A`]: { compute: (r) => personalA(r) },
  [`${P}txtPersonalProp_B`]: { compute: (r) => personalB(r) },
  [`${P}txtPersonalProp_C`]: { compute: (r) => personalA(r) + personalB(r) },
  [`${P}txtTaxable_A`]: { compute: (r) => ex(r, "3") },
  [`${P}txtTaxable_B`]: { compute: (r) => cj(r, "3") },
  [`${P}txtTaxable_C`]: { compute: (r) => ex(r, "3") + cj(r, "3") },
  [`${P}txtBusiness_A`]: { compute: (r) => ex(r, "4") },
  [`${P}txtBusiness_B`]: { compute: (r) => cj(r, "4") },
  [`${P}txtBusiness_C`]: { compute: (r) => ex(r, "4") + cj(r, "4") },
  [`${P}txtGrossEst_A`]: { compute: (r) => grossA(r) },
  [`${P}txtGrossEst_B`]: { compute: (r) => grossB(r) },
  [`${P}txtGrossEst_C`]: { compute: (r) => grossA(r) + grossB(r) },
  [`${P}txtOrdDed_A`]: { compute: (r) => ordA(r) },
  [`${P}txtOrdDed_B`]: { compute: (r) => ordB(r) },
  [`${P}txtOrdDed_C`]: { compute: (r) => ordA(r) + ordB(r) },
  [`${P}txtEstAfterDed_A`]: { compute: (r) => afterA(r) },
  [`${P}txtEstAfterDed_B`]: { compute: (r) => afterB(r) },
  [`${P}txtEstAfterDed_C`]: { compute: (r) => afterA(r) + afterB(r) },
  [`${P}txtTotalDed_C`]: { compute: (r) => totalDed(r) },
  [`${P}txtNetEst_C`]: { compute: (r) => netEst(r) },
  [`${P}txtShareSpouse_C`]: { compute: (r) => shareSpouse(r) },
  [`${P}txtNetTaxEst_C`]: { compute: (r) => taxable(r) },
  [`${P}sched5Exc_Total`]: { compute: (r) => ordA(r) },
  [`${P}sched5Conj_Total`]: { compute: (r) => ordB(r) },
});
FORM_1801V2018.group = [SCHED1_1801V2018, SCHED1A_1801V2018, SCHED2_1801V2018, SCHED2A_1801V2018, SCHED3_1801V2018, SCHED4_1801V2018];

/** validateForm's row check: a "0.00" cell is ignored; an untouched select (index 0: "" or "000") counts as blank. */
const cellState = (kind: string, v: string | undefined): "skip" | "blank" | "filled" =>
  v === "0.00" ? "skip" : !v || (kind === "select" && v === "000") ? "blank" : "filled";

export function validate1801v2018(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1801V2018, state);
  const tin = `${state[`${P}tinA_1`] ?? ""}${state[`${P}tinB_1`] ?? ""}${state[`${P}tinC_1`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA_1`, message: "The TIN's check digit doesn't match." });
  if (state[`${P}categoryNonResident_1`] !== "true" && state[`${P}categoryNonResident_2`] !== "true")
    problem.push({ id: `${P}categoryNonResident_1`, message: "Select an option for item 9 (non-resident alien)." });
  if (state[`${P}instGranted_1`] === "true") {
    const freq = ["freq_Mon", "freq_Qtr", "freq_Semi", "freq_Other"].some((k) => state[`${P}${k}`] === "true");
    if (!freq) problem.push({ id: `${P}freq_Mon`, message: "Select a frequency of payment on item 15D." });
    if (state[`${P}freq_Other`] === "true" && !(state[`${P}freqOtherInput`] ?? "").trim())
      problem.push({ id: `${P}freqOtherInput`, message: "Specify the frequency of payment on item 15D — Others." });
  }
  // validateForm's caps on items 37A / 37B
  const standard = parseMoney(state[`${P}txtStandardDed_C`] ?? "");
  if (state[`${P}categoryNonResident_1`] === "true" && standard > 50_000_000)
    problem.push({ id: `${P}txtStandardDed_C`, message: "A non-resident alien's standard deduction (37A) can't exceed ₱500,000." });
  else if (state[`${P}categoryNonResident_2`] === "true" && standard > 500_000_000)
    problem.push({ id: `${P}txtStandardDed_C`, message: "The standard deduction (37A) can't exceed ₱5,000,000." });
  if (parseMoney(state[`${P}txtFamDed_C`] ?? "") > 1_000_000_000)
    problem.push({ id: `${P}txtFamDed_C`, message: "The family-home deduction (37B) can't exceed ₱10,000,000." });
  // validateForm: a schedule row is either complete or empty
  for (const g of FORM_1801V2018.group ?? []) {
    (groups[g.name] ?? []).forEach((row, i) => {
      const cell = g.row.map((sub) => cellState(sub.kind, row[sub.id] ?? (sub.kind === "money" ? "0.00" : "")));
      if (cell.includes("blank") && cell.includes("filled"))
        problem.push({ id: `${g.row[0]!.id.replace("{i}", String(i + 1))}`, message: `Incomplete values on ${g.name}, row ${i + 1}.` });
    });
  }
  return problem;
}
