import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_0620 } from "@/form/form0620.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm0620:";
const base = { [`${P}txtTax14`]: "5,000.00", [`${P}txtTax15`]: "1,000.00", [`${P}txtTax17A`]: "10.10", [`${P}txtTax17B`]: "20.20", [`${P}txtTax17C`]: "0.30" };
const amended: FormState = { ...base, [`${P}AmendedRtn_1`]: "true" };
describe("0620 compute", () => {
  it("original return: items 14/15 are gated to 0, so 16=0 and 18=17D", () => {
    const o = computeAll(FORM_0620, base);
    expect(o[`${P}txtTax14`]).toBe("0.00");
    expect(o[`${P}txtTax16`]).toBe("0.00");
    expect(o[`${P}txtTax17D`]).toBe("30.60");
    expect(o[`${P}txtTax18`]).toBe("30.60");
  });
  it("amended return: 16=14−15; 17D=17A+17B+17C; 18=16+17D", () => {
    const o = computeAll(FORM_0620, amended);
    expect(o[`${P}txtTax16`]).toBe("4,000.00");
    expect(o[`${P}txtTax17D`]).toBe("30.60");
    expect(o[`${P}txtTax18`]).toBe("4,030.60");
  });
  it("drops a negative item 16 from the total due (BIR quirk)", () => {
    const o = computeAll(FORM_0620, { ...amended, [`${P}txtTax14`]: "500.00", [`${P}txtTax15`]: "1,000.00" });
    expect(o[`${P}txtTax16`]).toBe("-500.00");
    expect(o[`${P}txtTax18`]).toBe("30.60"); // = 17D only, not 16 + 17D
  });
});
describe.skipIf(!hasForm("0620"))("native 0620 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 0620 computes the same values", async () => {
    // Items 14/15 are amended-return only: changeAmended() zeros them unless AmendedRtn_1 is checked.
    const state = { ...amended, [`${P}txtMonth`]: "10", [`${P}txtYear`]: "2026", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN" };
    const { value, error } = await oracle.openSaved(FORM_0620, state, "84653210700000-0620-102026.xml");
    expect(await value(`${P}txtTax16`)).toBe("4,000.00");
    expect(await value(`${P}txtTax17D`)).toBe("30.60");
    expect(await value(`${P}txtTax18`)).toBe("4,030.60");
    expect(error).toEqual([]);
  }, 120_000);
  it("is 1:1 with BIR's form; the due date is the 10th of the month after the period (setDueDateFromPeriod)", async () => {
    const state = { ...amended, [`${P}txtMonth`]: "12", [`${P}txtYear`]: "2025", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN" };
    const o = computeAll(FORM_0620, state);
    expect([o[`${P}txtDueMonth`], o[`${P}txtDueDate`], o[`${P}txtDueYear`]]).toEqual(["01", "10", "2026"]);
    expect(computeAll(FORM_0620, { ...state, [`${P}txtDueDate`]: "15" })[`${P}txtDueDate`]).toBe("15"); // the day stays editable
    const r = await parityCheck(oracle, FORM_0620, state, "84653210700000-0620-122025.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
