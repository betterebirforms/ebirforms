// BIR Form 1707A (Annual Capital Gains Tax Return for Onerous Transfer of Shares Not Traded Through the LSE),
// P3. Two fixed schedules: Sched 1 (7 rows: selling price / cost / capital gains / tax paid), Sched 2 (4 rows:
// selling price / cost / capital loss).
//   C5 (per row) = Sched1 C3 − C4 / Sched2 C4 − C3, computed (disabled in BIR)
//   I12 = Σ Sched1 capital gains;  I13 = Σ Sched2 capital loss;  I14 = I12 − I13 (net capital gain/loss)
//   I15 tax due (bracket): net ≤ 100,000 → net × 5% ; else 5,000 + (net − 100,000) × 10% ; floored at 0
//   I16A = Σ Sched1 tax paid;  I16B = input on an amended return only;  I16C = I16A + I16B;  I17 = I15 − I16C
//   I18D = I18A + I18B + I18C;  I19 = (I17 < 0 && I18D > 0) ? I18D : I17 + I18D
// Negatives render as accounting parentheses (the form's `roundAmount`), so this schema uses formatMoneyParen.

import fieldJson from "./fields/1707A.json";
import { formatMoneyParen, parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1707A:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const s1n = [1, 2, 3, 4, 5, 6, 7];
const s2n = [1, 2, 3, 4];
const s1sum = (r: Read, stem: string): number => s1n.reduce((t, i) => t + m(r, `txtS1${stem}I${i}`), 0);
const s2sum = (r: Read, stem: string): number => s2n.reduce((t, i) => t + m(r, `txtS2${stem}I${i}`), 0);
const gain = (r: Read, i: number): number => m(r, `txtS1C3SellingPriceI${i}`) - m(r, `txtS1C4CostI${i}`);
const loss = (r: Read, i: number): number => m(r, `txtS2C4CostI${i}`) - m(r, `txtS2C3SellingPriceI${i}`);
const gains = (r: Read): number => s1n.reduce((t, i) => t + gain(r, i), 0);
const losses = (r: Read): number => s2n.reduce((t, i) => t + loss(r, i), 0);
// capital-gains tax bracket, in centavos
const bracketTax = (netCents: number): number => {
  const net = netCents / 100;
  const due = net <= 100000 ? net * 0.05 : 5000 + (net - 100000) * 0.1;
  return due < 0 ? 0 : parseMoney(due);
};
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtI5TIN1`]: { required: true },
  [`${P}txtI5TIN2`]: { required: true },
  [`${P}txtI5TIN3`]: { required: true },
  [`${P}txtI5BranchMask`]: { required: true },
  [`${P}rdoI6RDO`]: { required: true },
  [`${P}txtI8RegisteredName`]: { required: true },
  [`${P}txtI1YearEndYear`]: { required: true },
};
// Schedule 1 inputs (rows 1–7)
for (const i of s1n) for (const stem of ["C3SellingPrice", "C4Cost", "C6TaxPaid"]) override[`${P}txtS1${stem}I${i}`] = money;
// column 5 is disabled in BIR: the C3/C4 blur handler writes gain = selling price − cost (negative allowed)
for (const i of s1n) override[`${P}txtS1C5CapitalGainsI${i}`] = { ...money, compute: (r) => gain(r, i) };
// Schedule 2 inputs (rows 1–4)
for (const i of s2n) for (const stem of ["C3SellingPrice", "C4Cost"]) override[`${P}txtS2${stem}I${i}`] = money;
// …and Schedule 2's loss = cost − selling price (a gain there shows as a negative loss)
for (const i of s2n) override[`${P}txtS2C5CapitalLossI${i}`] = { ...money, compute: (r) => loss(r, i) };
// Schedule totals
override[`${P}txtS1I20TotalSellingPrice`] = { ...money, compute: (r) => s1sum(r, "C3SellingPrice") };
override[`${P}txtS1I20TotalCost`] = { ...money, compute: (r) => s1sum(r, "C4Cost") };
override[`${P}txtS1I20TotalCapitalGains`] = { ...money, compute: (r) => gains(r) };
override[`${P}txtS1I20TotalTaxPaid`] = { ...money, compute: (r) => s1sum(r, "C6TaxPaid") };
override[`${P}txtS2I21TotalSellingPrice`] = { ...money, compute: (r) => s2sum(r, "C3SellingPrice") };
override[`${P}txtS2I21TotalCost`] = { ...money, compute: (r) => s2sum(r, "C4Cost") };
override[`${P}txtS2I21TotalCapitalLoss`] = { ...money, compute: (r) => losses(r) };
// Part II chain (self-contained reads of the schedule sums, since Part II is on page 1, schedules on page 2)
override[`${P}txtI12TotalCapitalGains`] = { ...money, compute: (r) => gains(r) };
override[`${P}txtI13TotalCapitalLoss`] = { ...money, compute: (r) => losses(r) };
override[`${P}txtI14NetCapitalGainLoss`] = { ...money, compute: (r) => gains(r) - losses(r) };
override[`${P}txtI15TaxDue`] = { ...money, compute: (r) => bracketTax(gains(r) - losses(r)) };
override[`${P}txtI16ATotalTaxPaid`] = { ...money, compute: (r) => s1sum(r, "C6TaxPaid") };
// checkAmendedForItem16A: 16B (tax paid in the original return) is live only on an amended return, else forced 0.00
override[`${P}txtI16BTotalTaxPaid`] = { ...money, gate: { on: `${P}rdoI2AmemdedYes`, equals: "true" } };
override[`${P}txtI16CTotalTaxPaid`] = { ...money, compute: (r) => m(r, "txtI16ATotalTaxPaid") + m(r, "txtI16BTotalTaxPaid") };
override[`${P}txtI17TaxStillPayable`] = { ...money, compute: (r) => m(r, "txtI15TaxDue") - m(r, "txtI16CTotalTaxPaid") };
override[`${P}txtI18ASurcharge`] = money;
override[`${P}txtI18BInterest`] = money;
override[`${P}txtI18CCompromise`] = money;
override[`${P}txtI18DPenalties`] = { ...money, compute: (r) => m(r, "txtI18ASurcharge") + m(r, "txtI18BInterest") + m(r, "txtI18CCompromise") };
override[`${P}txtI19TotalAmountPayable`] = {
  ...money,
  compute: (r) => {
    const i17 = m(r, "txtI17TaxStillPayable");
    const i18d = m(r, "txtI18DPenalties");
    return i17 < 0 && i18d > 0 ? i18d : i17 + i18d;
  },
};

// checkOverPaymentRadio: the refund / TCC choice only stands while item 17 is an overpayment "(…)"; else both unchecked
const overpayment = (r: Read, v: string): string => (r(`${P}txtI17TaxStillPayable`).includes(")") ? v : "false");
override[`${P}rdoI19Refund`] = { derive: overpayment };
override[`${P}rdoI19TaxCreditCertificate`] = { derive: overpayment };

export const FORM_1707A = buildSchema("1707A", "Annual Capital Gains Tax — Shares Not Traded", fieldJson as FieldJson[], override);
FORM_1707A.format = formatMoneyParen;

export function validate1707A(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1707A, state);
  const tin = `${state[`${P}txtI5TIN1`] ?? ""}${state[`${P}txtI5TIN2`] ?? ""}${state[`${P}txtI5TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtI5TIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
