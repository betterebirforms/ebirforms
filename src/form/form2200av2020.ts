// BIR Form 2200Av2020 (Excise Tax Return for Alcohol Products), P3.
//
// Schedule 1 is a FIXED grid of 60 rows: per ATC (XA035 … XA057) one row per rate effectivity (2020, Jan 23 2020,
// 2021 … 2024). Each row: Export (entered), Taxable (entered), Due (read-only). On blur of Export or Taxable BIR's
// `computeField` sets   Due = amtFormat(ATR × NumWithComma(Taxable))   where amtFormat is `toFixed(2)` on the float
// product (so a half centavo rounds by the binary float, not half-up — replicated). ATR is the rate cell's `value`
// attribute, which tax-rate-helper.js overwrites at load from xml/taxRate.xml; RATE below is that effective table.
// BIR data bugs replicated through RATE:
//   - XA035 "Jan 23, 2020" shows 22% in the HTML but taxRate.xml sets 0.21 (and its text to "21%") — 0.21 applies.
//   - taxRate.xml's XA035 2022/2023/2024 cells all target the 2021 id, so those rows keep the HTML's 0.22.
//   - XA090 2020 is 0.0 ("taxed as distilled spirits"): its Due is always 0.00.
// Three "Others" rows (txtSched1_xa_others1..3: XA + 3-digit ATC, description, bracket, rate, Export, Taxable, Due)
// are entered as-is: computeOthers never computes their Due (the rate × taxable code is commented out); it only
// re-totals. BIR's "Add" builds rows 4+ in the page, but its loadData never rebuilds them on reopen (only the 3
// rows in the HTML exist), so a return with rows 4+ cannot be reopened in BIR — the native offers the 3 rows.
// calculate_Sched1_TotalDue: TotalDue = Σ every txtSched1_*_Due (fixed rows AND others rows); item 16 = TotalDue.
// calculate_Part3:
//   17C = 17A + 17B ; 18 = 16 − 17C ; 20 = 18 − 19 ; 21D = 21A + 21B + 21C ; 22 = 20 + 21D ;
//   23B = 21D ; 23C = 23A + 23B ; 24 = 22 − 23C
// onAmendedClick zeroes item 19 on an original return; onTreatyClick clears 12A unless availing; changePayment
// clears the "other scheme" text unless option 3 is chosen. blockNegativeNumber zeroes a schedule entry when
// `value < 0` — a JS string comparison, so "-5.00" is zeroed but "-1,234.00" (NaN) is not (replicated).

import fieldJson from "./fields/2200Av2020.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200Av2020:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };

