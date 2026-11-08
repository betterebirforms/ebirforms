import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { atcPickList } from "@/form/atc.ts";
import { F1600VT, FORM_1600VTV2018, ORDER_1600VT, validate1600VTv2018 } from "@/form/form1600vtv2018.ts";
import { hasForm, ORIGINAL, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1600VT:";
const row = (code: string, base: string, rate = "12.0") => ({ [`${P}txtAtcCd`]: code, [`${P}txtPg1P2TaxRate`]: rate, [`${P}txtPg1P2TaxBase`]: base });

const state: FormState = {
  [`${P}txtPg1I1Month`]: "03",
  [`${P}txtPg1I1Year`]: "25",
  [`${P}rdoPg1I2AmendedYes`]: "true",
  [`${P}rdoPg1I3TaxWithheldYes`]: "true",
  [`${P}rdoPg1I10CategoryofWthholdAgentPriv`]: "true",
  [`${P}rdoPg1I12TaxReliefNo`]: "true",
  [`${P}txtPg1P2I19TaxRemittedInRtrn`]: "40,000.00",
  [`${P}txtPg1P2I20OthrPymntsMade`]: "1,000.00",
  [`${P}txtPg1P2I23Surcharge`]: "100.00",
  [`${P}txtPg1P2I24Interest`]: "50.00",
  [`${P}Pg2Sc1TIN1`]: "123456789000",
  [`${P}Pg2Sc1Name1`]: "ACME CORP",
  [`${P}Pg2Sc1ATC1`]: "WV110",
  [`${P}Pg2Sc1AmtOfIncPmt1`]: "10,000.00",
  [`${P}Pg2Sc1TaxRate1`]: "12.00",
  [`${P}Pg2Sc1TIN2`]: "987654321000",
  [`${P}Pg2Sc1Name2`]: "BETA INC",
  [`${P}Pg2Sc1ATC2`]: "WV050",
  [`${P}Pg2Sc1AmtOfIncPmt2`]: "5,000.00",
  [`${P}Pg2Sc1TaxRate2`]: "5.00",
};
// 7 picks on the private list → 5 compute-table rows (items 13–17) + 2 "other selected ATC" rows (indices 6, 7)
const groups: GroupState = {
  atc: [row("WV110", "10,000.00"), row("WV050", "20,000.00"), row("WV060", "30,000.00"), row("WV070", "40,000.00"), row("WV012", "50,000.00")],
  other: [row("WV080", "60,000.00"), row("WV100", "70,000.00")],
};

describe("1600VTv2018 compute (Part II compute + other tables, page-1 chain, Schedule 1)", () => {
  it("Part II rows → other-tax (rows 6+) and 18; 19–27 chain with the item-27 overremittance quirk", () => {
    const o = computeForm(FORM_1600VTV2018, state, groups);
    expect(o[`${P}txtTotalOtherTax`]).toBe("15,600.00"); // 7,200 + 8,400
    expect(o[`${P}txtPg1P2I18TotTaxWithheld`]).toBe("33,600.00"); // 1,200+2,400+3,600+4,800+6,000 + 15,600
    expect(o[`${P}txtPg1P2I21TotTaxPymntsMade`]).toBe("41,000.00");
    expect(o[`${P}txtPg1P2I22TaxStillDueOverremit`]).toBe("-7,400.00");
    expect(o[`${P}txtPg1P2I26TotPenalties`]).toBe("150.00");
    // BIR: 22 < 0 and 26 > 0 → 27 = 26 (the overremittance is dropped, not netted)
    expect(o[`${P}txtPg1P2I27TotAmtStillDueOverremit`]).toBe("150.00");
    expect(o[`${P}Pg2Sc1AmtOfTxWthhld1`]).toBe("1,200.00");
    expect(o[`${P}Pg2Sc1AmtOfTxWthhld2`]).toBe("250.00");
    expect(o[`${P}Pg2Sc1TotTxWthhldAndRmtted`]).toBe("1,450.00");
  });

  it("27 = 22 + 26 otherwise; an original return forces item 19 to 0 (isAmended)", () => {
    const original = { ...state, [`${P}rdoPg1I2AmendedYes`]: "false", [`${P}rdoPg1I2AmendedNo`]: "true" };
    const o = computeForm(FORM_1600VTV2018, original, groups);
    expect(o[`${P}txtPg1P2I19TaxRemittedInRtrn`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I22TaxStillDueOverremit`]).toBe("32,600.00");
    expect(o[`${P}txtPg1P2I27TotAmtStillDueOverremit`]).toBe("32,750.00");
    const noPenalty = computeForm(FORM_1600VTV2018, { ...state, [`${P}txtPg1P2I23Surcharge`]: "0.00", [`${P}txtPg1P2I24Interest`]: "0.00" }, groups);
    expect(noPenalty[`${P}txtPg1P2I27TotAmtStillDueOverremit`]).toBe("-7,400.00");
  });

  it("the picker list per category is BIR's interleaved order; rows map to AtcCode<i> by (code, rate)", () => {
    const code = (s: FormState) => F1600VT.pickList(s).map((e) => e.atc_code);
    expect(code(state)).toEqual(["WV110", "WV050", "WV060", "WV070", "WV012", "WV014", "WV022", "WV024", "WV080", "WV100"]);
    const gov = { ...state, [`${P}rdoPg1I10CategoryofWthholdAgentPriv`]: "false", [`${P}rdoPg1I10CategoryofWthholdAgentGovt`]: "true" };
    expect(code(gov)).toEqual(["WV010", "WV020", "WV110", "WV050", "WV060", "WV070", "WV012", "WV014", "WV022", "WV024", "WV090", "WV100"]);
    // the interleave consumes every atc-list.json entry exactly once
    for (const tag of ["P", "G", "PG"] as const) expect(ORDER_1600VT.filter((t) => t === tag)).toHaveLength(atcPickList("1600VTv2018", tag).length);
    expect(F1600VT.pickIndex(state, groups)).toEqual([0, 1, 2, 3, 4, 8, 9]);
    const record = formRecords(FORM_1600VTV2018, state, groups).filter((r) => r.key.startsWith("AtcCode"));
    expect(record).toHaveLength(10);
    expect(record.filter((r) => r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode2", "AtcCode3", "AtcCode4", "AtcCode5", "AtcCode9", "AtcCode10"]);
  });

  it("flags an off-list ATC, other rows before 5 compute rows, a missing category, and a rate ≥ 100", () => {
    const problem = validate1600VTv2018(
      { ...state, [`${P}rdoPg1I10CategoryofWthholdAgentPriv`]: "false", [`${P}Pg2Sc1TaxRate1`]: "100.00" },
      { atc: [row("WV010", "1.00", "5.0")], other: [row("WV080", "1.00")] },
    );
    expect(problem.map((p) => p.id)).toEqual(
      expect.arrayContaining([`${P}rdoPg1I10CategoryofWthholdAgentPriv`, `${P}txtAtcCd1`, `${P}txtTotalOtherTax`, `${P}Pg2Sc1TaxRate1`]),
    );
  });
});

describe.skipIf(!existsSync(`${ORIGINAL}/xml/atcCodes.xml`))("1600VTv2018 ATC order matches BIR's atcCodes.xml", () => {
  it("loadATC + getPrivate/GovernmentWithholdingAgentATC order", () => {
    const xml = readFileSync(`${ORIGINAL}/xml/atcCodes.xml`, "utf8");
    const count = Number(xml.split("atcCount=")[1]!.match(/^\d+/)![0]);
    const entry: Array<[string, string, string]> = [];
    for (let i = 1; i <= count; i++) {
      const body = xml.split(`atc${i}:`)[1];
      if (body?.includes("1600VTv2018")) entry.push(body.split("~").filter((_, k) => k === 0 || k === 2 || k === 3).map((s) => s.trim()) as [string, string, string]);
    }
    for (const cat of ["P", "G"] as const) {
      const want = entry.filter(([, , c]) => c === cat || c === "PG").map(([a, r]) => `${a}@${r}`);
      const s = { [`${P}rdoPg1I10CategoryofWthholdAgent${cat === "P" ? "Priv" : "Govt"}`]: "true" };
      expect(F1600VT.pickList(s).map((e) => `${e.atc_code}@${e.rate}`)).toEqual(want);
    }
  });
});

describe.skipIf(!hasForm("1600VTv2018"))("native 1600VTv2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  const full: FormState = {
    ...state,
    [`${P}txtPg1TIN1`]: "846",
    [`${P}txtPg1TIN2`]: "532",
    [`${P}txtPg1TIN3`]: "107",
    [`${P}txtPg1TIN4`]: "00000",
    [`${P}txtPg2TinC1`]: "846",
    [`${P}txtPg2TinC2`]: "532",
    [`${P}txtPg2TinC3`]: "107",
    [`${P}txtPg2TinC4`]: "00000",
    [`${P}txtPg1I6RDO`]: "043",
    [`${P}rdoPg1Pt1I6RDO`]: "043",
    [`${P}txtPg1Pt1I7WithholdingAgentsName`]: "DELA CRUZ, JUAN",
    [`${P}txtPg2RegisteredName`]: "DELA CRUZ, JUAN",
    [`${P}txtPg1Pt1I8RegisteredAddress`]: "1 RIZAL ST., QUEZON CITY",
    [`${P}txPg1I8ZipCode`]: "1100",
    [`${P}txtPg1Pt1I9ContactNumber`]: "0281234567",
  };
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy rebuilds both Part II tables from AtcCode, and its own compute functions agree", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1600VTV2018, full, "84653210700000-1600VTv2018-032025.xml", groups);
    for (const i of [1, 5, 9, 10]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(true);
    for (const i of [6, 7, 8]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(false);
    // getATCCode rebuilt 5 compute rows + 2 "other" rows (ids 6, 7); loadDataATCRow refilled them
    expect(await value(`${P}txtAtcCd5`)).toBe("WV012");
    expect(await value(`${P}txtAtcCd7`)).toBe("WV100");
    // run BIR's own computations over the rebuilt rows (the other table is hidden, so no blur reaches it)
    await page.evaluate(() => {
      const w = window as unknown as Record<string, () => void>;
      for (let i = 1; i <= 7; i++) (w.getRequiredWithheld as unknown as (i: number) => void)(i);
      w.computeTotalOtherWithheldTax!();
      w.pageOneTaxWithheldComputation!();
      for (let i = 1; i <= 5; i++) (w.pageTwoComputation as unknown as (i: number) => void)(i);
    });
    expect(await value(`${P}txtPg1P2TaxWithheld7`)).toBe("8,400.00");
    expect(await value(`${P}txtTotalOtherTax`)).toBe("15,600.00");
    expect(await value(`${P}txtPg1P2I18TotTaxWithheld`)).toBe("33,600.00");
    expect(await value(`${P}txtPg1P2I22TaxStillDueOverremit`)).toBe("-7,400.00");
    expect(await value(`${P}txtPg1P2I27TotAmtStillDueOverremit`)).toBe("150.00");
    expect(await value(`${P}Pg2Sc1TotTxWthhldAndRmtted`)).toBe("1,450.00");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with a populated Part II (5 compute + 2 other rows) and Schedule 1", async () => {
    const r = await parityCheck(oracle, FORM_1600VTV2018, full, "84653210700000-1600VTv2018-032025.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
