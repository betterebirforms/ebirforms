import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1602, validate1602 } from "@/form/form1602.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1602:";

const input: FormState = {
  [`${P}OptTaxWithheld1`]: "true", [`${P}OptTaxWithheld2`]: "false",
  [`${P}OptCategoryAgent1`]: "true", [`${P}OptCategoryAgent2`]: "false",
  [`${P}OptSpecialTax1`]: "true", [`${P}OptSpecialTax2`]: "false", [`${P}lstSpecialTax`]: "3",
  [`${P}txt14A`]: "100,000.00", [`${P}txt15A`]: "50,000.00",
  [`${P}txt22D`]: "10,000.00", [`${P}txt22G`]: "20,000.00",
  [`${P}txt34`]: "2,000.00",
  [`${P}txt36A`]: "100.00", [`${P}txt36B`]: "50.00", [`${P}txt36C`]: "25.00",
  [`${P}txtReg1`]: "1,000.00", [`${P}txtForeign1`]: "500.00", [`${P}txtInst1`]: "200.00",
};
const sec = (s: "B" | "C", treaty: string, atc: string, amount: string, rate: string) => ({
  [`drpTreatyCodeSec${s}`]: treaty, [`drpATCCodeSec${s}`]: atc, [`txtAmtIncomePaySec${s}`]: amount, [`txtRateSec${s}`]: rate,
});
// Section B (treaty) → item 29, Section C (special rate) → item 32
const groups: GroupState = {
  secB: [sec("B", "US", "WC170", "10,000.00", "15.00")],
  secC: [sec("C", "JP", "WI170", "4,000.00", "15.00")],
};

describe("1602 compute", () => {
  it("rows × 20%, row-22 extras (12%/5%), Sections B/C into 29/32, the 26→37 chain, and Schedule 1", () => {
    const o = computeForm(FORM_1602, input, groups);
    expect(o[`${P}txt14C`]).toBe("20,000.00");
    expect(o[`${P}txt15C`]).toBe("10,000.00");
    expect(o[`${P}txt22F`]).toBe("1,200.00"); // 10,000 × 12%
    expect(o[`${P}txt22I`]).toBe("1,000.00"); // 20,000 × 5%
    expect(o[`${P}txt26`]).toBe("32,200.00"); // 20,000 + 10,000 + 1,200 + 1,000
    expect(o[`${P}txt29`]).toBe("1,500.00"); // 10,000 × 15%
    expect(o[`${P}txt32`]).toBe("600.00"); // 4,000 × 15%
    expect(o[`${P}txt33`]).toBe("34,300.00");
    expect(o[`${P}txt35`]).toBe("32,300.00");
    expect(o[`${P}txt37`]).toBe("32,475.00");
    expect(o[`${P}txtTotal1C`]).toBe("1,500.00");
    expect(o[`${P}txtTotalC`]).toBe("1,500.00");
    expect(o[`${P}txtTotalD`]).toBe("200.00");
  });

  it("item 13 = No zeroes 29 and 32 (disableSelTreaty); sections need item 13's matching choice", () => {
    const no = { ...input, [`${P}OptSpecialTax1`]: "false", [`${P}OptSpecialTax2`]: "true" };
    const o = computeForm(FORM_1602, no, groups);
    expect(o[`${P}txt29`]).toBe("0.00");
    expect(o[`${P}txt32`]).toBe("0.00");
    expect(validate1602(no, groups).map((p) => p.id)).toEqual(expect.arrayContaining([`${P}txt29`, `${P}txt32`]));
    const treatyOnly = { ...input, [`${P}lstSpecialTax`]: "2" };
    expect(validate1602(treatyOnly, groups).map((p) => p.id)).toEqual(expect.arrayContaining([`${P}txt32`]));
  });

  it("saves each section row plus the chxSec<i> marker the reload counts", () => {
    const key = formRecords(FORM_1602, input, groups).map((r) => r.key);
    expect(key).toEqual(expect.arrayContaining(["chxSecB0", "drpATCCodeSecB0", "txtReqWithheldSecB0", "chxSecC0", "txtReqWithheldSecC0"]));
  });
});

describe.skipIf(!hasForm("1602"))("native 1602 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input, [`${P}MonthEnd`]: "12", [`${P}txtYear`]: "2017", [`${P}AmendedRtn2`]: "true",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
  };
  it("legacy 1602 rebuilds Sections B and C and computes the same values", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1602, state, "84653210700000-1602-122017.xml", groups);
    expect(await value("txtReqWithheldSecB0")).toBe("1,500.00");
    expect(await value(`${P}txt29`)).toBe("1,500.00");
    expect(await value(`${P}txt32`)).toBe("600.00");
    expect(await value(`${P}txt37`)).toBe("32,475.00");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with BIR's form (populated Sections B and C)", async () => {
    const r = await parityCheck(oracle, FORM_1602, state, "84653210700000-1602-122017.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
