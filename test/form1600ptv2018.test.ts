import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { atcPickList } from "@/form/atc.ts";
import { F1600PT, FORM_1600PTV2018, ORDER_1600PT, validate1600PTv2018 } from "@/form/form1600ptv2018.ts";
import { hasForm, ORIGINAL, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1600PT:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCd`]: code, [`${P}txtPg1P2TaxRate`]: rate, [`${P}txtPg1P2TaxBase`]: base });

const state: FormState = {
  [`${P}txtPg1I1Month`]: "07",
  [`${P}txtPg1I1Year`]: "25",
  [`${P}rdoPg1I2AmendedNo`]: "true",
  [`${P}rdoPg1I3TaxWithheldYes`]: "true",
  [`${P}rdoPg1I10CategoryofWthholdAgentGovt`]: "true",
  [`${P}rdoPg1I12TaxReliefYes`]: "true",
  [`${P}txtPg1Pt1I12TaxReliefSpec`]: "SPECIAL LAW",
  [`${P}txtPg1P2I25Compromise`]: "1,000.00",
  [`${P}Pg2Sc1TIN1`]: "123456789000",
  [`${P}Pg2Sc1Name1`]: "ACME TRANSPORT",
  [`${P}Pg2Sc1ATC1`]: "WB030",
  [`${P}Pg2Sc1AmtOfIncPmt1`]: "12,345.67",
  [`${P}Pg2Sc1TaxRate1`]: "3.00",
};
// 8 picks on the government list → 5 compute rows + 3 "other" rows. WB080 appears twice on BIR's list (3% then
// 1%): the 1% row must map to the SECOND entry (AtcCode6), the 3% row to the first (AtcCode5), whatever row order.
const groups: GroupState = {
  atc: [
    row("WB030", "3.0", "10,000.00"),
    row("WB080", "1.0", "20,000.00"),
    row("WB080", "3.0", "30,000.00"),
    row("WB082", "1.0", "40,000.00"),
    row("WB200", "0.6", "50,000.55"),
  ],
  other: [row("WB140", "18.0", "60,000.00"), row("WB180", "30.0", "70,000.00"), row("WB102", "0.0", "1,000.00")],
};

describe("1600PTv2018 compute (shared make1600T graph)", () => {
  it("Part II rows → other-tax and 18; original-return chain; Schedule 1", () => {
    const o = computeForm(FORM_1600PTV2018, state, groups);
    expect(o[`${P}txtTotalOtherTax`]).toBe("31,800.00"); // 10,800 + 21,000 + 0
    expect(o[`${P}txtPg1P2I18TotTaxWithheld`]).toBe("33,900.00"); // 300+200+900+400+300.00 (0.6% of 50,000.55) + 31,800
    expect(o[`${P}txtPg1P2I22TaxStillDueOverremit`]).toBe("33,900.00");
    expect(o[`${P}txtPg1P2I26TotPenalties`]).toBe("1,000.00");
    expect(o[`${P}txtPg1P2I27TotAmtStillDueOverremit`]).toBe("34,900.00");
    expect(o[`${P}Pg2Sc1AmtOfTxWthhld1`]).toBe("370.37");
    expect(o[`${P}Pg2Sc1TotTxWthhldAndRmtted`]).toBe("370.37");
    // item 12 = No clears 12A (availTaxRelief)
    expect(computeForm(FORM_1600PTV2018, { ...state, [`${P}rdoPg1I12TaxReliefYes`]: "false", [`${P}rdoPg1I12TaxReliefNo`]: "true" })[`${P}txtPg1Pt1I12TaxReliefSpec`]).toBe("");
  });

  it("lists 31 government / 6 private entries in BIR's order and maps duplicate codes by rate", () => {
    expect(F1600PT.pickList(state)).toHaveLength(31);
    const priv = { ...state, [`${P}rdoPg1I10CategoryofWthholdAgentGovt`]: "false", [`${P}rdoPg1I10CategoryofWthholdAgentPriv`]: "true" };
    expect(F1600PT.pickList(priv).map((e) => `${e.atc_code}@${e.rate}`)).toEqual(["WB080@3.0", "WB080@1.0", "WB082@3.0", "WB082@1.0", "WB084@3.0", "WB084@1.0"]);
    for (const tag of ["P", "G", "PG"] as const) expect(ORDER_1600PT.filter((t) => t === tag)).toHaveLength(atcPickList("1600PTv2018", tag).length);
    expect(F1600PT.pickIndex(state, groups)).toEqual([0, 5, 4, 7, 19, 14, 18, 25]);
    const record = formRecords(FORM_1600PTV2018, state, groups).filter((r) => r.key.startsWith("AtcCode"));
    expect(record).toHaveLength(31);
    expect(record.filter((r) => r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode5", "AtcCode6", "AtcCode8", "AtcCode15", "AtcCode19", "AtcCode20", "AtcCode26"]);
  });

  it("flags a code picked twice at the same rate, rows with item 3 = No, and an empty 12A", () => {
    const problem = validate1600PTv2018(
      { ...state, [`${P}rdoPg1I3TaxWithheldYes`]: "false", [`${P}rdoPg1I3TaxWithheldNo`]: "true", [`${P}txtPg1Pt1I12TaxReliefSpec`]: "" },
      { atc: [row("WB030", "3.0", "1.00"), row("WB030", "3.0", "1.00")] },
    );
    expect(problem.map((p) => p.id)).toEqual(expect.arrayContaining([`${P}txtAtcCd2`, `${P}rdoPg1I3TaxWithheldYes`, `${P}txtPg1Pt1I12TaxReliefSpec`]));
  });
});

describe.skipIf(!existsSync(`${ORIGINAL}/xml/atcCodes.xml`))("1600PTv2018 ATC order matches BIR's atcCodes.xml", () => {
  it("loadATC + getPrivate/GovernmentWithholdingAgentATC order", () => {
    const xml = readFileSync(`${ORIGINAL}/xml/atcCodes.xml`, "utf8");
    const count = Number(xml.split("atcCount=")[1]!.match(/^\d+/)![0]);
    const entry: string[][] = [];
    for (let i = 1; i <= count; i++) {
      const body = xml.split(`atc${i}:`)[1];
      if (body?.includes("1600PTv2018")) entry.push(body.split("~").map((s) => s.trim()));
    }
    for (const cat of ["P", "G"] as const) {
      const want = entry.filter((e) => e[3] === cat || e[3] === "PG").map((e) => `${e[0]}@${e[2]}`);
      const s = { [`${P}rdoPg1I10CategoryofWthholdAgent${cat === "P" ? "Priv" : "Govt"}`]: "true" };
      expect(F1600PT.pickList(s).map((e) => `${e.atc_code}@${e.rate}`)).toEqual(want);
    }
  });
});

describe.skipIf(!hasForm("1600PTv2018"))("native 1600PTv2018 matches the legacy form", () => {
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

  it("legacy rebuilds both Part II tables (duplicate-code boxes included), and its own compute functions agree", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1600PTV2018, full, "84653210700000-1600PTv2018-072025.xml", groups);
    for (const i of [1, 5, 6, 8, 15, 19, 20, 26]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(true);
    for (const i of [7, 9, 10]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(false);
    expect(await value(`${P}txtAtcCd2`)).toBe("WB080");
    expect(await value(`${P}txtAtcCd8`)).toBe("WB102");
    await page.evaluate(() => {
      const w = window as unknown as Record<string, (i?: number) => void>;
      for (let i = 1; i <= 8; i++) w.getRequiredWithheld!(i);
      w.computeTotalOtherWithheldTax!();
      w.pageOneTaxWithheldComputation!();
      w.pageTwoComputation!(1);
    });
    expect(await value(`${P}txtPg1P2TaxWithheld2`)).toBe("200.00");
    expect(await value(`${P}txtPg1P2TaxWithheld5`)).toBe("300.00");
    expect(await value(`${P}txtTotalOtherTax`)).toBe("31,800.00");
    expect(await value(`${P}txtPg1P2I18TotTaxWithheld`)).toBe("33,900.00");
    expect(await value(`${P}txtPg1P2I27TotAmtStillDueOverremit`)).toBe("34,900.00");
    expect(await value(`${P}Pg2Sc1TotTxWthhldAndRmtted`)).toBe("370.37");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with a populated Part II (5 compute + 3 other rows, duplicate codes) and Schedule 1", async () => {
    const r = await parityCheck(oracle, FORM_1600PTV2018, full, "84653210700000-1600PTv2018-072025.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
