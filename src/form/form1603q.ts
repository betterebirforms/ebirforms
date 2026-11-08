// BIR Form 1603Qv2018 (Quarterly Remittance Return of Final Income Taxes Withheld on Fringe Benefits), P3.
// Schedule 1 is a FIXED two-row grossing-up table (ATC WF360 / WF330): per row the grossed-up tax base is
// value ÷ (divisor%), and the tax withheld is base × rate%. The two withheld amounts sum into item 14.
//   base_i    = value_i / (divisor_i / 100)                 (computeTaxBase360/330)
//   withheld_i= base_i  × taxRate_i / 100                   (compute360/330)
//   totalTax  = withheld_1 + withheld_2  → txtTax14         (computeTotalSchedule)
//   17 = 15 + 16;  18 = 14 − 17;  22 = 19 + 20 + 21;  23 = 18 + 22
// Item 15 (tax paid in a previously filed return) is amended-return only — changeAmended() / AmendedRtn gate it.
// Rounding at each step is BIR's formatCurrency round-half-up, which parseMoney(number) reproduces exactly.

import fieldJson from "./fields/1603Qv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1603Q:";
type Read = (id: string) => string;
/** NumWithComma / getNumericValue: strip commas, %, whitespace → float (NaN → 0). */
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** A money field → centavos. */
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));

// fixed Schedule-1 rows (1 = WF360, 2 = WF330); each step rounds like BIR's formatCurrency
// the divisor and rate are fixed text on BIR's page (65% / 35%, 75% / 25%); a fresh native form has no value for
// them, so a blank reads as BIR's own (it otherwise divides by zero and the tax base shows 0.00 until a reopen)
const FIXED: Record<string, number> = { Divisor1: 65, TaxRate1: 35, Divisor2: 75, TaxRate2: 25 };
const fixed = (r: Read, name: string): number => (String(r(`${P}Sched1:txt${name}`) ?? "").trim() === "" ? FIXED[name]! : numv(r, `Sched1:txt${name}`));
const base = (r: Read, i: 1 | 2): number => parseMoney(numv(r, `Sched1:txtValue${i}`) / (fixed(r, `Divisor${i}`) / 100));
const withheld = (r: Read, i: 1 | 2): number => parseMoney((base(r, i) / 100) * (fixed(r, `TaxRate${i}`) / 100));
const total = (r: Read): number => parseMoney(withheld(r, 1) / 100 + withheld(r, 2) / 100);

const money = { kind: "money" as const };

export const FORM_1603Q = buildSchema("1603Qv2018", "Quarterly Final Taxes Withheld on Fringe Benefits", fieldJson as FieldJson[], {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}rdoCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // Schedule 1 (fixed two rows): value is an input; base, rate→withheld, and the total are computed.
  [`${P}Sched1:txtValue1`]: money,
  [`${P}Sched1:txtValue2`]: money,
  [`${P}Sched1:txtTaxBase1`]: { ...money, compute: (r) => base(r, 1) },
  [`${P}Sched1:txtTaxBase2`]: { ...money, compute: (r) => base(r, 2) },
  [`${P}Sched1:txtTaxWithheld1`]: { ...money, compute: (r) => withheld(r, 1) },
  [`${P}Sched1:txtTaxWithheld2`]: { ...money, compute: (r) => withheld(r, 2) },
  [`${P}Sched1:txtTotalTax`]: { ...money, compute: total },
  [`${P}txtTax14`]: { compute: total },
  [`${P}txtTax15`]: { gate: { on: `${P}AmendedRtn_1`, equals: "true" } },
  [`${P}txtTax17`]: { compute: (r) => m(r, "txtTax15") + m(r, "txtTax16") },
  [`${P}txtTax18`]: { compute: (r) => m(r, "txtTax14") - m(r, "txtTax17") },
  [`${P}txtTax22`]: { compute: (r) => m(r, "txtTax19") + m(r, "txtTax20") + m(r, "txtTax21") },
  [`${P}txtTax23`]: { compute: (r) => m(r, "txtTax18") + m(r, "txtTax22") },
});

export function validate1603Q(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1603Q, state);
  const quarter = [1, 2, 3, 4].some((n) => state[`${P}optQuarter${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}optQuarter1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