/** Schedule 1 rows in DOM order: [id stem, ATC, effectivity, effective rate (taxRate.xml over the HTML attribute)]. */
export const SCHED1_ROW: ReadonlyArray<readonly [stem: string, atc: string, effective: string, rate: string]> = [
  ["1A_2020", "XA035", "January 1, 2020", "0.20"], ["1A_2020B", "XA035", "January 23, 2020", "0.21"],
  ["1A_2021", "XA035", "January 1, 2021", "0.22"], ["1A_2022", "XA035", "January 1, 2022", "0.22"],
  ["1A_2023", "XA035", "January 1, 2023", "0.22"], ["1A_2024", "XA035", "January 1, 2024", "0.22"],
  ["1B_2020", "XA036", "January 1, 2020", "24.34"], ["1B_2020B", "XA036", "January 23, 2020", "42.00"],
  ["1B_2021", "XA036", "January 1, 2021", "47.00"], ["1B_2022", "XA036", "January 1, 2022", "52.00"],
  ["1B_2023", "XA036", "January 1, 2023", "59.00"], ["1B_2024", "XA036", "January 1, 2024", "66.00"],
  ["2A_2020", "XA061", "January 1, 2020", "328.98"], ["2A_2020B", "XA061", "January 23, 2020", "50.00"],
  ["2A_2021", "XA061", "January 1, 2021", "53.00"], ["2A_2022", "XA061", "January 1, 2022", "56.18"],
  ["2A_2023", "XA061", "January 1, 2023", "59.55"], ["2A_2024", "XA061", "January 1, 2024", "63.12"],
  ["2A_2020A", "XA062", "January 1, 2020", "921.15"], ["2A_2020B2", "XA062", "January 23, 2020", "50.00"],
  ["2A_2021B", "XA062", "January 1, 2021", "53.00"], ["2A_2022B", "XA062", "January 1, 2022", "56.18"],
  ["2A_2023B", "XA062", "January 1, 2023", "59.55"], ["2A_2024B", "XA062", "January 1, 2024", "63.12"],
  ["2B_2020", "XA070", "January 1, 2020", "39.48"], ["2B_2020B", "XA070", "January 23, 2020", "50.00"],
  ["2B_2021", "XA070", "January 1, 2021", "53.00"], ["2B_2022", "XA070", "January 1, 2022", "56.18"],
  ["2B_2023", "XA070", "January 1, 2023", "59.55"], ["2B_2024", "XA070", "January 1, 2024", "63.12"],
  ["2C_2020", "XA080", "January 1, 2020", "78.96"], ["2C_2020B", "XA080", "January 23, 2020", "50.00"],
  ["2C_2021", "XA080", "January 1, 2021", "53.00"], ["2C_2022", "XA080", "January 1, 2022", "56.18"],
  ["2C_2023", "XA080", "January 1, 2023", "59.55"], ["2C_2024", "XA080", "January 1, 2024", "63.12"],
  ["2D_2020", "XA090", "January 1, 2020", "0.0"], ["2D_2020B", "XA090", "January 23, 2020", "50.00"],
  ["2D_2021", "XA090", "January 1, 2021", "53.00"], ["2D_2022", "XA090", "January 1, 2022", "56.18"],
  ["2D_2023", "XA090", "January 1, 2023", "59.55"], ["2D_2024", "XA090", "January 1, 2024", "63.12"],
  ["3A_2020", "XA055", "January 1, 2020", "26.43"], ["3A_2020B", "XA055", "January 23, 2020", "35.00"],
  ["3A_2021", "XA055", "January 1, 2021", "37.00"], ["3A_2022", "XA055", "January 1, 2022", "39.00"],
  ["3A_2023", "XA055", "January 1, 2023", "41.00"], ["3A_2024", "XA055", "January 1, 2024", "43.00"],
  ["3A_2020A", "XA056", "January 1, 2020", "26.43"], ["3B_2020B2", "XA056", "January 23, 2020", "35.00"],
  ["3A_2021B", "XA056", "January 1, 2021", "37.00"], ["3A_2022B", "XA056", "January 1, 2022", "39.00"],
  ["3A_2023B", "XA056", "January 1, 2023", "41.00"], ["3A_2024B", "XA056", "January 1, 2024", "43.00"],
  ["3B_2020", "XA057", "January 1, 2020", "36.85"], ["3B_2020B", "XA057", "January 23, 2020", "35.00"],
  ["3B_2021", "XA057", "January 1, 2021", "37.00"], ["3B_2022", "XA057", "January 1, 2022", "39.00"],
  ["3B_2023", "XA057", "January 1, 2023", "41.00"], ["3B_2024", "XA057", "January 1, 2024", "43.00"],
];
export const OTHER_ROW = [1, 2, 3] as const;

/** blockNegativeNumber: `if (e.value < 0) e.value = "0.00"` — JS coerces the string, so a comma'd negative is NaN
 *  and survives. Unset reads as BIR's "0.00" default. */
