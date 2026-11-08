import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1707 } from "@/form/form1707.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1707:";

const state: FormState = { [`${P}txtSurcharge`]: "1,000.00" };
const groups: GroupState = {
  sched1: [{ txtSched1TaxableBase: "200,000.00" }],
  sched2: [{ txtSched2Amt: "5,000.00" }],
};

describe("1707 compute", () => {
  it("two schedules → base/credits, net capital gain, bracket, payable, total", () => {
    const o = computeForm(FORM_1707, state, groups);
    expect(o[`${P}txtTax`]).toBe("200,000.00");
    expect(o[`${P}txtLess`]).toBe("5,000.00");
    expect(o[`${P}txtNetCap`]).toBe("195,000.00");
    expect(o[`${P}txtTaxDue`]).toBe("14,500.00"); // (195k−100k)×10% + 5,000
    expect(o[`${P}txtTaxPayable`]).toBe("14,500.00");
    expect(o[`${P}txtTotal`]).toBe("15,500.00"); // + 1,000 surcharge
  });
});

describe.skipIf(!hasForm("1707"))("native 1707 matches the legacy form (dynamic reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1707 reconstructs both schedules and computes the same values", async () => {
    const full: FormState = {
      ...state, [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "31", [`${P}txtDateYear`]: "2017",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043",
    };
    const { value, error } = await oracle.openSaved(FORM_1707, full, "84653210700000-1707-12312017.xml", groups);
    expect(await value(`${P}txtTax`)).toBe("200,000.00");
    expect(await value(`${P}txtNetCap`)).toBe("195,000.00");
    expect(await value(`${P}txtTaxDue`)).toBe("14,500.00");
    expect(await value(`${P}txtTotal`)).toBe("15,500.00");
    expect(error).toEqual([]);
  }, 120_000);
});
