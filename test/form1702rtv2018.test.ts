import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords } from "@/form/schema.ts";
import { FORM_1702RTv2018, validate1702RTv2018 } from "@/form/form1702rtv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { evenNol, fiscal, fiscalGroups, groups, id, itemized, osdLoss, stuckNolco, tinyNol, youngLoss } from "./form1702rt2018-case.ts";

describe("1702RTv2018 compute (the superseded edition's fixed rates)", () => {
  const o = computeForm(FORM_1702RTv2018, itemized, groups);
  const v = (s: string) => o[id(s)];

  it("shares the 2018 chain: 33, Sch I/II with modals, NOLCO, 37, 39", () => {
    expect(v("txtPg2Pt4I33TotalGross")).toBe("3,950,000");
    expect(v("txtPg3Sc1I18TotalOrdinaryAllowable")).toBe("2,371,000");
    expect(v("txtPg2Pt4I37TotalItemized")).toBe("2,644,000");
    expect(v("txtPg2Pt4I39NetTaxable")).toBe("1,306,000");
  });

  it("RCIT is a fixed 30% (40 is not editable), MCIT a computed 2% of 33, 57 = 35 × 30%", () => {
    expect(FORM_1702RTv2018.field.some((f) => f.id === id("Pg2Pt4I40IncomeTaxRate"))).toBe(false);
    expect(v("txtPg2Pt4I41IncomeTaxDue")).toBe("391,800"); // 1,306,000 × 30%, the entered 25 is ignored
    expect(v("txtPg2Pt4I42MinimumCorporate")).toBe("79,000"); // 3,950,000 × 2%
    expect(v("txtPg2Pt4I43TotalIncomeTax")).toBe("391,800");
    expect(v("txtPg2Pt5I57SpecialAllowable")).toBe("12,900"); // 43,000 × 30%
    expect(v("txtPg2Pt5I59TotalTax")).toBe("14,900");
    expect(v("txtPg2Pt4I55TotalTaxCredits")).toBe("212,000");
    expect(v("txtPg1Pt2I21TotalAmount")).toBe("181,050"); // 391,800 − 212,000 + 1,250
    const rec = new Map(formRecords(FORM_1702RTv2018, itemized, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("Pg2Pt4I40IncomeTaxRate"))).toBe("30%");
  });

  it("MCIT beats RCIT on a thin margin; without IC055 42 is 0; Sch IV C8 is clamped at 0", () => {
    const thin = computeForm(FORM_1702RTv2018, { ...itemized, [id("txtPg2Pt4I30LessCost")]: "9,000,000" }, groups);
    expect(thin[id("txtPg2Pt4I39NetTaxable")]).toBe("-1,694,000");
    expect(thin[id("txtPg2Pt4I41IncomeTaxDue")]).toBe("0");
    expect(thin[id("txtPg2Pt4I42MinimumCorporate")]).toBe("19,000"); // 950,000 × 2%
    expect(thin[id("txtPg2Pt4I43TotalIncomeTax")]).toBe("19,000");
    const young = computeForm(FORM_1702RTv2018, youngLoss, groups);
    expect(young[id("txtPg2Pt4I42MinimumCorporate")]).toBe("0");
    const over = computeForm(FORM_1702RTv2018, { ...itemized, [id("txtPg4Sc4I1C6")]: "50,000" }, groups);
    expect(over[id("txtPg4Sc4I1C8")]).toBe("0"); // 30k − 75k, clamped (v2018C keeps the negative)
    expect(validate1702RTv2018({ ...osdLoss, [id("rdoPg1Pt1I13ItemizedDeduction")]: "true" }).length).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasForm("1702RTv2018"))("native 1702RTv2018 is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-1702RTv2018-122025.xml";

  it("itemized + MCIT + every modal populated", async () => {
    const r = await parityCheck(oracle, FORM_1702RTv2018, itemized, file, groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBeGreaterThan(258);
  }, 120_000);

  it("OSD with a negative gross, amended, overpayment carried over", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018, osdLoss, "84653210700000-1702RTv2018-122025V1.xml", groups))).toEqual([]);
  }, 120_000);

  it("no MCIT, an itemized loss, NOLCO rows that break BIR's checks (both chain outcomes)", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018, youngLoss, file, {}))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018, stuckNolco, file, groups))).toEqual([]);
  }, 120_000);

  it("fiscal year-end with centavo inputs and one-row modals; Sch IIIA row 4 at and under 1,000", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018, fiscal, "84653210700000-1702RTv2018-062025.xml", fiscalGroups))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018, tinyNol, file, {}))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018, evenNol, file, {}))).toEqual([]);
  }, 120_000);
});
