import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2550DS } from "@/form/form2550ds.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2550ds:";

const input: FormState = {
  [`${P}grossSaleForTheQuarter`]: "1,000,000.00", [`${P}lessGrossSaleSubjectedToWithHoldingTax`]: "100,000.00",
  [`${P}vatPaidInReturn`]: "10,000.00", [`${P}excessPaymentCarriedOver`]: "5,000.00",
  [`${P}advancePaymentOrDepositMadeThisQuarter`]: "2,000.00", [`${P}otherPaymentCreditAmount`]: "3,000.00",
  [`${P}addPenaltiesSurcharge`]: "1,000.00", [`${P}addPenaltiesInterest`]: "500.00",
};

describe("2550DS compute", () => {
  it("balance → vatPayable → credits → stillPayable → total", () => {
    const o = computeAll(FORM_2550DS, input);
    expect(o[`${P}vatRate`]).toBe("12.00%"); // BIR's fixed, disabled rate text
    expect(o[`${P}balanceSubjectToVAT`]).toBe("900,000.00");
    expect(o[`${P}vatPayable`]).toBe("108,000.00"); // 900,000 × 12%
    expect(o[`${P}totalPaymentsCredits`]).toBe("20,000.00");
    expect(o[`${P}vatStillPayable`]).toBe("88,000.00");
    expect(o[`${P}addPenaltiesTotal`]).toBe("1,500.00");
    expect(o[`${P}totalAmountPayable`]).toBe("89,500.00");
  });
  it("rounds vatPayable round-half-up", () => {
    const o = computeAll(FORM_2550DS, { [`${P}grossSaleForTheQuarter`]: "333,333.33" });
    expect(o[`${P}vatPayable`]).toBe("40,000.00"); // 333,333.33 × 0.12 = 39,999.9996 → 40,000.00
  });
});

const state: FormState = {
  ...input,
  [`${P}paymentValueAddedTax`]: "true", [`${P}calendarNo1`]: "true", [`${P}selectedMonthNo2`]: "12", [`${P}txtYearNo2`]: "2025",
  [`${P}OptQuarter3`]: "true", [`${P}amendedReturnNo5`]: "true",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}branchCode`]: "00000", [`${P}rdoCode`]: "043",
  [`${P}taxpayerName`]: "DELA CRUZ, JUAN", [`${P}address`]: "1 RIZAL ST., QUEZON CITY", [`${P}telephoneNum`]: "0281234567",
};

// The reload used to abort before loading anything: sleeptime() calls loadBGXML("profile/<TIN>.xml") first, and when
// that file is missing its catch writes to a #msg element this form doesn't have (BIR bug), throwing out of the
// whole reload. BIR's app (and ours) never opens a return without the taxpayer's profile, which the oracle now writes.
describe.skipIf(!hasForm("2550DS"))("native 2550DS matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with BIR's form", async () => {
    const r = await parityCheck(oracle, FORM_2550DS, state, "84653210700000-2550DS-Q32025.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
