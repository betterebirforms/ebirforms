import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1601C } from "@/form/form1601c.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1601c:";
const SA = `${P}SectionA:`;

const state: FormState = {
  [`${P}txtTax15`]: "10,000.00",
  [`${P}txtTax18`]: "8,000.00",
  [`${P}j_id217:_1`]: "true", // amended = Yes → item 21A is live
  [`${P}txtTax21A`]: "500.00",
  [`${P}txtTax21B`]: "100.00",
  [`${P}txtTax24A`]: "50.00",
  // fixed radio sub-section row 1: Month branch, should-tax-due 1,000 − tax-paid 400 = 600
  [`${SA}SelMonthYear1_1`]: "true",
  [`${SA}TxtShouldTaxDueRadio1`]: "1,000.00",
  [`${SA}TxtTaxPaidRadio1`]: "400.00",
};
const groups: GroupState = {
  sectionA: [{ [`${SA}SelMonthYear`]: "M", [`${SA}TxtShouldTaxDue`]: "5,000.00", [`${SA}TxtTaxPaid`]: "3,000.00" }],
};

describe("1601C compute (compensation WHT, radio + modal prior-month adjustments)", () => {
  it("items 17/19/20/22/23/24D/25 and the Month/Year branch", () => {
    const o = computeForm(FORM_1601C, state, groups);
    expect(o[`${SA}TxtCurrentYearRadio1`]).toBe("600.00"); // Month branch → current-year column
    expect(o[`${SA}TxtFromYearEndRadio1`]).toBe("0.00");
    expect(o["txtDvTotalAmount7a7b"]).toBe("2,000.00"); // modal: 5,000 − 3,000
    expect(o[`${P}txtTax17`]).toBe("10,000.00"); // 15 − adjustments
    expect(o[`${P}txtTax19`]).toBe("2,600.00"); // radio 600 + modal 2,000
    expect(o[`${P}txtTax26`]).toBe("2,600.00");
    expect(o[`${P}txtTax20`]).toBe("10,600.00"); // 18 + 19
    expect(o[`${P}txtTax22`]).toBe("600.00"); // 21A + 21B
    expect(o[`${P}txtTax23`]).toBe("10,000.00"); // 20 − 22
    expect(o[`${P}txtTax24D`]).toBe("50.00");
    expect(o[`${P}txtTax25`]).toBe("10,050.00"); // 23 + 24D
  });

  it("a Year-branch modal row routes to the from-year-end column; amended=No gates item 21A to 0", () => {
    const o = computeForm(FORM_1601C, { ...state, [`${P}j_id217:_1`]: "" }, {
      sectionA: [{ [`${SA}SelMonthYear`]: "Y", [`${SA}TxtShouldTaxDue`]: "5,000.00", [`${SA}TxtTaxPaid`]: "3,000.00" }],
    });
    expect(o[`${P}txtTax21A`]).toBe("0.00"); // gated off (not amended)
    expect(o[`${P}txtTax22`]).toBe("100.00"); // 0 + 21B
    expect(o["txtDvTotalAmount7a7b"]).toBe("2,000.00"); // Year branch still Σ(ShouldTaxDue − TaxPaid)
    expect(o[`${P}txtTax23`]).toBe("10,500.00"); // 20 (10,600) − 22 (100)
  });
});

describe.skipIf(!hasForm("1601C"))("native 1601C matches the legacy form (dynamic reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy reconstructs the modal Section A and the chain round-trips", async () => {
    const full: FormState = {
      ...state, [`${P}txtYear`]: "2017", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtPayerName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1601C, full, "84653210700000-1601C-012017.xml", groups);
    // The modal Section A reconstructs (checkSectionADelete marker count) and loadData fills the row by id.
    expect(await value(`${SA}TxtTaxPaid0`)).toBe("3,000.00");
    expect(await value(`${SA}TxtShouldTaxDue0`)).toBe("5,000.00");
    // The scalar chain and the modal total are serialized, so they round-trip.
    expect(await value("txtDvTotalAmount7a7b")).toBe("2,000.00");
    expect(await value(`${P}txtTax25`)).toBe("10,050.00");
    expect(error).toEqual([]);
  }, 120_000);
});
