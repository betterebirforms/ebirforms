// BIR Form 1701A (Annual Income Tax Return — Individuals Earning Purely from Business/Profession, TRAIN), P3.
// Two columns A=taxpayer / B=spouse. The filer picks a tax method per column (optTaxRate_1 / optSpouseTaxRate_1
// = graduated; optTaxRate_2 / optSpouseTaxRate_2 = the 8% option). Every computed amount is WHOLE PESOS: BIR runs
// each result through `.toFixed(0)` (round half AWAY from zero) before formatCurrency.
//
// Graduated path (Part IV.A): 38=36−37; 39=38×40/100 (OSD); 40=38−39; 44=41+42+43; 45=40+44; 46=graduated(45),
//   a YEAR-DEPENDENT table (pre-2018, 2018–2022, 2023+).
// 8% path (Part IV.B): 49=47−48; 52=50+51; 53=49+52; 55=53−54; 56 = 55<0 ? "0" : 55×8/100.
// Credits: 64 = Σ(57..63) → item 21.  Tax due 20 = graduated?46:56.  65 = (due − 64) → item 22.
// 24 = 22 − 23;  28 = 25+26+27 (penalties);  29 = 24<0 ? 24 : 24+28;  30 = 29A + 29B.
//
// What BIR's reload (sleeptime) does to a saved return, and so what a native save must already hold:
//   processFTC      — no foreign tax credit → 62 = "0", its number cleared.
//   processCivilStatus / processFilingStatus — not married → spouse-income / filing-status radios cleared; not a
//                     joint filing → disableSpouse: spouse inputs 23B 25B–27B 57B–60B 63B = "0", spouse identity
//                     and every spouse radio cleared.
//   processOverpayment — item 30 not negative → the refund / TCC options cleared.
//   enablePartIVA/B — the method chosen zeroes the OTHER Part IV column: every item of it is set to "0", then the
//                     chain recomputes the computed ones to "0.00" (44 / 52 are not recomputed, so they stay "0").

import fieldJson from "./fields/1701A.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1701A:";
type Read = (id: string) => string;
type Side = "A" | "B";
const on = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";
/** BIR's `.toFixed(0)` on a peso float: round half away from zero. */
const fix0 = (pesos: number): number => Number(pesos.toFixed(0));
const cents = (pesos: number): number => pesos * 100;

// the radios as BIR's reload leaves them
const spouse = (r: Read): boolean => on(r, "optCivilStatus_2") && on(r, "optFilingStatus_1");
const rateG = (r: Read, s: Side): boolean => (s === "A" ? on(r, "optTaxRate_1") : spouse(r) && on(r, "optSpouseTaxRate_1"));
const rate8 = (r: Read, s: Side): boolean => (s === "A" ? on(r, "optTaxRate_2") : spouse(r) && on(r, "optSpouseTaxRate_2"));
const SPOUSE_ONLY = [23, 25, 26, 27, 57, 58, 59, 60, 63];

/** Whether BIR forces item n of column s to "0". */
const forced = (r: Read, n: number, s: Side): boolean => {
  if (n >= 36 && n <= 46) return rate8(r, s); // Part IV.A zeroed when the 8% option is chosen
  if (n >= 47 && n <= 56) return rateG(r, s); // Part IV.B zeroed when graduated is chosen
  if (n === 62) return s === "A" ? !on(r, "optForeignTaxCredits_1") : !(spouse(r) && on(r, "optSpouseFTC_1"));
  return s === "B" && SPOUSE_ONLY.includes(n) && !spouse(r);
};
/** An input item, as BIR's NumWithComma reads it (a peso float). item54Validate turns 54 > 250,000 into "0". */
const p = (r: Read, n: number, s: Side): number => {
  if (forced(r, n, s)) return 0;
  const v = parseMoney(r(`${P}txt${n}${s}`)) / 100;
  return n === 54 && v > 250000 ? 0 : v;
};

