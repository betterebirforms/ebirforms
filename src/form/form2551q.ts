// BIR Form 2551Qv2018 (Quarterly Percentage Tax Return — TRAIN), P3.
// Schedule 1 is a fixed six-row ATC table (un-prefixed ids): per row ATCDue = ATCAmt × ATCRate / 100;
// Σ → txt14. Then: 18 = 15 + 16 + 17; 19 = 14 − 18; 23 = 20 + 21 + 22; 24 = 19 + 23.
// Radio gating (the enabler for TRAIN's 8% option):
//   - taxRate1 = file percentage tax (Schedule 1 live). taxRate2 = 8% income-tax option → the whole return
//     is zeroed "for compliance only". So txt14..txt22 are gated on taxRate1.
//   - item 16 (tax paid in a previously filed return) needs taxRate1 AND an amended return → an AND-gate.

import fieldJson from "./fields/2551Qv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2551Qv2018:";
type Read = (id: string) => string;
const mp = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(id)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const atcRow = [1, 2, 3, 4, 5, 6];
// per-row tax due, rounded like formatCurrency; self-contained so it is order-independent (item 14 on page 1
// is computed before the Schedule-1 cells on page 2, so it cannot read their computed values).
const atcDue = (r: Read, i: number): number => parseMoney(numv(r, `txtATCAmt${i}`) * (numv(r, `txtATCRate${i}`) / 100));
const schedTotal = (r: Read): number => atcRow.reduce((s, i) => s + atcDue(r, i), 0);
const money = { kind: "money" as const };
const onRate1 = { on: `${P}taxRate1`, equals: "true" };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}rtnMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  // Schedule 1: six fixed ATC rows (un-prefixed ids). Amount & rate are inputs; due is computed.
  ...Object.fromEntries(atcRow.flatMap((i) => [
    [`txtATCAmt${i}`, money],
    [`txtATCRate${i}`, money],
    [`txtATCDue${i}`, { ...money, compute: (r: Read) => atcDue(r, i) }],
  ])),
  txtTotalSched1: { ...money, compute: schedTotal },
  // Item 14 = Schedule 1 total, gated on the percentage-tax option (8% option zeroes it).
  [`${P}txt14`]: { ...money, gate: onRate1, compute: schedTotal },
  [`${P}txt15`]: { ...money, gate: onRate1 },
  [`${P}txt16`]: { ...money, gate: [onRate1, { on: `${P}amendedRtn_1`, equals: "true" }] },
  [`${P}txt17`]: { ...money, gate: onRate1 },
  [`${P}txt18`]: { ...money, compute: (r) => mp(r, "txt15") + mp(r, "txt16") + mp(r, "txt17") },
  [`${P}txt19`]: { ...money, compute: (r) => mp(r, "txt14") - mp(r, "txt18") },
  [`${P}txt20`]: { ...money, gate: onRate1 },
  [`${P}txt21`]: { ...money, gate: onRate1 },
  [`${P}txt22`]: { ...money, gate: onRate1 },
  [`${P}txt23`]: { ...money, compute: (r) => mp(r, "txt20") + mp(r, "txt21") + mp(r, "txt22") },
  [`${P}txt24`]: { ...money, compute: (r) => mp(r, "txt19") + mp(r, "txt23") },
};

export const FORM_2551Q = buildSchema("2551Qv2018", "Quarterly Percentage Tax Return", fieldJson as FieldJson[], override);

export function validate2551Q(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2551Q, state);
  const rateChosen = state[`${P}taxRate1`] === "true" || state[`${P}taxRate2`] === "true";
  if (!rateChosen) problem.push({ id: `${P}taxRate1`, message: "Select the tax-rate option (percentage tax or 8%)." });
  const quarter = [1, 2, 3, 4].some((n) => state[`${P}qtr_${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}qtr_1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
