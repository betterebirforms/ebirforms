import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2200T } from "@/form/form2200t.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2200Tv2020:";

const input: FormState = {
  [`${P}txtSched1_1A_2020_Taxable`]: "1,000.00", [`${P}txtSched1_1A_2020_Due`]: "250.00",
  [`${P}txtSched1_6_10ml_Taxable`]: "400.00", [`${P}txtSched1_6_10ml_Due`]: "150.50",
  [`${P}amendedRtn_1`]: "true", // item 19 (previous return) is live only on an amended return
  [`${P}txtLess_Balance`]: "20.00", [`${P}txtLess_Excise`]: "30.00", [`${P}txtPrevReturn`]: "50.00",
  [`${P}txtPen_Surcharge`]: "25.00", [`${P}txtPen_Interest`]: "10.00", [`${P}txtPen_Compromise`]: "5.00",
  [`${P}txtPay_TaxPayment`]: "100.00",
};

describe("2200Tv2020 compute (calculate_Sched1_TotalDue + calculate_Part3)", () => {
  it("Schedule 1 dues sum into item 14, then the Part III chain", () => {
    const o = computeAll(FORM_2200T, input);
    expect(o[`${P}txtSched1_TotalDue`]).toBe("400.50");
    expect(o[`${P}txtExciseDue`]).toBe("400.50");
    expect(o[`${P}txtLess_Tot`]).toBe("50.00");
    expect(o[`${P}txtNetTaxDue`]).toBe("350.50");
    expect(o[`${P}txtStillDue`]).toBe("300.50");
    expect(o[`${P}txtPen_Tot`]).toBe("40.00");
    expect(o[`${P}txtAmtPayable`]).toBe("340.50");
    expect(o[`${P}txtPay_Penalties`]).toBe("40.00");
    expect(o[`${P}txtPay_Tot`]).toBe("140.00");
    expect(o[`${P}txtBalance`]).toBe("200.50");
    // an original return zeroes item 19 (onAmendedClick)
    expect(computeAll(FORM_2200T, { ...input, [`${P}amendedRtn_1`]: "false" })[`${P}txtStillDue`]).toBe("350.50");
  });
});

describe.skipIf(!hasForm("2200Tv2020"))("native 2200Tv2020 round-trips through the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input, [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "31", [`${P}txtDateYear`]: "2020",
    [`${P}tinA`]: "846", [`${P}tinB`]: "532", [`${P}tinC`]: "107", [`${P}branchCode`]: "00000",
    [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
  };
  it("entered values survive a save/load round-trip", async () => {
    const { value, error } = await oracle.openSaved(FORM_2200T, state, "84653210700000-2200Tv2020-12312020.xml");
    expect(await value(`${P}txtExciseDue`)).toBe("400.50");
    expect(await value(`${P}txtSched1_1A_2020_Due`)).toBe("250.00");
    expect(await value(`${P}txtSched1_1A_2020_Taxable`)).toBe("1,000.00");
    expect(await value(`${P}txtAmtPayable`)).toBe("340.50");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form (Schedule 1 rows and Part III filled)", async () => {
    const r = await parityCheck(oracle, FORM_2200T, state, "84653210700000-2200Tv2020-12312020.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
