import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1603Q } from "@/form/form1603q.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1603Q:";

// Clean grossing-up: 6,500 / 0.65 = 10,000 base × 35% = 3,500; 7,500 / 0.75 = 10,000 base × 25% = 2,500.
const clean: FormState = {
  [`${P}Sched1:txtValue1`]: "6,500.00", [`${P}Sched1:txtDivisor1`]: "65", [`${P}Sched1:txtTaxRate1`]: "35",
  [`${P}Sched1:txtValue2`]: "7,500.00", [`${P}Sched1:txtDivisor2`]: "75", [`${P}Sched1:txtTaxRate2`]: "25",
  [`${P}txtTax16`]: "1,000.00", [`${P}txtTax19`]: "100.00", [`${P}txtTax20`]: "50.00", [`${P}txtTax21`]: "25.00",
};

describe("1603Q compute", () => {
  it("grosses up each fixed row, sums into 14, then 17/18/22/23", () => {
    const o = computeAll(FORM_1603Q, clean);
    expect(o[`${P}Sched1:txtTaxBase1`]).toBe("10,000.00");
    expect(o[`${P}Sched1:txtTaxWithheld1`]).toBe("3,500.00");
    expect(o[`${P}Sched1:txtTaxWithheld2`]).toBe("2,500.00");
    expect(o[`${P}txtTax14`]).toBe("6,000.00");
    expect(o[`${P}txtTax15`]).toBe("0.00"); // original return: gated
    expect(o[`${P}txtTax17`]).toBe("1,000.00");
    expect(o[`${P}txtTax18`]).toBe("5,000.00");
    expect(o[`${P}txtTax22`]).toBe("175.00");
    expect(o[`${P}txtTax23`]).toBe("5,175.00");
  });
  it("rounds the grossing-up division round-half-up, like formatCurrency", () => {
    const o = computeAll(FORM_1603Q, { [`${P}Sched1:txtValue1`]: "1,000.00", [`${P}Sched1:txtDivisor1`]: "65", [`${P}Sched1:txtTaxRate1`]: "35" });
    // a fresh form has no divisor/rate in its state; BIR's fixed 65% / 35% apply
    expect(computeAll(FORM_1603Q, { [`${P}Sched1:txtValue1`]: "1,000.00" })[`${P}Sched1:txtTaxBase1`]).toBe(o[`${P}Sched1:txtTaxBase1`]);
    expect(o[`${P}Sched1:txtTaxBase1`]).toBe("1,538.46"); // 1000/0.65 = 1538.4615…
    expect(o[`${P}Sched1:txtTaxWithheld1`]).toBe("538.46"); // 1538.46 × 0.35 = 538.461
    expect(o[`${P}txtTax14`]).toBe("538.46");
  });
});

describe.skipIf(!hasForm("1603Qv2018"))("native 1603Q matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1603Q computes the same values (incl. grossing-up rounding)", async () => {
    const state: FormState = {
      ...clean, [`${P}Sched1:txtValue1`]: "1,000.00", // the rounding case
      [`${P}optQuarter1`]: "true", [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}rdoCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
      [`${P}Sched1:txtATC1`]: "WF360", [`${P}Sched1:txtATC2`]: "WF330",
    };
    const { value, error } = await oracle.openSaved(FORM_1603Q, state, "84653210700000-1603Qv2018-2026Q1.xml");
    expect(await value(`${P}Sched1:txtTaxBase1`)).toBe("1,538.46");
    expect(await value(`${P}Sched1:txtTaxWithheld1`)).toBe("538.46");
    expect(await value(`${P}Sched1:txtTaxWithheld2`)).toBe("2,500.00");
    expect(await value(`${P}txtTax14`)).toBe("3,038.46");
    expect(await value(`${P}txtTax18`)).toBe("2,038.46");
    expect(await value(`${P}txtTax23`)).toBe("2,213.46");
    expect(error).toEqual([]);
  }, 120_000);
});
