import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2000OTV2018, validate2000OTv2018 } from "@/form/form2000otv2018.ts";
import { floatSum, ONE_TIME_RATE, taxDue2000OTv2018 } from "@/form/dst.ts";
import { formatMoney } from "@/form/money.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const P = "frm2000OT:";
const A = `${P}sched1A:`;
const B = `${P}sched1B:`;
const S2 = `${P}Sched2:`;
const due = (...arg: Parameters<typeof taxDue2000OTv2018>) => {
  const v = taxDue2000OTv2018(...arg);
  return v === null ? null : formatMoney(v);
};

describe("2000OTv2018 rate engine (TaxComputation, case for case)", () => {
  it("DO102 shares: P1.50 per FULL P200 of par value (BIR floors)", () => {
    expect(due("DO102", "shares", 1_250_100.5, 0, 0)).toBe("9,375.00"); // floor(6,250.50) × 1.50
    expect(due("DO102", "shares", 399.99, 0, 0)).toBe("1.50");
    expect(due("DO102", "shares", 0, 0, 0)).toBe("0.00");
  });
  it("DO125 shares: 50% of the DST paid on the original issue", () => {
    expect(due("DO125", "shares", 0, 1_234.57, 0)).toBe("617.28"); // 617.285 is the double 617.28499…: toFixed rounds DOWN
  });
  it("DO122 real property: P15 per P1,000 with Math.round (under P500 of remainder pays nothing)", () => {
    expect(due("DO122", "property", 0, 0, 1_700_000.5)).toBe("25,500.00");
    expect(due("DO122", "property", 0, 0, 2_345_600)).toBe("35,190.00"); // 2,345.6 → 2,346
    expect(due("DO122", "property", 0, 0, 999_499.99)).toBe("14,985.00"); // 999.49999 → 999
    expect(due("DO122", "property", 0, 0, 1_500)).toBe("30.00"); // 1.5 → 2
  });
  it("a mismatched ATC / nature is BIR's NaN × 0 → 0.00; no nature or no ATC leaves 17 alone", () => {
    expect(due("DO122", "shares", 1_000, 1_000, 1_000)).toBe("0.00");
    expect(due("DO102", "property", 1_000, 1_000, 1_000)).toBe("0.00");
    expect(due("DO125", "property", 1_000, 1_000, 1_000)).toBe("0.00");
    expect(due("DO102", "", 1_000, 0, 0)).toBeNull();
    expect(due("", "shares", 1_000, 0, 0)).toBeNull();
  });
  it("Schedule 1B's sums are BIR's float running sums, which can fall just short of a P200 step", () => {
    const par = floatSum(["119.41", "24.11", "56.48"]);
    expect(par).toBe(199.99999999999997); // exact sum 200.00
    expect(due("DO102", "shares", par, 0, 0)).toBe("0.00"); // BIR loses the whole P1.50 step
    expect(due("DO125", "shares", 0, floatSum(["899.29", "324.84"]), 0)).toBe("612.06"); // exact would be 612.07
  });
});

