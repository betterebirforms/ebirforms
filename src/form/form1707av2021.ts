// BIR Form 1707Av2021 (Annual Capital Gains Tax Return for Shares Not Traded Through the LSE — TRAIN).
// Same shape as 1707A but Sched 1 has 4 rows and item 15 uses a FLAT applicable rate (TRAIN's 15%) from
// txtI16ApplicableTaxRate instead of the old 5/10% bracket. Negatives render as accounting parentheses.
//   I12 = Σ Sched1 capital gains; I13 = Σ Sched2 capital loss; I14 = I12 − I13
//   I15 = (net < 0 ? 0 : net × applicableRate%);  I16C = I16A + I16B(0);  I17 = I15 − I16C
//   I18D = I18A + I18B + I18C;  I19 = (I17 < 0 && I18D > 0) ? I18D : I17 + I18D

import fieldJson from "./fields/1707Av2021.json";
import { formatMoneyParen, parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1707Av2021:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const rowN = [1, 2, 3, 4];
const s1sum = (r: Read, stem: string): number => rowN.reduce((t, i) => t + m(r, `txtS1${stem}I${i}`), 0);
const s2sum = (r: Read, stem: string): number => rowN.reduce((t, i) => t + m(r, `txtS2${stem}I${i}`), 0);
const net = (r: Read): number => s1sum(r, "C5CapitalGains") - s2sum(r, "C5CapitalLoss");
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
for (const i of rowN) {
  for (const stem of ["C3SellingPrice", "C4Cost", "C5CapitalGains", "C6TaxPaid"]) override[`${P}txtS1${stem}I${i}`] = money;
  for (const stem of ["C3SellingPrice", "C4Cost", "C5CapitalLoss"]) override[`${P}txtS2${stem}I${i}`] = money;
}
override[`${P}txtS1I20TotalSellingPrice`] = { ...money, compute: (r) => s1sum(r, "C3SellingPrice") };
override[`${P}txtS1I20TotalCost`] = { ...money, compute: (r) => s1sum(r, "C4Cost") };
override[`${P}txtS1I20TotalCapitalGains`] = { ...money, compute: (r) => s1sum(r, "C5CapitalGains") };
override[`${P}txtS1I20TotalTaxPaid`] = { ...money, compute: (r) => s1sum(r, "C6TaxPaid") };
override[`${P}txtS2I21TotalSellingPrice`] = { ...money, compute: (r) => s2sum(r, "C3SellingPrice") };
override[`${P}txtS2I21TotalCost`] = { ...money, compute: (r) => s2sum(r, "C4Cost") };
override[`${P}txtS2I21TotalCapitalLoss`] = { ...money, compute: (r) => s2sum(r, "C5CapitalLoss") };
override[`${P}txtI12TotalCapitalGains`] = { ...money, compute: (r) => s1sum(r, "C5CapitalGains") };
override[`${P}txtI13TotalCapitalLoss`] = { ...money, compute: (r) => s2sum(r, "C5CapitalLoss") };
override[`${P}txtI14NetCapitalGainLoss`] = { ...money, compute: net };
override[`${P}txtI16ApplicableTaxRate`] = money;
override[`${P}txtI15TaxDue`] = { ...money, compute: (r) => { const n = net(r); return n < 0 ? 0 : parseMoney((n / 100) * (numv(r, "txtI16ApplicableTaxRate") / 100)); } };
override[`${P}txtI16ATotalTaxPaid`] = { ...money, compute: (r) => s1sum(r, "C6TaxPaid") };
override[`${P}txtI16BTotalTaxPaid`] = { ...money, compute: () => 0 }; // disabled/vestigial — always 0
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

export const FORM_1707Av2021 = buildSchema("1707Av2021", "Annual Capital Gains Tax — Shares Not Traded (TRAIN)", fieldJson as FieldJson[], override);
FORM_1707Av2021.format = formatMoneyParen;

export function validate1707Av2021(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1707Av2021, state);
  const tin = `${state[`${P}txtI5TIN1`] ?? ""}${state[`${P}txtI5TIN2`] ?? ""}${state[`${P}txtI5TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtI5TIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
