import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, computeGroupRows, formRecords, type FormState } from "@/form/schema.ts";
import { ATTACHMENT_GROUP, FORM_1701v2018 } from "@/form/form1701v2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem, randomFill } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { attachmentGroups, compensation, eightPct, gradItemized, id, identity, joint, mixedOsd, withAttachment } from "./form1701v2018-case.ts";

const v = (o: FormState, k: string) => o[id(k)];
const calc = (s: FormState) => computeForm(FORM_1701v2018, s);

describe("1701v2018 compute (BIR's own page logic, whole-peso schedules)", () => {
  it("graduated rates, 2023 table, itemized: Sched 4/5/6 → 13/14/15, Math.round to whole pesos, 25 = tax on 24", () => {
    const o = calc(gradItemized);
    expect(v(o, "txtPg2IShed3_10A")).toBe("2,400,000.00");
    expect(v(o, "txtPg2IShed3_12A")).toBe("1,500,000.00"); // − 900,000 cost of sales (itemized only)
    expect(v(o, "txtPg3IShed4_18A")).toBe("485,001.00"); // 485,000.50 → Math.round
    expect(v(o, "txtPg2IShed3_13A")).toBe("485,001.00");
    expect(v(o, "txtPg2IShed3_14A")).toBe("20,000.00"); // Sched 5 item 3
    expect(v(o, "txtPg3IShed6_4E")).toBe("40,000.00"); // NOLCO 80,000 − (10,000 + 30,000)
    expect(v(o, "txtPg2IShed3_15A")).toBe("30,000.00"); // NOLCO applied (Sched 6 item 8)
    expect(v(o, "txtPg2IShed3_18A")).toBe("964,999.00");
    expect(v(o, "txtPg2IShed3_22A")).toBe("65,000.00"); // 60,000 + 5,000.40
    expect(v(o, "txtPg2IShed3_24A")).toBe("1,029,999.00");
    expect(v(o, "txtPg2IShed3_25A")).toBe("160,000.00"); // (1,029,999 − 800,000) × 25% + 102,500 = 159,999.75 → toFixed(0)
    expect(v(o, "txtPg1I22ATaxDue")).toBe("160,000.00");
    expect(v(o, "txtPg1I23A")).toBe("38,346.00"); // Part VII 10: 38,345.67 → whole pesos
    expect(v(o, "txtPg1I26A")).toBe("121,654.00");
    expect(v(o, "txtPg1I30A")).toBe("1,500.00");
    expect(v(o, "txtPg1I32AggregateAmtPyble")).toBe("123,154.00");
    expect(v(o, "rdoPg1I21TaxRateG")).toBe("true"); // ATC II012 forces graduated rates
    expect(v(o, "txtPg4IPart9_11A")).toBe("999,000.00");
  });

  it("the 2018–2022 table gives a different graduated tax; a blank / pre-2018 year computes none", () => {
    expect(v(calc({ ...gradItemized, [id("txtPg1I1Year")]: "2022" }), "txtPg2IShed3_25A")).toBe("199,000.00"); // 229,999 × 30% + 130,000
    expect(v(calc({ ...gradItemized, [id("txtPg1I1Year")]: "2017" }), "txtPg2IShed3_25A")).toBe("0.00"); // calcTaxAmt → undefined
  });

  it("8% option (II017): 28 = 26 + 27, 30 = 28 − ₱250,000, 31 = 30 × 8%; the graduated schedule stays zero", () => {
    const o = calc(eightPct);
    expect(v(o, "rdoPg1I21TaxRateP")).toBe("true");
    expect(v(o, "txtPg3IShed3_28A")).toBe("1,850,000.00"); // 1,850,000.25 → whole pesos
    expect(v(o, "txtPg3IShed3_30A")).toBe("1,600,000.00");
    expect(v(o, "txtPg3IShed3_31A")).toBe("128,000.00");
    expect(v(o, "txtPg4ISc6_1A")).toBe("128,000.00");
    expect(v(o, "txtPg1I26A")).toBe("58,000.00");
    expect(v(o, "txtPg1I31ATotalAmtPyble")).toBe("59,000.00");
    expect(v(o, "txtPg2IShed3_10A")).toBe("0.00");
    // BIR's checks: the reduction may not exceed ₱250,000, and gross over the ₱3M VAT threshold is refused
    expect(v(calc({ ...eightPct, [id("txtPg3IShed3_29A")]: "300,000.00" }), "txtPg3IShed3_29A")).toBe("0.00");
    expect(v(calc({ ...eightPct, [id("txtPg3IShed3_26A")]: "3,000,001.00" }), "txtPg3IShed3_26A")).toBe("0.00");
  });

  it("OSD vs itemized: OSD is 40% of 10 and drops cost of sales and Sched 4–6; mixed income adds Sched 2 6 to 24", () => {
    const o = calc(mixedOsd);
    expect(v(o, "txtPg2IShed2_6A")).toBe("510,000.00"); // taxable compensation 600,000 − 90,000
    expect(v(o, "txtPg2IShed2_7A")).toBe("44,500.00"); // 2023 table on 510,000
    expect(v(o, "txtPg2IShed3_17A")).toBe("355,000.00"); // 887,500 × 40%
    expect(v(o, "txtPg2IShed3_18A")).toBe("532,500.00");
    expect(v(o, "txtPg2IShed3_24A")).toBe("1,050,000.00"); // 510,000 + 540,000
    expect(v(o, "txtPg2IShed3_25A")).toBe("165,000.00");
    expect(v(o, "txtPg4IPart7_5A")).toBe("30,000.00"); // Sched 1 3A tax withheld → Part VII 5
    expect(v(o, "txtPg1I26A")).toBe("129,000.00"); // − 1,000 item 25 (≤ 50% of 22)
    const itemized = calc({ ...mixedOsd, [id("rdoPg1I21AMethodDeductionO")]: "false", [id("rdoPg1I21AMethodDeductionI")]: "true", [id("txtPg3IShed4_13A")]: "100,000.00" });
    expect(v(itemized, "txtPg2IShed3_17A")).toBe("0.00");
    expect(v(itemized, "txtPg2IShed3_18A")).toBe("787,500.00"); // 887,500 − 100,000 itemized
    expect(v(calc({ ...mixedOsd, [id("txtPg3IShed4_13A")]: "100,000.00" }), "txtPg3IShed4_13A")).toBe("0.00"); // Sched 4 is off under OSD
    expect(v(calc({ ...mixedOsd, [id("txtPg1I25A")]: "90,000.00" }), "txtPg1I25A")).toBe("0.00"); // more than 50% of 22
  });

  it("joint filing: the spouse column (B) runs its own regime; an overpaid spouse shows just the penalties in 31B", () => {
    const o = calc(joint);
    expect(v(o, "txtPg3IShed3_32A")).toBe("74,100.00"); // taxpayer 8%: 7A 16,500 + 31A 57,600
    expect(v(o, "txtPg2IShed2_7A")).toBe("16,500.00"); // 2024 table on 360,000 compensation
    expect(v(o, "txtPg2IShed1c_1CI")).toBe("420,000.00"); // employer 1 kept although the spouse's ATC clears Sched 1
    expect(v(o, "txtPg2IShed1c_2CI")).toBe("0.00"); // the spouse (II012, business only) has no compensation
    expect(v(o, "rdoPg2I12TaxRateG")).toBe("true");
    expect(v(o, "txtPg2IShed3_13B")).toBe("595,001.00");
    expect(v(o, "txtPg2IShed3_15B")).toBe("15,000.00");
    expect(v(o, "txtPg2IShed3_18B")).toBe("-220,001.00");
    expect(v(o, "txtPg2IShed3_25B")).toBe("0.00");
    expect(v(o, "txtPg4IShed6_12A")).toBe("50,000.00"); // this year's NOL, |400,000 − 450,000|
    expect(v(o, "txtPg4IShed6_12Year")).toBe("2024");
    expect(v(o, "txtPg1I26B")).toBe("-91,500.00");
    expect(v(o, "txtPg1I31BTotalAmtPyble")).toBe("300.00");
    expect(v(o, "txtPg1I32AggregateAmtPyble")).toBe("54,600.00");
    expect(v(o, "rdoPg1OverpaymentRefund")).toBe("true");
    expect(v(o, "rdoPg2I8ForeignTaxCreditsYes")).toBe("true");
    // not filing jointly: every spouse input is reset, and the spouse column computes zero
    const single = calc({ ...joint, [id("rdoPg1I18FilingStatusJ")]: "false", [id("rdoPg1I18FilingStatusS")]: "true" });
    expect([v(single, "txtPg2IShed3_8B"), v(single, "txtPg1I27B"), v(single, "txtPg2I5SpouseName"), v(single, "rdoPg2I4ATC_II012")]).toEqual(["0.00", "0.00", "", "false"]);
    expect(v(single, "txtPg1I32AggregateAmtPyble")).toBe("54,300.00");
  });

  it("compensation only (C → II011): Part VI 1 is Sched 3.B 32 = the tax on taxable compensation", () => {
    const o = calc(compensation);
    expect(v(o, "rdoPg1I7ATC_II011")).toBe("true");
    expect(v(o, "txtPg2IShed2_7A")).toBe("163,000.00"); // 2019 table on 910,000
    expect(v(o, "txtPg1I22ATaxDue")).toBe("163,000.00");
    expect(v(o, "txtPg1I26A")).toBe("63,000.00");
  });

  it("BIR's input checks: NOLCO B + C + D over A is zeroed, deductions below gross income are zeroed, Sched 5 needs a description", () => {
    const o = calc({ ...gradItemized, [id("txtPg3IShed6_5Year")]: "2022", [id("txtPg3IShed6_5A")]: "10,000.00", [id("txtPg3IShed6_5D")]: "20,000.00", [id("txtPg3IShed6_1A")]: "500,000.00", [id("txtPg3IShed6_2A")]: "400,000.00", [id("txtPg3IShed5_2Amt")]: "9,000.00" });
    expect(v(o, "txtPg3IShed6_5D")).toBe("0.00");
    expect(v(o, "txtPg3IShed6_2A")).toBe("0.00");
    expect(v(o, "txtPg3IShed5_2Amt")).toBe("0.00");
    expect(v(calc({ ...gradItemized, [id("txtPg3IShed6_4Year")]: "2019" }), "txtPg3IShed6_4Year")).toBe(""); // more than 3 years back
  });

  it("a second pass is a no-op (the save recomputes the computed state)", () => {
    for (const s of [gradItemized, eightPct, mixedOsd, joint, compensation, randomFill(FORM_1701v2018, identity)]) {
      const once = computeForm(FORM_1701v2018, s);
      expect(computeForm(FORM_1701v2018, once)).toEqual(once);
    }
  });

  it("Part XI attachments: per-activity Sched B/C/D, the regime from Part X option 2, consolidation into Part X and VIII", () => {
    const c = computeForm(FORM_1701v2018, withAttachment, attachmentGroups);
    const sp = computeGroupRows(ATTACHMENT_GROUP.special, attachmentGroups.special, c);
    const ex = computeGroupRows(ATTACHMENT_GROUP.exempt, attachmentGroups.exempt, c);
    const cell = (row: Record<string, string>, key: string, kind: string) => row[id(`${key}${kind}{i}`)];
    expect(cell(ex[0]!, "rdoPg3mExempt", "EX")).toBe("true");
    expect(cell(ex[0]!, "txtPg4mSchedC_18A", "EX")).toBe("177,001.00");
    expect(cell(ex[0]!, "txtPg3mSchedB_13A", "EX")).toBe("379,999.00"); // 850,000 − 300,000 − (177,001 + 5,000) + 12,000
    expect(cell(sp[0]!, "txtPg3mSchedB_15A", "SP")).toBe("35,000.00"); // special rate 5% × 700,000
    expect(cell(sp[1]!, "txtPg3mSchedB_14A", "SP")).toBe("5.13"); // setPercentage: > 2 decimals → toFixed(2)
    expect(cell(sp[1]!, "txtPg3mSchedB_15A", "SP")).toBe("25,650.00");
    expect(v(c, "txtPg1mI1BSchdB")).toBe("2,500,000.00"); // Σ special attachments
    expect(v(c, "txtPg1mI17BSchdB")).toBe("60,650.00");
    expect(v(c, "txtPg2mI18BSchdC")).toBe("110,000.00");
    expect(v(c, "txtPg1mI12DescSchdB")).toBe("OTHERS");
    expect(v(c, "txtPg4IPart8_1A")).toBe("15,000.00"); // Part X 16B × the 5% rate of Sched A 4B
    expect(v(c, "txtPg4IPart8_7A")).toBe("-42,150.00");
    expect(v(c, "txtAttachmentTypes")).toBe("EX1,SP2");
    const rec = new Map(formRecords(FORM_1701v2018, withAttachment, attachmentGroups).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg3mSchedB_15ASP2"))).toBe("25,650.00");
    expect(rec.get(id("rdoPg3mSpecialRateSP1"))).toBe("true");
    expect(rec.get(id("txtPg1I9Address"))).toBe("1%20RIZAL%20ST.%2C%20QUEZON%20CITY"); // both lines in one escaped record
    // option 1 (consolidated): attachments carry no regime and do not feed Part X Sched B
    const opt1 = { ...withAttachment, [id("rdoPg1mOption1")]: "true", [id("rdoPg1mOption2")]: "false" };
    const c1 = computeForm(FORM_1701v2018, opt1, attachmentGroups);
    expect(v(c1, "txtPg1mI1BSchdB")).toBe("0.00");
    expect(cell(computeGroupRows(ATTACHMENT_GROUP.special, attachmentGroups.special, c1)[0]!, "txtPg3mSchedB_15A", "SP")).toBe("0.00");
  });
});

const PAGE = "#Page1Content, #Page2Content, #Page3Content, #Page4Content";

describe.skipIf(!hasForm("1701v2018"))("native 1701v2018 is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = (s: FormState) => `84653210700000-1701v2018-12${s[id("txtPg1I1Year")] ?? ""}.xml`;

  it("reopens with every attachment rebuilt and its figures intact", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1701v2018, withAttachment, file(withAttachment), attachmentGroups);
    expect(await value(id("txtAttachmentTypes"))).toBe("EX1,SP2");
    expect(await value(id("txtPg3mSchedB_13AEX1"))).toBe("379,999.00");
    expect(await value(id("txtPg3mSchedB_15ASP2"))).toBe("25,650.00");
    expect(await value(id("txtPg1I22ATaxDue"))).toBe("160,000.00");
    expect(await page.locator(`[id="${id("rdoPg3mSpecialRateSP2")}"]`).isChecked()).toBe(true);
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  // every page shown and blurred twice, as a filer reviewing the reopened return would
  const cases: Array<[string, FormState, string[]]> = [
    ["single, graduated + itemized (2023 table)", gradItemized, []],
    ["single professional on 8% (2022 table)", eightPct, []],
    ["mixed income on graduated + OSD (2023)", mixedOsd, []],
    // BIR's reload (checkFieldsAfterXMLLoad) ticks the spouse's foreign-tax-credit "No" whatever was saved
    ["joint: taxpayer 8%, spouse graduated + itemized, overpaid (2024)", joint, [id("rdoPg2I8ForeignTaxCreditsYes"), id("rdoPg2I8ForeignTaxCreditsNo")]],
    ["compensation only (2019)", compensation, []],
    ["seeded random fill, single", randomFill(FORM_1701v2018, identity), []],
    ["seeded random fill, joint", randomFill(FORM_1701v2018, { ...identity, [id("rdoPg1I16CivilStatusM")]: "true", [id("rdoPg1I17SpouseIncomeYes")]: "true", [id("rdoPg1I18FilingStatusJ")]: "true", [id("rdoPg2I8ForeignTaxCreditsNo")]: "true", [id("txtPg1I1Year")]: "2023" }), []],
  ];
  for (const [name, state, allow] of cases)
    it(`is 1:1 with every page reviewed: ${name}`, async () => {
      const r = await allPageParityCheck(oracle, FORM_1701v2018, state, file(state), {}, undefined, PAGE);
      expect(parityProblem(r, allow)).toEqual([]);
    }, 120_000);

  it("is 1:1 with Part XI attachments (option 2) and Part VIII relief, page 1 and every page", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1701v2018, withAttachment, file(withAttachment), attachmentGroups))).toEqual([]);
    const r = await allPageParityCheck(oracle, FORM_1701v2018, withAttachment, file(withAttachment), attachmentGroups, undefined, PAGE);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBe(838 + 3 * 115);
  }, 120_000);
});
