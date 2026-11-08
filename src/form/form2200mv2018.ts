// BIR Form 2200-M v2018 (Excise Tax Return for Mineral Products), P3. Two pages:
//   • Page 2, Part V Schedule 1: one row per mineral product. Rows 1–8 are fixed (ATC XM010 ×3 coal & coke by year,
//     XM020, XM030, XM040, XM050, XM051) with BIR's printed rates in columns E / Imported Tax Rate ("P 50/MT", "4%" …);
//     rows 9–10 are "Other metallic minerals (specify)" (XM060) whose description and rates the filer types; rows 11+
//     are added by addRowSched1 (XM060 too) and counted in frm2200M:sched1AddedRowCount. Every amount — volumes,
//     values, the tax due columns F / Imported / Adjustment / Total — is ENTERED: BIR's per-row tax computes
//     (computeTaxDue) are commented out, so a row carries no rate arithmetic.
//   • Page 1, Part III: computeTotalTaxDue (onblur of any column F) sums column F of every row into
//     frm2200M:TotalExciseTaxDue ("" when the sum is 0); partThreeComputation (shared with 2200Pv2020, see
//     excise-part3.ts) then carries it to item 16 and the payable chain 17C … 24.
//
// BIR behaviours replicated because they change saved values:
//   • Item 16 is Σ column F (Locally Extracted tax due) only. BIR never adds the Imported tax due, the adjustment or
//     the row's own "Total Tax Due" column — so an imported-only return files item 16 = 0.00. (getTotalRow counts the
//     TotalTaxDue inputs from 0, but the disabled spacer txtSched1_TotalTaxDueDisabled2 pads the count, so every row
//     IS reached.)
//   • Item 19, 12A and the "Others" description are gated by their radios (excise-part3.ts).
//   • capitalize() upper-cases and trims Place of Removal and the XM060 descriptions on blur, and populateTable2Desc
//     copies the description into the disabled continuation-table cell (descriptionCont).

import fieldJson from "./fields/2200Mv2018.json";
import { capitalize, excisePage1, formatCentavo } from "./excise-part3.ts";
import { parseMoney, type Centavo } from "./money.ts";
import {
  buildSchema,
  validate as validateRequired,
  type FieldJson,
  type FieldSpec,
  type FormState,
  type GroupRow,
  type GroupSpec,
  type GroupState,
  type Problem,
} from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200M:";
type Read = (id: string) => string;
const money = { kind: "money" as const };

/** Fixed Schedule 1 rows (1–8 printed products, 9–10 "other metallic minerals"); added rows start at 11. */
export const FIXED_ROW = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const OTHER_ROW = [9, 10];
export const ADDED_FIRST_INDEX = 11;

/** Column C's row-1 input is the odd `frm2200M:LocallyExtractedRate1` (no `txtSched1_` stem). */
const colC = (row: number): string => (row === 1 ? `${P}LocallyExtractedRate1` : `${P}txtSched1_LocallyExtractedRateC${row}`);
/** The amount columns of a Schedule 1 row, by id. E and Imported Tax Rate are BIR's printed rates on rows 1–8. */
const amountCell = (row: number): string[] => [
  `${P}txtSched1_VOMRITaxableA${row}`,
  `${P}txtSched1_VOMRIExemptB${row}`,
  colC(row),
  `${P}txtSched1_LocallyExtractedRateD${row}`,
  ...(row >= 9 ? [`${P}txtSched1_LocallyExtractedTaxRateE${row}`] : []),
  `${P}txtSched1_LocallyExtractedTaxDueF${row}`,
  `${P}txtSched1_ImportedTaxableG${row}`,
  `${P}txtSched1_ImportedExemptH${row}`,
  ...(row >= 9 ? [`${P}txtSched1_ImportedTaxRate${row}`] : []),
  `${P}txtSched1_ImportedTaxDue${row}`,
  `${P}txtSched1_TaxDueAdjustment${row}`,
  `${P}txtSched1_TotalTaxDue${row}`,
];
const taxDueF = (row: number): string => `${P}txtSched1_LocallyExtractedTaxDueF${row}`;
const ADDED_F = `${P}_sched1AddedTaxDueF`;

/** Rows 11+ (addRowSched1 / sched1RowTemplate): ATC XM060, a delete checkbox, description, then the same columns. */
export const SCHED1_2200MV2018: GroupSpec = {
  name: "sched1",
  size_field: `${P}sched1AddedRowCount`,
  first_index: ADDED_FIRST_INDEX,
  row: [
    { id: `${P}txtSched1ATC`, kind: "text", derive: () => "XM060" },
    { id: `${P}chkBoxSched1Description`, kind: "checkbox", derive: (_r, v) => (v === "true" ? "true" : "false") },
    { id: `${P}txtSched1_description`, kind: "text", derive: capitalize },
    { id: `${P}txtSched1_PlaceOfRemoval`, kind: "text", derive: capitalize },
    { id: `${P}txtSched1_VOMRITaxableA`, kind: "money" },
    { id: `${P}txtSched1_VOMRIExemptB`, kind: "money" },
    { id: `${P}txtSched1_LocallyExtractedRateC`, kind: "money" },
    { id: `${P}txtSched1_LocallyExtractedRateD`, kind: "money" },
    { id: `${P}txtSched1_LocallyExtractedTaxRateE`, kind: "money" },
    { id: `${P}txtSched1_LocallyExtractedTaxDueF`, kind: "money" },
    { id: `${P}txtSched1_descriptionCont`, kind: "text", derive: (r) => r(`${P}txtSched1_description`) },
    { id: `${P}txtSched1_ImportedTaxableG`, kind: "money" },
    { id: `${P}txtSched1_ImportedExemptH`, kind: "money" },
    { id: `${P}txtSched1_ImportedTaxRate`, kind: "money" },
    { id: `${P}txtSched1_ImportedTaxDue`, kind: "money" },
    { id: `${P}txtSched1_TaxDueAdjustment`, kind: "money" },
    { id: `${P}txtSched1_TotalTaxDue`, kind: "money" },
  ],
  total: { into: ADDED_F, of: `${P}txtSched1_LocallyExtractedTaxDueF` },
};

