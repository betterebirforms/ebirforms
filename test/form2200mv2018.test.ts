import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2200MV2018, validate2200Mv2018 } from "@/form/form2200mv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const P = "frm2200M:";
const s1 = (stem: string, row: number) => `${P}txtSched1_${stem}${row}`;

const input: FormState = {
  [`${P}rdoPg1I2AmendedYes`]: "true",
  [`${P}rdoPg1I2AmendedNo`]: "false",
  [`${P}rdoPg1I12TaxReliefYes`]: "true",
  [`${P}txtPg1I12TaxReliefSpecify`]: " peza registered ",
  [`${P}rdoPg1Pt2MOPPrepayment`]: "true",
  // row 1 (coal, 2018): column C has its own odd id
  [s1("PlaceOfRemoval", 1)]: "semirara ",
  [s1("VOMRITaxableA", 1)]: "1,000.00",
  [`${P}LocallyExtractedRate1`]: "900.00",
  [s1("LocallyExtractedTaxDueF", 1)]: "45,000.00",
  // row 4 (XM020): local + imported; only column F reaches item 16
  [s1("PlaceOfRemoval", 4)]: "rizal",
  [s1("LocallyExtractedRateC", 4)]: "250,000.00",
  [s1("LocallyExtractedTaxDueF", 4)]: "10,000.00",
  [s1("ImportedTaxableG", 4)]: "100,000.00",
  [s1("ImportedTaxDue", 4)]: "4,000.00",
  [s1("TotalTaxDue", 4)]: "14,000.00",
  // row 9 (XM060 other metallic mineral, typed description and rates)
  [`${P}chkBoxSched1Description9`]: "false",
  [s1("description", 9)]: "nickel ore",
  [s1("PlaceOfRemoval", 9)]: "surigao",
  [s1("LocallyExtractedRateC", 9)]: "50,000.00",
  [s1("LocallyExtractedTaxRateE", 9)]: "4.00",
  [s1("LocallyExtractedTaxDueF", 9)]: "2,000.25",
  [s1("ImportedTaxRate", 9)]: "4.00",
  [`${P}txtPg1P3I17ABalCarriedOver`]: "500.00",
  [`${P}txtPg1P3I17BCredExciseTax`]: "250.00",
  [`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]: "1,000.00",
  [`${P}txtPg1P3I21ASurcharge`]: "100.00",
  [`${P}txtPg1P3I21BInterest`]: "50.00",
  [`${P}txtPg1P3I21CCompromise`]: "25.00",
  [`${P}txtPg1P3I23ATaxPmntDposit`]: "60,000.00",
};
const added = (description: string, place: string, f: string, extra: Record<string, string> = {}) => ({
  [`${P}txtSched1_description`]: description,
  [`${P}txtSched1_PlaceOfRemoval`]: place,
  [`${P}txtSched1_LocallyExtractedTaxDueF`]: f,
  ...extra,
});
// two added rows (11, 12): XM060 again, counted in sched1AddedRowCount
const groups: GroupState = {
  sched1: [
    added("copper conc", "cebu", "1,500.50", { [`${P}txtSched1_LocallyExtractedRateC`]: "37,512.50", [`${P}txtSched1_LocallyExtractedTaxRateE`]: "4.00" }),
    added("zinc", "benguet", "750.00", { [`${P}txtSched1_ImportedTaxableG`]: "10,000.00", [`${P}txtSched1_ImportedTaxDue`]: "400.00", [`${P}txtSched1_TotalTaxDue`]: "1,150.00" }),
  ],
};

describe("2200Mv2018 compute (computeTotalTaxDue + partThreeComputation)", () => {
  it("Σ column F of every row → TotalExciseTaxDue → item 16, then the Part III chain", () => {
    const o = computeForm(FORM_2200MV2018, input, groups);
    // 45,000 + 10,000 + 2,000.25 + 1,500.50 + 750 — the imported 4,000 / 400 and the Total Tax Due column are NOT added
    expect(o[`${P}TotalExciseTaxDue`]).toBe("59,250.75");
    expect(o[`${P}txtPg1P3I16ExciseTaxDue`]).toBe("59,250.75");
    expect(o[`${P}txtPg1P3I17CTotal`]).toBe("750.00");
    expect(o[`${P}txtPg1P3I18NetTaxDue`]).toBe("58,500.75");
    expect(o[`${P}txtPg1P3I20TaxStillDue`]).toBe("57,500.75");
    expect(o[`${P}txtPg1P3I21DTotPenalties`]).toBe("175.00");
    expect(o[`${P}txtPg1P3I22AmountPayable`]).toBe("57,675.75");
    expect(o[`${P}txtPg1P3I23BPenalties`]).toBe("175.00");
    expect(o[`${P}txtPg1P3I23CTotPmntMade`]).toBe("60,175.00");
    expect(o[`${P}txtPg1P3I24BalToCarryOver`]).toBe("-2,499.25");
  });

  it("an original return zeroes item 19; an all-empty column F leaves TotalExciseTaxDue blank", () => {
    const o = computeForm(FORM_2200MV2018, { ...input, [`${P}rdoPg1I2AmendedYes`]: "false", [`${P}rdoPg1I2AmendedNo`]: "true" }, groups);
    expect(o[`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]).toBe("0.00");
    expect(o[`${P}txtPg1P3I20TaxStillDue`]).toBe("58,500.75");
    const empty = computeForm(FORM_2200MV2018, {}, {});
    expect(empty[`${P}TotalExciseTaxDue`]).toBe("");
    expect(empty[`${P}txtPg1P3I16ExciseTaxDue`]).toBe("0.00");
  });

  it("radio gates: tax relief No blanks 12A, actual-removal payment blanks the Others description", () => {
    const o = computeForm(FORM_2200MV2018, {
      ...input,
      [`${P}rdoPg1I12TaxReliefYes`]: "false",
      [`${P}rdoPg1I12TaxReliefNo`]: "true",
      [`${P}rdoPg1Pt2MOPPaymentActual`]: "true",
      [`${P}rdoPg1Pt2MOPPrepayment`]: "false",
      [`${P}txtPg1Pt2MOPOtherDesc`]: "x",
    });
    expect(o[`${P}txtPg1I12TaxReliefSpecify`]).toBe("");
    expect(o[`${P}txtPg1Pt2MOPOtherDesc`]).toBe("");
    expect(computeForm(FORM_2200MV2018, input)[`${P}txtPg1I12TaxReliefSpecify`]).toBe("PEZA REGISTERED");
  });

  it("serializes added rows from index 11 with the XM060 ATC, the count, and the copied description", () => {
    const rec = new Map(formRecords(FORM_2200MV2018, input, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}sched1AddedRowCount`)).toBe("2");
    expect(rec.get(`${P}txtSched1ATC11`)).toBe("XM060");
    expect(rec.get(`${P}txtSched1ATC12`)).toBe("XM060");
    expect(rec.get(`${P}chkBoxSched1Description12`)).toBe("false");
    expect(rec.get(s1("description", 11))).toBe("COPPER CONC");
    expect(rec.get(s1("descriptionCont", 11))).toBe("COPPER CONC");
    expect(rec.get(s1("descriptionCont", 9))).toBe("NICKEL ORE");
    expect(rec.get(s1("PlaceOfRemoval", 1))).toBe("SEMIRARA");
    expect(rec.has(s1("description", 13))).toBe(false);
  });

  it("checkPartVFields: a row with entries needs Place of Removal and a description where BIR asks for one", () => {
    expect(validate2200Mv2018(computeForm(FORM_2200MV2018, input, groups), groups).filter((p) => p.id.includes("Sched1"))).toEqual([]);
    const bad = validate2200Mv2018({ [s1("VOMRITaxableA", 2)]: "1.00", [s1("description", 10)]: "lead" }, { sched1: [{ [`${P}txtSched1_PlaceOfRemoval`]: "x" }] });
    expect(bad.map((p) => p.id)).toEqual(expect.arrayContaining([s1("PlaceOfRemoval", 2), s1("PlaceOfRemoval", 10), s1("description", 11)]));
  });
});

describe.skipIf(!hasForm("2200Mv2018"))("native 2200Mv2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input,
    [`${P}txtPg1I1Month`]: "06", [`${P}txtPg1I1Day`]: "30", [`${P}txtPg1I1Year`]: "2026",
    [`${P}txtPg1TIN1`]: "846", [`${P}txtPg1TIN2`]: "532", [`${P}txtPg1TIN3`]: "107", [`${P}txtPg1TIN4`]: "00000",
    [`${P}txtPg2TinC1`]: "846", [`${P}txtPg2TinC2`]: "532", [`${P}txtPg2TinC3`]: "107", [`${P}txtPg2TinC4`]: "00000",
    [`${P}txtPg1I5RDO`]: "043", [`${P}rdoPg1Pt1I6RDO`]: "043", [`${P}txtPg1Pt1I6RegisteredName`]: "DELA CRUZ, JUAN",
    [`${P}txtPg1Pt1I7RegisteredAddress`]: "1 Rizal St., Quezon City", [`${P}txPg1I7ZipCode`]: "1100", [`${P}txtPg1Pt1I8ContactNumber`]: "0281234567",
  };
  const file = "84653210700000-2200Mv2018-06302026.xml";

  it("reopens with every schedule row rebuilt (fixed, other, added) and the chain intact", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200MV2018, state, file, groups);
    // loadData re-runs loadRow once per sched1AddedRowCount, so rows 11–12 exist again and are refilled by id
    expect(await value(s1("description", 12))).toBe("ZINC");
    expect(await value(s1("ImportedTaxDue", 12))).toBe("400.00");
    expect(await value(s1("LocallyExtractedTaxDueF", 11))).toBe("1,500.50");
    expect(await value(s1("description", 9))).toBe("NICKEL ORE");
    expect(await value(`${P}LocallyExtractedRate1`)).toBe("900.00");
    expect(await value(`${P}TotalExciseTaxDue`)).toBe("59,250.75");
    expect(await value(`${P}txtPg1P3I16ExciseTaxDue`)).toBe("59,250.75");
    expect(await value(`${P}txtPg1P3I24BalToCarryOver`)).toBe("-2,499.25");
    expect(await page.locator(`[id="${P}txtSched1_TotalTaxDue13"]`).count()).toBe(0);
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with BIR's form, Schedule 1 populated and recomputed by BIR on page 2", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200MV2018, state, file, groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBeGreaterThan(280);
  }, 120_000);
});
