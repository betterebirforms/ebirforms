// Shared 1702-EX (2018 layout) fill cases and BIR-side recompute: both 2018 editions have the same save keys, so
// their tests reuse them.
import type { FormSchema, FormState, GroupState } from "@/form/schema.ts";
import { formRecords } from "@/form/schema.ts";
import { P } from "@/form/form1702exv2018c.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import type { Oracle } from "./oracle.ts";

export const id = (s: string) => `${P}${s}`;
export const identity: FormState = {
  [id("txtPg1Pt1I6TINC1")]: "846", [id("txtPg1Pt1I6TINC2")]: "532", [id("txtPg1Pt1I6TINC3")]: "107", [id("txtPg1Pt1I6TINC4")]: "00000",
  [id("hdnPg1Pt1I7RDO")]: "043", [id("rdoPg1Pt1I7RDO")]: "043", [id("txtPg1Pt1I8RegisteredName")]: "ABC FOUNDATION (PHILS.) INC.",
  [id("txtPg1Pt1I9RegisteredAddress")]: "1 RIZAL ST., QUEZON CITY", [id("txPg1I9ZipCode")]: "1100", [id("txtPg1Pt1I11ContactNumber")]: "0281234567",
  [id("txtPg1Pt1I10DateofIncorporation")]: "03/15/2015",
  [id("rdoPg1I5ATCR1C3")]: "false", [id("rdoPg1I5ATCR2C3")]: "true",
  [id("txtPg1Pt1I14LegalBasis")]: "SEC. 30(E) NIRC", [id("txtPg1Pt1I15Investment")]: "SEC", [id("txtPg1Pt1I16RegisteredActivity")]: "CHARITABLE WORK",
  [id("txtPg1Pt1I17EffectivityFrom")]: "01/01/2015", [id("txtPg1Pt1I17EffectivityTo")]: "12/31/2030",
  [id("txtLOB")]: "CHARITY",
};

