// BIR Form 2200-P v2020 (Excise Tax Return for Petroleum Products), P3. Two pages:
//   • Page 2, Part V Schedule 1 (frm2200P:sched1Table): one row per petroleum product. Rows 1–25 are fixed: their ATC
//     (XP010 … XP220), description, unit of measure and applicable rate are hidden constant inputs BIR saves as-is
//     (template defaults — including BIR's own typos: row 11's description ends in `style=`, row 14's rate is `5.00"`).
//     Rows 26–27 are blank "other" rows (ATC digits after a printed "XP", description, unit, rate typed); rows 28+ are
//     appended by addRowSched1 / rowTemplate and counted in frm2200P:sched1AddedRowCount. Every quantity and the Basic
//     Excise Tax Due are ENTERED — BIR's per-row computes (computeTotTaxRemov, computeTotTaxPaid, computeBasicExciseDue
//     = removals × rate) are all commented out, so a row carries no rate arithmetic.
//   • Page 1, Part III: computeBasicExciseTaxDue (onblur of any Basic Excise Tax Due) sums that column over every row
//     (getTotalRow counts the inputs, so none is skipped) into frm2200P:txtSched1TotalTaxDue — "" when the sum is 0 —
//     and partThreeComputation (shared with 2200Mv2018, excise-part3.ts) carries it to item 16 and on to item 24.
//
// BIR behaviours replicated because they change saved values: the "" total, item 19 / 12A / Others gates, and
// capitalize() (upper-case + trim) on Place of Removal and the other rows' description and unit of measure.
// Not replicated: the IAF-copy writer (saveXMLsubmit) upper-cases every text value; the regular savefile does not.

import fieldJson from "./fields/2200Pv2020.json";
import { capitalize, excisePage1, formatCentavo } from "./excise-part3.ts";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200P:";
type Read = (id: string) => string;
const money = { kind: "money" as const };

/** Fixed Schedule 1 rows (1–25 printed products, 26–27 "other" rows); added rows start at 28. */
export const FIXED_ROW = Array.from({ length: 27 }, (_, k) => k + 1);
export const OTHER_ROW = [26, 27];
export const ADDED_FIRST_INDEX = 28;

/** The quantity columns of a row, in BIR's order (checkPartVRow's fieldsArr after Place of Removal). */
export const QUANTITY_STEM = ["LocalManuProd", "Imported", "TotTaxRemovals", "TaxPaidImported", "UnderBond", "Exports", "Others", "TotTaxPaid", "BasicExciseTaxDue"];
const cell = (stem: string, row: number | "") => `${P}txtSched1${stem}${row}`;
const ADDED_DUE = `${P}_sched1AddedBasicExciseTaxDue`;

/** Rows 28+ (rowTemplate): delete checkbox, ATC digits, description, unit, rate, then the same columns as rows 1–27. */
export const SCHED1_2200PV2020: GroupSpec = {
  name: "sched1",
  size_field: `${P}sched1AddedRowCount`,
  first_index: ADDED_FIRST_INDEX,
  row: [
    { id: `${P}chkBoxSched1ATC`, kind: "checkbox", derive: (_r, v) => (v === "true" ? "true" : "false") },
    { id: cell("ATC", ""), kind: "text" },
    { id: cell("Description", ""), kind: "text", derive: capitalize },
    { id: cell("UnitOfMeasure", ""), kind: "text", derive: capitalize },
    { id: cell("ApplicableRate", ""), kind: "money" },
    { id: cell("PlaceOfRemoval", ""), kind: "text", derive: capitalize },
    ...QUANTITY_STEM.map((stem) => ({ id: cell(stem, ""), kind: "money" as const })),
  ],
  total: { into: ADDED_DUE, of: cell("BasicExciseTaxDue", "") },
};

/** computeBasicExciseTaxDue: Σ Basic Excise Tax Due over every row. Item 16 sits above Schedule 1 in the DOM, so it
 *  sums the row inputs rather than the (later) txtSched1TotalTaxDue. */
