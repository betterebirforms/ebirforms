import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2551 } from "@/form/form2551.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2551:";

const rows: FormState = {
  [`${P}txtTax14C`]: "100,000.00", [`${P}txtTax14D`]: "3",
  [`${P}txtTax15C`]: "50,000.00", [`${P}txtTax15D`]: "2",
  [`${P}txtTax20A`]: "500.00", [`${P}txtTax20B`]: "250.00",
  [`${P}txtTax22A`]: "100.00", [`${P}txtTax22B`]: "50.00", [`${P}txtTax22C`]: "25.00",
};

describe("2551 compute", () => {
  it("per-row tax = amount ÷ 100 × rate; 19/20C/21/22D/23 chain", () => {
    const o = computeAll(FORM_2551, rows);
    expect(o[`${P}txtTax14E`]).toBe("3,000.00");
    expect(o[`${P}txtTax15E`]).toBe("1,000.00");
    expect(o[`${P}txtTax19`]).toBe("4,000.00");
    expect(o[`${P}txtTax20C`]).toBe("750.00");
    expect(o[`${P}txtTax21`]).toBe("3,250.00");
    expect(o[`${P}txtTax22D`]).toBe("175.00");
    expect(o[`${P}txtTax23`]).toBe("3,425.00");
  });
});

describe.skipIf(!hasForm("2551"))("native 2551 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 2551 computes the same values", async () => {
    const state: FormState = {
      ...rows, [`${P}txtTax14C`]: "33,333.33", [`${P}txtTax14D`]: "3", // rounding row
      [`${P}qtr_4`]: "true", [`${P}rtnMonth`]: "12", [`${P}txtYear`]: "2017",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_2551, state, "84653210700000-2551-122017Q4.xml");
    expect(await value(`${P}txtTax14E`)).toBe("1,000.00"); // 333.3333 × 3 = 999.9999 → 1,000.00
    expect(await value(`${P}txtTax19`)).toBe("2,000.00");
    expect(await value(`${P}txtTax21`)).toBe("1,250.00");
    expect(await value(`${P}txtTax23`)).toBe("1,425.00");
    expect(error).toEqual([]);
  }, 120_000);

  const identity: FormState = {
    [`${P}qtr_4`]: "true", [`${P}rtnMonth`]: "12", [`${P}txtYear`]: "2017",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
  };
  it("is 1:1 with BIR's form: a payable 23 clears the overpayment choice (checkOverpayment)", async () => {
    const state: FormState = { ...rows, ...identity, [`${P}opt23_2`]: "true" };
    expect(computeAll(FORM_2551, state)[`${P}opt23_2`]).toBe("false");
    const r = await parityCheck(oracle, FORM_2551, state, "84653210700000-2551-122017Q4.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form on an overpayment: the choice is kept while 23 < 0", async () => {
    const state: FormState = { ...rows, ...identity, [`${P}txtTax20A`]: "5,000.00", [`${P}opt23_1`]: "false", [`${P}opt23_2`]: "true" };
    const o = computeAll(FORM_2551, state);
    expect(o[`${P}txtTax23`]).toBe("-1,075.00");
    expect(o[`${P}opt23_2`]).toBe("true");
    const r = await parityCheck(oracle, FORM_2551, state, "84653210700000-2551-122017Q4.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
