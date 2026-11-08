import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1603 } from "@/form/form1603.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1603:";

// Clean grossing-up: 8,500/0.85=10,000 ×15%=1,500; 7,500/0.75=10,000 ×25%=2,500; 6,500/0.65=10,000 ×35%=3,500.
const clean: FormState = {
  [`${P}txtFringe320`]: "8,500.00", [`${P}txtFringe330`]: "7,500.00", [`${P}txtFringe360`]: "6,500.00",
  [`${P}txt21A`]: "100.00", [`${P}txt21B`]: "50.00", [`${P}txt21C`]: "25.00",
};

describe("1603 compute", () => {
  it("grosses up each group, totals 18A/18B, then 20/21D/22", () => {
    const o = computeAll(FORM_1603, clean);
    expect(o[`${P}txtBase320`]).toBe("10,000.00");
    expect(o[`${P}txtReq320`]).toBe("1,500.00");
    expect(o[`${P}txtReq360`]).toBe("3,500.00");
    expect(o[`${P}txt18A`]).toBe("22,500.00");
    expect(o[`${P}txt18B`]).toBe("7,500.00");
    expect(o[`${P}txt19`]).toBe("0.00"); // original return: gated
    expect(o[`${P}txt20`]).toBe("7,500.00");
    expect(o[`${P}txt21D`]).toBe("175.00");
    expect(o[`${P}txt22`]).toBe("7,675.00");
  });
  it("rounds the grossing-up division round-half-up", () => {
    const o = computeAll(FORM_1603, { [`${P}txtFringe320`]: "1,000.00" });
    expect(o[`${P}txtBase320`]).toBe("1,176.47"); // 1000/0.85 = 1176.4705…
    expect(o[`${P}txtReq320`]).toBe("176.47"); // 1176.47 × 0.15 = 176.4705
  });
});

describe.skipIf(!hasForm("1603"))("native 1603 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1603 computes the same values (incl. rounding)", async () => {
    const state: FormState = {
      ...clean, [`${P}txtFringe320`]: "1,000.00", // rounding case
      [`${P}optQrtr:_1`]: "true", [`${P}txtYear`]: "2017",
      [`${P}tinPart1`]: "846", [`${P}tinPart2`]: "532", [`${P}tinPart3`]: "107", [`${P}branchCode`]: "00000",
      [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1603, state, "84653210700000-1603-2017Q1.xml");
    expect(await value(`${P}txtBase320`)).toBe("1,176.47");
    expect(await value(`${P}txtReq320`)).toBe("176.47");
    expect(await value(`${P}txtReq360`)).toBe("3,500.00");
    expect(await value(`${P}txt18B`)).toBe("6,176.47");
    expect(await value(`${P}txt20`)).toBe("6,176.47");
    expect(await value(`${P}txt22`)).toBe("6,351.47");
    expect(error).toEqual([]);
  }, 120_000);
});
