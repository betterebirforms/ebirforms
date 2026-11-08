import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords } from "@/form/schema.ts";
import { FORM_1702EXv2018C, fix0, model, rowPeso, validDate, validate1702EXv2018C, yearEnd } from "@/form/form1702exv2018c.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { fiscalGroups, fiscalLoss, fullRecompute, groups, id, identity, itemized, noMethod, osdOver } from "./form1702ex2018-case.ts";

const rec = (s: typeof itemized, g = groups) => new Map(formRecords(FORM_1702EXv2018C, s, g).map((r) => [r.key, r.value]));
/** BIR-reload-bug: sleeptime runs FormatValue over every maxlength-12 input after loadData, and the Sch 3 item-3
 *  pop-up's amount cells are maxlength 12 — so a reopen rewrites BIR's own "3500.00" as "3,500" (same amount). */
const S3I3_ROW = (n: number) => Array.from({ length: n }, (_, i) => id(`txtPg3Pt6S3I3_${i + 1}Col2`));

describe("1702EXv2018C compute (BIR's toFixed(0) chain)", () => {
  const o = computeForm(FORM_1702EXv2018C, itemized, groups);
  const v = (s: string) => o[id(s)];

  it("gross income 28→34: each total is toFixed(0) on the float, so 4,899,999.50 rounds up", () => {
    expect(v("txtPg2Pt4I30NetSalesReceiptsRevFees")).toBe("4,900,000.00"); // 5,000,000 − 100,000.50
    expect(v("txtPg2Pt4I32GrossIncomeFromOper")).toBe("2,900,000.00"); // 4,900,000 − 2,000,000.25 = 2,899,999.75
    expect(v("txtPg2Pt4I34TotalGross")).toBe("3,050,000.00");
  });

  it("Sch 1 (with the 17I pop-up), Sch 2 (with the item-4 pop-up), itemized 35–39 and the tax at the entered rate", () => {
    // 10k + 200k + 1,200,000.40 + 50k + 17D–H 71k + 17I pop-up (1,500 + 2,500 truncated + 1,000)
    expect(v("txtPg3Pt6S1I18TotOrdinaryAllowableItemDeduc")).toBe("1,536,000.00");
    expect(v("txtPg3Pt6S2I5TotSpecialAllowedItemDeduc")).toBe("65,000.00");
    expect(v("txtPg2Pt4I35OrdinaryAllowable")).toBe("1,536,000.00");
    expect(v("txtPg2Pt4I36SpecialAllowable")).toBe("65,000.00");
    expect(v("txtPg2Pt4I37TotalItemized")).toBe("1,601,000.00");
    expect(v("txtPg2Pt4I38OptionalStandardDeduc")).toBe("0.00");
    expect(v("txtPg2Pt4I39NetTaxable")).toBe("1,449,000.00");
    expect(v("txtPg2Pt4I41TaxDue")).toBe("362,250.00"); // × 25%
  });

  it("credits (47 is 0 unless amended), 51, page 1 items 18–22, Part V 54, Sch 3", () => {
    expect(v("txtPg2Pt4I50TotalTaxCrPmt")).toBe("89,001.00"); // 89,000.55 → toFixed(0)
    expect(v("txtPg2Pt4I51TotalOverpayment")).toBe("273,249.00");
    expect(v("txtPg1Pt2I18TaxDue")).toBe("362,250.00");
    expect(v("txtPg1Pt2I19TotalTaxCrPmt")).toBe("89,001.00");
    expect(v("txtPg1Pt2I20TotalOverpmt")).toBe("273,249.00");
    expect(v("txtPg1Pt2I22TotalAmtPayable")).toBe("274,499.00"); // 273,249 + 1,250.40 → toFixed(0)
    expect(v("txtPg2Pt5I54TotalTaxReliefAvailment")).toBe("378,500.00");
    expect(v("txtPg3Pt6S3I4Total")).toBe("1,050,000.33"); // BIR formats item 4 without toFixed(0)
    expect(v("txtPg3Pt6S3I9Total")).toBe("29,000.00");
    expect(v("txtPg3Pt6S3I10NetTaxableIncome")).toBe("1,021,000.00");
  });

  it("OSD: 38 = 40% of 34, Sch 1/2 cleared (their pop-up rows kept), amended 47, item 22 on an overpayment is the penalty", () => {
    const c = computeForm(FORM_1702EXv2018C, osdOver, groups);
    expect(c[id("txtPg2Pt4I38OptionalStandardDeduc")]).toBe("1,220,000.00");
    expect(c[id("txtPg2Pt4I35OrdinaryAllowable")]).toBe("0.00");
    expect(c[id("txtPg3Pt6S1I18TotOrdinaryAllowableItemDeduc")]).toBe("0.00");
    expect(c[id("txtPg2Pt4I39NetTaxable")]).toBe("1,830,000.00");
    expect(c[id("txtPg2Pt4I41TaxDue")]).toBe("183,000.00");
    expect(c[id("txtPg2Pt4I50TotalTaxCrPmt")]).toBe("296,001.00");
    expect(c[id("txtPg1Pt2I20TotalOverpmt")]).toBe("-113,001.00");
    expect(c[id("txtPg1Pt2I22TotalAmtPayable")]).toBe("1,250.40"); // formatCurrency(21): centavos kept
    const r = rec(osdOver);
    expect(r.get(id("txtPg3Pt6S1I13SalaryWageAllowance"))).toBe("0.00");
    expect(r.get(id("txtPg3Pt6I17OthersDDesc"))).toBe("");
    expect(r.get(id("txtPg3Pt6I17OthersIAmt"))).toBe("0.00");
    expect(r.get(id("txtPg3Pt6S2I4Description"))).toBe("");
    expect(r.get("Pg3Pt6S1I17PopLength")).toBe("3"); // disableForOSD leaves the pop-up rows in the DOM
    expect(r.get("Pg3Pt6S1I17SubTotal")).toBe("5,000.00");
    expect(r.get(id("txtPg2Pt4I47TaxPaidInReturnPrevFiled"))).toBe("7,000.00");
    expect(r.get(id("rdoPg1OverpaymentCarryOver"))).toBe("true");
  });

  it("IC 011 forces itemized; a net loss gives a NEGATIVE tax due (BIR never clamps item 41)", () => {
    const c = computeForm(FORM_1702EXv2018C, fiscalLoss, fiscalGroups);
    expect(c[id("txtPg2Pt4I30NetSalesReceiptsRevFees")]).toBe("800,001.00"); // 800,000.75
    expect(c[id("txtPg2Pt4I35OrdinaryAllowable")]).toBe("904,000.00"); // 900k + the one-row pop-up 4,000.90 → 4,000
    expect(c[id("txtPg2Pt4I39NetTaxable")]).toBe("-403,999.00");
    expect(c[id("txtPg2Pt4I41TaxDue")]).toBe("-121,200.00"); // −121,199.7 → toFixed(0)
    expect(c[id("txtPg1Pt2I22TotalAmtPayable")]).toBe("-122,200.00");
    expect(c[id("txtPg3Pt6S3I4Total")]).toBe("-387,655.49");
    expect(c[id("txtPg3Pt6S3I10NetTaxableIncome")]).toBe("-387,905.00");
    const r = rec(fiscalLoss, fiscalGroups);
    expect(r.get(id("rdoPg1Pt1I13MethodOfDeducItemized"))).toBe("true");
    expect(r.get(id("rdoPg1Pt1I13MethodOfDeducOptional"))).toBe("false");
    expect(r.get(id("txtPg3Pt6S3I6_2Col2"))).toBe("0.00"); // toComma turns a negative row into 0
    expect(r.get(id("txtPg3Pt6S3I6NonTaxIncomeAndIncomeSubjectToFinTaxDesc"))).toBe("OTHERS");
    expect(r.get(id("txtPg3Pt6S3I6NonTaxIncomeAndIncomeSubjectToFinTaxAmt"))).toBe("250.00");
    expect(validate1702EXv2018C(fiscalLoss, fiscalGroups).map((p) => p.id)).toEqual(
      expect.arrayContaining([id("rdoPg1Pt1I13MethodOfDeducOptional"), id("txtPg3Pt6S3I6_2Col2")]),
    );
  });

  it("no method ticked: 38 is still 40% of 34 and 39 never leaves 0; BIR's date checks clear bad dates", () => {
    const c = computeForm(FORM_1702EXv2018C, noMethod, {});
    expect(c[id("txtPg2Pt4I34TotalGross")]).toBe("1,000,001.00"); // + 0.25
    expect(c[id("txtPg2Pt4I38OptionalStandardDeduc")]).toBe("400,000.00");
    expect(c[id("txtPg2Pt4I39NetTaxable")]).toBe("0.00");
    expect(c[id("txtPg2Pt4I37TotalItemized")]).toBe("100,000.00");
    const r = rec(noMethod, {});
    expect(r.get(id("txtPg1Pt1I10DateofIncorporation"))).toBe(""); // 02/30 — validateDate clears it
    expect(r.get(id("txtPg1Pt1I17EffectivityTo"))).toBe(""); // expired before the August 2024 year end
    expect(r.get(id("txtPg1Pt1I17EffectivityFrom"))).toBe("01/01/2015");
    expect(validate1702EXv2018C(noMethod).map((p) => p.id)).toEqual(
      expect.arrayContaining([id("rdoPg1Pt1I13MethodOfDeducItemized"), id("txtPg1Pt1I10DateofIncorporation"), id("txtPg1Pt1I17EffectivityTo")]),
    );
  });

  it("BIR quirks: toFixed half-up on whole pesos, pop-up rows truncated, item 2's clock rules, BIR's lax dates", () => {
    expect(fix0(2.5)).toBe(300);
    expect(fix0(-2.5)).toBe(-300);
    expect(fix0(Number.NaN)).toBe(0);
    expect(rowPeso("2,500.99")).toBe(250000);
    expect(rowPeso("-5.00")).toBe(0);
    const now = new Date(2026, 9, 26);
    const at = (s: Record<string, string>) => yearEnd((k) => s[k] ?? "", now);
    expect(at({ [id("rdoPg1I1Fiscal")]: "true" })).toEqual({ month: "00", year: "25" }); // fiscal may not end in December
    expect(at({ [id("rdoPg1I1Fiscal")]: "true", [id("ddlPg1I2Date")]: "11", [id("txtPg1I2YearEnd")]: "26" })).toEqual({ month: "11", year: "" });
    expect(at({ [id("txtPg1I2YearEnd")]: "26" })).toEqual({ month: "12", year: "25" }); // calendar year not over
    expect(at({ [id("txtPg1I2YearEnd")]: "17" })).toEqual({ month: "12", year: "25" }); // before 2018
    expect(at({ [id("rdoPg1I4ShortPeriodYes")]: "true", [id("txtPg1I2YearEnd")]: "26", [id("ddlPg1I2Date")]: "11" })).toEqual({ month: "", year: "26" });
    expect(validDate("00/15/2020", true)).toBe(true); // BIR lets month "00" through
    expect(validDate("02/29/2023", true)).toBe(false);
    expect(validDate("02/29/2024", true)).toBe(true);
    expect(validDate("04/31/2020", false)).toBe(false);
    expect(validDate("12/31/2099", false)).toBe(true);
    expect(validDate("12/31/2099", true)).toBe(false);
  });

  it("saved records: pop-up lines/subtotals/counts, bare item-3 rows, page headers, escaped name, 47 as BIR's 0", () => {
    const r = rec(itemized);
    expect(r.get("Pg3Pt6S1I17PopLength")).toBe("3");
    expect(r.get("Pg3Pt6S1I17SubTotal")).toBe("5,000.00");
    expect(r.get(id("txtPg3Pt6I17OthersIDesc"))).toBe("OTHERS");
    expect(r.get(id("txtPg3Pt6I17OthersIAmt"))).toBe("5,000.00");
    expect(r.get(id("txtPg3Pt6S1I17_2Col2"))).toBe("2,500.00");
    expect(r.get(id("txtPg3Pt6S2I4Description"))).toBe("SENIOR CITIZEN DISCOUNT"); // one row: the line is that row
    expect(r.get(id("txtPg3Pt6S2I4LegalBasis"))).toBe("RA 9994");
    expect(r.get(id("txtPg3Pt6S2I4Amount"))).toBe("18,000.00");
    expect(r.get(id("txtPg3Pt6S3I3_1Col2"))).toBe("3500.00"); // maxlength 12: saveXML strips the commas
    expect(r.get(id("txtPg3Pt6S3I3NonDeductExpenseOtherIncomeAmt"))).toBe("5,000.00");
    expect(r.get(id("txtPg2TinC3"))).toBe("107");
    expect(r.get(id("txtPg3RegisteredName"))).toBe("ABC FOUNDATION (PHILS.) INC.");
    expect(r.get(id("txtPg1Pt1I8RegisteredName"))).toBe("ABC%20FOUNDATION%20%28PHILS.%29%20INC.");
    expect(r.get(id("txtPg1Pt1I14LegalBasis"))).toBe("SEC. 30(E) NIRC"); // no NumWithParenthesis on this form's text
    expect(r.get(id("txtPg2Pt4I47TaxPaidInReturnPrevFiled"))).toBe("0");
    expect(r.get(id("rdoPg1OverpaymentRefund"))).toBe("false");
    expect(r.get(id("txtPg2Pt4I40TaxRate"))).toBe("25.00");
    // a pop-up never used keeps BIR's empty count / subtotal
    const blank = new Map(formRecords(FORM_1702EXv2018C, identity, {}).map((x) => [x.key, x.value]));
    expect(blank.get("Pg3Pt6S3I8PopLength")).toBe("");
    expect(blank.get("Pg3Pt6S3I8SubTotal")).toBe("");
    expect(model((k) => itemized[k] ?? "", "2018C").itemized).toBe(true);
  });
});

