import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Savefile } from "@/lib/savefile.ts";
import { computeAll, formRecords, groupsFromSavefile, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { CsvError, FORM_1707A, birRoundAmount, birValidDate, parseSched1Csv, parseSched2Csv, placeSchedCsv, validate1707A } from "@/form/form1707a.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1707A:";
const S1 = (c: string) => `${P}txtS1${c}_{i}`;
const S2 = (c: string) => `${P}txtS2${c}_{i}`;

// gains: 500,000 − 420,000 = 80,000 and 130,000 − 100,000 = 30,000; loss: 50,000 − 40,000 = 10,000
const input: FormState = {
  [`${P}txtS1C3SellingPriceI1`]: "500,000.00", [`${P}txtS1C4CostI1`]: "420,000.00", [`${P}txtS1C6TaxPaidI1`]: "1,000.00",
  [`${P}txtS1C3SellingPriceI2`]: "130,000.00", [`${P}txtS1C4CostI2`]: "100,000.00",
  [`${P}txtS2C3SellingPriceI1`]: "40,000.00", [`${P}txtS2C4CostI1`]: "50,000.00",
  [`${P}txtI18ASurcharge`]: "100.00", [`${P}txtI18BInterest`]: "50.00", [`${P}txtI18CCompromise`]: "25.00",
};

describe("1707A compute", () => {
  it("column 5 = selling − cost (S1) / cost − selling (S2); 5% bracket (net ≤ 100k) and the 12→19 chain", () => {
    const o = computeAll(FORM_1707A, input);
    expect(o[`${P}txtS1C5CapitalGainsI1`]).toBe("80,000.00");
    expect(o[`${P}txtS2C5CapitalLossI1`]).toBe("10,000.00");
    expect(o[`${P}txtI12TotalCapitalGains`]).toBe("110,000.00");
    expect(o[`${P}txtI13TotalCapitalLoss`]).toBe("10,000.00");
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("100,000.00");
    expect(o[`${P}txtI15TaxDue`]).toBe("5,000.00"); // 100,000 × 5%
    expect(o[`${P}txtI16CTotalTaxPaid`]).toBe("1,000.00"); // 16A only; not amended → 16B is 0
    expect(o[`${P}txtI17TaxStillPayable`]).toBe("4,000.00");
    expect(o[`${P}txtI19TotalAmountPayable`]).toBe("4,175.00");
  });
  it("10% bracket above 100k", () => {
    const o = computeAll(FORM_1707A, { [`${P}txtS1C3SellingPriceI1`]: "150,000.00" });
    expect(o[`${P}txtI15TaxDue`]).toBe("10,000.00"); // 5,000 + (50,000 × 10%)
  });
  it("renders negatives as accounting parentheses; tax due floors at 0", () => {
    const o = computeAll(FORM_1707A, { [`${P}txtS1C3SellingPriceI1`]: "10,000.00", [`${P}txtS1C4CostI1`]: "30,000.00" });
    expect(o[`${P}txtS1C5CapitalGainsI1`]).toBe("(20,000.00)"); // a loss row in Schedule 1
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("(20,000.00)");
    expect(o[`${P}txtI15TaxDue`]).toBe("0.00"); // floored
  });
  it("16B counts only on an amended return; the overpayment option only stands for a negative 17", () => {
    const amended = { ...input, [`${P}rdoI2AmemdedYes`]: "true", [`${P}rdoI2AmemdedNo`]: "false", [`${P}txtI16BTotalTaxPaid`]: "500.00" };
    expect(computeAll(FORM_1707A, amended)[`${P}txtI16CTotalTaxPaid`]).toBe("1,500.00");
    expect(computeAll(FORM_1707A, { ...input, [`${P}txtI16BTotalTaxPaid`]: "500.00" })[`${P}txtI16BTotalTaxPaid`]).toBe("0.00");
    expect(computeAll(FORM_1707A, { ...input, [`${P}rdoI19Refund`]: "true" })[`${P}rdoI19Refund`]).toBe("false");
    const over = { ...input, [`${P}txtS1C6TaxPaidI1`]: "9,000.00", [`${P}rdoI19Refund`]: "true" };
    expect(computeAll(FORM_1707A, over)[`${P}txtI17TaxStillPayable`]).toBe("(4,000.00)");
    expect(computeAll(FORM_1707A, over)[`${P}rdoI19Refund`]).toBe("true");
  });
});

describe.skipIf(!hasForm("1707A"))("native 1707A matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input, [`${P}txtI1YearEndMonth`]: "12", [`${P}txtI1YearEndDay`]: "31", [`${P}txtI1YearEndYear`]: "2019",
    [`${P}txtI5TIN1`]: "846", [`${P}txtI5TIN2`]: "532", [`${P}txtI5TIN3`]: "107", [`${P}txtI5BranchMask`]: "00000",
    [`${P}rdoI6RDO`]: "043", [`${P}txtI8RegisteredName`]: "DELA CRUZ, JUAN",
    [`${P}txtS1C1DateOfTransactionI1`]: "03/15/2019", [`${P}txtS1C2NameOfCorporateStockI1`]: "ABC HOLDINGS",
    [`${P}txtS1C1DateOfTransactionI2`]: "07/01/2019", [`${P}txtS1C2NameOfCorporateStockI2`]: "XYZ CORP",
    [`${P}txtS2C1DateOfTransactionI1`]: "09/30/2019", [`${P}txtS2C2NameOfCorporateStockI1`]: "LMN INC",
  };

  it("legacy 1707A computes the same values (incl. parentheses)", async () => {
    const { value, error } = await oracle.openSaved(FORM_1707A, state, "84653210700000-1707A-12312019.xml");
    expect(await value(`${P}txtS1C5CapitalGainsI1`)).toBe("80,000.00");
    expect(await value(`${P}txtI14NetCapitalGainLoss`)).toBe("100,000.00");
    expect(await value(`${P}txtI15TaxDue`)).toBe("5,000.00");
    expect(await value(`${P}txtI17TaxStillPayable`)).toBe("4,000.00");
    expect(await value(`${P}txtI19TotalAmountPayable`)).toBe("4,175.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: a payable return, both schedules filled", async () => {
    const r = await parityCheck(oracle, FORM_1707A, state, "84653210700000-1707A-12312019.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: an amended overpayment (16B live, refund option)", async () => {
    const over: FormState = {
      ...state, [`${P}rdoI2AmemdedYes`]: "true", [`${P}rdoI2AmemdedNo`]: "false", [`${P}txtI16BTotalTaxPaid`]: "6,000.00",
      [`${P}rdoI19Refund`]: "false", [`${P}rdoI19TaxCreditCertificate`]: "true",
    };
    const r = await parityCheck(oracle, FORM_1707A, over, "84653210700000-1707A-12312019.xml");
    expect(r.diff.find((d) => d.key === `${P}txtI17TaxStillPayable`)).toBeUndefined();
    // BIR reload bug, not native: init() runs roundElement over every amount, and Number("(2,000.00)") is NaN, so
    // each "(…)" overpayment loads as "0.00"; checkOverPaymentRadio then sees no ")" and unchecks the choice
    // (the later blurs recompute 17 but never re-check it). BIR's own save of this return reloads the same way.
    expect(r.diff.map((d) => d.key)).toEqual([`${P}rdoI19TaxCreditCertificate`]);
    expect(parityProblem(r, [`${P}rdoI19TaxCreditCertificate`])).toEqual([]);
  }, 120_000);
});

// Schedule 1 row 7 and Schedule 2 row 4 hold "OTHERS" once the (more...) pop-up has rows
const more1: GroupRow[] = [
  { [S1("C1DateOfTransaction")]: "02/10/2019", [S1("C2NameOfCorporateStock")]: "alpha corp", [S1("C3SellingPrice")]: "30,000.00", [S1("C4Cost")]: "20,000.00", [S1("C6TaxPaid")]: "100.00" },
  { [S1("C1DateOfTransaction")]: "02/11/2019", [S1("C2NameOfCorporateStock")]: "BETA INC", [S1("C3SellingPrice")]: "5,000.50", [S1("C4Cost")]: "1,000.25", [S1("C6TaxPaid")]: "0.00" },
  { [S1("C1DateOfTransaction")]: "02/12/2019", [S1("C2NameOfCorporateStock")]: "GAMMA", [S1("C3SellingPrice")]: "9,000.00", [S1("C4Cost")]: "2,000.00", [S1("C6TaxPaid")]: "50.00" },
];
const more2: GroupRow[] = [
  { [S2("C1DateOfTransaction")]: "03/01/2019", [S2("C2NameOfCorporateStock")]: "delta", [S2("C3SellingPrice")]: "1,000.00", [S2("C4Cost")]: "4,000.00" },
  { [S2("C1DateOfTransaction")]: "03/02/2019", [S2("C2NameOfCorporateStock")]: "EPSILON", [S2("C3SellingPrice")]: "2,000.00", [S2("C4Cost")]: "2,500.50" },
];
const groups: GroupState = { sched1more: more1, sched2more: more2 };
const full1: FormState = {};
for (let i = 1; i <= 6; i++) Object.assign(full1, { [`${P}txtS1C1DateOfTransactionI${i}`]: "01/15/2019", [`${P}txtS1C2NameOfCorporateStockI${i}`]: `STOCK ${i}`, [`${P}txtS1C3SellingPriceI${i}`]: "1,000.00", [`${P}txtS1C4CostI${i}`]: "400.00" });
for (let i = 1; i <= 3; i++) Object.assign(full1, { [`${P}txtS2C1DateOfTransactionI${i}`]: "01/16/2019", [`${P}txtS2C2NameOfCorporateStockI${i}`]: `LOSER ${i}`, [`${P}txtS2C3SellingPriceI${i}`]: "100.00", [`${P}txtS2C4CostI${i}`]: "300.00" });
const moreState: FormState = {
  ...full1, [`${P}txtI1YearEndMonth`]: "12", [`${P}txtI1YearEndDay`]: "31", [`${P}txtI1YearEndYear`]: "2019",
  [`${P}txtI5TIN1`]: "846", [`${P}txtI5TIN2`]: "532", [`${P}txtI5TIN3`]: "107", [`${P}txtI5BranchMask`]: "00000",
  [`${P}rdoI6RDO`]: "043", [`${P}txtI8RegisteredName`]: "DELA CRUZ, JUAN",
};

describe("1707A (more...) pop-ups: Schedule 1 and 2 overflow rows", () => {
  const record = formRecords(FORM_1707A, moreState, groups);
  const value = (key: string) => record.find((r) => r.key === key)?.value;
  it("saves each pop-up row under BIR's _<n> ids, with the length and the modal totals", () => {
    expect(value("ModalSched1Length")).toBe("3");
    expect(value("ModalSched2Length")).toBe("2");
    expect(value(`${P}txtS1C2NameOfCorporateStock_1`)).toBe("ALPHA CORP"); // capitalize() on blur
    expect(value(`${P}txtS1C5CapitalGains_1`)).toBe("10,000.00");
    expect(value(`${P}txtS1C5CapitalGains_2`)).toBe("4,000.25");
    expect(value(`${P}txtS1C6TaxPaid_3`)).toBe("50.00");
    expect(value(`${P}txtS2C5CapitalLoss_1`)).toBe("3,000.00");
    expect(value(`${P}txtS2C5CapitalLoss_2`)).toBe("500.50");
    expect(value(`${P}txtS1ModalTotalSellingPrice`)).toBe("44,000.50");
    expect(value(`${P}txtS1ModalTotalCost`)).toBe("23,000.25");
    expect(value(`${P}txtS1ModalTotalCapitalGains`)).toBe("21,000.25");
    expect(value(`${P}txtS1ModalTotalTaxPaid`)).toBe("150.00");
    expect(value(`${P}txtS2ModalTotalSellingPrice`)).toBe("3,000.00");
    expect(value(`${P}txtS2ModalTotalCost`)).toBe("6,500.50");
    expect(value(`${P}txtS2ModalTotalCapitalLoss`)).toBe("3,500.50");
  });
  it("row 7 / row 4 read OTHERS with the pop-up totals and feed totals 20 / 21", () => {
    expect(value(`${P}txtS1C2NameOfCorporateStockI7`)).toBe("OTHERS");
    expect(value(`${P}txtS1C1DateOfTransactionI7`)).toBe("");
    expect(value(`${P}txtS1C3SellingPriceI7`)).toBe("44,000.50");
    expect(value(`${P}txtS1C5CapitalGainsI7`)).toBe("21,000.25");
    expect(value(`${P}txtS1C6TaxPaidI7`)).toBe("150.00");
    expect(value(`${P}txtS2C2NameOfCorporateStockI4`)).toBe("OTHERS");
    expect(value(`${P}txtS2C5CapitalLossI4`)).toBe("3,500.50");
    expect(value(`${P}txtS1I20TotalSellingPrice`)).toBe("50,000.50"); // 6 x 1,000 + 44,000.50
    expect(value(`${P}txtS1I20TotalCapitalGains`)).toBe("24,600.25"); // 6 x 600 + 21,000.25
    expect(value(`${P}txtS2I21TotalCapitalLoss`)).toBe("4,100.50"); // 3 x 200 + 3,500.50
  });
  it("a pop-up with no rows leaves row 7 alone and the template defaults", () => {
    const blank = formRecords(FORM_1707A, input);
    expect(blank.find((r) => r.key === "ModalSched1Length")?.value).toBe("0");
    expect(blank.find((r) => r.key === `${P}txtS1ModalTotalCost`)?.value).toBe("0.00");
    expect(blank.find((r) => r.key === `${P}txtS1C2NameOfCorporateStockI7`)?.value).toBe("");
  });
  it("reads the rows back from the savefile", () => {
    const back = groupsFromSavefile(FORM_1707A, { record, trailer_year: 2014, is_final_copy: false } satisfies Savefile, "1707A");
    expect(back.sched1more?.length).toBe(3);
    expect(back.sched1more?.[1]?.[S1("C2NameOfCorporateStock")]).toBe("BETA INC");
    expect(back.sched2more?.[0]?.[S2("C4Cost")]).toBe("4,000.00");
  });
  it("validate: a lone pop-up row, negative gain and empty rows are refused as BIR's pop-up refuses them", () => {
    expect(validate1707A(moreState, groups).filter((p) => /pop-up|row 7|row 4/.test(p.message))).toEqual([]);
    expect(validate1707A(moreState, { sched1more: [more1[0]!] }).map((p) => p.id)).toContain("ModalSched1Length");
    const bad: GroupRow = { ...more1[0]!, [S1("C4Cost")]: "40,000.00" };
    expect(validate1707A(moreState, { sched1more: [bad, more1[1]!] }).some((p) => /negative/.test(p.message))).toBe(true);
    const empty: GroupRow = { [S2("C1DateOfTransaction")]: "", [S2("C3SellingPrice")]: "0.00" };
    expect(validate1707A(moreState, { sched2more: [empty, more2[0]!] }).some((p) => /empty or incomplete/.test(p.message))).toBe(true);
  });
});

describe("1707A CSV import (BIR's checkCSVData / addToTable)", () => {
  const ok1 = "03/15/2019,abc holdings,500000,420000,80000,1000\n01/02/2020,xyz,1000.5,200,800.5,12.345";
  it("Schedule 1: 6 columns; name upper-cased, gain recomputed, amounts rounded as BIR's roundAmount (truncating)", () => {
    const row = parseSched1Csv(ok1);
    expect(row.length).toBe(2);
    expect(row[0]).toEqual({
      [S1("C1DateOfTransaction")]: "03/15/2019", [S1("C2NameOfCorporateStock")]: "ABC HOLDINGS", [S1("C3SellingPrice")]: "500,000.00",
      [S1("C4Cost")]: "420,000.00", [S1("C5CapitalGains")]: "80,000.00", [S1("C6TaxPaid")]: "1,000.00",
    });
    expect(row[1]![S1("C3SellingPrice")]).toBe("1,000.50");
    expect(row[1]![S1("C5CapitalGains")]).toBe("800.50");
    expect(row[1]![S1("C6TaxPaid")]).toBe("12.34"); // truncated, not rounded
  });
  it("Schedule 2: 5 columns; loss = cost - selling; the 5th column is only a running total", () => {
    const row = parseSched2Csv("09/30/2019,lmn,1000,4000,999");
    expect(row[0]![S2("C5CapitalLoss")]).toBe("3,000.00");
    expect(Object.keys(row[0]!).length).toBe(5);
    expect(() => parseSched2Csv("09/30/2019,lmn,1000,4000,999,1")).toThrow("invalid number of columns in row 1");
  });
  it("BIR's refusals, with its own wording and the row", () => {
    const err = (text: string, parse = parseSched1Csv) => { try { parse(text); } catch (e) { return e as CsvError; } return undefined; };
    expect(err("1/2/2019,a,1,1,1,1")?.message).toMatch(/valid date \(MM\/DD\/YYYY format\) for Column 1 \(Date Of Transaction\) in row 1/);
    expect(err("01/02/2000,a,1,1,1,1")?.message).toMatch(/year should not be less than 2001/);
    expect(err("02/30/2019,a,1,1,1,1")?.message).toMatch(/valid date/);
    expect(err("01/02/2019, ,1,1,1,1")?.message).toMatch(/provide a value for Column 2/);
    expect(err("01/02/2019,123,1,1,1,1")?.message).toMatch(/should not be all numbers in row 1/);
    expect(err("01/02/2019,a,x,1,1,1")?.message).toBe("Column 3 (Selling Price) should be numeric only in row 1");
    expect(err("01/02/2019,a,-1,1,1,1")?.message).toBe("Column 3 (Selling Price) should not be a negative value in row 1");
    expect(err("01/02/2019,a,1,0,1,1")?.message).toBe("Column 4 (Cost) should have a value in row 1");
    expect(err("01/02/2019,a,1,1,1,1\n01/02/2019,a,1,1")?.row).toBe(2);
  });
  it("BIR defects kept: a trailing newline is an empty last row; a zero total in column 5 / 6 refuses the file", () => {
    expect(err0("01/02/2019,a,1,1,1,1\n")).toMatch(/invalid number of columns in row 2/);
    expect(err0("01/02/2019,a,1,1,0,1")).toMatch(/ReferenceError/);
    expect(err0("01/02/2019,a,1,1,1,0")).toMatch(/Column 5 \(TaxPaid\) could cause the total to exceed billions in row 1/);
    // ...unless an earlier total already holds something, which BIR's check adds to
    expect(parseSched1Csv("01/02/2019,a,1,1,0,0", { gainLoss: "5.00", taxPaid: "5.00" }).length).toBe(1);
    expect(parseSched1Csv("01/02/2019,a,1,1,0,1\r\n", {}, true).length).toBe(1); // lenient: no empty last row, no column 5 check
    function err0(text: string): string { try { parseSched1Csv(text); } catch (e) { return (e as Error).message; } return ""; }
  });
  it("CRLF files keep a \\r on the last column, which roundAmount drops", () => {
    expect(parseSched1Csv("01/02/2019,a,100,50,50,7\r\n01/03/2019,b,100,50,50,8\r")[1]![S1("C6TaxPaid")]).toBe("8.00");
  });
  it("roundAmount and validateDate behave as BIR's", () => {
    expect(birRoundAmount("1234567.891")).toBe("1,234,567.89");
    expect(birRoundAmount("-5")).toBe("(5.00)");
    expect(birRoundAmount("1234567890123")).toBe("0.00"); // 13 digits
    expect(birValidDate("02/29/2020")).toBe(true);
    expect(birValidDate("02/29/2019")).toBe(false);
    expect(birValidDate("04/31/2019")).toBe(false);
    expect(birValidDate("13/01/2019")).toBe(false);
  });
  it("placeSchedCsv fills empty rows first, then moves row 7 into the pop-up", () => {
    const rows = parseSched1Csv(Array.from({ length: 9 }, (_, i) => `01/0${i + 1}/2019,s${i},100,50,50,5`).join("\n"));
    const filled = { [`${P}txtS1C1DateOfTransactionI1`]: "01/01/2019", [`${P}txtS1C2NameOfCorporateStockI1`]: "X", [`${P}txtS1C3SellingPriceI1`]: "10.00", [`${P}txtS1C4CostI1`]: "5.00" };
    const placed = placeSchedCsv(1, filled, [], rows);
    expect(placed.state[`${P}txtS1C2NameOfCorporateStockI2`]).toBe("S0");
    expect(placed.state[`${P}txtS1C2NameOfCorporateStockI7`]).toBe("S5");
    expect(placed.state[`${P}txtS1C2NameOfCorporateStockI1`]).toBeUndefined(); // row 1 was taken, left alone
    expect(placed.more.length).toBe(1 + 3); // row 7's own content, then the 3 rows that did not fit
    expect(placed.more[0]![S1("C2NameOfCorporateStock")]).toBe("S5");
    expect(placed.more[3]![S1("C2NameOfCorporateStock")]).toBe("S8");
    const small = placeSchedCsv(2, {}, [], parseSched2Csv("01/02/2019,a,1,2,1"));
    expect(small.more).toEqual([]);
    expect(small.state[`${P}txtS2C5CapitalLossI1`]).toBe("1.00");
  });
});

describe.skipIf(!hasForm("1707A"))("native 1707A (more...) pop-ups match the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with BIR: both pop-ups holding rows, reloaded through loadData", async () => {
    const r = await parityCheck(oracle, FORM_1707A, moreState, "84653210700000-1707A-12312019.xml", groups);
    expect(r.missing.filter((k) => /_\d|Modal/.test(k))).toEqual([]);
    expect(r.equal_count).toBeGreaterThan(30);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