/** Itemized, every schedule line and every pop-up populated, a positive tax due with penalties. */
export const itemized: FormState = {
  ...identity,
  [id("rdoPg1Pt1I13MethodOfDeducItemized")]: "true", [id("rdoPg1Pt1I13MethodOfDeducOptional")]: "false",
  [id("txtPg1Pt2I21PenaltyCompromise")]: "1,250.40", [id("txtPg1P2I23NumOfAttachments")]: "03",
  [id("txtPg1Pt2AuthorizedRepresentative")]: "JUAN DELA CRUZ", [id("txtPg1Pt2Treasurer")]: "MARIA SANTOS",
  [id("txtPg2Pt4I28SalesReceiptsRevFees")]: "5,000,000.00", [id("txtPg2Pt4I29SalesRetAllowanceDisc")]: "100,000.50",
  [id("txtPg2Pt4I31CostOfSalesServ")]: "2,000,000.25", [id("txtPg2Pt4I33AddOther")]: "150,000.00",
  [id("txtPg2Pt4I40TaxRate")]: "25.00",
  [id("txtPg2Pt4I42PriorYearExcessCr")]: "10,000.00", [id("txtPg2Pt4I43IncomeTaxPmtFromPreviousQrt")]: "50,000.00",
  [id("txtPg2Pt4I44CreditableTaxWithheldFromPrevQrt")]: "20,000.00", [id("txtPg2Pt4I45CreditableTaxWithheldFor4thQrt")]: "5,000.55",
  [id("txtPg2Pt4I47TaxPaidInReturnPrevFiled")]: "7,000.00", // not amended: BIR writes 0
  [id("txtPg2Pt4I48OtherTaxCrPmtDesc")]: "TAX CREDIT CERTIFICATE", [id("txtPg2Pt4I48OtherTaxCrPmtAmt")]: "3,000.00",
  [id("txtPg2Pt4I49OtherTaxCrPmtDesc")]: "BOI CREDIT", [id("txtPg2Pt4I49OtherTaxCrPmtAmt")]: "1,000.00",
  [id("txtPg2Pt5I52RegularIncomeOtherwiseDue")]: "362,250.00", [id("txtPg2Pt5I53SpecialAllowableItemizedDeduc")]: "16,250.00",
  [id("txtPg3Pt6S1I1Ammortization")]: "10,000.00", [id("txtPg3Pt6S1I5Depreciation")]: "200,000.00",
  [id("txtPg3Pt6S1I13SalaryWageAllowance")]: "1,200,000.40", [id("txtPg3Pt6S1I15TaxAndLicense")]: "50,000.00",
  [id("txtPg3Pt6S1I17bProfessionalFee")]: "0.00",
  [id("txtPg3Pt6I17OthersDDesc")]: "REPAIRS", [id("txtPg3Pt6I17OthersDAmt")]: "30,000.00",
  [id("txtPg3Pt6I17OthersEDesc")]: "UTILITIES", [id("txtPg3Pt6I17OthersEAmt")]: "20,000.00",
  [id("txtPg3Pt6I17OthersFDesc")]: "SUPPLIES", [id("txtPg3Pt6I17OthersFAmt")]: "5,000.00",
  [id("txtPg3Pt6I17OthersGDesc")]: "COMMUNICATION", [id("txtPg3Pt6I17OthersGAmt")]: "7,000.00",
  [id("txtPg3Pt6I17OthersHDesc")]: "INSURANCE", [id("txtPg3Pt6I17OthersHAmt")]: "9,000.00",
  [id("txtPg3Pt6S2I1Description")]: "TRAINING EXPENSE", [id("txtPg3Pt6S2I1LegalBasis")]: "RA 10771", [id("txtPg3Pt6S2I1Amount")]: "25,000.00",
  [id("txtPg3Pt6S2I2Description")]: "ADOPT-A-SCHOOL", [id("txtPg3Pt6S2I2LegalBasis")]: "RA 8525", [id("txtPg3Pt6S2I2Amount")]: "10,000.00",
  [id("txtPg3Pt6S2I3Description")]: "PWD WAGES", [id("txtPg3Pt6S2I3LegalBasis")]: "RA 7277", [id("txtPg3Pt6S2I3Amount")]: "12,000.00",
  [id("txtPg3Pt6S3I1NetIncomePerBook")]: "1,000,000.33",
  [id("txtPg3Pt6S3I2NonDeductExpenseOtherIncomeDesc")]: "NON-DEDUCTIBLE EXPENSES", [id("txtPg3Pt6S3I2NonDeductExpenseOtherIncomeAmt")]: "45,000.00",
  [id("txtPg3Pt6S3I5NonTaxIncomeAndIncomeSubjectToFinTaxDesc")]: "INTEREST INCOME", [id("txtPg3Pt6S3I5NonTaxIncomeAndIncomeSubjectToFinTaxAmt")]: "12,000.00",
  [id("txtPg3Pt6S3I7SpecialDeductDesc")]: "NOLCO", [id("txtPg3Pt6S3I7SpecialDeductAmt")]: "6,000.00",
};
export const row = (stem: string, ...col: Array<[string, string]>) => Object.fromEntries(col.map(([c, v]) => [`${P}${stem}{i}${c}`, v]));
export const groups: GroupState = {
  sc1_17: [row("txtPg3Pt6S1I17_", ["Col1", "PRINTING"], ["Col2", "1,500.00"]), row("txtPg3Pt6S1I17_", ["Col1", "POSTAGE"], ["Col2", "2,500.75"]), row("txtPg3Pt6S1I17_", ["Col1", "BANK FEES"], ["Col2", "1,000.00"])],
  sc2_4: [row("txtPg3Pt6S2I4_", ["Col1", "SENIOR CITIZEN DISCOUNT"], ["Col2", "RA 9994"], ["Col3", "18,000.00"])],
  sc3_3: [row("txtPg3Pt6S3I3_", ["Col1", "UNREALIZED FX LOSS"], ["Col2", "3,500.00"]), row("txtPg3Pt6S3I3_", ["Col1", "PENALTIES"], ["Col2", "1,500.00"])],
  sc3_6: [row("txtPg3Pt6S3I6_", ["Col1", "DIVIDENDS"], ["Col2", "8,000.00"])],
  sc3_8: [row("txtPg3Pt6S3I8_", ["Col1", "SPECIAL DEDUCTION A"], ["Col2", "1,000.00"]), row("txtPg3Pt6S3I8_", ["Col1", "SPECIAL DEDUCTION B"], ["Col2", "2,000.00"])],
};

/** OSD over a populated Sch 1/2 (BIR clears them, pop-up rows stay), amended with item 47, an overpayment
 *  carried over, penalties on the overpayment (item 22 = the penalty, centavos kept). */
export const osdOver: FormState = {
  ...itemized,
  [id("rdoPg1Pt1I13MethodOfDeducItemized")]: "false", [id("rdoPg1Pt1I13MethodOfDeducOptional")]: "true",
  [id("rdoPg1I3AmendedYes")]: "true", [id("rdoPg1I3AmendedNo")]: "false",
  [id("txtPg2Pt4I40TaxRate")]: "10.00", [id("txtPg2Pt4I43IncomeTaxPmtFromPreviousQrt")]: "250,000.00",
  [id("rdoPg1OverpaymentCarryOver")]: "true",
};

/** Fiscal June year-end, IC 011 with OSD ticked (BIR ticks itemized), a net loss (negative tax due), a negative
 *  net income per books, one-row pop-ups, a negative pop-up row (BIR's toComma makes it 0). */