/** computeTotalTaxDue: Σ column F over every row (fixed + added). Item 16 sits above Schedule 1 in the DOM, so it
 *  sums the row inputs rather than the (later) TotalExciseTaxDue field. */
export const totalTaxDueF = (r: Read): Centavo => FIXED_ROW.reduce((s, row) => s + parseMoney(r(taxDueF(row))), 0) + parseMoney(r(ADDED_F));

const schedOverride: Record<string, Partial<FieldSpec>> = Object.fromEntries([
  ...FIXED_ROW.flatMap((row) => amountCell(row).map((id) => [id, money])),
  ...FIXED_ROW.map((row) => [`${P}txtSched1_PlaceOfRemoval${row}`, { derive: capitalize }]),
  ...OTHER_ROW.flatMap((row) => [
    [`${P}txtSched1_description${row}`, { derive: capitalize }],
    [`${P}txtSched1_descriptionCont${row}`, { derive: (r: Read) => r(`${P}txtSched1_description${row}`).toUpperCase().trim() }],
  ]),
]);

/** BIR's printed constants (ATC, product description, rows 1–8's rates) and the disabled spacer cells: not inputs. Left out
 *  of the schema, the save keeps BIR's own template value for each. */
const CONSTANT = /^frm2200M:(txtSched1ATC\d+|txtSched1Description\d+|txtSched1_(LocallyExtractedTaxRateE|ImportedTaxRate)[1-8]|txtSched1_\w+Disabled\d)$/;
const scalarField = (fieldJson as FieldJson[]).filter((f) => !CONSTANT.test(f.id));

export const FORM_2200MV2018 = buildSchema("2200Mv2018", "Excise Tax — Mineral Products", scalarField, {
  ...excisePage1(P, totalTaxDueF),
  ...schedOverride,
  // computeTotalTaxDue writes "" (not 0.00) when the column-F sum is zero
  [`${P}TotalExciseTaxDue`]: { kind: "text", compute: totalTaxDueF, format: (c) => (c === 0 ? "" : formatCentavo(c)) },
});
FORM_2200MV2018.group = [SCHED1_2200MV2018];

/** checkPartVRow: Place of Removal, then at least one more column. */
const rowProblem = (row: number, value: (id: string) => string, cell: string[], label: string): Problem[] => {
  if (!value(`${P}txtSched1_PlaceOfRemoval${row}`).trim()) return [{ id: `${P}txtSched1_PlaceOfRemoval${row}`, message: `Place of Removal in ${label} is required.` }];
  if (!cell.some((id) => value(id).trim() !== "")) return [{ id: cell[0]!, message: `Input at least 1 more column in ${label}.` }];
  return [];
};

export function validate2200Mv2018(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2200MV2018, state);
  const tin = `${state[`${P}txtPg1TIN1`] ?? ""}${state[`${P}txtPg1TIN2`] ?? ""}${state[`${P}txtPg1TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
  const v = (id: string) => state[id] ?? "";
  // checkPartVFields: a fixed row with any entry needs Place of Removal and one more column; rows 9–10 also a description
  for (const row of FIXED_ROW) {
    const cell = amountCell(row);
    const description = row >= 9 ? v(`${P}txtSched1_description${row}`).trim() : "x";
    const any = [`${P}txtSched1_PlaceOfRemoval${row}`, ...cell].some((id) => v(id).trim() !== "");
    if (any && !description) problem.push({ id: `${P}txtSched1_description${row}`, message: `Description in Schedule 1 row ${row} is required.` });
    else if (any || (row >= 9 && v(`${P}txtSched1_description${row}`).trim())) problem.push(...rowProblem(row, v, cell, `Schedule 1 row ${row}`));
  }
  (groups.sched1 ?? []).forEach((r: GroupRow, k) => {
    const row = ADDED_FIRST_INDEX + k;
    const rv = (id: string) => r[id.replace(new RegExp(`${row}$`), "")] ?? "";
    if (!rv(`${P}txtSched1_description${row}`).trim()) {
      problem.push({ id: `${P}txtSched1_description${row}`, message: `Description in Schedule 1 row ${row} is required.` });
      return;
    }
    const cell = SCHED1_2200MV2018.row.filter((s) => s.kind === "money").map((s) => `${s.id}${row}`);
    problem.push(...rowProblem(row, rv, cell, `Schedule 1 row ${row}`));
  });
  if (parseMoney(v(`${P}txtPg1P3I24BalToCarryOver`)) > 0) {
    problem.push({ id: `${P}txtPg1P3I24BalToCarryOver`, message: "Item 24 is still payable: apply a deposit (item 23A) to proceed." });
  }
  return problem;
}
