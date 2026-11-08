// BIR Form 1704 (Improperly Accumulated Earnings Tax Return — IAET), P3.
// Schedule 1 (fixed): sched1Txt3 = Txt1 − Txt2; sched1Txt9 = Σ(Txt3..Txt8); item 21A = sched1Txt9.
// Part reconciliation grid (rows 14–16 × value columns B,D,F,H,J,L,N,P,R,T) + 17A → 17B.
// Chain: 18 = 13 + 17B; 21B = 19 + 20 + 21A; 22 = 18 − 21B; 24 = 22 × 23%; 26 = 24 − 25;
//        27D = 27A + 27B + 27C; 28 = 26 + 27D. All formatCurrency round-half-up.

import fieldJson from "./fields/1704.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1704:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const gridRow = [14, 15, 16];
const gridCol = ["B", "D", "F", "H", "J", "L", "N", "P", "R", "T"];
// Schedule 1 total (items 3..8), self-contained (Txt3 = Txt1 − Txt2)
const sched9 = (r: Read): number => (m(r, "sched1Txt1") - m(r, "sched1Txt2")) + [4, 5, 6, 7, 8].reduce((s, x) => s + m(r, `sched1Txt${x}`), 0);
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTin1`]: { required: true },
  [`${P}txtTin2`]: { required: true },
  [`${P}txtTin3`]: { required: true },
  [`${P}txtBranch`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtName`]: { required: true },
  [`${P}txtYearEnded`]: { required: true },
  // Schedule 1
  ...Object.fromEntries([1, 2, 4, 5, 6, 7, 8].map((x) => [`${P}sched1Txt${x}`, money])),
  [`${P}sched1Txt3`]: { ...money, compute: (r) => m(r, "sched1Txt1") - m(r, "sched1Txt2") },
  [`${P}sched1Txt9`]: { ...money, compute: sched9 },
  // reconciliation grid value columns
  ...Object.fromEntries(gridRow.flatMap((x) => gridCol.map((c) => [`${P}txt${x}${c}`, money]))),
  [`${P}txt17A`]: money,
  [`${P}txt17B`]: { ...money, compute: (r) => gridRow.reduce((t, x) => t + gridCol.reduce((u, c) => u + m(r, `txt${x}${c}`), 0), 0) + m(r, "txt17A") },
  // page-1 chain
  [`${P}txt13`]: money,
  [`${P}txt18`]: { ...money, compute: (r) => m(r, "txt13") + m(r, "txt17B") },
  [`${P}txt19`]: money,
  [`${P}txt20`]: money,
  [`${P}txt21A`]: { ...money, compute: sched9 }, // item 21A = Schedule 1 total
  [`${P}txt21B`]: { ...money, compute: (r) => m(r, "txt19") + m(r, "txt20") + m(r, "txt21A") },
  [`${P}txt22`]: { ...money, compute: (r) => m(r, "txt18") - m(r, "txt21B") },
  [`${P}txt23`]: money, // IAET rate %
  [`${P}txt24`]: { ...money, compute: (r) => parseMoney((m(r, "txt22") / 100) * (numv(r, "txt23") / 100)) },
  [`${P}txt25`]: money,
  [`${P}txt26`]: { ...money, compute: (r) => m(r, "txt24") - m(r, "txt25") },
  [`${P}txt27A`]: money,
  [`${P}txt27B`]: money,
  [`${P}txt27C`]: money,
  [`${P}txt27D`]: { ...money, compute: (r) => m(r, "txt27A") + m(r, "txt27B") + m(r, "txt27C") },
  [`${P}txt28`]: { ...money, compute: (r) => m(r, "txt26") + m(r, "txt27D") },
};

export const FORM_1704 = buildSchema("1704", "Improperly Accumulated Earnings Tax Return", fieldJson as FieldJson[], override);

export function validate1704(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1704, state);
  const tin = `${state[`${P}txtTin1`] ?? ""}${state[`${P}txtTin2`] ?? ""}${state[`${P}txtTin3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTin1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