export const fiscalLoss: FormState = {
  ...identity,
  [id("rdoPg1I1Fiscal")]: "true", [id("rdoPg1I1Calendar")]: "false", [id("ddlPg1I2Date")]: "06",
  [id("rdoPg1I5ATCR1C3")]: "true", [id("rdoPg1I5ATCR2C3")]: "false",
  [id("rdoPg1Pt1I13MethodOfDeducItemized")]: "false", [id("rdoPg1Pt1I13MethodOfDeducOptional")]: "true",
  [id("txtPg2Pt4I28SalesReceiptsRevFees")]: "800,000.75", [id("txtPg2Pt4I31CostOfSalesServ")]: "300,000.00",
  [id("txtPg2Pt4I40TaxRate")]: "30.00",
  [id("txtPg3Pt6S1I13SalaryWageAllowance")]: "900,000.00",
  [id("txtPg2Pt4I45CreditableTaxWithheldFor4thQrt")]: "1,000.00",
  [id("rdoPg1OverpaymentRefund")]: "true",
  [id("txtPg3Pt6S3I1NetIncomePerBook")]: "-400,000.49",
};
export const fiscalGroups: GroupState = {
  sc1_17: [row("txtPg3Pt6S1I17_", ["Col1", "MISCELLANEOUS"], ["Col2", "4,000.90"])],
  sc3_3: [row("txtPg3Pt6S3I3_", ["Col1", "ACCRUED EXPENSE"], ["Col2", "12,345.00"])],
  sc3_6: [row("txtPg3Pt6S3I6_", ["Col1", "EXEMPT INCOME"], ["Col2", "250.00"]), row("txtPg3Pt6S3I6_", ["Col1", "REVERSAL"], ["Col2", "-100.00"])],
};

/** No method ticked (38 = 40% anyway, 39 stays 0), an invalid incorporation date and an expired exemption (BIR
 *  clears both), a short-period calendar return. */
export const noMethod: FormState = {
  ...identity,
  [id("rdoPg1I4ShortPeriodYes")]: "true", [id("rdoPg1I4ShortPeriodNo")]: "false", [id("ddlPg1I2Date")]: "08", [id("txtPg1I2YearEnd")]: "24",
  [id("txtPg1Pt1I10DateofIncorporation")]: "02/30/2015", [id("txtPg1Pt1I17EffectivityTo")]: "06/30/2024",
  [id("txtPg2Pt4I28SalesReceiptsRevFees")]: "1,000,001.00", [id("txtPg2Pt4I33AddOther")]: "0.25",
  [id("txtPg3Pt6S1I5Depreciation")]: "100,000.00",
};

/** BIR's popup Save button for each pop-up that has rows: Set_ / Load_ (the "More" button) then Save_. */
const POPUP_KEY: Record<string, string> = { sc1_17: "Pg3Pt6S1I17", sc2_4: "Pg3Pt6S2I4", sc3_3: "Pg3Pt6S3I3", sc3_6: "Pg3Pt6S3I6", sc3_8: "Pg3Pt6S3I8" };

/** Open the native save in BIR's form, reveal pages 2–3, blur EVERY input twice as a user tabbing through all three
 *  pages does, press each populated pop-up's More → Save, and return the keys whose value BIR ends with differs
 *  from the native save (money compared without its commas: the Sch 3 item-3 rows are saved bare). parityCheck
 *  blurs only page 1, so it never runs FormatAmount or the pop-ups; this does. `press` limits the pop-ups pressed
 *  (a disabled "More" button can't be). */
export async function fullRecompute(oracle: Oracle, schema: FormSchema, s: FormState, file: string, g: GroupState, press: GroupState = g) {
  const escaped = new Set(schema.field.filter((f) => f.escaped).map((f) => f.id));
  const native = formRecords(schema, s, g).map((r) => ({ key: r.key, value: escaped.has(r.key) ? legacyUnescape(r.value) : r.value }));
  const popup = Object.keys(press).filter((k) => (press[k] ?? []).length > 0).map((k) => POPUP_KEY[k]!);
  const { page, error } = await oracle.openSaved(schema, s, file, g);
  const legacy: Array<[string, string]> = await page.evaluate((popup) => {
    for (const pg of ["Page2Content", "Page3Content"]) (document.getElementById(pg) as HTMLElement).style.display = "block";
    const all = () => Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    const blur = () => {
      for (const el of all()) if (!el.disabled && el.type === "text" && el.offsetParent !== null) el.dispatchEvent(new FocusEvent("blur"));
    };
    blur();
    blur();
    const w = window as unknown as Record<string, () => unknown>;
    for (const k of popup) {
      w[`Set_${k}`]!();
      w[`Load_${k}PopTable`]!();
      w[`Save_${k}PopTable`]!();
    }
    return all()
      .filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type))
      .map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  }, popup);
  await page.close();
  const bir = new Map(legacy);
  const norm = (v: string) => (/^-?[\d,]+\.\d\d$/.test(v.trim()) ? v.trim().replace(/,/g, "") : v.trim());
  const diff = native.filter((r) => !bir.has(r.key) || norm(bir.get(r.key)!) !== norm(r.value)).map((r) => ({ key: r.key, native: r.value, legacy: bir.get(r.key) ?? null }));
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}
