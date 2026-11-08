// BIR Form 2200ANv2018 (Excise Tax Return for Automobiles and Non-Essential Goods), P3.
// Part II is a fixed grid of excise codes; each txtXG<code>TaxDue is an entered amount. Summing them:
//   txtBasicExciseTaxDue                  = Σ automobile codes
//   txtBasicExciseTaxDueNonEssentialGoods = Σ non-essential-goods codes
//   txtSchedule1C = the two above → item 16
//   17C = 17A + 17B;  18 = 16 − 17C;  20 = 18 − 19;  21D = 21A + 21B + 21C;  23B = 21D;
//   22 = 20 + 21A + 21B + 21C + 21D   ← the legacy DOUBLE-COUNTS the 21 series (21A..C AND their sum 21D);
//        replicated verbatim for byte-compatibility, not a fix.
//   23C = 23A + 23B;  24 = 22 − 23C.

import fieldJson from "./fields/2200ANv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200ANv2018:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const autoCode = ["021", "022", "023", "024", "031", "032", "033", "034", "055", "041", "042", "043", "044", "065", "071", "072", "073", "068", "061", "062", "063", "064"];
const goodsCode = ["100", "110", "120", "Others1", "Others2"];
const basic = (r: Read): number => autoCode.reduce((s, c) => s + m(r, `txtXG${c}TaxDue`), 0);
const goods = (r: Read): number => goodsCode.reduce((s, c) => s + m(r, `txtXG${c}TaxDue`), 0);
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  // excise code entries
  ...Object.fromEntries([...autoCode, ...goodsCode].map((c) => [`${P}txtXG${c}TaxDue`, money])),
  [`${P}txtBasicExciseTaxDue`]: { ...money, compute: basic },
  [`${P}txtBasicExciseTaxDueNonEssentialGoods`]: { ...money, compute: goods },
  [`${P}txtSchedule1C`]: { ...money, compute: (r) => basic(r) + goods(r) },
  [`${P}txt16`]: { ...money, compute: (r) => basic(r) + goods(r) },
  [`${P}txt17A`]: money,
  [`${P}txt17B`]: money,
  [`${P}txt17C`]: { ...money, compute: (r) => m(r, "txt17A") + m(r, "txt17B") },
  [`${P}txt18`]: { ...money, compute: (r) => m(r, "txt16") - m(r, "txt17C") },
  [`${P}txt19`]: money,
  [`${P}txt20`]: { ...money, compute: (r) => m(r, "txt18") - m(r, "txt19") },
  [`${P}txt21A`]: money,
  [`${P}txt21B`]: money,
  [`${P}txt21C`]: money,
  [`${P}txt21D`]: { ...money, compute: (r) => m(r, "txt21A") + m(r, "txt21B") + m(r, "txt21C") },
  [`${P}txt23A`]: money,
  [`${P}txt23B`]: { ...money, compute: (r) => m(r, "txt21A") + m(r, "txt21B") + m(r, "txt21C") }, // = 21D
  // over-count replicated: 20 + (21A+21B+21C) + 21D, i.e. the 21 series is added twice
  [`${P}txt22`]: { ...money, compute: (r) => m(r, "txt20") + m(r, "txt21A") + m(r, "txt21B") + m(r, "txt21C") + m(r, "txt21D") },
  [`${P}txt23C`]: { ...money, compute: (r) => m(r, "txt23A") + m(r, "txt23B") },
  [`${P}txt24`]: { ...money, compute: (r) => m(r, "txt22") - m(r, "txt23C") },
};

export const FORM_2200AN = buildSchema("2200ANv2018", "Excise Tax — Automobiles & Non-Essential Goods", fieldJson as FieldJson[], override);

export function validate2200AN(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2200AN, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