// BIR's computeTxt46, verbatim per year band (txtYear "" reads as 0, so it falls into the pre-2018 band)
const graduated = (v: number, yr: number): number => {
  if (v <= 0) return 0;
  if (yr >= 2018 && yr <= 2022) {
    if (v <= 250000) return 0;
    if (v <= 400000) return fix0((v - 250000) * (20 / 100));
    if (v <= 800000) return fix0((v - 400000) * (25 / 100) + 30000);
    if (v <= 2000000) return fix0((v - 800000) * (30 / 100) + 130000);
    if (v <= 8000000) return fix0((v - 2000000) * (32 / 100) + 490000);
    return fix0((v - 8000000) * (35 / 100) + 2410000);
  }
  if (yr > 2022) {
    if (v <= 250000) return 0;
    if (v <= 400000) return fix0((v - 250000) * (15 / 100));
    if (v <= 800000) return fix0((v - 400000) * (20 / 100) + 22500);
    if (v <= 2000000) return fix0((v - 800000) * (25 / 100) + 102500);
    if (v <= 8000000) return fix0((v - 2000000) * (30 / 100) + 402500);
    return fix0((v - 8000000) * (35 / 100) + 2202500);
  }
  if (v < 10000) return fix0(v * (5 / 100));
  if (v < 30000) return fix0((v - 10000) * (10 / 100) + 500);
  if (v < 70000) return fix0((v - 30000) * (15 / 100) + 2500);
  if (v < 140000) return fix0((v - 70000) * (20 / 100) + 8500);
  if (v < 250000) return fix0((v - 140000) * (25 / 100) + 22500);
  if (v < 500000) return fix0((v - 250000) * (30 / 100) + 50000);
  return fix0((v - 500000) * (32 / 100) + 125000);
};
const year = (r: Read): number => Number(r(`${P}txtYear`)) || 0;

// self-contained per-column chain in whole pesos (every item recomputes from inputs → order-independent across pages)
const d38 = (r: Read, s: Side) => fix0(p(r, 36, s) - p(r, 37, s));
const d39 = (r: Read, s: Side) => fix0((d38(r, s) * 40) / 100);
const d40 = (r: Read, s: Side) => fix0(d38(r, s) - d39(r, s));
const d44 = (r: Read, s: Side) => fix0(p(r, 41, s) + p(r, 42, s) + p(r, 43, s));
const d45 = (r: Read, s: Side) => fix0(d40(r, s) + d44(r, s));
const d46 = (r: Read, s: Side) => graduated(d45(r, s), year(r));
const d49 = (r: Read, s: Side) => fix0(p(r, 47, s) - p(r, 48, s));
const d52 = (r: Read, s: Side) => fix0(p(r, 50, s) + p(r, 51, s));
const d53 = (r: Read, s: Side) => fix0(d49(r, s) + d52(r, s));
const d55 = (r: Read, s: Side) => fix0(d53(r, s) - p(r, 54, s));
const d56 = (r: Read, s: Side) => (d55(r, s) < 0 ? 0 : fix0((d55(r, s) * 8) / 100));
const d64 = (r: Read, s: Side) => fix0([57, 58, 59, 60, 61, 62, 63].reduce((t, n) => t + p(r, n, s), 0));
const due = (r: Read, s: Side) => (rateG(r, s) ? d46(r, s) : d56(r, s));
const d65 = (r: Read, s: Side) => fix0(due(r, s) - d64(r, s));
const d24 = (r: Read, s: Side) => fix0(d65(r, s) - p(r, 23, s));
const d28 = (r: Read, s: Side) => fix0(p(r, 25, s) + p(r, 26, s) + p(r, 27, s));
const d29 = (r: Read, s: Side) => (d24(r, s) < 0 ? d24(r, s) : fix0(d24(r, s) + d28(r, s)));
const d30 = (r: Read) => fix0(d29(r, "A") + d29(r, "B"));
// computeTxt56 assigns the NUMBER-string "0" (not "0.00") when 55 is negative; item 20 copies 56 verbatim
const zero56 = (r: Read, s: Side, v: string) => (d55(r, s) < 0 ? "0" : v);

