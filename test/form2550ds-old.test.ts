import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2550DS_OLD } from "@/form/form2550ds-old.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2550ds:";

const amount: FormState = {
  [`${P}grossSaleForTheQuarter`]: "1,000,000.00", [`${P}lessGrossSaleSubjectedToWithHoldingTax`]: "100,000.00",
  [`${P}vatPaidInReturn`]: "10,000.00", [`${P}excessPaymentCarriedOver`]: "5,000.00",
  [`${P}advancePaymentOrDepositMadeThisQuarter`]: "2,000.00", [`${P}otherPaymentCreditAmount`]: "3,000.00",
  [`${P}addPenaltiesSurcharge`]: "1,000.00", [`${P}addPenaltiesInterest`]: "500.00",
};
const state: FormState = {
  ...amount,
  [`${P}paymentAdvanceDeposit`]: "true", [`${P}fiscalNo1`]: "true", [`${P}selectedMonthNo2`]: "06", [`${P}txtYearNo2`]: "2025",
  [`${P}OptQuarter2`]: "true", [`${P}amendedReturnYesNo5`]: "true",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}branchCode`]: "00000", [`${P}rdoCode`]: "043",
  [`${P}taxpayerName`]: "DELA CRUZ, JUAN", [`${P}address`]: "1 RIZAL ST., QUEZON CITY", [`${P}telephoneNum`]: "0281234567",
};

// Same compute graph as 2550DS (shared makeDS).
describe("2550DS-old compute", () => {
  it("balance → vatPayable → credits → stillPayable → total", () => {
    const o = computeAll(FORM_2550DS_OLD, amount);
    expect(o[`${P}balanceSubjectToVAT`]).toBe("900,000.00");
    expect(o[`${P}vatPayable`]).toBe("108,000.00");
    expect(o[`${P}totalPaymentsCredits`]).toBe("20,000.00");
    expect(o[`${P}vatStillPayable`]).toBe("88,000.00");
    expect(o[`${P}totalAmountPayable`]).toBe("89,500.00");
  });
});

describe.skipIf(!hasForm("2550DS-old"))("native 2550DS-old matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with BIR's form (the reload needs the taxpayer profile; see form2550ds.test.ts)", async () => {
    const r = await parityCheck(oracle, FORM_2550DS_OLD, state, "84653210700000-2550DS-old-Q32025.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
