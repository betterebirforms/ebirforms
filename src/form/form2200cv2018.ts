// BIR Form 2200Cv2018 (Excise Tax Return for Coffee), P3.
// Page 2 Part V is a fixed ten-row gross-receipts table. Per row: seven entered columns (CPPexmpt / CPPexcise /
// CPPnonexcise / GRnetVat / GRexciseNet / GRexciseExmpt / GRnonexcise) and three computed ones —
//   ACexcise  = formatCurrency(((GRexciseNet + GRexciseExmpt) × 0.05).toFixed(0))
//   ACvat     = formatCurrency(((GRnetVat + GRexciseNet + GRnonexcise + ACexcise) × vatColumnI.value).toFixed(0))
//   ACtotBill = formatCurrency((Σ the seven GR columns + ACexcise + ACvat).toFixed(0))
// BIR BUG (replicated): vatColumnI is an empty `<span value="">` — its .value is "" in IE and undefined in
// WebKit, so the multiplier is 0 / NaN and ACvat is "0.00" on EVERY row, on BOTH engines.
// totalExciseTax sums column H with a toFixed(0) running total → partThreeComputation:
//   16 = ACexciseTotal ; 17C = 17A + 17B ; 18 = 16 − 17C ; 20 = 18 − 19 ; 21D = 21A+21B+21C ;
//   22 = 20 + 21D ; 23B = 21D ; 23C = 23A + 23B ; 24 = 22 − 23C  (every step formatCurrency(x.toFixed(0))).
// Radio effects (onclick only — the reload never re-fires them, so the saved state must already hold them):
//   item 2 amended No → item 19 "0.00" (isAmended) ; item 12 relief No → the specify box cleared ;
//   item 14 prepayment → every Part V entered column "0.00" (resetPartFive) and item 15's describe box
//   cleared (modeOfPayment clears it for 13 and 14 both). The VAT columns stay computed either way.
import fieldJson from "./fields/2200Cv2018.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200C:";
type Read = (id: string) => string;

const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };
const prepayment = (r: Read): boolean => r(`${P}rdoPg1Pt2MOPPrepayment`) === "true";
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// resetPartFive zeroes the entered columns under a prepayment; gross() folds that in so the early page-1
// computes (item 16) see the effective zeros without reading the later row fields
const gross = (r: Read, row: number, col: string): Centavo => (prepayment(r) ? 0 : parseMoney(r(`${P}GR${col}${row}`) || "0.00"));
const acExcise = (r: Read, row: number): Centavo => Number((((gross(r, row, "exciseNet") + gross(r, row, "exciseExmpt")) / 100) * 0.05).toFixed(0)) * 100;
const acVat = (_r: Read, _row: number): Centavo => 0; // vatColumnI is an empty <span value=""> — 0.00 on every row, every engine
/** BIR's `.toFixed(0)` on a peso figure: round half away from zero to a whole peso. */
const whole = (cents: Centavo): Centavo => (cents < 0 ? -Math.ceil(-cents / 100 - 0.5) : Math.floor(cents / 100 + 0.5)) * 100;
const acTotal = (r: Read, row: number): Centavo =>
  whole(["netVat", "exciseNet", "exciseExmpt", "nonexcise"].reduce((s, c) => s + gross(r, row, c), 0) + acExcise(r, row));

/** totalExciseTax: a toFixed(0) running sum of column H. */
const exciseTotal = (r: Read): Centavo => ROWS.reduce((s, _x, i) => s + acExcise(r, i + 1), 0);

