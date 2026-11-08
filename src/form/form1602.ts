// BIR Form 1602 (Monthly Remittance Return of Final Income Taxes Withheld on Interest on Bank Deposits and
// Yield on Deposit Substitutes/Trusts), P3. Rows 14–23: tax C = amount A × 20% (preset hidden rates). Row 22
// carries two extra bases: 22F = 22D × 12%, 22I = 22G × 5%. Then:
//   26 = Σ(14..23 C) + 22F + 22I + 24D + 25D ;  33 = 26 + 29 + 32 ;  35 = 33 − 34 ;
//   36D = 36A + 36B + 36C ;  37 = 35 + 36D.
// Schedule 1 (10 rows): TotalC = Reg + Foreign; column totals A/B/C and Installment total D.
// (Items 24D/25D are foreign/treaty rows whose legacy auto-fill is an unusual A×rate×C formula; here they are
//  entered directly — the domestic chain, which is what determines the remittance, is fully modelled.)

import fieldJson from "./fields/1602.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1602:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const taxRow = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const sched = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}MonthEnd`]: { required: true },
  [`${P}txtYear`]: { required: true },
};
// rows 14–23: C = A × 20%
for (const i of taxRow) {
  override[`${P}txt${i}A`] = money;
  override[`${P}txt${i}C`] = { ...money, compute: (r: Read) => parseMoney(numv(r, `txt${i}A`) * 0.2) };
}
// row 22 extra bases
override[`${P}txt22D`] = money;
override[`${P}txt22F`] = { ...money, compute: (r) => parseMoney(numv(r, "txt22D") * 0.12) };
override[`${P}txt22G`] = money;
override[`${P}txt22I`] = { ...money, compute: (r) => parseMoney(numv(r, "txt22G") * 0.05) };
// foreign rows (entered directly)
override[`${P}txt24D`] = money;
override[`${P}txt25D`] = money;
// remittance chain
override[`${P}txt26`] = { ...money, compute: (r) => taxRow.reduce((s, i) => s + m(r, `txt${i}C`), 0) + m(r, "txt22F") + m(r, "txt22I") + m(r, "txt24D") + m(r, "txt25D") };
// 29 = Section B (international tax treaty) total and 32 = Section C (special rate) total: BIR fills them only by
// committing those modal tables (getSecB / getSecC), never by typing. disableSelTreaty (item 13 = No) zeroes both.
// On reload BIR re-sums Section C into 32 (getSecC(true)) but its next loadDataATCRow() puts the SAVED 29 back
// after getSecB(true) re-summed it (BIR bug), so a 29 that disagrees with its rows would survive; ours never does.
const specialTax = { on: `${P}OptSpecialTax1`, equals: "true" } as const;
override[`${P}txt29`] = { ...money, gate: specialTax };
override[`${P}txt32`] = { ...money, gate: specialTax };
override[`${P}txt33`] = { ...money, compute: (r) => m(r, "txt26") + m(r, "txt29") + m(r, "txt32") };
override[`${P}txt34`] = money;
override[`${P}txt35`] = { ...money, compute: (r) => m(r, "txt33") - m(r, "txt34") };
override[`${P}txt36A`] = money;
override[`${P}txt36B`] = money;
override[`${P}txt36C`] = money;
override[`${P}txt36D`] = { ...money, compute: (r) => m(r, "txt36A") + m(r, "txt36B") + m(r, "txt36C") };
override[`${P}txt37`] = { ...money, compute: (r) => m(r, "txt35") + m(r, "txt36D") };
// Schedule 1
for (const i of sched) {
  override[`${P}txtReg${i}`] = money;
  override[`${P}txtForeign${i}`] = money;
  override[`${P}txtInst${i}`] = money;
  override[`${P}txtTotal${i}C`] = { ...money, compute: (r: Read) => m(r, `txtReg${i}`) + m(r, `txtForeign${i}`) };
}
override[`${P}txtTotalA`] = { ...money, compute: (r) => sched.reduce((s, i) => s + m(r, `txtReg${i}`), 0) };
override[`${P}txtTotalB`] = { ...money, compute: (r) => sched.reduce((s, i) => s + m(r, `txtForeign${i}`), 0) };
override[`${P}txtTotalC`] = { ...money, compute: (r) => sched.reduce((s, i) => s + (m(r, `txtReg${i}`) + m(r, `txtForeign${i}`)), 0) };
override[`${P}txtTotalD`] = { ...money, compute: (r) => sched.reduce((s, i) => s + m(r, `txtInst${i}`), 0) };

/** Sections B and C: modal tables BIR saves as `<stem><i>` from 0 and rebuilds on reload by counting the
 *  `chxSecB<i>` / `chxSecC<i>` row markers. Required withheld = amount × rate ÷ 100 (getReqWithheldComputeSec*). */
const section = (name: string, sec: "B" | "C", into: string): GroupSpec => ({
  name,
  first_index: 0,
  row: [
    { id: `drpTreatyCodeSec${sec}`, kind: "select" },
    { id: `drpATCCodeSec${sec}`, kind: "select" },
    { id: `txtAmtIncomePaySec${sec}`, kind: "money" },
    { id: `txtRateSec${sec}`, kind: "text" },
    { id: `txtReqWithheldSec${sec}`, kind: "money", row_compute: (r) => parseMoney((parseMoney(r(`txtAmtIncomePaySec${sec}`)) / 100) * (Number(r(`txtRateSec${sec}`).replace(/,/g, "")) || 0) / 100) },
  ],
  total: { into, of: `txtReqWithheldSec${sec}` },
});
export const SECTION_B_1602 = section("secB", "B", `${P}txt29`);
export const SECTION_C_1602 = section("secC", "C", `${P}txt32`);

export const FORM_1602 = buildSchema("1602", "Final Taxes Withheld on Interest on Bank Deposits", fieldJson as FieldJson[], override);
FORM_1602.group = [SECTION_B_1602, SECTION_C_1602];
// the row-selection checkbox BIR saves unchecked per row; the reload counts these to rebuild each table
FORM_1602.extra_record = (_state, groups) =>
  (["B", "C"] as const).flatMap((sec) => (groups[`sec${sec}`] ?? []).map((_, i) => ({ key: `chxSec${sec}${i}`, value: "false" })));

export function validate1602(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1602, state);
  // checkiftaxwheld: B needs item 4 = Yes and item 13 = Treaty (2) or Both (3); C needs Special Rate (1) or Both (3)
  const live = state[`${P}OptTaxWithheld1`] === "true" && state[`${P}OptSpecialTax1`] === "true";
  const list = state[`${P}lstSpecialTax`] ?? "0";
  if ((groups.secB ?? []).length > 0 && !(live && (list === "2" || list === "3")))
    problem.push({ id: `${P}txt29`, message: "Section B needs item 4 = Yes and item 13 = International Tax Treaty or Both." });
  if ((groups.secC ?? []).length > 0 && !(live && (list === "1" || list === "3")))
    problem.push({ id: `${P}txt32`, message: "Section C needs item 4 = Yes and item 13 = Special Rate or Both." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
