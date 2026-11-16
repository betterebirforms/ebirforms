import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Savefile } from "@/lib/savefile.ts";
import { computeAll, formRecords, groupsFromSavefile, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1707Av2021, validate1707Av2021 } from "@/form/form1707av2021.ts";
import { parseSched1Csv, parseSched2Csv, placeSchedCsv } from "@/form/form1707a.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1707Av2021:";

const input: FormState = {
  [`${P}txtS1C5CapitalGainsI1`]: "80,000.00", [`${P}txtS1C5CapitalGainsI2`]: "30,000.00",
  [`${P}txtS1C6TaxPaidI1`]: "1,000.00",
  [`${P}txtS2C5CapitalLossI1`]: "10,000.00",
  [`${P}txtI16ApplicableTaxRate`]: "15",
  [`${P}txtI18ASurcharge`]: "100.00", [`${P}txtI18BInterest`]: "50.00", [`${P}txtI18CCompromise`]: "25.00",
};

describe("1707Av2021 compute", () => {
  it("flat applicable rate (TRAIN 15%) and the 12→19 chain", () => {
    const o = computeAll(FORM_1707Av2021, input);
    expect(o[`${P}txtI12TotalCapitalGains`]).toBe("110,000.00");
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("100,000.00");
    expect(o[`${P}txtI15TaxDue`]).toBe("15,000.00"); // 100,000 × 15%
    expect(o[`${P}txtI16CTotalTaxPaid`]).toBe("1,000.00");
    expect(o[`${P}txtI17TaxStillPayable`]).toBe("14,000.00");
    expect(o[`${P}txtI19TotalAmountPayable`]).toBe("14,175.00");
  });
  it("net loss → tax due floors at 0, parentheses on the net", () => {
    const o = computeAll(FORM_1707Av2021, { [`${P}txtS2C5CapitalLossI1`]: "5,000.00", [`${P}txtI16ApplicableTaxRate`]: "15" });
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("(5,000.00)");
    expect(o[`${P}txtI15TaxDue`]).toBe("0.00");
  });
});