const base: FormState = {
  [`${P}txtTransactionDate`]: "05/31/2024",
  [`${P}AmendedRtn_1`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "Dela Cruz, Juan",
  [`${P}txtAddress`]: "1 Rizal St., Quezon City",
  [`${P}txtZipCode`]: "1100",
  [`${P}txtTelNum`]: "0281234567",
  [`${P}txtLineBus`]: "Realty",
  [`${P}optParty_2`]: "true",
  [`${P}txtOtherName`]: "Santos, Maria",
  [`${P}txtOtherTIN`]: "123456789",
  [`${P}txtTax18`]: "500.00",
  [`${P}txtTax20A`]: "100.00",
  [`${P}txtTax20B`]: "50.25",
  [`${P}txtTax20C`]: "1,000.00",
};
const lot = (oct: string, col1: string, col2: string) => ({
  [`${A}txtOCTNo`]: oct, [`${A}txtTaxDecNo`]: `td-${oct}`, [`${A}txtLoc`]: "Quezon City",
  [`${A}txtLot`]: `lot ${oct}`, [`${A}txtClassification`]: "res", [`${A}txtArea`]: "250 sqm", [`${A}txtFMVCol1`]: col1, [`${A}txtFMVCol2`]: col2,
});
const share = (name: string, par: string, paid: string) => ({
  [`${B}txtNameOfCorpStock`]: name, [`${B}txtNoOfSharesSold`]: "1000", [`${B}txtStockCertNo`]: "c-1", [`${B}txtParValOfShares`]: par, [`${B}txtDSTPaid`]: paid,
});
const property: FormState = { ...base, [`${P}ATC_2`]: "true", [`${P}rbTransNature_2`]: "true", [`${P}txtRealLocation`]: "Diliman, Quezon City", [`${S2}txtGrossSellingPrice`]: "1,650,000.00" };
const propertyGroups: GroupState = { sched1A: [lot("T-1", "1,000,000.00", "1,200,000.50"), lot("T-2", "500,000.00", "300,000.00")] };
const shares: FormState = { ...base, [`${P}ATC_1`]: "true", [`${P}rbTransNature_1`]: "true" };
const sharesGroups: GroupState = { sched1B: [share("Acme Corp.", "1,000,000.00", "0.00"), share("Beta Inc.", "250,100.50", "0.00")] };

describe("2000OTv2018 form (schedules → items 14–21)", () => {
  it("DO122 real property: FMV subtotals → total → max(GSP, FMV) → 15 → 17; 19 = 17 − 18; 21 = 19 + 20D", () => {
    const o = computeForm(FORM_2000OTV2018, property, propertyGroups);
    expect(o[`${A}txtFMVTotal`]).toBe("1,700,000.50");
    expect(o[`${S2}txtTotalFairMarket`]).toBe("1,700,000.50");
    expect(o[`${S2}txtTaxableBase`]).toBe("1,700,000.50");
    expect(o[`${P}txtTax15`]).toBe("1,700,000.50");
    expect(o[`${P}txtTax16`]).toBe("P15 / P1,000");
    expect(o[`${P}txtTax17`]).toBe("25,500.00");
    expect(o[`${P}txtTax19`]).toBe("25,000.00");
    expect(o[`${P}txtTax20D`]).toBe("1,150.25");
    expect(o[`${P}txtTax21`]).toBe("26,150.25");
  });
  it("an 'other' taxable base overrides max(GSP, FMV); an overpayment doesn't offset penalties", () => {
    const o = computeForm(FORM_2000OTV2018, { ...property, [`${S2}txtOthers`]: "zonal", [`${S2}txtOthersAmount`]: "999,499.99", [`${P}txtTax18`]: "20,000.00" }, propertyGroups);
    expect(o[`${P}txtTax15`]).toBe("999,499.99");
    expect(o[`${P}txtTax17`]).toBe("14,985.00");
    expect(o[`${P}txtTax19`]).toBe("-5,015.00");
    expect(o[`${P}txtTax21`]).toBe("1,150.25");
  });
  it("DO102 shares: 14 = Σ par value, 17 floors; not amended zeroes 18", () => {
    const o = computeForm(FORM_2000OTV2018, { ...shares, [`${P}AmendedRtn_1`]: "false", [`${P}AmendedRtn_2`]: "true" }, sharesGroups);
    expect(o[`${P}txtTax14`]).toBe("1,250,100.50");
    expect(o[`${P}txtTax15`]).toBe("0.00");
    expect(o[`${P}txtTax17`]).toBe("9,375.00");
    expect(o[`${P}txtTax18`]).toBe("0.00");
    expect(o[`${P}txtTax21`]).toBe("10,525.25");
  });
  it("saves BIR's format: everything upper-cased by capital(), item 16 the ATC's rate text, rows paired", () => {
    const record = new Map(formRecords(FORM_2000OTV2018, { ...shares, [`${P}ATC_1`]: "false", [`${P}ATC_3`]: "true" }, sharesGroups).map((r) => [r.key, r.value]));
    expect(record.get(`${P}txtTax16`)).toBe(ONE_TIME_RATE.DO125.toUpperCase());
    expect(record.get(`${B}txtNameOfCorpStock0`)).toBe("ACME CORP.");
    expect(record.get(`${B}txtStockCertNo1`)).toBe("C-1");
    expect(record.get("chkSchedule1BDelete1")).toBe("false");
    expect(record.get(`${P}txtPg2TIN1`)).toBe("846");
    const prop = new Map(formRecords(FORM_2000OTV2018, property, propertyGroups).map((r) => [r.key, r.value]));
    expect(prop.get(`${A}txtFMVSubTot0`)).toBe("1,200,000.50");
    expect(prop.get(`${A}txtLot1`)).toBe("LOT T-2");
    expect(prop.get("chkSchedule1A1Delete1")).toBe("false");
    expect(prop.get(`${A}txtOCTNo4`)).toBe(""); // BIR's blank rows 2–4 stay
  });
  it("validates BIR's checks", () => {
    expect(validate2000OTv2018(property, propertyGroups)).toEqual([]);
    const id = validate2000OTv2018({ ...base, [`${P}txtTransactionDate`]: "12/31/2017", [`${P}rbTransNature_3`]: "true" }).map((p) => p.id);
    expect(id).toEqual(expect.arrayContaining([`${P}txtTransactionDate`, `${P}ATC_1`, `${P}txtRealLocation`]));
  });
});

/** Re-pick the saved ATC as a filer would: BIR's reload never re-runs SelectedATC, so without this click it leaves
 *  items 14–17 and the taxable base exactly as loaded and the check would only cover the FMV totals and 19–21. */
const RECLICK_ATC = `(() => { const c = document.querySelector('input[name="frm2000OT:ATC"]:checked'); if (c) { SelectedATC(c.value); TaxComputation(); } })()`;

describe.skipIf(!hasForm("2000OTv2018"))("native 2000OTv2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  const scenario: Array<[string, FormState, GroupState]> = [
    ["do122-fmv", property, propertyGroups],
    ["do122-gsp", { ...property, [`${S2}txtGrossSellingPrice`]: "2,345,600.00", [`${P}rbTransNature_2`]: "false", [`${P}rbTransNature_3`]: "true" }, propertyGroups],
    ["do122-other", { ...property, [`${S2}txtOthers`]: "zonal", [`${S2}txtOthersAmount`]: "999,499.99", [`${P}txtTax18`]: "20,000.00" }, propertyGroups],
    ["do122-many", property, { sched1A: [...propertyGroups.sched1A!, lot("T-3", "1.00", "0.50"), lot("T-4", "250.25", "250.25"), lot("T-5", "0.00", "750.00"), lot("T-6", "1,000.00", "999.99")] }],
    ["do102", shares, sharesGroups],
    ["do102-float", shares, { sched1B: [share("A", "119.41", "0.00"), share("B", "24.11", "0.00"), share("C", "56.48", "0.00")] }],
    ["do125-float", { ...shares, [`${P}ATC_1`]: "false", [`${P}ATC_3`]: "true", [`${P}AmendedRtn_1`]: "false", [`${P}AmendedRtn_2`]: "true", [`${P}txtTax18`]: "0.00" }, { sched1B: [share("A", "0.00", "899.29"), share("B", "0.00", "324.84"), share("C", "0.00", "0.00"), share("D", "5.00", "1.01")] }],
    ["mismatch", { ...shares, [`${P}ATC_1`]: "false", [`${P}ATC_2`]: "true" }, { ...sharesGroups, ...propertyGroups }],
  ];

  it("BIR's reload (no ATC re-pick) keeps the native figures: parityCheck over every scenario", async () => {
    for (const [name, s, g] of scenario) {
      const r = await parityCheck(oracle, FORM_2000OTV2018, s, `84653210700000-2000OTv2018-${name}.xml`, g);
      expect(parityProblem(r), name).toEqual([]);
    }
  }, 240_000);

  it("BIR's own TaxComputation (ATC re-picked, every page blurred) recomputes the same save", async () => {
    for (const [name, s, g] of scenario) {
      const r = await allPageParityCheck(oracle, FORM_2000OTV2018, s, `84653210700000-2000OTv2018-${name}b.xml`, g, RECLICK_ATC);
      expect(parityProblem(r), name).toEqual([]);
      expect(r.key_count, name).toBeGreaterThan(120);
    }
  }, 240_000);
});
