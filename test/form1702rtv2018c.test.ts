import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords } from "@/form/schema.ts";
import { FORM_1702RTv2018C, formatPeso, model, nolcoRows, validate1702RTv2018C } from "@/form/form1702rtv2018c.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { evenNol, fiscal, fiscalGroups, groups, id, identity, itemized, osdLoss, stuckNolco, tinyNol, youngLoss } from "./form1702rt2018-case.ts";

describe("1702RTv2018C compute (whole-peso chain)", () => {
  const o = computeForm(FORM_1702RTv2018C, itemized, groups);
  const v = (s: string) => o[id(s)];

  it("gross income 27→33 and the itemized deductions 34–37 (Sch I + modal, Sch II + modal, NOLCO)", () => {
    expect(v("txtPg2Pt4I29NetSales")).toBe("9,800,000");
    expect(v("txtPg2Pt4I31GrossIncome")).toBe("3,800,000");
    expect(v("txtPg2Pt4I33TotalGross")).toBe("3,950,000");
    // 15k+250k+40k+1.8M+60k+90k+35k + modal 17i (22k+48k+11k = 81k)
    expect(v("txtPg3Sc1I18TotalOrdinaryAllowable")).toBe("2,371,000");
    expect(v("txtPg2Pt4I34OrdinaryAllowable")).toBe("2,371,000");
    expect(v("txtPg3Sc2I5TotalSpecialAllowable")).toBe("43,000"); // 25k + one-row modal 18k
    expect(v("txtPg4Sc3AI5C6")).toBe("50,000"); // 300k − (0 + 100k + 150k)
    expect(v("txtPg4Sc3AI6C6")).toBe("0");
    expect(v("txtPg4Sc4I8TotalNOLCO")).toBe("230,000");
    expect(v("txtPg2Pt4I36Nolco")).toBe("230,000");
    expect(v("txtPg2Pt4I37TotalItemized")).toBe("2,644,000");
    expect(v("txtPg2Pt4I38OptionalStandard")).toBe("0");
    expect(v("txtPg2Pt4I39NetTaxable")).toBe("1,306,000");
  });

  it("RCIT at the entered rate vs MCIT (42), excess-MCIT Sch IV, credits, net tax and 21", () => {
    expect(v("txtPg2Pt4I41IncomeTaxDue")).toBe("326,500"); // 1,306,000 × 25%
    expect(v("txtPg2Pt4I43TotalIncomeTax")).toBe("326,500"); // RCIT beats the 79,000 MCIT
    expect(v("txtPg4Sc4I1C4")).toBe("30,000");
    expect(v("txtPg4Sc4I1C8")).toBe("5,000"); // 30k − (10k + 0 + 15k)
    expect(v("txtPg4Sc4I2C8")).toBe("6,000");
    expect(v("txtPg4Sc4I4TotalExcessMCIT")).toBe("19,000");
    expect(v("txtPg2Pt4I47ExcessMCIT")).toBe("19,000");
    // 10k+5k+120k+19k+30k+12.5k+0+0(not amended)+2k+3k+10.5k(modal)
    expect(v("txtPg2Pt4I55TotalTaxCredits")).toBe("212,000");
    expect(v("txtPg2Pt4I56NetTax")).toBe("114,500");
    expect(v("txtPg1Pt2I14IncomeTax")).toBe("326,500");
    expect(v("txtPg1Pt2I16NetTax")).toBe("114,500");
    expect(v("txtPg1Pt2I20TotalPenalties")).toBe("1,250");
    expect(v("txtPg1Pt2I21TotalAmount")).toBe("115,750");
    expect(v("txtPg2Pt5I58AddSpecialTax")).toBe("2,000");
    expect(v("txtPg2Pt5I59TotalTax")).toBe("9,500");
    expect(v("txtPg4Sc5I4Total")).toBe("1,284,567");
    expect(v("txtPg4Sc5I9Total")).toBe("295,000");
    expect(v("txtPg4Sc5I10NetTaxableIncome")).toBe("989,567");
  });

  it("MCIT wins when it exceeds the regular tax; without IC055 (under 4 years) 42/45/47 and Sch IV are zeroed", () => {
    const high = computeForm(FORM_1702RTv2018C, { ...itemized, [id("txtPg2Pt4I42MinimumCorporate")]: "400,000" }, groups);
    expect(high[id("txtPg2Pt4I43TotalIncomeTax")]).toBe("400,000");
    const young = { ...itemized, [id("txtPg1Pt1I10")]: "06/01/2023" };
    const m = model((k) => young[k] ?? "", "2018C");
    expect(m.mcit).toBe(false);
    const y = computeForm(FORM_1702RTv2018C, young, groups);
    expect(y[id("txtPg2Pt4I47ExcessMCIT")]).toBe("0");
    expect(y[id("txtPg4Sc4I1C4")]).toBe("0");
    const rec = new Map(formRecords(FORM_1702RTv2018C, young, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("rdoPg1I5Atc"))).toBe("false");
    expect(rec.get(id("txtPg2Pt4I42MinimumCorporate"))).toBe("0");
    expect(rec.get(id("txtPg2Pt4I45IncomeTaxPaymentUnderMCIT"))).toBe("0");
    expect(rec.get(id("txtPg4Sc4I1C1"))).toBe("");
  });

  it("OSD: 38 = 40% of 33, Schedules I–IIIA and 57 are cleared, both methods never saved ticked", () => {
    const osd = { ...itemized, [id("rdoPg1Pt1I13ItemizedDeduction")]: "true", [id("rdoPg1Pt1I13OptionalStandard")]: "true" };
    const c = computeForm(FORM_1702RTv2018C, osd, groups);
    expect(c[id("txtPg2Pt4I37TotalItemized")]).toBe("0");
    expect(c[id("txtPg2Pt4I38OptionalStandard")]).toBe("1,580,000");
    expect(c[id("txtPg2Pt4I39NetTaxable")]).toBe("2,370,000");
    expect(c[id("txtPg3Sc1I18TotalOrdinaryAllowable")]).toBe("0");
    const rec = new Map(formRecords(FORM_1702RTv2018C, osd, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("rdoPg1Pt1I13ItemizedDeduction"))).toBe("false");
    expect(rec.get(id("txtPg3Sc1I13Salaries"))).toBe("0");
    expect(rec.get(id("txtPg3Sc1I17dC1"))).toBe("");
    expect(rec.get(id("txtPg2Pt5I57SpecialAllowable"))).toBe("0");
    expect(validate1702RTv2018C(osd).map((p) => p.id)).toContain(id("rdoPg1Pt1I13OptionalStandard"));
  });

  it("a current-year NOL fills Sch III and Sch IIIA row 4; an overpayment keeps 21 = 16 and needs an option", () => {
    const loss = { ...itemized, [id("txtPg2Pt4I30LessCost")]: "9,500,000", [id("txtPg2Pt4I32AddOtherTaxable")]: "0" };
    const c = computeForm(FORM_1702RTv2018C, loss, groups);
    expect(c[id("txtPg2Pt4I33TotalGross")]).toBe("300,000");
    expect(c[id("txtPg4Sc3I1GrossIncome")]).toBe("300,000");
    expect(c[id("txtPg4Sc3I2TotalDeductions")]).toBe("2,371,000");
    expect(c[id("txtPg4Sc3I3NetOperatingLoss")]).toBe("-2,071,000");
    expect(c[id("txtPg4Sc3AI4C2")]).toBe("2,071,000");
    expect(c[id("txtPg2Pt4I39NetTaxable")]).toBe("-2,344,000");
    expect(c[id("txtPg2Pt4I41IncomeTaxDue")]).toBe("0");
    expect(c[id("txtPg1Pt2I16NetTax")]).toBe("-133,000");
    expect(c[id("txtPg1Pt2I21TotalAmount")]).toBe("1,250"); // BIR: a negative 16 with penalties shows just the penalties
    const rec = new Map(formRecords(FORM_1702RTv2018C, loss, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg4Sc3AI4C1"))).toBe("2025");
    expect(validate1702RTv2018C(loss).map((p) => p.id)).toContain(id("rdoPg1Pt2I21OverpaymentRefunded"));
  });

  it("BIR quirks: whole-peso truncation, lexicographic NOL compare under 1,000, NOLCO else-if zeroing", () => {
    expect(formatPeso(123499)).toBe("1,234");
    expect(formatPeso(-123499)).toBe("-1,234");
    expect(formatPeso(-40)).toBe("-0");
    // Sch I 18 = 100 > 33 = 90 numerically, but "100" > "90" is false as strings: BIR records no NOL
    const tiny = { ...identity, [id("txtPg2Pt4I27Sales")]: "90", [id("txtPg3Sc1I1Amortization")]: "100" };
    expect(model((k) => tiny[k] ?? "", "2018C").amount.txtPg4Sc3AI4C2).toBe(0);
    // row 5 C5 > C2 is zeroed first; row 6's C3+C4+C5 > C2 is zeroed next (C5), then the row check clears row 7
    expect(nolcoRows([
      { C2: "100", C3: "0", C4: "0", C5: "150" },
      { C2: "100", C3: "60", C4: "0", C5: "50" },
      { C2: "100", C3: "120", C4: "0", C5: "0" },
    ])).toEqual([{ C3: false, C4: false, C5: true }, { C3: false, C4: false, C5: true }, { C3: true, C4: true, C5: true }]);
  });

  it("saved records: modal lines, page headers, NumWithParenthesis on plain text, escaped names", () => {
    const rec = new Map(formRecords(FORM_1702RTv2018C, itemized, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg2Pt4I54CtrModal"))).toBe("2");
    expect(rec.get(id("txtPg2Pt4I54C1"))).toBe("OTHERS");
    expect(rec.get(id("txtPg2Pt4I54C2"))).toBe("10,500");
    expect(rec.get(id("txtPg2Pt4I54Subtotal"))).toBe("10,500");
    expect(rec.get(id("txtPg2Pt4I54.2C1"))).toBe("BOI -RA 7916 CREDIT");
    expect(rec.get(id("txtPg3Sc2I4C1"))).toBe("SENIOR CITIZEN DISCOUNT"); // one row: the line is that row
    expect(rec.get(id("txtPg3Sc2I4C3"))).toBe("18,000");
    expect(rec.get(id("txtPg3Sc1I17iC2"))).toBe("81,000");
    expect(rec.get(id("txtPg2TIN3"))).toBe("107");
    expect(rec.get(id("txtPg3RegisteredName"))).toBe("ABC -PHILS. INC.");
    expect(rec.get(id("txtPg1Pt1I8Name1"))).toBe("ABC%20%28PHILS.%29%20INC.");
    expect(rec.get(id("rdoPg1I5Atc"))).toBe("true");
    expect(rec.get(id("txtPg2Pt4I51TaxPaidInReturn"))).toBe("0");
  });
});

describe.skipIf(!hasForm("1702RTv2018C"))("native 1702RTv2018C is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("itemized + MCIT + every modal populated: BIR reloads, recomputes and saves the same records", async () => {
    const r = await parityCheck(oracle, FORM_1702RTv2018C, itemized, "84653210700000-1702RTv2018C-122025.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBeGreaterThan(258);
  }, 120_000);

  it("OSD, a net operating loss and an overpayment carried over", async () => {
    const r = await parityCheck(oracle, FORM_1702RTv2018C, osdLoss, "84653210700000-1702RTv2018C-122025V1.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("a fresh return under 4 years old (no MCIT) with an itemized loss and invalid NOLCO rows", async () => {
    const r = await parityCheck(oracle, FORM_1702RTv2018C, youngLoss, "84653210700000-1702RTv2018C-122025.xml", {});
    expect(parityProblem(r)).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018C, stuckNolco, "84653210700000-1702RTv2018C-122025.xml", groups))).toEqual([]);
  }, 120_000);

  it("fiscal June year-end, centavo inputs truncated, MCIT above RCIT, one-row modals, a stale overpayment tick", async () => {
    const c = computeForm(FORM_1702RTv2018C, fiscal, fiscalGroups);
    expect(c[id("txtPg2Pt4I29NetSales")]).toBe("1,000,000"); // 1,000,000.25 → whole pesos
    expect(c[id("txtPg2Pt4I31GrossIncome")]).toBe("299,999"); // 1,000,000 − 700,000.99 = 299,999.01
    expect(c[id("txtPg2Pt4I43TotalIncomeTax")]).toBe("60,000"); // MCIT 60,000 > RCIT 12,599
    const r = await parityCheck(oracle, FORM_1702RTv2018C, fiscal, "84653210700000-1702RTv2018C-062025.xml", fiscalGroups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("Sch IIIA row 4 under 1,000: BIR's string comparison drops the NOL, and so do we", async () => {
    expect(computeForm(FORM_1702RTv2018C, tinyNol)[id("txtPg4Sc3AI4C6")]).toBe("100"); // the stale first-pass C6
    const r = await parityCheck(oracle, FORM_1702RTv2018C, tinyNol, "84653210700000-1702RTv2018C-122025.xml", {});
    expect(parityProblem(r)).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702RTv2018C, evenNol, "84653210700000-1702RTv2018C-122025.xml", {}))).toEqual([]);
  }, 120_000);
});
