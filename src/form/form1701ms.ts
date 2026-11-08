// BIR Form 1701-MS (Annual Income Tax Return — Individuals, Mixed Income / Compensation Earners, the 2024
// Ease-of-Paying-Taxes edition), P3. Two columns a = taxpayer, b = spouse. No dynamic schedules — every Part V
// credit line is a scalar, and the two "add more…" keys (addForeignTaxCredits / addOtherCreditsPayments) are the
// specify TEXT boxes next to the schedule's Add links.
//
// The chain (BIR's own computes; every figure a whole peso through formatCurrencyWithComma, which renders a bare
// "0" for junk and keeps decimals off):
//   Part III  3 = 1 − 2 ; 4 = graduated(3)                                  (calculateNo3*)
//   Part IV-B1 7 = 5 − 6 ; 9 = 7 − 8 ; 10D = 10A + 10B + 10C ; 11 = 40% × 7 (OSD, only under the OSD radio) ;
//     12 = 9 − 10D | 11 (only with the itemized / OSD radio) ; 14 = 12 + 13 ;
//     15 = (3>0?3:0) + (14>0?14:0) — written only for mixed-exempt/special, mixed-graduated and
//     compensation-income (spouse), never under the plain 8% ;
//     17 (special/exempt due) = exempt ? round(14 × rate%) : round(max(0,9) × rate%) ;
//     18A = round(17 + 4) ; 18B = graduated(15) ; 22 = item 4 | 18B | 25 per the regime radios ;
//     tax relief availment = max(graduated(10B + 14) − 17 + PartV 8, 0) (special/exempt only).
//   Part IV-B2 (8% schedule) 21 = 19 + 20 ; 23 = 21 − 22 ; 24 = 23 ≥ 1 ? round(23 × 8%) : "0" ;
//     25 = item 4 + 24 (only under the 8% radio).
//   Part II 19 = special ? 17 : exempt ? "0" : 18A ; 20 forced "0" while 19 ≤ 0 ; 21 = 19 − 20 ;
//     23 = 21 + 22 ; 24 = Part V 10 ; 25 = 23 − 24 ; 26 forced "0" while 25 < 0 (BIR's own validate also zeroes
//     an entry above 50% of 23 or above 25) ; 27 = 25 − 26 ; 28D = 28A + 28B + 28C ;
//     29 = (27 < 0 and 28D > 0) ? 28D : 27 + 28D ; 30 = 29A + 29B unless exactly one side is negative (then the
//     positive one alone), and 30 ≥ 0 unchecks the refund / TCC / carry-over choice.
// computeRegularIncomeTax: the 2023+ TRAIN table (0 ≤ 250k; 15%; 20% + 22500; 25% + 102500; 30% + 402500; 35% + 2202500).
import fieldJson from "./fields/1701MS.json";
import { formatMoney, parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export const P = "frm1701MS:";
type Read = (id: string) => string;

/** BIR's NumWithComma (this form's own): junk → 0, never NaN. */
const nwc = (s: string | undefined): number => {
  const v = String(s ?? "").replace(/,/g, "").trim();
  if (!/^-?\d*\.?\d*$/.test(v) || v === "" || v === "-" || v === "." || v === "-.") return 0;
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};
/** formatCurrencyWithComma: a comma-grouped figure whose decimals BIR keeps off, junk → "0". */
const woc = (x: number): string => {
  const negative = x < 0;
  const [i = "0", d = ""] = Math.abs(x).toString().split(".");
  const grouped = (i || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = d.length > 0 ? `${grouped}.${d}` : grouped;
  return negative && out !== "0" ? `-${out}` : out;
};
const pesos = (s: string | undefined): Centavo => {
  const raw = String(s ?? "0").replace(/,/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const m = (r: Read, id: string): Centavo => pesos(r(`${P}${id}`));

// computeRegularIncomeTax: the 2023+ TRAIN table
const graduated = (income: number): number => {
  if (income <= 250000) return 0;
  if (income <= 400000) return 0.15 * (income - 250000);
  if (income <= 800000) return 22500 + 0.2 * (income - 400000);
  if (income <= 2000000) return 102500 + 0.25 * (income - 800000);
  if (income <= 8000000) return 402500 + 0.3 * (income - 2000000);
  return 2202500 + 0.35 * (income - 8000000);
};

const on = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";

/** BIR's whole chain, from the raw inputs, as the strings BIR leaves in each field. */
export function chain1701MS(r: Read): Record<string, string> {
  const out: Record<string, string> = {};
  for (const side of ["a", "b"] as const) {
    const sp = side === "b";
    const tp11 = sp ? "txtTaxpayerNo11d1" : "txtTaxpayerNo11b"; // the taxpayer's Part I item 11: mixed income / (spouse) compensation income
    const mix = sp ? "txtTaxpayerNo11b1" : "txtTaxpayerNo11b";
    const grad = sp ? "txtTaxpayerNo12b1" : "txtTaxpayerNo12b";
    const pct8 = sp ? "txtTaxpayerNo12c1" : "txtTaxpayerNo12c";
    const exempt = sp ? "txtTaxpayerNo12d1" : "txtTaxpayerNo12d";
    const special = sp ? "txtTaxpayerNo12e1" : "txtTaxpayerNo12e";
    const itemized = sp ? "txtSpouseNo17a" : "txtTaxpayerNo17a";
    const osd = sp ? "txtSpouseNo17b" : "txtTaxpayerNo17b";
    const isMix = on(r, mix);
    const isGrad = on(r, grad);
    const is8 = on(r, pct8);
    const isExempt = on(r, exempt);
    const isSpecial = on(r, special);
    const isComp = sp && on(r, tp11);

    // Part III
    const taxableComp = woc(nwc(r(`${P}txtGross${side}`)) - nwc(r(`${P}txtLessNonTaxable${side}`)));
    out[`txtTaxableCompensationIncome${side}`] = taxableComp;
    const item4 = woc(Math.round(graduated(nwc(taxableComp))));
    out[`txtTaxpayerNo4${side}`] = item4;

    // Part IV-B1
    const item7 = woc(nwc(r(`${P}txtSalesRevenueNo5${side}`)) - nwc(r(`${P}txtSalesReturnsNo6${side}`)));
    out[`txtTaxableCompensationIncomeNo7${side}`] = item7;
    const item9 = woc(nwc(item7) - nwc(r(`${P}txtCostofSalesNo8${side}`)));
    out[`txtGrossIncomeNo9${side}`] = item9;
    const item10d = woc(nwc(r(`${P}txtAllowableItemizedDeductionsNo10a${sp ? "Spouse" : ""}`)) + nwc(r(`${P}txtSpecialAllowableNo10${side}`)) + nwc(r(`${P}txtNetOperatingLossNo10${side}`)));
    out[`txtTotalAllowableItemixedDeductionsNo10${side}`] = item10d;
    // the OSD is 40% of item 7 (a Math.round on the peso figure), only under the OSD radio
    const item11 = on(r, osd) ? woc(Math.round(nwc(item7) * 0.4)) : (r(`${P}txtOptionalDeductionNo11${side}`) || "");
    out[`txtOptionalDeductionNo11${side}`] = item11;
    if (on(r, itemized)) out[`txtNetIncomeLossNo12${side}`] = woc(nwc(item9) - nwc(item10d));
    else if (on(r, osd)) out[`txtNetIncomeLossNo12${side}`] = woc(nwc(item9) - nwc(item11));
    const item12 = out[`txtNetIncomeLossNo12${side}`] ?? r(`${P}txtNetIncomeLossNo12${side}`) ?? "";
    const item14 = woc(nwc(item12) + nwc(r(`${P}txtNonOperatingIncomeNo13${side}`)));
    out[`txtTaxableIncomeBusinesNo14${side}`] = item14;
    const pos = (v: string): number => Math.max(0, nwc(v));
    const sum15 = pos(taxableComp) + pos(item14); // calculateNo3TP set item 3 before computeTaxableIncome15TP reads it
    if (isComp) out[`txtCompensationBusinessNo15${side}`] = woc(nwc(item14));
    else if (isMix && (isExempt || isSpecial)) out[`txtCompensationBusinessNo15${side}`] = woc(sum15);
    else if (isGrad) out[`txtCompensationBusinessNo15${side}`] = woc(sum15);
    const item15 = out[`txtCompensationBusinessNo15${side}`] ?? r(`${P}txtCompensationBusinessNo15${side}`) ?? "";
    // 17 (special/exempt due) and 18A/18B
    const rate = nwc(r(`${P}txtTaxRate${side}`));
    let item17 = r(`${P}txtTaxDueSpecial${side}`) ?? "";
    if (isExempt) { item17 = woc(Math.round(nwc(item14) * (rate / 100))); out[`txtTaxDueSpecial${side}`] = item17; }
    else if (isSpecial) { item17 = woc(Math.round(Math.max(0, nwc(item9)) * (rate / 100))); out[`txtTaxDueSpecial${side}`] = item17; }
    const item18a = woc(Math.round(nwc(out[`txtTaxDueSpecial${side}`] ?? item17) + nwc(item4)));
    if (isExempt || isSpecial) out[`TotalTaxDueCompensationA${sp ? "SP" : "TP"}`] = item18a;
    if (isGrad) {
      const taxable = nwc(item15);
      out[`TotalTaxDueCompensationB${sp ? "SP" : "TP"}`] = !Number.isFinite(taxable) || taxable < 0 ? woc(0) : woc(Math.round(graduated(taxable)));
    }
    // Part IV-B2 (the 8% schedule)
    const b2item21 = woc(nwc(r(`${P}txtSalesRevenuesFeesANo19${side}`)) + nwc(r(`${P}txtOtherNonOperatingIncomeNo20${side}`)));
    out[`txtTotalIncomeNo21${side}`] = b2item21;
    const b2item23 = woc(nwc(b2item21) - nwc(r(`${P}txtLess22${side.toUpperCase()}`)));
    out[`txtTaxableIncomeLoss23${side.toUpperCase()}`] = b2item23;
    const b2item24 = nwc(b2item23) >= 1 ? woc(Math.round(nwc(b2item23) * 0.08)) : "0";
    out[`txtTaxDueBusinessIncome24${side.toUpperCase()}`] = b2item24;
    const item25b2 = woc(nwc(item4) + nwc(b2item24));
    if (is8) {
      out[`txtCompensationBusinessNo25${side}`] = item25b2;
      out[`txtIncomeTaxRegularNo22${side}`] = item25b2;
    }
    // the tax-relief availment (special/exempt only)
    if (isExempt || isSpecial) {
      const computed = graduated(nwc(r(`${P}txtSpecialAllowableNo10${side}`)) + nwc(item14));
      const final = Math.max(0, Math.round(computed - nwc(out[`txtTaxDueSpecial${side}`] ?? item17) + nwc(r(`${P}txtSpecialTaxCreditsNo8${side}`))));
      out[`totalTaxReliefAvailment${side.toUpperCase()}`] = woc(final);
    }

    // Part II
    const item19 =
      isSpecial ? (out[`txtTaxDueSpecial${side}`] ?? item17)
      : isExempt ? "0"
      : (out[`TotalTaxDueCompensationA${sp ? "SP" : "TP"}`] ?? r(`${P}TotalTaxDueCompensationA${sp ? "SP" : "TP"}`) ?? "");
    out[`txtIncomeTaxDueNo19${side}`] = item19;
    const item20 = nwc(item19) <= 0 || Number.isNaN(nwc(item19)) ? "0" : r(`${P}txtShareOfOtherNo20${side}`) || "0";
    out[`txtShareOfOtherNo20${side}`] = item20;
    const item21 = woc(nwc(item19) - nwc(item20));
    out[`txtNetSpecialRateNo21${side}`] = item21;
    if (!(is8)) {
      if (isExempt || isSpecial) out[`txtIncomeTaxRegularNo22${side}`] = isExempt || isSpecial ? woc(nwc(item4)) : out[`txtIncomeTaxRegularNo22${side}`] ?? "";
      if (isGrad) out[`txtIncomeTaxRegularNo22${side}`] = out[`TotalTaxDueCompensationB${sp ? "SP" : "TP"}`] ?? "";
      if (sp && isComp) out[`txtIncomeTaxRegularNo22${side}`] = item4;
      if (isMix && (isExempt || isSpecial)) out[`txtIncomeTaxRegularNo22${side}`] = item4;
    }
    const item22 = out[`txtIncomeTaxRegularNo22${side}`] ?? r(`${P}txtIncomeTaxRegularNo22${side}`) ?? "";
    const item23 = woc(nwc(item21) + nwc(item22));
    out[`txtTotalIncomeTaxDueNo23${side}`] = item23;
    const credits = woc(["txtPriorYearsNo1", "txtTaxPaymentsNo2", "txtCreditableTaxNo3", "txtCreditableFourthQuarterNo4", "txtCreditableForm2316No5", "txtTaxPaidPreviouslyFiledNo6", "txtForeignTaxCreditsNo7", "txtSpecialTaxCreditsNo8", "txtOtherCreditsPaymentsNo9"].reduce((t, k) => t + nwc(r(`${P}${k}${side}`)), 0));
    out[`txtTotalTaxCreditsPaymentsPartVNo10${side}`] = credits;
    out[`txtTotalTaxCreditsPartIINo24${side}`] = credits;
    const item25 = woc(nwc(item23) - nwc(credits));
    out[`txtTaxPayableNo25${side}`] = item25;
    const item26 = nwc(item25) < 0 ? "0" : r(`${P}txtTaxDueAllowedNo26${side}`) || "0";
    out[`txtTaxDueAllowedNo26${side}`] = item26;
    const item27 = woc(nwc(item25) - nwc(item26));
    out[`txtAmountPayableNo27${side}`] = item27;
    const item28d = woc(nwc(r(`${P}txtSurchangeNo28${side}`)) + nwc(r(`${P}txtInterestNo28${side}`)) + nwc(r(`${P}txtCompromise28${side}`)));
    out[`txtTotalPenaltiesNo28${side}`] = item28d;
    const item29 = nwc(item27) < 0 && nwc(item28d) > 0 ? item28d : woc(nwc(item27) + nwc(item28d));
    out[`txtTotalAmountPayableNo29${side}`] = item29;
  }

  // Part II item 30: 29A + 29B — unless exactly one side is negative, then the positive side alone
  const a = nwc(out.txtTotalAmountPayableNo29a);
  const b = nwc(out.txtTotalAmountPayableNo29b);
  let item30 = a + b;
  if (a < 0 || b < 0) {
    if (a < 0 && b > 0) item30 = b;
    else if (b < 0 && a > 0) item30 = a;
    else item30 = a + b;
  }
  out.txtAggregateAmountPayable30a = woc(item30);
  return out;
}

const money = { kind: "money" as const };
/** BIR's formatCurrencyWithComma: a whole figure carries no decimals ("405,000"), a fractional one keeps them. */
const wocFmt = (cents: Centavo): string => (cents % 100 === 0 ? woc(cents / 100) : formatMoney(cents));
const chainField = (key: string) => ({ ...money, compute: (r: Read) => pesos(chain1701MS(r)[key]), format: wocFmt });
/** removeDecimal: these inputs' blur rounds the typed value to a whole peso (Math.round, comma-grouped). */
const removeDecimal = (_r: Read, v: string): string => (v.trim() === "" || Number.isNaN(Number(v.replace(/,/g, ""))) ? v : woc(Math.round(nwc(v))));

const override: Record<string, Partial<FieldSpec>> = {};
for (const side of ["a", "b"] as const) {
  const up = side.toUpperCase();
  for (const [key, id] of [
    [`txtTaxableCompensationIncome${side}`, `txtTaxableCompensationIncome${side}`],
    [`txtTaxpayerNo4${side}`, `txtTaxpayerNo4${side}`],
    [`txtTaxableCompensationIncomeNo7${side}`, `txtTaxableCompensationIncomeNo7${side}`],
    [`txtGrossIncomeNo9${side}`, `txtGrossIncomeNo9${side}`],
    [`txtTotalAllowableItemixedDeductionsNo10${side}`, `txtTotalAllowableItemixedDeductionsNo10${side}`],
    [`txtNetIncomeLossNo12${side}`, `txtNetIncomeLossNo12${side}`],
    [`txtTaxableIncomeBusinesNo14${side}`, `txtTaxableIncomeBusinesNo14${side}`],
    [`txtCompensationBusinessNo15${side}`, `txtCompensationBusinessNo15${side}`],
    [`txtTaxDueSpecial${side}`, `txtTaxDueSpecial${side}`],
    [`TotalTaxDueCompensationA${sp(side)}`, `TotalTaxDueCompensationA${sp(side)}`],
    [`TotalTaxDueCompensationB${sp(side)}`, `TotalTaxDueCompensationB${sp(side)}`],
    [`txtTotalIncomeNo21${side}`, `txtTotalIncomeNo21${side}`],
    [`txtTaxableIncomeLoss23${up}`, `txtTaxableIncomeLoss23${up}`],
    [`txtTaxDueBusinessIncome24${up}`, `txtTaxDueBusinessIncome24${up}`],
    [`txtCompensationBusinessNo25${side}`, `txtCompensationBusinessNo25${side}`],
    [`totalTaxReliefAvailment${up}`, `totalTaxReliefAvailment${up}`],
    [`txtIncomeTaxDueNo19${side}`, `txtIncomeTaxDueNo19${side}`],
    [`txtShareOfOtherNo20${side}`, `txtShareOfOtherNo20${side}`],
    [`txtNetSpecialRateNo21${side}`, `txtNetSpecialRateNo21${side}`],
    [`txtIncomeTaxRegularNo22${side}`, `txtIncomeTaxRegularNo22${side}`],
    [`txtTotalIncomeTaxDueNo23${side}`, `txtTotalIncomeTaxDueNo23${side}`],
    [`txtTotalTaxCreditsPaymentsPartVNo10${side}`, `txtTotalTaxCreditsPaymentsPartVNo10${side}`],
    [`txtTotalTaxCreditsPartIINo24${side}`, `txtTotalTaxCreditsPartIINo24${side}`],
    [`txtTaxPayableNo25${side}`, `txtTaxPayableNo25${side}`],
    [`txtTaxDueAllowedNo26${side}`, `txtTaxDueAllowedNo26${side}`],
    [`txtAmountPayableNo27${side}`, `txtAmountPayableNo27${side}`],
    [`txtTotalPenaltiesNo28${side}`, `txtTotalPenaltiesNo28${side}`],
    [`txtTotalAmountPayableNo29${side}`, `txtTotalAmountPayableNo29${side}`],
  ] as const) {
    override[`${P}${id}`] = chainField(key);
  }
  // the computed Part III/IV lines the chain derives (3, 7, 11)
  override[`${P}txtOptionalDeductionNo11${side}`] = chainField(`txtOptionalDeductionNo11${side}`);
}
function sp(side: "a" | "b"): string { return side === "a" ? "TP" : "SP"; }

const override2: Record<string, Partial<FieldSpec>> = {
  ...Object.fromEntries(["txtPg1TIN1", "txtPg1TIN2", "txtPg1TIN3", "txtPg1BranchCode", "txtRDOCodea", "txtTaxpayerNo8a"].map((k) => [`${P}${k}`, { required: true }])),
  ...Object.fromEntries(["ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret"].map((k) => [k, { secret: true }])),
  [`${P}txtAggregateAmountPayable30a`]: chainField("txtAggregateAmountPayable30a"),
  // item 30 ≥ 0 unchecks the refund / TCC / carry-over choice (computeAggregateAmountNo30)
  [`${P}txtToBeRefunded`]: { gate: { when: (r: Read) => nwc(chain1701MS(r).txtAggregateAmountPayable30a) < 0 } },
  [`${P}txtToBeIssued`]: { gate: { when: (r: Read) => nwc(chain1701MS(r).txtAggregateAmountPayable30a) < 0 } },
  [`${P}txtToBeCarried`]: { gate: { when: (r: Read) => nwc(chain1701MS(r).txtAggregateAmountPayable30a) < 0 } },
};

// the entered Part V credit lines and the penalties carry removeDecimal on blur
for (const k of ["txtPriorYearsNo1", "txtTaxPaymentsNo2", "txtCreditableTaxNo3", "txtCreditableFourthQuarterNo4", "txtCreditableForm2316No5", "txtTaxPaidPreviouslyFiledNo6", "txtSpecialTaxCreditsNo8", "txtOtherCreditsPaymentsNo9", "txtShareOfOtherNo20", "txtSurchangeNo28", "txtInterestNo28", "txtCompromise28"]) {
  for (const side of ["a", "b"] as const) override[`${P}${k}${side}`] = { ...money, derive: removeDecimal };
}
// item 26: setP2No25TPStatus forces "0" while item 25 is negative (a bare "0", not "0.00")
for (const side of ["a", "b"] as const)
  override[`${P}txtTaxDueAllowedNo26${side}`] = {
    ...money,
    derive: (r: Read, v: string) => (nwc(chain1701MS(r)[`txtTaxPayableNo25${side}`]) < 0 ? "0" : removeDecimal(r, v)),
  };
override[`${P}addForeignTaxCredits`] = { derive: (_r, v) => v.toUpperCase().trim() };
override[`${P}addOtherCreditsPayments`] = { derive: (_r, v) => v.toUpperCase().trim() };

export const FORM_1701MS: FormSchema = buildSchema("1701MS", "Annual Income Tax — Individuals (Mixed Income)", fieldJson as FieldJson[], { ...override, ...override2 });

export function validate1701MS(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1701MS, state);
  const tin = `${state[`${P}txtPg1TIN1`] ?? ""}${state[`${P}txtPg1TIN2`] ?? ""}${state[`${P}txtPg1TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