export const blockNegative = (v: string): string => (v === "" ? "0.00" : Number(v) < 0 ? "0.00" : v);
/** NumWithComma: parseFloat after stripping commas ("0.00" == 0 skips the strip, same result). */
const numWithComma = (v: string): number => parseFloat(v.replace(/,/g, ""));
/** computeField: Due = (ATR × Taxable).toFixed(2) on the binary float. */
export function rowDue(rate: string, taxable: string): Centavo {
  const x = parseFloat(rate) * numWithComma(blockNegative(taxable));
  return Number.isFinite(x) ? parseMoney(x.toFixed(2)) : 0;
}
const fixedDue = (r: Read, stem: string, rate: string): Centavo => rowDue(rate, r(`${P}txtSched1_${stem}_Taxable`));
/** calculate_Sched1_TotalDue, from the row INPUTS (item 16 sits above Schedule 1 in the DOM, so it can't read the
 *  computed Due cells, which come later in the one-pass compute). */
const sched1Total = (r: Read): Centavo =>
  SCHED1_ROW.reduce((s, [stem, , , rate]) => s + fixedDue(r, stem, rate), 0) +
  OTHER_ROW.reduce((s, i) => s + parseMoney(blockNegative(r(`${P}txtSched1_xa_others${i}_Due`))), 0);
const block: Partial<FieldSpec> = { ...money, derive: (_r, v) => (v === "" ? "" : blockNegative(v)) };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateDay`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  [`${P}tinA`]: { required: true },
  [`${P}tinB`]: { required: true },
  [`${P}tinC`]: { required: true },
  [`${P}branchCode`]: { required: true },
  [`${P}rdoCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}registeredAddress`]: { required: true },
  [`${P}zipCode`]: { required: true },
  [`${P}phoneNumber`]: { required: true },
  // 12A applies only when availing of a tax relief (onTreatyClick); 15's "other scheme" only for option 3
  [`${P}treatyY`]: { gate: { on: `${P}optTreaty_1`, equals: "true" } },
  [`${P}paymentOther`]: { gate: { on: `${P}optPayment_3`, equals: "true" } },
  // Part III
  [`${P}txtExciseDue`]: { ...money, compute: sched1Total },
  [`${P}txtLess_Balance`]: money,
  [`${P}txtLess_Excise`]: money,
  [`${P}txtLess_Tot`]: { ...money, compute: (r) => m(r, "txtLess_Balance") + m(r, "txtLess_Excise") },
  [`${P}txtNetTaxDue`]: { ...money, compute: (r) => m(r, "txtExciseDue") - m(r, "txtLess_Tot") },
  // item 19 (paid in a previous return) is live only on an amended return: onAmendedClick zeroes it otherwise
  [`${P}txtPrevReturn`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtStillDue`]: { ...money, compute: (r) => m(r, "txtNetTaxDue") - m(r, "txtPrevReturn") },
  [`${P}txtPen_Surcharge`]: money,
  [`${P}txtPen_Interest`]: money,
  [`${P}txtPen_Compromise`]: money,
  [`${P}txtPen_Tot`]: { ...money, compute: (r) => m(r, "txtPen_Surcharge") + m(r, "txtPen_Interest") + m(r, "txtPen_Compromise") },
  [`${P}txtAmtPayable`]: { ...money, compute: (r) => m(r, "txtStillDue") + m(r, "txtPen_Tot") },
  [`${P}txtPay_TaxPayment`]: money,
  [`${P}txtPay_Penalties`]: { ...money, compute: (r) => m(r, "txtPen_Tot") },
  [`${P}txtPay_Tot`]: { ...money, compute: (r) => m(r, "txtPay_TaxPayment") + m(r, "txtPay_Penalties") },
  [`${P}txtBalance`]: { ...money, compute: (r) => m(r, "txtAmtPayable") - m(r, "txtPay_Tot") },
  // Schedule 1
  ...Object.fromEntries(
    SCHED1_ROW.flatMap(([stem, , , rate]) => [
      [`${P}txtSched1_${stem}_Export`, block],
      [`${P}txtSched1_${stem}_Taxable`, block],
      [`${P}txtSched1_${stem}_Due`, { ...money, compute: (r: Read) => fixedDue(r, stem, rate) }],
    ]),
  ),
  ...Object.fromEntries(
    OTHER_ROW.flatMap((i) => [
      [`${P}txtSched1_xa_others${i}_Export`, block],
      [`${P}txtSched1_xa_others${i}_Taxable`, block],
      [`${P}txtSched1_xa_others${i}_Due`, block],
    ]),
  ),
  [`${P}txtSched1_TotalDue`]: { ...money, compute: sched1Total },
};

