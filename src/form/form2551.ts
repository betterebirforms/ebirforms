// BIR Form 2551 (Monthly Percentage Tax Return — pre-2018; superseded by 2551Q), P3.
// Same shape as 2553: a fixed five-row table (items 14–18), per row tax due = amount ÷ 100 × rate%, then
//   19 = Σ 14E..18E;  20C = 20A + 20B;  21 = 19 − 20C;  22D = 22A + 22B + 22C;  23 = 21 + 22D.

import fieldJson from "./fields/2551.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2551:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const row = [14, 15, 16, 17, 18];
const rowTax = (n: number) => (r: Read) => parseMoney((numv(r, `txtTax${n}C`) / 100) * numv(r, `txtTax${n}D`));
const money = { kind: "money" as const };

export const FORM_2551 = buildSchema("2551", "Monthly Percentage Tax Return", fieldJson as FieldJson[], {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}rtnMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  ...Object.fromEntries(row.flatMap((n) => [
    [`${P}txtTax${n}C`, money],
    [`${P}txtTax${n}D`, money],
    [`${P}txtTax${n}E`, { ...money, compute: rowTax(n) }],
  ])),
  [`${P}txtTax19`]: { ...money, compute: (r) => row.reduce((s, n) => s + m(r, `txtTax${n}E`), 0) },
  [`${P}txtTax20A`]: money,
  [`${P}txtTax20B`]: money,
  [`${P}txtTax20C`]: { ...money, compute: (r) => m(r, "txtTax20A") + m(r, "txtTax20B") },
  [`${P}txtTax21`]: { ...money, compute: (r) => m(r, "txtTax19") - m(r, "txtTax20C") },
  [`${P}txtTax22A`]: money,
  [`${P}txtTax22B`]: money,
  [`${P}txtTax22C`]: money,
  [`${P}txtTax22D`]: { ...money, compute: (r) => m(r, "txtTax22A") + m(r, "txtTax22B") + m(r, "txtTax22C") },
  [`${P}txtTax23`]: { ...money, compute: (r) => m(r, "txtTax21") + m(r, "txtTax22D") },
  // item 23's overpayment choice (refund / tax credit) is live only while 23 is negative: checkOverpayment
  // unchecks both otherwise
  ...Object.fromEntries(["opt23_1", "opt23_2"].map((id) => [`${P}${id}`, { gate: { when: (r: Read) => m(r, "txtTax23") < 0 } }])),
});

export function validate2551(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2551, state);
  const quarter = [1, 2, 3, 4].some((n) => state[`${P}qtr_${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}qtr_1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