const override: Record<string, Partial<FieldSpec>> = {
  ...Object.fromEntries(["txtPg1I1Month", "txtPg1I1Day", "txtPg1I1Year", "txtPg1TIN1", "txtPg1TIN2", "txtPg1TIN3", "txtPg1TIN4", "txtPg1I6RDO", "txtPg1Pt1I7RegisteredName", "txtPg1Pt1I8RegisteredAddress", "txPg1I8ZipCode", "txtPg1Pt1I9ContactNumber"].map((k) => [`${P}${k}`, { required: true }])),
  ...Object.fromEntries(["ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret"].map((k) => [k, { secret: true }])),
  // loadBGData upper-cases the registered name from the profile; capitalize() on blur. The page-2 navigation
  // also upper-cases the address and copies the name into page 2's RegName box
  [`${P}txtPg1Pt1I7RegisteredName`]: { required: true, derive: (_r, v) => v.toUpperCase().trim() },
  [`${P}txtPg1Pt1I8RegisteredAddress`]: { derive: (_r, v) => v.toUpperCase() },
  [`${P}txtPg1Pt1I8RegisteredAddress2`]: { derive: (_r, v) => v.toUpperCase() },
  [`${P}txtPg2RegisteredName`]: { derive: (r) => r(`${P}txtPg1Pt1I7RegisteredName`) },
  // isAmended: amended No zeroes item 19 ; availTaxRelief: relief No clears the specify box
  [`${P}txtPg1I12TaxReliefSpecify`]: { gate: { on: `${P}rdoPg1I12TaxReliefYes`, equals: "true" } },
  // modeOfPayment: the "specify" box only under Other Similar Schemes
  [`${P}txtPg1Pt2MOPOtherDesc`]: { gate: { on: `${P}rdoPg1Pt2MOPOther`, equals: "true" }, derive: (_r, v) => v.toUpperCase().trim() },
  // resetPartFive zeroes every Part V entered column under a prepayment (the computed columns follow)
  ...Object.fromEntries(
    ROWS.flatMap((row) =>
      ["CPPexmpt", "CPPexcise", "CPPnonexcise", "GRnetVat", "GRexciseNet", "GRexciseExmpt", "GRnonexcise"].map((col) => [
        `${P}${col}${row}`,
        { ...money, gate: { when: (r: Read) => !prepayment(r) } },
      ]),
    ),
  ),
  ...Object.fromEntries(
    ROWS.flatMap((row) => [
      [`${P}ACexcise${row}`, { ...money, compute: (r: Read) => acExcise(r, row) }],
      [`${P}ACvat${row}`, { ...money, compute: (r: Read) => acVat(r, row) }],
      [`${P}ACtotAmountBill${row}`, { ...money, compute: (r: Read) => acTotal(r, row) }],
    ]),
  ),
  [`${P}ACexciseTotal`]: { ...money, compute: exciseTotal },
  // partThreeComputation
  // item 16 sits before the Part V table in the DOM, so it derives from the rows (totalExciseTax) directly
  [`${P}txtPg1P3I16ExciseTaxDue`]: { ...money, compute: exciseTotal },
  [`${P}txtPg1P3I17ABalCarriedOver`]: money,
  [`${P}txtPg1P3I17BCredExciseTax`]: money,
  [`${P}txtPg1P3I17CTotal`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I17ABalCarriedOver") + m(r, "txtPg1P3I17BCredExciseTax")) },
  [`${P}txtPg1P3I18NetTaxDue`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I16ExciseTaxDue") - m(r, "txtPg1P3I17CTotal")) },
  [`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]: { ...money, gate: { on: `${P}rdoPg1I2AmendedYes`, equals: "true" } },
  [`${P}txtPg1P3I20TaxStillDue`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I18NetTaxDue") - m(r, "txtPg1P3I19PmntOnRtrnPrevFiled")) },
  [`${P}txtPg1P3I21ASurcharge`]: money,
  [`${P}txtPg1P3I21BInterest`]: money,
  [`${P}txtPg1P3I21CCompromise`]: money,
  [`${P}txtPg1P3I21DTotPenalties`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I21ASurcharge") + m(r, "txtPg1P3I21BInterest") + m(r, "txtPg1P3I21CCompromise")) },
  [`${P}txtPg1P3I22AmountPayable`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I20TaxStillDue") + m(r, "txtPg1P3I21DTotPenalties")) },
  [`${P}txtPg1P3I23ATaxPmntDposit`]: money,
  [`${P}txtPg1P3I23BPenalties`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I21DTotPenalties")) },
  [`${P}txtPg1P3I23CTotPmntMade`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I23ATaxPmntDposit") + m(r, "txtPg1P3I23BPenalties")) },
  [`${P}txtPg1P3I24BalToCarryOver`]: { ...money, compute: (r) => whole(m(r, "txtPg1P3I22AmountPayable") - m(r, "txtPg1P3I23CTotPmntMade")) },
  // Part III payment details
  [`${P}txtPg1Pt3I25CashC1`]: money, [`${P}txtPg1Pt3I25CashC2`]: money, [`${P}txtPg1Pt3I25CashC3`]: money,
  [`${P}txtPg1Pt3I26CheckC1`]: money, [`${P}txtPg1Pt3I26CheckC2`]: money, [`${P}txtPg1Pt3I26CheckC3`]: money,
  [`${P}txtPg1Pt3I27TaxDebitC2`]: money, [`${P}txtPg1Pt3I27TaxDebitC3`]: money,
  [`${P}txtPg1Pt3I28OthersC1`]: money, [`${P}txtPg1Pt3I28OthersC2`]: money, [`${P}txtPg1Pt3I28OthersC3`]: money, [`${P}txtPg1Pt3I28OthersC4`]: money,
};

export const FORM_2200CV2018: FormSchema = buildSchema("2200Cv2018", "Excise Tax Return — Coffee (2018)", fieldJson as FieldJson[], override);

/** BIR's checkYear / initialValidate checks a native save can fail. */
export function validate2200Cv2018(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2200CV2018, state);
  const v = (id: string) => (state[`${P}${id}`] ?? "").trim();
  const tin = `${v("txtPg1TIN1")}${v("txtPg1TIN2")}${v("txtPg1TIN3")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
  const y = parseInt(v("txtPg1I1Year"), 10);
  if (v("txtPg1I1Year") && (y < 2018 || y > new Date().getFullYear())) problem.push({ id: `${P}txtPg1I1Year`, message: "Year shall not be greater than the present year and not earlier than 2018." });
  return problem;
}
