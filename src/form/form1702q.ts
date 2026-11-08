// BIR Form 1702Q (Quarterly Income Tax Return for Corporations, Partnerships and Other Non-Individual
// Taxpayers), P3. A multi-column ITR, no dynamic rows. Field prefix is frm1702q:, EXCEPT the MCIT schedule
// (bare ids txt1st/txt2nd/txt3rd/txtTotal/txtMinCorpIncomeTax) and the deduction-method radio (1702q:...).
//
//   18A=16A−17A  20A=18A        18B=16B−17B  18C=16C−17C
//   20B=19A+18B  20C=19B+18C    22A=20B−21B
//   21C: itemized (OptMethodDeduct_1) → entered; OSD → 20C×40%.  22B=20C−21C
//   24A=22A+23A  24B=22B+23B    26A=24A>0?24A×25A%:0   26B=24B>0?24B×25B%:0
//   MCIT txt28 = (txt1st+txt2nd+txt3rd)×2%
//   29A=max(26B, 28)  (if 26B<28 the MCIT applies and 29B is forced 0)   29C=29A−29B   29D=26A−27
//   30=29C+29D   31H=Σ31A..31G   32=30−31H   33D=33A+33B+33C   34=32+33D

import fieldJson from "./fields/1702Q.json";
import { formatMoney, parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1702q:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const mb = (r: Read, id: string): number => parseMoney(r(id)); // bare-id MCIT schedule fields
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const itemized = (r: Read): boolean => r("1702q:OptMethodDeduct_1") === "true";
const mcit = (r: Read): number => parseMoney(((mb(r, "txt1st") + mb(r, "txt2nd") + mb(r, "txt3rd")) / 100) * 0.02);
const money = { kind: "money" as const };
const input = (ids: string[]): Record<string, Partial<FieldSpec>> => Object.fromEntries(ids.map((id) => [`${P}${id}`, money]));

/** Shared builder for 1702Q and its identical-structure variant 1702Qv2008C (same frm1702q: prefix + graph).
 *  `is31GGated`: the 2008C edition's validate31G() (onblur of the "Others, please specify" box) forces 31G to
 *  0.00 while that description is blank, so an amount without a description never survives. */
export function makeQ(code: string, json: FieldJson[], is31GGated = false): FormSchema {
  return buildSchema(code, "Quarterly Income Tax — Corporations", json, {
  [`${P}txtTin1`]: { required: true },
  [`${P}txtTin2`]: { required: true },
  [`${P}txtTin3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRdoCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtYearEnded`]: { required: true },
  ...input(["txt16A", "txt16B", "txt16C", "txt17A", "txt17B", "txt17C", "txt19A", "txt19B", "txt21B", "txt21C",
    "txt23A", "txt23B", "txt25A", "txt25B", "txt27", "txt29B", "txt31A", "txt31B", "txt31C", "txt31D", "txt31E",
    "txt31F", "txt31G", "txt33A", "txt33B", "txt33C"]),
  txt1st: money, txt2nd: money, txt3rd: money,
  txtTotal: { ...money, compute: (r) => mb(r, "txt1st") + mb(r, "txt2nd") + mb(r, "txt3rd") },
  txtMinCorpIncomeTax: { ...money, compute: mcit },
  [`${P}txt18A`]: { ...money, compute: (r) => m(r, "txt16A") - m(r, "txt17A") },
  [`${P}txt20A`]: { ...money, compute: (r) => m(r, "txt18A") },
  [`${P}txt18B`]: { ...money, compute: (r) => m(r, "txt16B") - m(r, "txt17B") },
  [`${P}txt18C`]: { ...money, compute: (r) => m(r, "txt16C") - m(r, "txt17C") },
  [`${P}txt20B`]: { ...money, compute: (r) => m(r, "txt19A") + m(r, "txt18B") },
  [`${P}txt20C`]: { ...money, compute: (r) => m(r, "txt19B") + m(r, "txt18C") },
  [`${P}txt22A`]: { ...money, compute: (r) => m(r, "txt20B") - m(r, "txt21B") },
  // 21C: entered under itemized deduction; under OSD it is 40% of item 20C
  [`${P}txt21C`]: { ...money, compute: (r) => (itemized(r) ? m(r, "txt21C") : parseMoney((m(r, "txt20C") / 100) * 0.4)) },
  [`${P}txt22B`]: { ...money, compute: (r) => m(r, "txt20C") - m(r, "txt21C") },
  [`${P}txt24A`]: { ...money, compute: (r) => m(r, "txt22A") + m(r, "txt23A") },
  [`${P}txt24B`]: { ...money, compute: (r) => m(r, "txt22B") + m(r, "txt23B") },
  // compute26A writes the bare number 0 (shown and saved as "0", not "0.00") when 24A is not positive (BIR quirk)
  [`${P}txt26A`]: {
    ...money,
    compute: (r) => (m(r, "txt24A") > 0 ? parseMoney((m(r, "txt24A") / 100) * (numv(r, "txt25A") / 100)) : 0),
    format: (cents, r) => (m(r, "txt24A") > 0 ? formatMoney(cents) : "0"),
  },
  [`${P}txt26B`]: { ...money, compute: (r) => (m(r, "txt24B") > 0 ? parseMoney((m(r, "txt24B") / 100) * (numv(r, "txt25B") / 100)) : 0) },
  [`${P}txt28`]: { ...money, compute: mcit },
  [`${P}txt29A`]: { ...money, compute: (r) => (m(r, "txt26B") < m(r, "txt28") ? m(r, "txt28") : m(r, "txt26B")) },
  // 29B is forced to 0 when the MCIT applies (26B < 28); otherwise it is an entered credit
  [`${P}txt29B`]: { ...money, compute: (r) => (m(r, "txt26B") < m(r, "txt28") ? 0 : m(r, "txt29B")) },
  [`${P}txt29C`]: { ...money, compute: (r) => m(r, "txt29A") - m(r, "txt29B") },
  [`${P}txt29D`]: { ...money, compute: (r) => m(r, "txt26A") - m(r, "txt27") },
  [`${P}txt30`]: { ...money, compute: (r) => m(r, "txt29C") + m(r, "txt29D") },
  [`${P}txt31H`]: { ...money, compute: (r) => ["txt31A", "txt31B", "txt31C", "txt31D", "txt31E", "txt31F", "txt31G"].reduce((s, id) => s + m(r, id), 0) },
  [`${P}txt32`]: { ...money, compute: (r) => m(r, "txt30") - m(r, "txt31H") },
  [`${P}txt33D`]: { ...money, compute: (r) => m(r, "txt33A") + m(r, "txt33B") + m(r, "txt33C") },
    [`${P}txt34`]: { ...money, compute: (r) => m(r, "txt32") + m(r, "txt33D") },
    ...(is31GGated ? { [`${P}txt31G`]: { ...money, gate: { when: (r: Read) => !/^ *$/.test(r(`${P}txt31Gothers`)) } } } : {}),
  });
}

export const FORM_1702Q = makeQ("1702Q", fieldJson as FieldJson[]);

export function validateQ(schema: FormSchema, state: FormState): Problem[] {
  const problem = validateRequired(schema, state);
  const quarter = [1, 2, 3].some((n) => state[`${P}optQtr:_${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}optQtr:_1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txtTin1`] ?? ""}${state[`${P}txtTin2`] ?? ""}${state[`${P}txtTin3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTin1`, message: "The TIN's check digit doesn't match." });
  return problem;
}

export const validate1702Q = (state: FormState): Problem[] => validateQ(FORM_1702Q, state);