export const totalBasicExciseTaxDue = (r: Read): Centavo =>
  FIXED_ROW.reduce((s, row) => s + parseMoney(r(cell("BasicExciseTaxDue", row))), 0) + parseMoney(r(ADDED_DUE));

const schedOverride: Record<string, Partial<FieldSpec>> = Object.fromEntries([
  ...FIXED_ROW.flatMap((row) => QUANTITY_STEM.map((stem) => [cell(stem, row), money])),
  ...FIXED_ROW.map((row) => [cell("PlaceOfRemoval", row), { derive: capitalize }]),
  ...OTHER_ROW.flatMap((row) => [
    [cell("Description", row), { derive: capitalize }],
    [cell("UnitOfMeasure", row), { derive: capitalize }],
    [cell("ApplicableRate", row), money],
  ]),
]);

/** Rows 1–25's ATC / description / unit / rate are hidden constant inputs, not inputs a filer types: left out of the
 *  schema, the save keeps BIR's own template value for each (typos included). */
const CONSTANT = /^frm2200P:txtSched1(ATC|Description|UnitOfMeasure|ApplicableRate)([1-9]|1\d|2[0-5])$/;
const scalarField = (fieldJson as FieldJson[]).filter((f) => !CONSTANT.test(f.id));

export const FORM_2200PV2020 = buildSchema("2200Pv2020", "Excise Tax — Petroleum Products", scalarField, {
  ...excisePage1(P, totalBasicExciseTaxDue),
  ...schedOverride,
  // computeBasicExciseTaxDue writes "" (not 0.00) when the sum is zero
  [cell("TotalTaxDue", "")]: { kind: "text", compute: totalBasicExciseTaxDue, format: (c) => (c === 0 ? "" : formatCentavo(c)) },
});
FORM_2200PV2020.group = [SCHED1_2200PV2020];

/** checkPartVReqRow + checkPartVRow for one row read through `v`. */
function rowProblem(row: number, v: (stem: string) => string, needsHead: boolean): Problem[] {
  const id = (stem: string) => cell(stem, row);
  if (needsHead) {
    for (const [stem, label] of [["ATC", "ATC"], ["Description", "Description"], ["UnitOfMeasure", "Unit of Measure"], ["ApplicableRate", "Applicable Rate"]] as const) {
      if (!v(stem).trim()) return [{ id: id(stem), message: `${label} in Schedule 1 row ${row} is required.` }];
    }
  }
  if (!v("PlaceOfRemoval").trim()) return [{ id: id("PlaceOfRemoval"), message: `Place of Removal in Schedule 1 row ${row} is required.` }];
  if (!QUANTITY_STEM.some((stem) => v(stem).trim() !== "")) return [{ id: id(QUANTITY_STEM[0]!), message: `Input at least 1 more column in Schedule 1 row ${row}.` }];
  return [];
}

export function validate2200Pv2020(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2200PV2020, state);
  const tin = `${state[`${P}txtPg1TIN1`] ?? ""}${state[`${P}txtPg1TIN2`] ?? ""}${state[`${P}txtPg1TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
  // checkPartVFields: a row with any quantity needs Place of Removal and one more column; rows 26–27 also need ATC,
  // description, unit and rate once any of those is typed; added rows always do
  for (const row of FIXED_ROW) {
    const v = (stem: string) => state[cell(stem, row)] ?? "";
    const quantity = ["PlaceOfRemoval", ...QUANTITY_STEM].some((stem) => v(stem).trim() !== "");
    const head = row >= 26 && ["ATC", "Description", "UnitOfMeasure", "ApplicableRate"].some((stem) => v(stem).trim() !== "");
    if (quantity || head) problem.push(...rowProblem(row, v, row >= 26));
  }
  (groups.sched1 ?? []).forEach((r: GroupRow, k) => problem.push(...rowProblem(ADDED_FIRST_INDEX + k, (stem) => r[cell(stem, "")] ?? "", true)));
  if (parseMoney(state[`${P}txtPg1P3I24BalToCarryOver`] ?? "") > 0) {
    problem.push({ id: `${P}txtPg1P3I24BalToCarryOver`, message: "Item 24 is still payable: apply a deposit (item 23A) to proceed." });
  }
  return problem;
}