describe.skipIf(!hasForm("1707Av2021"))("native 1707Av2021 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1707Av2021 computes the same values", async () => {
    const state: FormState = {
      ...input, [`${P}txtI1YearEndMonth`]: "12", [`${P}txtI1YearEndDay`]: "31", [`${P}txtI1YearEndYear`]: "2021",
      [`${P}txtI5TIN1`]: "846", [`${P}txtI5TIN2`]: "532", [`${P}txtI5TIN3`]: "107", [`${P}txtI5BranchMask`]: "00000",
      [`${P}rdoI6RDO`]: "043", [`${P}txtI8RegisteredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1707Av2021, state, "84653210700000-1707Av2021-12312021.xml");
    expect(await value(`${P}txtI14NetCapitalGainLoss`)).toBe("100,000.00");
    expect(await value(`${P}txtI15TaxDue`)).toBe("15,000.00");
    expect(await value(`${P}txtI17TaxStillPayable`)).toBe("14,000.00");
    expect(await value(`${P}txtI19TotalAmountPayable`)).toBe("14,175.00");
    expect(error).toEqual([]);
  }, 120_000);
});

// BIR's "(more...)" pop-ups on the TRAIN edition take over row 4 (not 7) of each schedule
const S1 = (c: string) => `${P}txtS1${c}_{i}`;
const S2 = (c: string) => `${P}txtS2${c}_{i}`;
const more1: GroupRow[] = [
  { [S1("C1DateOfTransaction")]: "02/10/2021", [S1("C2NameOfCorporateStock")]: "alpha corp", [S1("C3SellingPrice")]: "30,000.00", [S1("C4Cost")]: "20,000.00", [S1("C6TaxPaid")]: "100.00" },
  { [S1("C1DateOfTransaction")]: "02/11/2021", [S1("C2NameOfCorporateStock")]: "BETA INC", [S1("C3SellingPrice")]: "5,000.50", [S1("C4Cost")]: "1,000.25", [S1("C6TaxPaid")]: "0.00" },
  { [S1("C1DateOfTransaction")]: "02/12/2021", [S1("C2NameOfCorporateStock")]: "GAMMA", [S1("C3SellingPrice")]: "9,000.00", [S1("C4Cost")]: "2,000.00", [S1("C6TaxPaid")]: "50.00" },
];
const more2: GroupRow[] = [
  { [S2("C1DateOfTransaction")]: "03/01/2021", [S2("C2NameOfCorporateStock")]: "delta", [S2("C3SellingPrice")]: "1,000.00", [S2("C4Cost")]: "4,000.00" },
  { [S2("C1DateOfTransaction")]: "03/02/2021", [S2("C2NameOfCorporateStock")]: "EPSILON", [S2("C3SellingPrice")]: "2,000.00", [S2("C4Cost")]: "2,500.50" },
];
const groups: GroupState = { sched1more: more1, sched2more: more2 };
const full: FormState = {};
for (let i = 1; i <= 3; i++) Object.assign(full, { [`${P}txtS1C1DateOfTransactionI${i}`]: "01/15/2021", [`${P}txtS1C2NameOfCorporateStockI${i}`]: `STOCK ${i}`, [`${P}txtS1C3SellingPriceI${i}`]: "1,000.00", [`${P}txtS1C4CostI${i}`]: "400.00", [`${P}txtS1C5CapitalGainsI${i}`]: "600.00" });
for (let i = 1; i <= 3; i++) Object.assign(full, { [`${P}txtS2C1DateOfTransactionI${i}`]: "01/16/2021", [`${P}txtS2C2NameOfCorporateStockI${i}`]: `LOSER ${i}`, [`${P}txtS2C3SellingPriceI${i}`]: "100.00", [`${P}txtS2C4CostI${i}`]: "300.00", [`${P}txtS2C5CapitalLossI${i}`]: "200.00" });
const moreState: FormState = {
  ...full, [`${P}txtI16ApplicableTaxRate`]: "15", [`${P}txtI1YearEndMonth`]: "12", [`${P}txtI1YearEndDay`]: "31", [`${P}txtI1YearEndYear`]: "2021",
  [`${P}txtI5TIN1`]: "846", [`${P}txtI5TIN2`]: "532", [`${P}txtI5TIN3`]: "107", [`${P}txtI5BranchMask`]: "00000",
  [`${P}rdoI6RDO`]: "043", [`${P}txtI8RegisteredName`]: "DELA CRUZ, JUAN",
};

describe("1707Av2021 (more...) pop-ups: Schedule 1 and 2 overflow rows", () => {
  const record = formRecords(FORM_1707Av2021, moreState, groups);
  const value = (key: string) => record.find((r) => r.key === key)?.value;
  it("saves each pop-up row under BIR's _<n> ids, with the length and the modal totals", () => {
    expect(value("ModalSched1Length")).toBe("3");
    expect(value("ModalSched2Length")).toBe("2");
    expect(value(`${P}txtS1C2NameOfCorporateStock_1`)).toBe("ALPHA CORP");
    expect(value(`${P}txtS1C5CapitalGains_2`)).toBe("4,000.25");
    expect(value(`${P}txtS2C5CapitalLoss_1`)).toBe("3,000.00");
    expect(value(`${P}txtS1ModalTotalSellingPrice`)).toBe("44,000.50");
    expect(value(`${P}txtS1ModalTotalCapitalGains`)).toBe("21,000.25");
    expect(value(`${P}txtS1ModalTotalTaxPaid`)).toBe("150.00");
    expect(value(`${P}txtS2ModalTotalCapitalLoss`)).toBe("3,500.50");
  });
  it("row 4 (not 7) reads OTHERS with the pop-up totals and feeds totals 20 / 21", () => {
    expect(value(`${P}txtS1C2NameOfCorporateStockI4`)).toBe("OTHERS");
    expect(value(`${P}txtS1C1DateOfTransactionI4`)).toBe("");
    expect(value(`${P}txtS1C3SellingPriceI4`)).toBe("44,000.50");
    expect(value(`${P}txtS1C6TaxPaidI4`)).toBe("150.00");
    expect(value(`${P}txtS2C2NameOfCorporateStockI4`)).toBe("OTHERS");
    expect(value(`${P}txtS2C5CapitalLossI4`)).toBe("3,500.50");
    expect(value(`${P}txtS1I20TotalSellingPrice`)).toBe("47,000.50"); // 3 x 1,000 + 44,000.50
    expect(value(`${P}txtS1I20TotalCapitalGains`)).toBe("22,800.25"); // 3 x 600 + 21,000.25
    expect(value(`${P}txtS2I21TotalCapitalLoss`)).toBe("4,100.50"); // 3 x 200 + 3,500.50
  });
  it("a pop-up with no rows leaves row 4 alone", () => {
    const blank = formRecords(FORM_1707Av2021, full);
    expect(blank.find((r) => r.key === "ModalSched1Length")?.value).toBe("0");
    expect(blank.find((r) => r.key === `${P}txtS1C2NameOfCorporateStockI4`)?.value).toBe("");
  });
  it("reads the rows back from the savefile", () => {
    const back = groupsFromSavefile(FORM_1707Av2021, { record, trailer_year: 2014, is_final_copy: false } satisfies Savefile, "1707Av2021");
    expect(back.sched1more?.length).toBe(3);
    expect(back.sched1more?.[1]?.[S1("C2NameOfCorporateStock")]).toBe("BETA INC");
    expect(back.sched2more?.[0]?.[S2("C4Cost")]).toBe("4,000.00");
  });
  it("validate: a lone pop-up row is refused and names row 4", () => {
    expect(validate1707Av2021(moreState, groups).filter((p) => /pop-up|row 4/.test(p.message))).toEqual([]);
    const lone = validate1707Av2021(moreState, { sched1more: [more1[0]!] });
    expect(lone.find((p) => p.id === "ModalSched1Length")?.message).toMatch(/row 4/);
  });
  it("CSV import fills the 4 fixed rows, then the pop-up (row 4's own content first when empty)", () => {
    const csv = parseSched1Csv(Array.from({ length: 6 }, (_, i) => `01/0${i + 1}/2021,s${i},100,50,50,5`).join("\n"));
    const placed = placeSchedCsv(1, computeAll(FORM_1707Av2021, {}), [], csv);
    expect(placed.state[`${P}txtS1C2NameOfCorporateStockI4`]).toBe("S3");
    expect(placed.state[`${P}txtS1C2NameOfCorporateStockI5`]).toBeUndefined();
    expect(placed.more.length).toBe(1 + 2); // row 4 own content, then the 2 rows that did not fit
    expect(placed.more[2]![S1("C2NameOfCorporateStock")]).toBe("S5");
    expect(parseSched2Csv("01/02/2021,a,1,2,1").length).toBe(1);
  });
});

describe.skipIf(!hasForm("1707Av2021"))("native 1707Av2021 (more...) pop-ups match the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with BIR: both pop-ups holding rows, reloaded through loadData", async () => {
    const r = await parityCheck(oracle, FORM_1707Av2021, moreState, "84653210700000-1707Av2021-12312021.xml", groups);
    expect(r.missing.filter((k) => /_\d|Modal/.test(k))).toEqual([]);
    expect(r.equal_count).toBeGreaterThan(30);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
