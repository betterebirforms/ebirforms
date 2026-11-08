import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1621 } from "@/form/form1621.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1621:";
const W = `${P}txtSched1_{i}_Withdrawn`;

const state: FormState = { [`${P}txtTaxRate`]: "6.0 %", [`${P}txtPen_Surcharge`]: "100.00" };
const groups: GroupState = { sched1: [{ [W]: "100,000.00" }, { [W]: "50,000.00" }] };

describe("1621 compute", () => {
  it("per-row Withheld = Withdrawn × 6%, column totals, still-due chain", () => {
    const o = computeForm(FORM_1621, state, groups);
    expect(o[`${P}txtSched1_Total_Withdrawn`]).toBe("150,000.00");
    expect(o[`${P}txtSched1_Total_Withheld`]).toBe("9,000.00"); // 6,000 + 3,000
    expect(o[`${P}txtTaxBase`]).toBe("150,000.00");
    expect(o[`${P}txtTaxWithheld`]).toBe("9,000.00");
    expect(o[`${P}txtStillDue`]).toBe("9,000.00"); // no remittance
    expect(o[`${P}txtStillDue_tot`]).toBe("9,100.00"); // + 100 surcharge
  });
});

describe.skipIf(!hasForm("1621"))("native 1621 matches the legacy form (dynamic-schedule reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1621 reconstructs the schedule and computes the same totals", async () => {
    const full: FormState = {
      ...state, [`${P}txtYear`]: "2026",
      [`${P}tinA`]: "846", [`${P}tinB`]: "532", [`${P}tinC`]: "107", [`${P}branchCode`]: "00000",
      [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN", [`${P}quarter_1`]: "true",
    };
    const { value, error } = await oracle.openSaved(FORM_1621, full, "84653210700000-1621-2026.xml", groups);
    expect(await value(`${P}txtTaxWithheld`)).toBe("9,000.00");
    expect(await value(`${P}txtStillDue_tot`)).toBe("9,100.00");
    expect(error).toEqual([]);
  }, 120_000);
});
