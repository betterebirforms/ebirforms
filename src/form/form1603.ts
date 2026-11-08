// BIR Form 1603 (Quarterly Remittance Return of Final Income Taxes Withheld on Fringe Benefits — pre-2018,
// superseded by 1603Qv2018), P3. Three fixed grossing-up groups (ATC WF320/WF330/WF360):
//   base_g   = fringe_g / divisor × 100       (85 → 15%, 75 → 25%, 65 → 35%)
//   req_g    = base_g × rate / 100
//   18A = Σ fringe;  18B = Σ req;  20 = 18B − 19;  21D = 21A+21B+21C;  22 = 20 + 21D
// Item 19 (tax remitted in a previously filed return) is amended-only — radio j_id217 gates it.
// Rounding at each step is BIR's formatCurrency round-half-up (parseMoney(number) reproduces it).

import fieldJson from "./fields/1603.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1603:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// grossing-up group g with divisor and rate; base from fringe, then req from the rounded base
const base = (g: number, div: number) => (r: Read) => parseMoney((numv(r, `txtFringe${g}`) / div) * 100);
const req = (g: number, div: number, rate: number) => (r: Read) => parseMoney((parseMoney((numv(r, `txtFringe${g}`) / div) * 100) / 100) * (rate / 100));

const money = { kind: "money" as const };

export const FORM_1603 = buildSchema("1603", "Quarterly Final Taxes Withheld on Fringe Benefits", fieldJson as FieldJson[], {
  [`${P}tinPart1`]: { required: true },
  [`${P}tinPart2`]: { required: true },
  [`${P}tinPart3`]: { required: true },
  [`${P}branchCode`]: { required: true },
  [`${P}rdoCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtFringe320`]: money,
  [`${P}txtFringe330`]: money,
  [`${P}txtFringe360`]: money,
  [`${P}txtBase320`]: { ...money, compute: base(320, 85) },
  [`${P}txtReq320`]: { ...money, compute: req(320, 85, 15) },
  [`${P}txtBase330`]: { ...money, compute: base(330, 75) },
  [`${P}txtReq330`]: { ...money, compute: req(330, 75, 25) },
  [`${P}txtBase360`]: { ...money, compute: base(360, 65) },
  [`${P}txtReq360`]: { ...money, compute: req(360, 65, 35) },
  [`${P}txt18A`]: { ...money, compute: (r) => m(r, "txtFringe320") + m(r, "txtFringe330") + m(r, "txtFringe360") },
  [`${P}txt18B`]: { ...money, compute: (r) => m(r, "txtReq320") + m(r, "txtReq330") + m(r, "txtReq360") },
  [`${P}txt19`]: { ...money, gate: { on: `${P}j_id217:_1`, equals: "true" } },
  [`${P}txt20`]: { ...money, compute: (r) => m(r, "txt18B") - m(r, "txt19") },
  [`${P}txt21A`]: money,
  [`${P}txt21B`]: money,
  [`${P}txt21C`]: money,
  [`${P}txt21D`]: { ...money, compute: (r) => m(r, "txt21A") + m(r, "txt21B") + m(r, "txt21C") },
  [`${P}txt22`]: { ...money, compute: (r) => m(r, "txt20") + m(r, "txt21D") },
});

export function validate1603(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1603, state);
  const quarter = [1, 2, 3, 4].some((n) => state[`${P}optQrtr:_${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}optQrtr:_1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}tinPart1`] ?? ""}${state[`${P}tinPart2`] ?? ""}${state[`${P}tinPart3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinPart1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