const money = { kind: "money" as const };
const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtYear`]: { required: true },
};
for (const s of ["A", "B"] as const) {
  for (const n of [36, 37, 41, 42, 43, 47, 48, 50, 51, 54, 23, 25, 26, 27, 57, 58, 59, 60, 61, 62, 63])
    override[`${P}txt${n}${s}`] = { ...money, derive: (r, v) => (forced(r, n, s) || (n === 54 && parseMoney(v) > 25_000_000) ? "0" : v) };
  const set = (n: number, fn: (r: Read, s: Side) => number, derive?: FieldSpec["derive"]) => {
    override[`${P}txt${n}${s}`] = { ...money, compute: (r: Read) => cents(fn(r, s)), ...(derive && { derive }) };
  };
  set(38, d38); set(39, d39); set(40, d40); set(45, d45); set(46, d46);
  set(44, d44, (r, v) => (rate8(r, s) ? "0" : v)); // disablePartIVA zeroes 44 and never recomputes it
  set(49, d49); set(53, d53); set(55, d55);
  set(52, d52, (r, v) => (rateG(r, s) ? "0" : v)); // likewise 52 under disablePartIVB
  set(56, d56, (r, v) => zero56(r, s, v));
  set(64, d64); set(21, d64); set(65, d65); set(22, d65);
  set(20, due, (r, v) => (rateG(r, s) ? v : zero56(r, s, v)));
  set(24, d24); set(28, d28); set(29, d29);
}
override[`${P}txt30`] = { ...money, compute: (r) => cents(d30(r)) };

// radios and texts BIR's reload clears
const keepIf = (cond: (r: Read) => boolean, cleared: string) => ({ derive: (r: Read, v: string) => (cond(r) ? v : cleared) });
for (const id of ["optSpouseIncome_1", "optSpouseIncome_2", "optFilingStatus_1", "optFilingStatus_2"]) override[`${P}${id}`] = keepIf((r) => on(r, "optCivilStatus_2"), "false");
for (const id of ["optSpouseTaxType_1", "optSpouseTaxType_2", "optSpouseATC_1", "optSpouseATC_2", "optSpouseATC_3", "optSpouseATC_4", "optSpouseFTC_1", "optSpouseFTC_2", "optSpouseTaxRate_1", "optSpouseTaxRate_2"])
  override[`${P}${id}`] = keepIf(spouse, "false");
for (const id of ["txtSpouseTIN1", "txtSpouseTIN2", "txtSpouseTIN3", "txtSpouseBranchCode", "txtSpouseName", "txtSpouseTelNum", "txtSpouseCitizenship"]) override[`${P}${id}`] = keepIf(spouse, "");
override[`${P}txtSpouseRDOCode`] = keepIf(spouse, "000");
override[`${P}txtSpouseFTN`] = keepIf((r) => spouse(r) && on(r, "optSpouseFTC_1"), "");
override[`${P}txtForeignTaxNumber`] = keepIf((r) => on(r, "optForeignTaxCredits_1"), "");
for (const id of ["optRefund_1", "optRefund_2", "optRefund_3"]) override[`${P}${id}`] = keepIf((r) => d30(r) < 0, "false");
// disablePartIVA(person) clears the shared Part IV.A descriptions unless the OTHER column is on graduated rates;
// disablePartIVB likewise for IV.B unless the other column is on 8%
const ivaDescKept = (r: Read) => !((rate8(r, "A") && !rateG(r, "B")) || (rate8(r, "B") && !rateG(r, "A")));
const ivbDescKept = (r: Read) => !((rateG(r, "A") && !rate8(r, "B")) || (rateG(r, "B") && !rate8(r, "A")));
for (const id of ["txt41Desc", "txt42Desc"]) override[`${P}${id}`] = keepIf(ivaDescKept, "");
for (const id of ["txt50Desc", "txt51Desc"]) override[`${P}${id}`] = keepIf(ivbDescKept, "");

export const FORM_1701A = buildSchema("1701A", "Annual Income Tax — Individuals (Business/Profession)", fieldJson as FieldJson[], override);

export function validate1701A(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1701A, state);
  const method = state[`${P}optTaxRate_1`] === "true" || state[`${P}optTaxRate_2`] === "true";
  if (!method) problem.push({ id: `${P}optTaxRate_1`, message: "Select the tax rate (graduated or 8%)." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
