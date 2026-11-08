import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState } from "@/form/schema.ts";
import { FORM_1602QV2018 } from "@/form/form1602qv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1602Q:";

const state: FormState = {
  [`${P}OptTaxWithheld1`]: "true", // "were taxes withheld this quarter? — Yes" keeps the schedules enabled on reload
  [`${P}txtSched1Amount1`]: "999,999.00", // row 1 — amount entered, but rate font is empty (BIR bug) → tax 0
  [`${P}txtSched1Amount13`]: "1,000,000.00", [`${P}txtSched1TaxRate13`]: "20", [`${P}txtSched1Rate13`]: "0.5", // BSP row
  [`${P}txtSched2Interest1`]: "500,000.00", [`${P}txtSched2TaxRate1`]: "15",
  [`${P}txtSched3TotInterest1`]: "200,000.00", [`${P}txtSched3TaxRate1`]: "10",
  [`${P}txt18`]: "5,000.00", [`${P}txt24`]: "1,000.00",
};

describe("1602Qv2018 compute (fixed schedules; BSP + documented rate-wiring bug)", () => {
  it("Sched1 rows 1-12/15 are BIR-broken to 0; BSP row 13 = amount × rate% × bsp; Sched2/3 work", () => {
    const o = computeForm(FORM_1602QV2018, state, {});
    expect(o[`${P}txtSched1Tax1`]).toBe("0.00"); // empty fnt rate → NaN → formatCurrency = 0.00 (replicated)
    expect(o[`${P}txtSched1Tax13`]).toBe("100,000.00"); // 1,000,000 × 20% × 0.5
    expect(o[`${P}txtSched1Total`]).toBe("100,000.00");
    expect(o[`${P}txt14`]).toBe("100,000.00");
    expect(o[`${P}txtSched2TaxesWithheld1`]).toBe("75,000.00"); // 500,000 × 15%
    expect(o[`${P}txt15`]).toBe("75,000.00");
    expect(o[`${P}txtSched3TaxWithheld1`]).toBe("20,000.00"); // 200,000 × 10%
    expect(o[`${P}txt16`]).toBe("20,000.00");
    expect(o[`${P}txt17`]).toBe("195,000.00"); // 100k + 75k + 20k
    expect(o[`${P}txt22`]).toBe("5,000.00");
    expect(o[`${P}txt23`]).toBe("190,000.00"); // 195k − 5k
    expect(o[`${P}txt27`]).toBe("1,000.00");
    expect(o[`${P}txt28`]).toBe("191,000.00"); // 190k + 1k
  });

  it("'no taxes withheld' (OptTaxWithheld1 off) zeros every schedule total, matching the legacy disable path", () => {
    const o = computeForm(FORM_1602QV2018, { ...state, [`${P}OptTaxWithheld1`]: "" }, {});
    expect(o[`${P}txt14`]).toBe("0.00");
    expect(o[`${P}txtSched1Tax13`]).toBe("0.00");
    expect(o[`${P}txtSched2Total`]).toBe("0.00");
    expect(o[`${P}txt17`]).toBe("0.00");
    // schedules zeroed, but the page-1 credit (txt18=5,000) and penalty (txt24=1,000) remain: 0 − 5,000 + 1,000
    expect(o[`${P}txt28`]).toBe("-4,000.00");
  });
});

describe.skipIf(!hasForm("1602Qv2018"))("native 1602Qv2018 matches the legacy form (round-trip)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("the fixed-schedule chain round-trips through the legacy form", async () => {
    const full: FormState = {
      ...state, [`${P}txtYear`]: "2019", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1602QV2018, full, "84653210700000-1602Qv2018-2019.xml");
    expect(await value(`${P}txtSched1Tax13`)).toBe("100,000.00");
    expect(await value(`${P}txt17`)).toBe("195,000.00");
    expect(await value(`${P}txt28`)).toBe("191,000.00");
    expect(error).toEqual([]);
  }, 120_000);

  const identity: FormState = {
    [`${P}txtYear`]: "2019", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
    [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
  };
  // BIR bug, not a native one: row 15's onblur is computeSched1(this.value, 6, …) and getElementById(6) is null, so
  // blurring it (the harness tabs through every live input, as a user does) — and every reload under "No" — throws.
  const row15Throw = (e: string) => e.includes("d.getElementById(rate).value");
  const withoutRow15Throw = <T extends { page_error: string[] }>(r: T): T => ({ ...r, page_error: r.page_error.filter((e) => !row15Throw(e)) });

  it("is 1:1 with BIR's form: schedules filled, over-remittance (28 < 0) keeps item 29's choice", async () => {
    const over: FormState = {
      ...state, ...identity, [`${P}OptTaxWithheld2`]: "false", [`${P}txt18`]: "300,000.00",
      [`${P}OverRemittance1`]: "true", [`${P}OverRemittance2`]: "false", [`${P}OverRemittance3`]: "false",
    };
    expect(computeForm(FORM_1602QV2018, over, {})[`${P}txt28`]).toBe("-104,000.00");
    const r = await parityCheck(oracle, FORM_1602QV2018, over, "84653210700000-1602Qv2018-2019.xml");
    expect(r.page_error.every(row15Throw)).toBe(true);
    expect(parityProblem(withoutRow15Throw(r))).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form under 'No': Schedule 1 zeroed, Schedules 2/3 kept (the reload aborts at row 15)", async () => {
    const no: FormState = {
      ...state, ...identity, [`${P}OptTaxWithheld1`]: "false", [`${P}OptTaxWithheld2`]: "true",
      [`${P}txt18`]: "0.00", [`${P}OverRemittance3`]: "true", // 28 = 1,000 >= 0, so BIR unchecks it and so do we
    };
    const o = computeForm(FORM_1602QV2018, no, {});
    expect(o[`${P}txtSched1Amount13`]).toBe("0.00");
    expect(o[`${P}txtSched2Interest1`]).toBe("500,000.00");
    expect(o[`${P}OverRemittance3`]).toBe("false");
    const r = await parityCheck(oracle, FORM_1602QV2018, no, "84653210700000-1602Qv2018-2019.xml");
    expect(r.page_error.length).toBeGreaterThan(0);
    expect(parityProblem(withoutRow15Throw(r))).toEqual([]);
  }, 120_000);
});
