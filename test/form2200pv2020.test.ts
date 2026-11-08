import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2200PV2020, validate2200Pv2020 } from "@/form/form2200pv2020.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const P = "frm2200P:";
const s1 = (stem: string, row: number | "") => `${P}txtSched1${stem}${row}`;

const input: FormState = {
  [`${P}rdoPg1I2AmendedYes`]: "true",
  [`${P}rdoPg1I2AmendedNo`]: "false",
  [`${P}rdoPg1I12TaxReliefNo`]: "true",
  [`${P}rdoPg1Pt2MOPPaymentActual`]: "true",
  // row 1 (XP010 lubricating oils, P10.00/L) and row 16 (XP140 diesel, P6.00/L): quantities and the due are typed
  [s1("PlaceOfRemoval", 1)]: "batangas ",
  [s1("LocalManuProd", 1)]: "1,000.00",
  [s1("Imported", 1)]: "500.00",
  [s1("TotTaxRemovals", 1)]: "1,500.00",
  [s1("BasicExciseTaxDue", 1)]: "15,000.00",
  [s1("PlaceOfRemoval", 16)]: "limay",
  [s1("TotTaxRemovals", 16)]: "2,000.50",
  [s1("Exports", 16)]: "100.00",
  [s1("TotTaxPaid", 16)]: "100.00",
  [s1("BasicExciseTaxDue", 16)]: "12,003.00",
  // row 26 (an "other" product): ATC digits, description, unit and rate typed
  [`${P}chkBoxSched1ATC26`]: "false",
  [s1("ATC", 26)]: "230",
  [s1("Description", 26)]: "bio blend",
  [s1("UnitOfMeasure", 26)]: "per liter",
  [s1("ApplicableRate", 26)]: "4.50",
  [s1("PlaceOfRemoval", 26)]: "subic",
  [s1("TotTaxRemovals", 26)]: "100.00",
  [s1("BasicExciseTaxDue", 26)]: "450.25",
  [`${P}txtPg1P3I17ABalCarriedOver`]: "1,000.00",
  [`${P}txtPg1P3I17BCredExciseTax`]: "0.50",
  [`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]: "2,000.00",
  [`${P}txtPg1P3I21ASurcharge`]: "300.00",
  [`${P}txtPg1P3I21BInterest`]: "20.00",
  [`${P}txtPg1P3I21CCompromise`]: "5.00",
  [`${P}txtPg1P3I23ATaxPmntDposit`]: "20,000.00",
};
const added = (atc: string, description: string, due: string, extra: Record<string, string> = {}) => ({
  [s1("ATC", "")]: atc,
  [s1("Description", "")]: description,
  [s1("UnitOfMeasure", "")]: "per kg",
  [s1("ApplicableRate", "")]: "3.00",
  [s1("PlaceOfRemoval", "")]: "bataan",
  [s1("BasicExciseTaxDue", "")]: due,
  ...extra,
});
// two added rows (28, 29), counted in sched1AddedRowCount
const groups: GroupState = {
  sched1: [added("240", "solvent", "3,000.00", { [s1("LocalManuProd", "")]: "1,000.00" }), added("250", "white oil", "1,234.56", { [s1("UnderBond", "")]: "10.00" })],
};

describe("2200Pv2020 compute (computeBasicExciseTaxDue + partThreeComputation)", () => {
  it("Σ Basic Excise Tax Due of every row → txtSched1TotalTaxDue → item 16, then the Part III chain", () => {
    const o = computeForm(FORM_2200PV2020, input, groups);
    // 15,000 + 12,003 + 450.25 + 3,000 + 1,234.56
    expect(o[s1("TotalTaxDue", "")]).toBe("31,687.81");
    expect(o[`${P}txtPg1P3I16ExciseTaxDue`]).toBe("31,687.81");
    expect(o[`${P}txtPg1P3I17CTotal`]).toBe("1,000.50");
    expect(o[`${P}txtPg1P3I18NetTaxDue`]).toBe("30,687.31");
    expect(o[`${P}txtPg1P3I20TaxStillDue`]).toBe("28,687.31");
    expect(o[`${P}txtPg1P3I21DTotPenalties`]).toBe("325.00");
    expect(o[`${P}txtPg1P3I22AmountPayable`]).toBe("29,012.31");
    expect(o[`${P}txtPg1P3I23BPenalties`]).toBe("325.00");
    expect(o[`${P}txtPg1P3I23CTotPmntMade`]).toBe("20,325.00");
    expect(o[`${P}txtPg1P3I24BalToCarryOver`]).toBe("8,687.31");
  });

  it("an original return zeroes item 19; no due anywhere leaves the schedule total blank", () => {
    const o = computeForm(FORM_2200PV2020, { ...input, [`${P}rdoPg1I2AmendedYes`]: "false", [`${P}rdoPg1I2AmendedNo`]: "true" }, groups);
    expect(o[`${P}txtPg1P3I19PmntOnRtrnPrevFiled`]).toBe("0.00");
    expect(o[`${P}txtPg1P3I20TaxStillDue`]).toBe("30,687.31");
    expect(computeForm(FORM_2200PV2020, {})[s1("TotalTaxDue", "")]).toBe("");
  });

  it("serializes added rows from 28 with the count, keeps BIR's fixed-row constants, upper-cases free text", () => {
    const rec = new Map(formRecords(FORM_2200PV2020, input, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}sched1AddedRowCount`)).toBe("2");
    expect(rec.get(s1("ATC", 29))).toBe("250");
    expect(rec.get(`${P}chkBoxSched1ATC28`)).toBe("false");
    expect(rec.get(s1("Description", 28))).toBe("SOLVENT");
    expect(rec.get(s1("UnitOfMeasure", 26))).toBe("PER LITER");
    expect(rec.get(s1("PlaceOfRemoval", 1))).toBe("BATANGAS");
    expect(rec.get(s1("ATC", 1))).toBe("XP010");
    expect(rec.get(s1("ApplicableRate", 14))).toBe('5.00"'); // BIR's own markup typo, saved as-is
    expect(rec.has(s1("ATC", 30))).toBe(false);
  });

  it("checkPartVFields: other / added rows need ATC, description, unit and rate; any row needs Place of Removal", () => {
    expect(validate2200Pv2020(computeForm(FORM_2200PV2020, input, groups), groups).filter((p) => p.id.includes("Sched1"))).toEqual([]);
    const bad = validate2200Pv2020({ [s1("Imported", 3)]: "1.00", [s1("ATC", 27)]: "999" }, { sched1: [{ [s1("ATC", "")]: "1" }] });
    expect(bad.map((p) => p.id)).toEqual(expect.arrayContaining([s1("PlaceOfRemoval", 3), s1("Description", 27), s1("Description", 28)]));
  });
});

describe.skipIf(!hasForm("2200Pv2020"))("native 2200Pv2020 matches the legacy form", () => {
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
  const file = "84653210700000-2200Pv2020-06302026.xml";

  it("reopens with every schedule row rebuilt (fixed, other, added) and the chain intact", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200PV2020, state, file, groups);
    // loadData re-runs loadRow once per sched1AddedRowCount, so rows 28–29 exist again and are refilled by id
    expect(await value(s1("ATC", 29))).toBe("250");
    expect(await value(s1("Description", 29))).toBe("WHITE OIL");
    expect(await value(s1("UnderBond", 29))).toBe("10.00");
    expect(await value(s1("BasicExciseTaxDue", 28))).toBe("3,000.00");
    expect(await value(s1("ApplicableRate", 26))).toBe("4.50");
    expect(await value(s1("TotalTaxDue", ""))).toBe("31,687.81");
    expect(await value(`${P}txtPg1P3I24BalToCarryOver`)).toBe("8,687.31");
    expect(await page.locator(`[id="${s1("ATC", 30)}"]`).count()).toBe(0);
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with BIR's form, Schedule 1 populated and recomputed by BIR on page 2", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200PV2020, state, file, groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBeGreaterThan(490);
  }, 120_000);
});
