import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords } from "@/form/schema.ts";
import { FORM_1702EXv2018, validate1702EXv2018 } from "@/form/form1702exv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { fiscalGroups, fiscalLoss, fullRecompute, groups, id, itemized, noMethod, osdOver } from "./form1702ex2018-case.ts";

/** BIR-reload-bug (as in v2018C): sleeptime's FormatValue pass over maxlength-12 inputs rewrites the Sch 3 item-3
 *  pop-up's own "3500.00" as "3,500" on every reopen (same amount). */
const S3I3_ROW = (n: number) => Array.from({ length: n }, (_, i) => id(`txtPg3Pt6S3I3_${i + 1}Col2`));
/** A 2020 return: `YearEnd.value <= 20`, so Part V takes 30%. */
const y2020 = { ...itemized, [id("txtPg1I2YearEnd")]: "20" };

describe("1702EXv2018 compute (item 40 fixed at 0, Part V computed)", () => {
  it("item 40 is not a field (taxRate.xml refills it with 0), so 41 = 0 and a 2025 Part V is 0 too", () => {
    expect(FORM_1702EXv2018.field.some((f) => f.id === id("txtPg2Pt4I40TaxRate"))).toBe(false);
    const c = computeForm(FORM_1702EXv2018, itemized, groups);
    expect(c[id("txtPg2Pt4I39NetTaxable")]).toBe("1,449,000.00");
    expect(c[id("txtPg2Pt4I41TaxDue")]).toBe("0.00");
    expect(c[id("txtPg2Pt5I52RegularIncomeOtherwiseDue")]).toBe("0.00"); // "25" <= 20 is false: item 40's "0"
    expect(c[id("txtPg2Pt5I54TotalTaxReliefAvailment")]).toBe("0.00");
    expect(c[id("txtPg1Pt2I20TotalOverpmt")]).toBe("-89,001.00");
    expect(c[id("txtPg1Pt2I22TotalAmtPayable")]).toBe("1,250.40");
    const rec = new Map(formRecords(FORM_1702EXv2018, itemized, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg2Pt4I40TaxRate"))).toBe("0");
    expect(validate1702EXv2018(itemized, groups).map((p) => p.id)).toContain(id("rdoPg1OverpaymentRefund"));
  });

  it("2018–2020 returns: 52 = 39 × 30%, 53 = 36 × 30%, 54 = 52 + 53", () => {
    const c = computeForm(FORM_1702EXv2018, y2020, groups);
    expect(c[id("txtPg2Pt5I52RegularIncomeOtherwiseDue")]).toBe("434,700.00");
    expect(c[id("txtPg2Pt5I53SpecialAllowableItemizedDeduc")]).toBe("19,500.00");
    expect(c[id("txtPg2Pt5I54TotalTaxReliefAvailment")]).toBe("454,200.00");
    // OSD zeroes 36, so 53 too
    const osd = computeForm(FORM_1702EXv2018, { ...osdOver, [id("txtPg1I2YearEnd")]: "19" }, groups);
    expect(osd[id("txtPg2Pt5I52RegularIncomeOtherwiseDue")]).toBe("549,000.00"); // 1,830,000 × 30%
    expect(osd[id("txtPg2Pt5I53SpecialAllowableItemizedDeduc")]).toBe("0.00");
  });
});

describe.skipIf(!hasForm("1702EXv2018"))("native 1702EXv2018 is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR's own FormatAmount / compTaxReliefAvail / pop-up Save (every page, every input) land on the native save", async () => {
    expect(await fullRecompute(oracle, FORM_1702EXv2018, y2020, "84653210700000-1702EXv2018-122020.xml", groups)).toEqual({ diff: [], missing: [], error: [] });
    expect(await fullRecompute(oracle, FORM_1702EXv2018, itemized, "84653210700000-1702EXv2018-122025.xml", groups)).toEqual({ diff: [], missing: [], error: [] });
    expect(await fullRecompute(oracle, FORM_1702EXv2018, fiscalLoss, "84653210700000-1702EXv2018-062025.xml", fiscalGroups)).toEqual({ diff: [], missing: [], error: [] });
    const osdGroups = { sc3_3: groups.sc3_3!, sc3_6: groups.sc3_6!, sc3_8: groups.sc3_8! };
    expect(await fullRecompute(oracle, FORM_1702EXv2018, osdOver, "84653210700000-1702EXv2018-122025V1.xml", groups, osdGroups)).toEqual({ diff: [], missing: [], error: [] });
    expect(await fullRecompute(oracle, FORM_1702EXv2018, noMethod, "84653210700000-1702EXv2018-082024.xml", {})).toEqual({ diff: [], missing: [], error: [] });
  }, 240_000);

  it("parityCheck: a 2020 itemized return with every pop-up, and OSD amended", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702EXv2018, y2020, "84653210700000-1702EXv2018-122020.xml", groups), S3I3_ROW(2))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702EXv2018, osdOver, "84653210700000-1702EXv2018-122025V1.xml", groups), S3I3_ROW(2))).toEqual([]);
  }, 120_000);

  it("parityCheck: fiscal loss with one-row pop-ups, and no method with cleared dates", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702EXv2018, fiscalLoss, "84653210700000-1702EXv2018-062025.xml", fiscalGroups), S3I3_ROW(1))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702EXv2018, noMethod, "84653210700000-1702EXv2018-082024.xml", {}))).toEqual([]);
  }, 120_000);
});
