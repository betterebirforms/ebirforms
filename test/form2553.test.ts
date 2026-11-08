import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2553 } from "@/form/form2553.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2553:";

const rows: FormState = {
  [`${P}txt14C`]: "100,000.00", [`${P}txt14D`]: "3",
  [`${P}txt15C`]: "50,000.00", [`${P}txt15D`]: "2",
  [`${P}txt20A`]: "500.00", [`${P}txt20B`]: "250.00",
  [`${P}txt22A`]: "100.00", [`${P}txt22B`]: "50.00", [`${P}txt22C`]: "25.00",
};

describe("2553 compute", () => {
  it("per-row tax = amount ÷ 100 × rate; 19/20C/21/22D/23 chain", () => {
    const o = computeAll(FORM_2553, rows);
    expect(o[`${P}txt14E`]).toBe("3,000.00");
    expect(o[`${P}txt15E`]).toBe("1,000.00");
    expect(o[`${P}txt19`]).toBe("4,000.00");
    expect(o[`${P}txt20C`]).toBe("750.00");
    expect(o[`${P}txt21`]).toBe("3,250.00");
    expect(o[`${P}txt22D`]).toBe("175.00");
    expect(o[`${P}txt23`]).toBe("3,425.00");
  });
  it("rounds the per-row tax round-half-up like formatCurrency", () => {
    const o = computeAll(FORM_2553, { [`${P}txt14C`]: "33,333.33", [`${P}txt14D`]: "3" });
    expect(o[`${P}txt14E`]).toBe("1,000.00"); // 333.3333 × 3 = 999.9999 → 1,000.00
    expect(o[`${P}txt19`]).toBe("1,000.00");
  });
});

describe.skipIf(!hasForm("2553"))("native 2553 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 2553 computes the same values", async () => {
    const state: FormState = {
      ...rows, [`${P}txt14C`]: "33,333.33", [`${P}txt14D`]: "3",
      [`${P}optQtr:_4`]: "true", [`${P}itemYearEndMonth`]: "12", [`${P}txtYearEnded`]: "2026",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtTPName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_2553, state, "84653210700000-2553-122026Q4.xml");
    expect(await value(`${P}txt14E`)).toBe("1,000.00"); // rounding
    expect(await value(`${P}txt15E`)).toBe("1,000.00");
    expect(await value(`${P}txt19`)).toBe("2,000.00");
    expect(await value(`${P}txt20C`)).toBe("750.00");
    expect(await value(`${P}txt21`)).toBe("1,250.00");
    expect(await value(`${P}txt23`)).toBe("1,425.00");
    expect(error).toEqual([]);
  }, 120_000);

  const identity: FormState = {
    [`${P}optQtr:_4`]: "true", [`${P}itemYearEndMonth`]: "12", [`${P}txtYearEnded`]: "2026",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtTPName`]: "DELA CRUZ, JUAN",
  };
  it("is 1:1 with BIR's form: a payable 23 clears the overpayment choice", async () => {
    const state: FormState = { ...rows, ...identity, [`${P}ifoverpay_1`]: "true" };
    expect(computeAll(FORM_2553, state)[`${P}ifoverpay_1`]).toBe("false");
    const r = await parityCheck(oracle, FORM_2553, state, "84653210700000-2553-122026Q4.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form on an overpayment, but for BIR's checkOverpayment bug", async () => {
    const state: FormState = { ...rows, ...identity, [`${P}txt20A`]: "5,000.00", [`${P}ifoverpay_1`]: "true", [`${P}ifoverpay_2`]: "false" };
    const o = computeAll(FORM_2553, state);
    expect(o[`${P}txt23`]).toBe("-1,075.00");
    expect(o[`${P}ifoverpay_1`]).toBe("true");
    const r = await parityCheck(oracle, FORM_2553, state, "84653210700000-2553-122026Q4.xml");
    // harness artifact: checkOverpayment unchecks both radios even on an overpayment, and the harness blurs every
    // amount (as a user tabbing through would); BIR keeps the choice only when it is picked after the last edit
    expect(r.diff).toEqual([{ key: "frm2553:ifoverpay_1", native: "true", legacy: "false" }]);
    expect(parityProblem(r, ["frm2553:ifoverpay_1"])).toEqual([]);
  }, 120_000);
});