describe.skipIf(!hasForm("1702EXv2018C"))("native 1702EXv2018C is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-1702EXv2018C-122025.xml";

  it("BIR's reload rebuilds every pop-up (rows, count, subtotal) and the item lines", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1702EXv2018C, itemized, file, groups);
    const count = await page.evaluate(() => ["Pg3Pt6S1I17", "Pg3Pt6S2I4", "Pg3Pt6S3I3", "Pg3Pt6S3I6", "Pg3Pt6S3I8"].map((k) => (document.getElementById(`${k}PopTable`) as HTMLTableElement).rows.length));
    expect(count).toEqual([3, 1, 2, 1, 2]);
    const arr = await page.evaluate(() => (window as unknown as Record<string, string[]>).Pg3Pt6S1I17_Col1);
    expect(arr).toEqual(["PRINTING", "POSTAGE", "BANK FEES"]); // loadToArray
    expect(await value(id("txtPg3Pt6S1I17_2Col2"))).toBe("2,500.00");
    expect(await value(id("txtPg3Pt6S2I4_1Col2"))).toBe("RA 9994");
    expect(await value(id("txtPg3Pt6S3I8_2Col1"))).toBe("SPECIAL DEDUCTION B");
    expect(await value("Pg3Pt6S1I17SubTotal")).toBe("5,000.00");
    expect(await value(id("txtPg3Pt6I17OthersIDesc"))).toBe("OTHERS");
    expect(await page.locator(`[id="${id("txtPg3Pt6I17OthersIAmt")}"]`).isDisabled()).toBe(true); // checkMoreButtons
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("BIR's own FormatAmount / amountComputation / pop-up Save (every page, every input) land on the native save", async () => {
    expect(await fullRecompute(oracle, FORM_1702EXv2018C, itemized, file, groups)).toEqual({ diff: [], missing: [], error: [] });
    expect(await fullRecompute(oracle, FORM_1702EXv2018C, fiscalLoss, "84653210700000-1702EXv2018C-062025.xml", fiscalGroups)).toEqual({ diff: [], missing: [], error: [] });
    // OSD disables the 17I and Sch 2 "More" buttons, so only the Sch 3 pop-ups can be pressed
    const osdGroups = { sc3_3: groups.sc3_3!, sc3_6: groups.sc3_6!, sc3_8: groups.sc3_8! };
    const osd = await fullRecompute(oracle, FORM_1702EXv2018C, osdOver, "84653210700000-1702EXv2018C-122025V1.xml", groups, osdGroups);
    expect(osd).toEqual({ diff: [], missing: [], error: [] });
    const none = await fullRecompute(oracle, FORM_1702EXv2018C, noMethod, "84653210700000-1702EXv2018C-082024.xml", {});
    // harness artifact: the untouched item 40 keeps BIR's template "0"; blurring it after a reopen makes it "0.00"
    expect(none.diff.filter((d) => d.key !== id("txtPg2Pt4I40TaxRate"))).toEqual([]);
    expect(none.missing).toEqual([]);
    expect(none.error).toEqual([]);
  }, 240_000);

  it("parityCheck: itemized, every schedule line and pop-up populated", async () => {
    const r = await parityCheck(oracle, FORM_1702EXv2018C, itemized, file, groups);
    expect(parityProblem(r, S3I3_ROW(2))).toEqual([]);
    expect(r.key_count).toBeGreaterThan(187 + 9 * 2);
  }, 120_000);

  it("parityCheck: OSD over populated schedules, amended, overpayment carried over", async () => {
    const r = await parityCheck(oracle, FORM_1702EXv2018C, osdOver, "84653210700000-1702EXv2018C-122025V1.xml", groups);
    expect(parityProblem(r, S3I3_ROW(2))).toEqual([]);
  }, 120_000);

  it("parityCheck: fiscal June, IC 011 + OSD, a loss, one-row pop-ups; and no method with cleared dates", async () => {
    const r = await parityCheck(oracle, FORM_1702EXv2018C, fiscalLoss, "84653210700000-1702EXv2018C-062025.xml", fiscalGroups);
    expect(parityProblem(r, S3I3_ROW(1))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702EXv2018C, noMethod, "84653210700000-1702EXv2018C-082024.xml", {}))).toEqual([]);
  }, 120_000);
});
