import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1704 } from "@/form/form1704.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1704:";

const input: FormState = {
  [`${P}sched1Txt1`]: "10,000.00", [`${P}sched1Txt2`]: "4,000.00", [`${P}sched1Txt4`]: "1,000.00", [`${P}sched1Txt5`]: "500.00",
  [`${P}txt14B`]: "100.00", [`${P}txt15D`]: "200.00", [`${P}txt16T`]: "50.00", [`${P}txt17A`]: "1,000.00",
  [`${P}txt13`]: "500,000.00", [`${P}txt19`]: "100.00", [`${P}txt20`]: "50.00",
  [`${P}txt23`]: "10", [`${P}txt25`]: "370.00", [`${P}txt27A`]: "100.00", [`${P}txt27B`]: "50.00", [`${P}txt27C`]: "25.00",
};

describe("1704 compute", () => {
  it("Schedule 1, reconciliation grid, and the 18→28 chain", () => {
    const o = computeAll(FORM_1704, input);
    expect(o[`${P}sched1Txt3`]).toBe("6,000.00");
    expect(o[`${P}sched1Txt9`]).toBe("7,500.00");
    expect(o[`${P}txt21A`]).toBe("7,500.00");
    expect(o[`${P}txt17B`]).toBe("1,350.00");
    expect(o[`${P}txt18`]).toBe("501,350.00");
    expect(o[`${P}txt21B`]).toBe("7,650.00");
    expect(o[`${P}txt22`]).toBe("493,700.00");
    expect(o[`${P}txt24`]).toBe("49,370.00"); // 493,700 × 10%
    expect(o[`${P}txt26`]).toBe("49,000.00");
    expect(o[`${P}txt28`]).toBe("49,175.00");
  });
});

describe.skipIf(!hasForm("1704"))("native 1704 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1704 computes the same values", async () => {
    const state: FormState = {
      ...input, [`${P}monthEnd`]: "12", [`${P}txtYearEnded`]: "2017",
      [`${P}txtTin1`]: "846", [`${P}txtTin2`]: "532", [`${P}txtTin3`]: "107", [`${P}txtBranch`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1704, state, "84653210700000-1704-122017.xml");
    expect(await value(`${P}txt17B`)).toBe("1,350.00");
    expect(await value(`${P}txt22`)).toBe("493,700.00");
    expect(await value(`${P}txt24`)).toBe("49,370.00");
    expect(await value(`${P}txt28`)).toBe("49,175.00");
    expect(error).toEqual([]);
  }, 120_000);
});
