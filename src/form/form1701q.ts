// BIR Form 1701Q (Quarterly Income Tax Return for Individuals / Estates / Trusts — pre-TRAIN), P3.
// Two columns: A = taxpayer, B = spouse. Per column:
//   33 = OSD selected ? 26 × 40% : entered (itemized)   (OSD radios frm1701:optMethodOfDeduction23/24:_2)
//   28 = 26 + 27 ; 30 = 28 − 29 ; 32 = 30 + 31 ; 34 = 32 − 33 ; 36 = 34 + 35
//   37 = graduated tax on 36 (pre-TRAIN 5–32% brackets)
//   38M/N = Σ tax credits ; 39 = 37 − credits ; 40G/H = Σ penalties ; 41 = 39 + penalties
//   41C = 41A + 41B (combined)

import fieldJson from "./fields/1701Q.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1701q:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
// pre-TRAIN graduated income-tax table (centavos in → centavos out)
const bracket = (cents: number): number => {
  const v = cents / 100;
  let t: number;
  if (v <= 0) t = 0;
  else if (v < 10000) t = v * 0.05;
  else if (v < 30000) t = (v - 10000) * 0.1 + 500;
  else if (v < 70000) t = (v - 30000) * 0.15 + 2500;
  else if (v < 140000) t = (v - 70000) * 0.2 + 8500;
  else if (v < 250000) t = (v - 140000) * 0.25 + 22500;
  else if (v < 500000) t = (v - 250000) * 0.3 + 50000;
  else t = (v - 500000) * 0.32 + 125000;
  return parseMoney(t);
};
const money = { kind: "money" as const };

interface Col { s: string; osd: string; credits: string[]; creditTot: string; pens: string[]; penTot: string }
const cols: Col[] = [
  { s: "A", osd: "frm1701:optMethodOfDeduction23:_2", credits: ["38A", "38C", "38E", "38G", "38I", "38K"], creditTot: "txt38M", pens: ["40A", "40C", "40E"], penTot: "txt40G" },
  { s: "B", osd: "frm1701:optMethodOfDeduction24:_2", credits: ["38B", "38D", "38F", "38H", "38J", "38L"], creditTot: "txt38N", pens: ["40B", "40D", "40F"], penTot: "txt40H" },
];

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txt5TIN1`]: { required: true },
  [`${P}txt5TIN2`]: { required: true },
  [`${P}txt5TIN3`]: { required: true },
  [`${P}txt5BranchCode`]: { required: true },
  [`${P}txt5RDOCode`]: { required: true },
  [`${P}txtTaxPayername`]: { required: true },
  [`${P}txtYear`]: { required: true },
};
for (const c of cols) {
  const s = c.s;
  for (const n of ["26", "27", "29", "31", "35"]) override[`${P}txt${n}${s}`] = money;
  for (const id of [...c.credits, ...c.pens]) override[`${P}txt${id}`] = money;
  // 33 = OSD ? 26×40% : entered
  override[`${P}txt33${s}`] = { ...money, compute: (r: Read) => (r(c.osd) === "true" ? parseMoney((m(r, `txt26${s}`) / 100) * 0.4) : m(r, `txt33${s}`)) };
  override[`${P}txt28${s}`] = { ...money, compute: (r: Read) => m(r, `txt26${s}`) + m(r, `txt27${s}`) };
  override[`${P}txt30${s}`] = { ...money, compute: (r: Read) => m(r, `txt28${s}`) - m(r, `txt29${s}`) };
  override[`${P}txt32${s}`] = { ...money, compute: (r: Read) => m(r, `txt30${s}`) + m(r, `txt31${s}`) };
  override[`${P}txt34${s}`] = { ...money, compute: (r: Read) => m(r, `txt32${s}`) - m(r, `txt33${s}`) };
  override[`${P}txt36${s}`] = { ...money, compute: (r: Read) => m(r, `txt34${s}`) + m(r, `txt35${s}`) };
  override[`${P}txt37${s}`] = { ...money, compute: (r: Read) => bracket(m(r, `txt34${s}`) + m(r, `txt35${s}`)) };
  override[`${P}${c.creditTot}`] = { ...money, compute: (r: Read) => c.credits.reduce((t, id) => t + m(r, `txt${id}`), 0) };
  override[`${P}txt39${s}`] = { ...money, compute: (r: Read) => m(r, `txt37${s}`) - m(r, c.creditTot) };
  override[`${P}${c.penTot}`] = { ...money, compute: (r: Read) => c.pens.reduce((t, id) => t + m(r, `txt${id}`), 0) };
  override[`${P}txt41${s}`] = { ...money, compute: (r: Read) => m(r, `txt39${s}`) + m(r, c.penTot) };
}
override[`${P}txt41C`] = { ...money, compute: (r) => m(r, "txt41A") + m(r, "txt41B") };

export const FORM_1701Q = buildSchema("1701Q", "Quarterly Income Tax — Individuals", fieldJson as FieldJson[], override);

export function validate1701Q(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1701Q, state);
  const quarter = [1, 2, 3].some((n) => state[`${P}DateQuarter_${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}DateQuarter_1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txt5TIN1`] ?? ""}${state[`${P}txt5TIN2`] ?? ""}${state[`${P}txt5TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txt5TIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
