import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState } from "@/form/schema.ts";
import { FORM_2200CV2018 } from "@/form/form2200cv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2200C:";

const base: FormState = {
  [`${P}txtPg1I1Month`]: "03", [`${P}txtPg1I1Day`]: "31", [`${P}txtPg1I1Year`]: "2024",
  [`${P}rdoPg1I2AmendedNo`]: "true", [`${P}txtPg1TIN1`]: "846", [`${P}txtPg1TIN2`]: "532", [`${P}txtPg1TIN3`]: "107", [`${P}txtPg1TIN4`]: "000",
  [`${P}txtPg1I6RDO`]: "043", [`${P}txtPg1Pt1I7RegisteredName`]: "KAPIHAN INC.", [`${P}txtPg1Pt1I8RegisteredAddress`]: "1 RIZAL ST., QC",
  [`${P}txPg1I8ZipCode`]: "1100", [`${P}txtPg1Pt1I9ContactNumber`]: "0281234567",
  [`${P}rdoPg1I12TaxReliefNo`]: "true", [`${P}rdoPg1Pt2MOPPaymentActual`]: "true",
  // row 1: gross receipts — excise-net 400,000 and exempt 200,000 → column H = 30,000
  [`${P}GRnetVat1`]: "500,000.00", [`${P}GRexciseNet1`]: "400,000.00", [`${P}GRexciseExmpt1`]: "200,000.00", [`${P}GRnonexcise1`]: "100,000.00",
  [`${P}txtPg1P3I17ABalCarriedOver`]: "1,000.00", [`${P}txtPg1P3I21ASurcharge`]: "500.00", [`${P}txtPg1P3I23ATaxPmntDposit`]: "2,000.00",
};

describe("2200Cv2018 compute (coffee excise)", () => {
  it("column H = 5% of excise gross receipts, column I is always 0.00 (the empty vatColumnI span), J sums the row", () => {
    const o = computeForm(FORM_2200CV2018, base);
    expect(o[`${P}ACexcise1`]).toBe("30,000.00"); // (400k + 200k) × 5%
    expect(o[`${P}ACvat1`]).toBe("0.00"); // the vatColumnI BIR bug
    expect(o[`${P}ACtotAmountBill1`]).toBe("1,230,000.00"); // 500k + 400k + 200k + 100k + 30k + 0
    expect(o[`${P}ACexciseTotal`]).toBe("30,000.00");
    expect(o[`${P}txtPg1P3I16ExciseTaxDue`]).toBe("30,000.00");
    expect(o[`${P}txtPg1P3I17CTotal`]).toBe("1,000.00");
    expect(o[`${P}txtPg1P3I18NetTaxDue`]).toBe("29,000.00");
    expect(o[`${P}txtPg1P3I20TaxStillDue`]).toBe("29,000.00"); // amended No keeps 19 at 0.00
    expect(o[`${P}txtPg1P3I21DTotPenalties`]).toBe("500.00");
    expect(o[`${P}txtPg1P3I22AmountPayable`]).toBe("29,500.00");
    expect(o[`${P}txtPg1P3I23BPenalties`]).toBe("500.00");
    expect(o[`${P}txtPg1P3I23CTotPmntMade`]).toBe("2,500.00");
    expect(o[`${P}txtPg1P3I24BalToCarryOver`]).toBe("27,000.00");
  });

  it("amended Yes enables item 19; relief Yes enables the specify box", () => {
    const o = computeForm(FORM_2200CV2018, {
      ...base, [`${P}rdoPg1I2AmendedYes`]: "true", [`${P}rdoPg1I2AmendedNo`]: "false",
      [`${P}rdoPg1I12TaxReliefYes`]: "true", [`${P}rdoPg1I12TaxReliefNo`]: "false", [`${P}txtPg1I12TaxReliefSpecify`]: "RR 4-2024",
      [`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]: "4,000.00",
    });
    expect(o[`${P}txtPg1P3I20TaxStillDue`]).toBe("25,000.00");
    expect(o[`${P}txtPg1I12TaxReliefSpecify`]).toBe("RR 4-2024");
  });

  it("a prepayment zeroes every Part V entered column, so 16 and the whole chain collapse", () => {
    const o = computeForm(FORM_2200CV2018, { ...base, [`${P}rdoPg1Pt2MOPPaymentActual`]: "false", [`${P}rdoPg1Pt2MOPPrepayment`]: "true" });
    expect(o[`${P}GRexciseNet1`]).toBe("0.00");
    expect(o[`${P}ACexcise1`]).toBe("0.00");
    expect(o[`${P}ACtotAmountBill1`]).toBe("0.00");
    expect(o[`${P}txtPg1P3I16ExciseTaxDue`]).toBe("0.00");
    expect(o[`${P}txtPg1P3I24BalToCarryOver`]).toBe("-3,000.00"); // the penalties are NOT disabled on a prepayment in this form
  });
});

describe.skipIf(!hasForm("2200Cv2018"))("native 2200Cv2018 is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with the Part V table on page 2 revealed and recomputed by BIR", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200CV2018, base, "84653210700000-2200Cv2018-03312024.xml", {}, undefined, "[id^=Page][id$=Content]");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
  it("is 1:1 for a prepayment and the plain parityCheck", async () => {
    const pre: FormState = { ...base, [`${P}rdoPg1Pt2MOPPaymentActual`]: "false", [`${P}rdoPg1Pt2MOPPrepayment`]: "true" };
    expect(parityProblem(await parityCheck(oracle, FORM_2200CV2018, pre, "84653210700000-2200Cv2018-prepay.xml"))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_2200CV2018, base, "84653210700000-2200Cv2018-plain.xml"))).toEqual([]);
  }, 120_000);
});