export const FORM_2200AV2020 = buildSchema("2200Av2020", "Excise Tax — Alcohol Products", fieldJson as FieldJson[], override);

/** BIR's validateForm (the checks a native save can fail), plus the Others-row checks of isValidDataOnSched1. */
export function validate2200Av2020(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2200AV2020, state);
  const v = (id: string) => (state[`${P}${id}`] ?? "").trim();
  const tin = `${v("tinA")}${v("tinB")}${v("tinC")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA`, message: "The TIN's check digit doesn't match." });
  const month = parseInt(v("txtDateMonth"), 10);
  const day = parseInt(v("txtDateDay"), 10);
  const year = parseInt(v("txtDateYear"), 10);
  if (v("txtDateMonth") && !(month >= 1 && month <= 12)) problem.push({ id: `${P}txtDateMonth`, message: "Please enter a valid month on Item 1." });
  else if (v("txtDateDay") && v("txtDateYear") && !(day >= 1 && day <= new Date(year, month, 0).getDate()))
    problem.push({ id: `${P}txtDateDay`, message: "Please enter a valid day on Item 1." });
  if (v("txtDateYear") && year < 2020)
    problem.push({ id: `${P}txtDateYear`, message: "Returning old forms is restricted to the last version up to the effectivity of the new form version." });
  if (v("rdoCode") === "000") problem.push({ id: `${P}rdoCode`, message: "Please enter a valid RDO Code on Item 5." });
  for (const id of ["prodCity", "remCity"]) if (!v(id) || v(id) === "00") problem.push({ id: `${P}${id}`, message: id === "prodCity" ? "Please enter a valid Place of Production on Item 10." : "Please enter a valid Place of Removal on Item 11." });
  if (v("optTreaty_1") === "true" && !v("treatyY")) problem.push({ id: `${P}treatyY`, message: "Please specify a Tax Relief on Item 12A." });
  if (![1, 2, 3].some((i) => v(`optPayment_${i}`) === "true")) problem.push({ id: `${P}optPayment_1`, message: "Please enter a Manner of Payment on Part II." });
  if (v("optPayment_3") === "true" && !v("paymentOther")) problem.push({ id: `${P}paymentOther`, message: "Please specify a Scheme on Item 15." });
  for (const i of OTHER_ROW) {
    const o = (k: string) => v(`txtSched1_xa_others${i}_${k}`);
    const used = o("Atc") || o("Desc") || o("Bracket") || o("Rate") || ["Export", "Taxable", "Due"].some((k) => parseMoney(o(k)) !== 0);
    if (!used) continue;
    if (!/^\d{3}$/.test(o("Atc"))) problem.push({ id: `${P}txtSched1_xa_others${i}_Atc`, message: `Please supply valid ATC Code for row #${i}` });
    else if (!o("Desc")) problem.push({ id: `${P}txtSched1_xa_others${i}_Desc`, message: `Description is required in row #${i}` });
    else if (!o("Bracket")) problem.push({ id: `${P}txtSched1_xa_others${i}_Bracket`, message: `Tax Bracket/Unit of Measure is required in row #${i}` });
    else if (!o("Rate")) problem.push({ id: `${P}txtSched1_xa_others${i}_Rate`, message: `Applicable Tax Rate is required in row #${i}` });
  }
  // item 24 > 0: "YOU HAVE INSUFFICIENT FUND. PLEASE APPLY DEPOSIT TO PROCEED"
  const c = (id: string) => parseMoney(state[`${P}${id}`] ?? "");
  if (c("txtAmtPayable") - c("txtPay_Tot") > 0) problem.push({ id: `${P}txtPay_TaxPayment`, message: "You have insufficient fund. Please apply deposit to proceed (item 24 must not be positive)." });
  return problem;
}
