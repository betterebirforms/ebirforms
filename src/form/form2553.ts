// BIR Form 2553 (Return of Percentage Tax Payable Under Special Laws), P3.
// A fixed five-row table (items 14–18): per row the tax due = taxable amount ÷ 100 × rate%  (computeTaxDue).
//   19 = Σ 14E..18E;  20C = 20A + 20B;  21 = 19 − 20C;  22D = 22A + 22B + 22C;  23 = 21 + 22D.
// No schedule reconstruction and no amended gating — a clean scalar form.

import fieldJson from "./fields/2553.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2553:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
/** NumWithComma / rate read: strip commas, %, whitespace → float (NaN → 0). */
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const row = [14, 15, 16, 17, 18];
// per-row tax due = (amount / 100) × rate, rounded like formatCurrency
const rowTax = (n: number) => (r: Read) => parseMoney((numv(r, `txt${n}C`) / 100) * numv(r, `txt${n}D`));

const money = { kind: "money" as const };

export const FORM_2553 = buildSchema("2553", "Percentage Tax Under Special Laws", fieldJson as FieldJson[], {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTPName`]: { required: true },
  [`${P}itemYearEndMonth`]: { required: true },
  [`${P}txtYearEnded`]: { required: true },
  // the five tax-due rows: C = taxable amount (input), D = rate (input), E = tax due (computed)
  ...Object.fromEntries(row.flatMap((n) => [
    [`${P}txt${n}C`, money],
    [`${P}txt${n}D`, money],
    [`${P}txt${n}E`, { ...money, compute: rowTax(n) }],
  ])),
  [`${P}txt19`]: { ...money, compute: (r) => row.reduce((s, n) => s + m(r, `txt${n}E`), 0) },
  [`${P}txt20A`]: money,
  [`${P}txt20B`]: money,
  [`${P}txt20C`]: { ...money, compute: (r) => m(r, "txt20A") + m(r, "txt20B") },
  [`${P}txt21`]: { ...money, compute: (r) => m(r, "txt19") - m(r, "txt20C") },
  [`${P}txt22A`]: money,
  [`${P}txt22B`]: money,
  [`${P}txt22C`]: money,
  [`${P}txt22D`]: { ...money, compute: (r) => m(r, "txt22A") + m(r, "txt22B") + m(r, "txt22C") },
  [`${P}txt23`]: { ...money, compute: (r) => m(r, "txt21") + m(r, "txt22D") },
  // item 23's overpayment choice is live only while 23 is negative. BIR bug: checkOverpayment unchecks both
  // radios in BOTH branches, so every recompute of 23 (any amount's onblur) also clears a valid choice; the
  // choice survives only when picked after the last amount edit. We keep it while 23 is negative.
  ...Object.fromEntries([1, 2].map((n) => [`${P}ifoverpay_${n}`, { gate: { when: (r: Read) => m(r, "txt23") < 0 } }])),
});

export function validate2553(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2553, state);
  const quarter = [1, 2, 3, 4].some((n) => state[`${P}optQtr:_${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}optQtr:_1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
