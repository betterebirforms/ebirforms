import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1800V2018 } from "@/form/form1800v2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1800v2018:";

const state: FormState = { [`${P}txtDeductionAmount28`]: "100,000.00", [`${P}Surcharge`]: "1,000.00" };
const groups: GroupState = {
  schedA: [{ [`${P}schedA:txtParticulars`]: "Cash gift", [`${P}schedA:txtFairMarketValue`]: "300,000.00" }],
  schedB2: [{ [`${P}schedB2:txtArea`]: "100", [`${P}schedB2:txtFairMarketValue`]: "600,000.00" }],
  schedB1: [],
};

describe("1800v2018 compute (TRAIN flat 6%)", () => {
  it("net gifts above the 250k exemption → 6% donor's tax, with deductions and penalties", () => {
    const o = computeForm(FORM_1800V2018, state, groups);
    expect(o[`${P}PersonalProperties`]).toBe("300,000.00");
    expect(o[`${P}RealProperties`]).toBe("600,000.00");
    expect(o[`${P}TotalGifts`]).toBe("900,000.00");
    expect(o[`${P}TotalDeductionsAllowed`]).toBe("100,000.00");
    expect(o[`${P}TotalReturnNetGifts`]).toBe("800,000.00");
    expect(o[`${P}TotalNetGifts36`]).toBe("800,000.00");
    expect(o[`${P}TotalNetGiftsSubjectToTax`]).toBe("550,000.00"); // 800k − 250k exemption
    expect(o[`${P}TotalNetGifts`]).toBe("550,000.00");
    expect(o[`${P}DonorTaxDue`]).toBe("33,000.00"); // 550k × 6%
    expect(o[`${P}txtTaxPayable`]).toBe("33,000.00");
    expect(o[`${P}TotalPenalties`]).toBe("1,000.00");
    expect(o[`${P}TotalAmountPayable`]).toBe("34,000.00");
  });

  it("replicates the BIR defect: net gifts below 250k produce a NEGATIVE tax due (no floor)", () => {
    const small: GroupState = { schedA: [{ [`${P}schedA:txtFairMarketValue`]: "100,000.00" }], schedB2: [], schedB1: [] };
    const o = computeForm(FORM_1800V2018, {}, small);
    expect(o[`${P}TotalNetGiftsSubjectToTax`]).toBe("-150,000.00");
    expect(o[`${P}DonorTaxDue`]).toBe("-9,000.00"); // −150k × 6% — a real legacy bug, reproduced for byte-compat
  });

  it("prior net gifts accumulate before the exemption (TRAIN per-year cumulative)", () => {
    const o = computeForm(FORM_1800V2018, { [`${P}TotalPriorNetGifts`]: "200,000.00" }, {
      schedA: [{ [`${P}schedA:txtFairMarketValue`]: "300,000.00" }], schedB2: [], schedB1: [],
    });
    expect(o[`${P}TotalNetGifts36`]).toBe("500,000.00"); // 300k current + 200k prior
    expect(o[`${P}DonorTaxDue`]).toBe("15,000.00"); // (500k − 250k) × 6%
  });
});

describe.skipIf(!hasForm("1800v2018"))("native 1800v2018 matches the legacy form (dynamic reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy reconstructs Schedules A/B-2/B-1 and the column totals round-trip", async () => {
    const full: FormState = {
      ...state, [`${P}txtYear`]: "2019", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtDonorName`]: "DELA CRUZ, JUAN",
    };
    const b1: GroupState = {
      ...groups,
      schedB1: [{ [`${P}schedB1:txtOCT`]: "OCT-123", [`${P}schedB1:txtLocation`]: "Makati", [`${P}schedB1:txtClassification`]: "Residential" }],
    };
    const { value, error } = await oracle.openSaved(FORM_1800V2018, full, "84653210700000-1800v2018-2019.xml", b1);
    // The field-occurrence split reconstructs each schedule; its FMV column total round-trips exactly.
    expect(await value(`${P}schedA:txtTotalPayment1`)).toBe("300,000.00");
    expect(await value(`${P}schedB2:txtTotal`)).toBe("600,000.00");
    expect(await value(`${P}PersonalProperties`)).toBe("300,000.00");
    expect(await value(`${P}RealProperties`)).toBe("600,000.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form (Schedules A, B-1, B-2 populated)", async () => {
    const full: FormState = {
      ...state, [`${P}txtYear`]: "2019", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtDonorName`]: "DELA CRUZ, JUAN",
      [`${P}TaxCredit17A`]: "500.00", [`${P}Interest`]: "250.00",
    };
    // text in capitals: BIR's capital() (onblur of any name / address box) uppercases every text input in the form
    const filled: GroupState = {
      schedA: [
        { [`${P}schedA:txtParticulars`]: "CASH GIFT", [`${P}schedA:txtFairMarketValue`]: "300,000.00" },
        { [`${P}schedA:txtParticulars`]: "CAR", [`${P}schedA:txtFairMarketValue`]: "450,000.00" },
      ],
      schedB2: [{ [`${P}schedB2:txtArea`]: "100", [`${P}schedB2:txtFairMarketValue`]: "600,000.00" }],
      schedB1: [{ [`${P}schedB1:txtOCT`]: "OCT-123", [`${P}schedB1:txtLocation`]: "MAKATI", [`${P}schedB1:txtClassification`]: "RESIDENTIAL" }],
    };
    const r = await parityCheck(oracle, FORM_1800V2018, full, "84653210700000-1800v2018-2019.xml", filled);
    // BIR bug the harness hits as a user would: compute18() and computeTotalAmtPayable() recurse forever on every
    // blur of 17A/17B/penalties ("Maximum call stack size exceeded"); the values are already written by then
    expect(r.page_error.length).toBeGreaterThan(0);
    expect(r.page_error.every((e) => e.includes("Maximum call stack size exceeded"))).toBe(true);
    expect(parityProblem({ ...r, page_error: [] })).toEqual([]);
  }, 120_000);
});
