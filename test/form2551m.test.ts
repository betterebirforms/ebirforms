import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2551M, validate2551m } from "@/form/form2551m.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2551m:";

const state: FormState = { [`${P}txtSurcharge`]: "100.00" };
const groups: GroupState = {
  atc: [{ atc_code: "PT010", txtTaxableAmount: "100,000.00", txtTaxRate: "3" }], // atc_code drives the AtcCode<j> picker boxes
  credit: [{ [`${P}txtPeriodCovered`]: "01/2017", [`${P}txtNameOfWithAgent`]: "ACME CORP", [`${P}txtApplied`]: "500.00" }],
};

describe("2551M compute (monthly percentage tax, two schedules)", () => {
  it("ATC tax (base × rate) − credits, plus penalties", () => {
    const o = computeForm(FORM_2551M, state, groups);
    expect(o[`${P}txtTotalTaxDue`]).toBe("3,000.00"); // 100,000 × 3%
    expect(o[`${P}txt20A`]).toBe("500.00"); // Σ applied credits
    expect(o[`${P}txt21`]).toBe("500.00");
    expect(o[`${P}txt22`]).toBe("2,500.00"); // 3,000 − 500
    expect(o[`${P}txt23D`]).toBe("100.00"); // surcharge
    expect(o[`${P}txtTotalAmountPayable_24`]).toBe("2,600.00"); // 2,500 + 100
  });

  it("multiple ATC rows sum; txt20B adds to applied credits", () => {
    const o = computeForm(FORM_2551M, { [`${P}txt20B`]: "1,000.00" }, {
      atc: [{ txtTaxableAmount: "200,000.00", txtTaxRate: "3" }, { txtTaxableAmount: "50,000.00", txtTaxRate: "2" }],
      credit: [{ [`${P}txtApplied`]: "500.00" }],
    });
    expect(o[`${P}txtTotalTaxDue`]).toBe("7,000.00"); // 6,000 + 1,000
    expect(o[`${P}txt21`]).toBe("1,500.00"); // 500 applied + 1,000 txt20B
    expect(o[`${P}txt22`]).toBe("5,500.00"); // 7,000 − 1,500
  });
});

describe.skipIf(!hasForm("2551M"))("native 2551M matches the legacy form (dynamic reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy reconstructs the credit Schedule I and repaints the ATC grid from the AtcCode<j> boxes", async () => {
    const full: FormState = {
      ...state, [`${P}txtYear`]: "2017", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtTaxPayerName`]: "DELA CRUZ, JUAN",
    };
    const { page, value, error } = await oracle.openSaved(FORM_2551M, full, "84653210700000-2551M-012017.xml", groups);
    // Credit Schedule I reconstructs by txtPeriodCovered occurrence-count → its applied total (txt20A) round-trips.
    expect(await value(`${P}txt20A`)).toBe("500.00");
    // getSelectedATC rebuilt row 1 from the checked AtcCode1 (PT010), loadDataATCRow refilled it
    expect(await page.locator('[id="ATCnameCode1"]').innerText()).toBe("PT010");
    expect(await value("txtTaxableAmount1")).toBe("100,000.00");
    expect(await value(`${P}txtTotalTaxDue`)).toBe("3,000.00");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with BIR's form with several ATC rows (picker order)", async () => {
    const atc = [
      { atc_code: "PT010", txtTaxableAmount: "100,000.00", txtTaxRate: "3" },
      { atc_code: "PT060", txtTaxableAmount: "40,000.00", txtTaxRate: "2" },
      { atc_code: "PT130", txtTaxableAmount: "10,000.00", txtTaxRate: "10" },
    ];
    expect(validate2551m({}, { atc: [atc[1]!, atc[0]!] }).some((p) => p.message.includes("order"))).toBe(true);
    const r = await parityCheck(oracle, FORM_2551M, { ...state, ...identity }, "84653210700000-2551M-012017.xml", { ...groups, atc });
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  const identity: FormState = {
    [`${P}txtYear`]: "2017", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
    [`${P}txtBranchCode`]: "00000", [`${P}txtTaxPayerName`]: "DELA CRUZ, JUAN",
  };
  it("is 1:1 with BIR's form (both schedules populated)", async () => {
    const r = await parityCheck(oracle, FORM_2551M, { ...state, ...identity }, "84653210700000-2551M-012017.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 on an overpayment: item 25's choice is kept only while item 24 is negative (getRowInTable)", async () => {
    const over: FormState = { ...state, ...identity, [`${P}txt20B`]: "5,000.00", [`${P}optToBeRefunded:_1`]: "true", [`${P}optToBeIssued:_2`]: "false" };
    const o = computeForm(FORM_2551M, over, groups);
    expect(o[`${P}txtTotalAmountPayable_24`]).toBe("-2,400.00");
    expect(o[`${P}txtTotalAmount`]).toBe("500.00"); // Schedule I total box = 20A
    expect(computeForm(FORM_2551M, { ...over, [`${P}txt20B`]: "0.00" }, groups)[`${P}optToBeRefunded:_1`]).toBe("false");
    const r = await parityCheck(oracle, FORM_2551M, over, "84653210700000-2551M-012017.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
