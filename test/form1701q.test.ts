import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1701Q } from "@/form/form1701q.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1701q:";

const base: FormState = {
  [`${P}txt26A`]: "500,000.00", [`${P}txt38A`]: "5,000.00", [`${P}txt40A`]: "1,000.00",
  "frm1701:optMethodOfDeduction23:_2": "true", // taxpayer OSD
};

describe("1701Q compute", () => {
  it("OSD 40%, graduated bracket, credits, penalties (taxpayer column)", () => {
    const o = computeAll(FORM_1701Q, base);
    expect(o[`${P}txt33A`]).toBe("200,000.00"); // 500k × 40%
    expect(o[`${P}txt34A`]).toBe("300,000.00"); // 500k − 200k
    expect(o[`${P}txt37A`]).toBe("65,000.00"); // bracket: (300k−250k)×30% + 50k
    expect(o[`${P}txt39A`]).toBe("60,000.00"); // − 5k credits
    expect(o[`${P}txt41A`]).toBe("61,000.00"); // + 1k penalties
    expect(o[`${P}txt41C`]).toBe("61,000.00"); // spouse col 0
  });
  it("itemized: item 33 is entered, not 40% of 26", () => {
    const o = computeAll(FORM_1701Q, { ...base, "frm1701:optMethodOfDeduction23:_2": "false", "frm1701:optMethodOfDeduction23:_1": "true", [`${P}txt33A`]: "150,000.00" });
    expect(o[`${P}txt34A`]).toBe("350,000.00"); // 500k − 150k
    expect(o[`${P}txt37A`]).toBe("80,000.00"); // (350k−250k)×30% + 50k
  });
});

describe.skipIf(!hasForm("1701Q"))("native 1701Q matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1701Q computes the same values (graduated tax)", async () => {
    const state: FormState = {
      ...base, [`${P}DateQuarter_1`]: "true", [`${P}txtYear`]: "2017",
      [`${P}txt5TIN1`]: "846", [`${P}txt5TIN2`]: "532", [`${P}txt5TIN3`]: "107", [`${P}txt5BranchCode`]: "00000",
      [`${P}txt5RDOCode`]: "043", [`${P}txtTaxPayername`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1701Q, state, "84653210700000-1701Q-2017Q1.xml");
    expect(await value(`${P}txt33A`)).toBe("200,000.00");
    expect(await value(`${P}txt37A`)).toBe("65,000.00");
    expect(await value(`${P}txt41C`)).toBe("61,000.00");
    expect(error).toEqual([]);
  }, 120_000);
});
