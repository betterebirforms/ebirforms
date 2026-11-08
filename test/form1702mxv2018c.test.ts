import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formRecords, fromSavefile, type FormSchema, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1702MXv2018C, P, validate1702MXv2018C } from "@/form/form1702mxv2018c.ts";
import { NegativeValue, formatCurrencyWOC, round2, wocCents } from "@/form/form1702mx-bir.ts";
import { periodName1702MX } from "@/form/form1702mx-label.ts";
import { legacyUnescape, parseSavefile, serializeSavefile } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { OSD_ORDER, allow, fullRecompute, groups, id, invalid, itemized, loss, osd, row } from "./form1702mx2018-case.ts";

const rec = (schema: FormSchema, s: FormState, g: GroupState = groups) => {
  const m = new Map(formRecords(schema, s, g).map((r) => [r.key, r.value]));
  return (k: string) => m.get(id(k));
};

describe("1702MXv2018C compute (BIR's own functions, replayed in BIR's order)", () => {
  const v = rec(FORM_1702MXv2018C, itemized);

  it("Schedule 2 per column: 3 = 1 − 2, 5 = 3 − 4, 7 = 5 + 6, 8 ← Sch 5, 9 ← Sch 6, 10 ← Sch 8 / Sch 7, D = A + B + C", () => {
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2Itm3${c}`))).toEqual(["4,900,000", "7,800,000", "11,700,000", "24,400,000"]);
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2Itm5${c}`))).toEqual(["2,900,000", "4,300,000", "5,700,000", "12,900,000"]);
    // 6C "120,000.40": setToZeroIfEmpty rounds a typed amount to the peso
    expect(v("txtPg2Sc2Itm6C")).toBe("120,000");
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2Itm7${c}`))).toEqual(["2,950,000", "4,375,000", "5,820,000", "13,145,000"]);
    // Sch 5 18 = Σ items 1–17i (17i = the 3-row modal "OTHERS": 1,500 / 2,600 / 12,700)
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg3Sc5Itm18${c}`))).toEqual(["756,500", "1,140,600", "1,888,700", "3,785,800"]);
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2Itm8${c}`))).toEqual(["756,500", "1,140,600", "1,888,700", "3,785,800"]);
    // Sch 6 5 = rows 1–3 + the one-row modal (100 / 200 / 300)
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2Itm9${c}`))).toEqual(["11,100", "22,200", "33,300", "66,600"]);
    // 10B = Sch 8 total (60k − (10k + 0 + 20k) applied 20k), 10C = Sch 7 total (150k + 80k)
    expect([v("txtPg2Sc2It10B"), v("txtPg2Sc2It10C"), v("txtPg2Sc2It10D")]).toEqual(["20,000", "230,000", "250,000"]);
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2It11${c}`))).toEqual(["767,600", "1,182,800", "2,152,000", "4,102,400"]);
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2It13${c}`))).toEqual(["2,182,400", "3,192,200", "3,668,000", "9,042,600"]);
  });

  it("taxes: 15B at the special rate on GROSS sales (BIR bug: item 1B, not 3B), 15C = 13C × rate, MCIT 18C vs 15C, 19D → item 14", () => {
    expect(v("txtPg2Sc2It15B")).toBe("400,000"); // 8,000,000 × 5% (3B 7.8M ≥ 7B 4.375M picks item 1B)
    expect(v("txtPg2Sc2It15C")).toBe("917,000"); // 3,668,000 × 25%
    expect([v("txtPg2Sc2It15D"), v("txtPg2Sc2It17B"), v("txtPg2Sc2It17C"), v("txtPg2Sc2It17D")]).toEqual(["1,317,000", "380,000", "917,000", "1,297,000"]);
    expect([v("txtPg2Sc2It18C"), v("txtPg2Sc2It19B"), v("txtPg2Sc2It19C"), v("txtPg2Sc2It19D")]).toEqual(["110,000", "380,000", "917,000", "1,297,000"]);
    expect(v("txtPg1Pt2I14TotalIncome")).toBe("1,297,000");
    const mcit = rec(FORM_1702MXv2018C, { ...itemized, [id("txtPg2Sc2It18C")]: "950,000" });
    expect(mcit("txtPg2Sc2It19C")).toBe("950,000");
    expect(mcit("txtPg2Sc2It19D")).toBe("1,330,000");
  });

  it("credits: Sch 3 totals per column, 23C ← Sch 9's applied excess MCIT, page 1 15 / 16 / 20 / 21", () => {
    // Sch 9: C = max(B − A, 0); G = C − (D + E + F); 4 = Σ F = 15,000 + 4,000
    expect([v("txtPg7Sc9I1CC"), v("txtPg7Sc9I1CG"), v("txtPg7Sc9I2CG"), v("txtPg7Sc9I4"), v("txtPg2Sc3It23C")]).toEqual(["30,000", "5,000", "6,000", "19,000", "19,000"]);
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc3It32${c}`))).toEqual(["7,600", "20,050", "166,300", "193,950"]);
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc3It33${c}`))).toEqual(["0", "359,950", "750,700", "1,103,050"]); // 33A is never computed
    expect([v("txtPg1Pt2I15LessTotalTax"), v("txtPg1Pt2I16NetTaxPayable"), v("txtPg1Pt2I20TotalPenalties"), v("txtPg1Pt2I21TotalAmount")]).toEqual([
      "193,950", "1,103,050", "1,250", "1,104,300",
    ]);
  });

  it("Schedule 4 (tax relief) and Schedule 10 (reconciliation → item 10 of Schedule 2's bottom line)", () => {
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc4Itm3${c}`))).toEqual(["780,000", "1,040,000", "50,000", "1,870,000"]);
    expect([v("txtPg2Sc4Itm4B"), v("txtPg2Sc4Itm5B"), v("txtPg2Sc4Itm7D")]).toEqual(["400,000", "640,000", "1,471,200"]);
    // 10C: −250,000 (data-type negative) + 3,000 + 90 (modal) − (6,000 + 900 (modal) + 300 + 3,100 (modal))
    expect(["A", "B", "C", "D"].map((c) => v(`txtPg2Sc2Itm10${c}`))).toEqual(["1,495,150", "1,993,970", "-257,210", "3,231,910"]);
  });

  it("modals: two or more rows → \"OTHERS\" + the subtotals, one row → that row; counters and row totals", () => {
    expect([v("txtPg3Sc5It17i"), v("txtPg3Sc5Itm17iC"), v("txtCtrmodalPg3Sc5I17i"), v("txtPg3Sc5It17i_3Col5")]).toEqual(["OTHERS", "12,700", "3", "9,000"]);
    expect([v("txtPg3Sc6I4description"), v("txtPg3Sc6I4legal"), v("txtPg3Sc6I4CD"), v("txtCtrmodalPg6Sc6")]).toEqual(["APPRENTICESHIP", "RA 7686", "600", "1"]);
    expect([v("txtPg2Sc3It31"), v("txtPg2Sc3It31D"), v("txtPg2Sc3_2Col1")]).toEqual(["OTHERS", "1,650", "OTHER TCC"]);
    expect([v("txtPg4Sc10Itm8"), v("txtPg4Sc10Itm8C"), v("txtCtrmodalPg7Sc10I8")]).toEqual(["OTHERS", "3,100", "2"]);
  });

  it("saved text: upper-cased (saveXML), names escaped, page headers repeat page 1, the IC055 tick derived from item 10", () => {
    expect(v("txtPg1Pt1I9RegisteredName")).toBe("ABC%20%28PHILS.%29%20INC.");
    expect(v("txtPg2Pt4I32CB")).toBe("RA 7916");
    expect(v("txtPg4RegisteredName")).toBe("ABC (PHILS.) INC.");
    expect(v("txtPg3TIN2")).toBe("532");
    expect([v("chkPg1I5ATCR1"), v("chkPg1I5ATCR2")]).toEqual(["true", "false"]);
    // the special-rate drop-down is rebuilt from item 4 (5%) and keeps its lowest option
    expect(v("drpPg3Sc1I11CB")).toBe("0.05");
    expect(periodName1702MX(itemized)).toBe("1225");
  });

  it("OSD: 12C = 40% of 7C, Sch 5 / Sch 6 column C and the whole Sch 7 zeroed; an overpayment refunded", () => {
    const o = rec(FORM_1702MXv2018C, osd);
    expect([o("txtPg2Sc2It12C"), o("txtPg2Sc2It13C"), o("txtPg2Sc2Itm8C"), o("txtPg3Sc5Itm13C"), o("txtPg6Sc6I1CC"), o("txtPg3IShed7_4A")]).toEqual([
      "2,328,000", "3,492,000", "0", "0", "0", "0",
    ]);
    // BIR's reload leaves 11D / 13D as Σ A..C (computePg2Sc2ColumnD runs last); a fresh tab-through would leave 0 / 13C
    expect([o("txtPg2Sc2It11D"), o("txtPg2Sc2It13D")]).toEqual(["1,950,400", "8,866,600"]);
    expect([o("txtPg2Sc3It27C"), o("txtPg1Pt2I16NetTaxPayable"), o("txtPg1Pt2I21TotalAmount"), o("rdoPg1Pt2I21Refund")]).toEqual(["5,000", "-875,950", "1,250", "true"]);
  });

  it("losses: Sch 7.1 / 8.1 row 7 take this year's NOL; under 4 years no MCIT; another ATC (IC030)", () => {
    const l = rec(FORM_1702MXv2018C, loss, {});
    expect([l("txtPg6Sc7I3"), l("txtPg3IShed7_7Year"), l("txtPg3IShed7_7A"), l("txtPg3IShed7_7E")]).toEqual(["-300,000", "2025", "300,000", "300,000"]);
    expect([l("txtPg4Sc8It3"), l("txtPg4IShed8_7A")]).toEqual(["-200,000", "200,000"]);
    expect([l("chkPg1I5ATCR1"), l("chkPg1I5ATCR2"), l("drpPg3Sc1I11CB")]).toEqual(["false", "true", "0.05"]);
    // a special-rate loss is still taxed at 5% of gross sales (1B 900,000), the regular loss at 0
    expect([l("txtPg2Sc2It15B"), l("txtPg2Sc2It15C"), l("txtPg2Sc2Itm10C")]).toEqual(["45,000", "0", "-300,000"]);
  });

  it("BIR's zeroing: a NOLCO column that tips B+C+D over A, Sch 9 D+E+F over C, a negative or centavo amount", () => {
    const x = rec(FORM_1702MXv2018C, invalid);
    // row 4: B (20,000) > A (10,000) is refused; row 5: D (20,000) would make 110,000 > 100,000, refused
    expect([x("txtPg3IShed7_4B"), x("txtPg3IShed7_4E"), x("txtPg3IShed7_5D"), x("txtPg3IShed7_5E")]).toEqual(["0.00", "10,000", "0.00", "10,000"]);
    expect([x("txtPg7Sc9I1CD"), x("txtPg7Sc9I1CE"), x("txtPg7Sc9I1CF"), x("txtPg7Sc9I1CG")]).toEqual(["0", "0", "0", "30,000"]);
    expect([x("txtPg2Sc2Itm1B"), x("txtPg1Pt2I18")]).toEqual(["1,001", "0"]);
  });

  it("BIR's number helpers: formatCurrencyWOC keeps whole pesos, NegativeValue parenthesises, round(…, 2)", () => {
    expect(formatCurrencyWOC("1234.99")).toBe("1,234");
    expect(formatCurrencyWOC(-0.4)).toBe("-0");
    expect(NegativeValue("-1,234")).toBe("(1,234)");
    expect(NegativeValue("-0")).toBe("(0)");
    expect(wocCents(-123499)).toBe("-1,234");
    expect(round2("1234.565")).toBe("1,234.57");
  });

  it("validation: method of deduction, an overpayment option, blank modal rows; a native save reads back unchanged", () => {
    expect(validate1702MXv2018C(itemized, groups)).toEqual([]);
    const ids = (s: FormState, g: GroupState = groups) => validate1702MXv2018C(s, g).map((p) => p.id);
    expect(ids({ ...itemized, [id("rdoPg1Pt1I13MethodOfDeducItemized")]: "false" })).toContain(id("rdoPg1Pt1I13MethodOfDeducItemized"));
    expect(ids({ ...osd, [id("rdoPg1Pt2I21Refund")]: "false" })).toContain(id("rdoPg1Pt2I21Refund"));
    expect(ids(itemized, { ...groups, sc10_3: [row("txtPg4Sc10Itm3_", ["", "1", "2", "3"])] })).toContain(id("txtPg4Sc10Itm3_1Col1"));
    const file = { record: formRecords(FORM_1702MXv2018C, itemized, groups), trailer_year: 2012 as const, is_final_copy: false };
    const back = fromSavefile(FORM_1702MXv2018C, parseSavefile(serializeSavefile(file)));
    expect(legacyUnescape(back[id("txtPg1Pt1I9RegisteredName")]!)).toBe("ABC (PHILS.) INC.");
    expect(formRecords(FORM_1702MXv2018C, back, groups)).toEqual(file.record);
  });
});

describe.skipIf(!hasForm("1702MXv2018C"))("native 1702MXv2018C is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-1702MXv2018C-1225.xml";

  it("parityCheck: itemized + MCIT, every column and schedule, all six modals populated", async () => {
    const r = await parityCheck(oracle, FORM_1702MXv2018C, itemized, file, groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBe(644); // the template's 588 + 56 modal cells
  }, 120_000);

  it("parityCheck: OSD, amended, an overpayment refunded; losses with a fiscal June year-end, no MCIT, IC030", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018C, osd, `84653210700000-1702MXv2018C-1225V1.xml`, groups))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018C, loss, "84653210700000-1702MXv2018C-0625.xml", {}))).toEqual([]);
  }, 120_000);

  it("parityCheck: NOLCO / MCIT rows BIR refuses, a centavo sale, a negative interest", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018C, invalid, file, groups))).toEqual([]);
  }, 120_000);

  it("BIR's reload shows the native save on the hidden pages and rebuilds every modal's rows", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1702MXv2018C, itemized, file, groups);
    const rows = await page.evaluate(() => ["Pg2Sc3", "Pg3Sc5I17i", "Pg3Sc6", "Pg4Sc10I3", "Pg4Sc10I6", "Pg4Sc10I8"].map((m) => (document.getElementById(`modalTable${m}`) as HTMLTableElement).rows.length));
    expect(rows).toEqual([2, 3, 1, 2, 1, 2]);
    expect(await value(`${P}txtPg2Sc2It15B`)).toBe("400,000");
    expect(await value(`${P}txtPg3Sc5It17i_3Col1`)).toBe("RENT (WAREHOUSE)");
    expect(await value(`${P}txtPg4Sc10Itm1C`)).toBe("(250,000)");
    expect(await value(`${P}txtPg3IShed7_4D`)).toBe("150,000.00");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("pages 2–4 revealed, every input changed and left, BIR's own modal OKs: BIR lands on the native save", async () => {
    expect(await fullRecompute(oracle, FORM_1702MXv2018C, itemized, groups, file)).toEqual({ diff: [], missing: [], error: [] });
    expect(await fullRecompute(oracle, FORM_1702MXv2018C, loss, {}, "84653210700000-1702MXv2018C-0625.xml")).toEqual({ diff: [], missing: [], error: [] });
    expect(await fullRecompute(oracle, FORM_1702MXv2018C, invalid, groups, file)).toEqual({ diff: [], missing: [], error: [] });
    const o = await fullRecompute(oracle, FORM_1702MXv2018C, osd, groups, "84653210700000-1702MXv2018C-1225V1.xml");
    expect([allow(o, OSD_ORDER), o.missing, o.error]).toEqual([[], [], []]);
  }, 200_000);
});

