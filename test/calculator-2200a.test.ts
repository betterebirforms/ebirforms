// 2200A Schedule 1 calculators, the parts the web version's pop-ups run (src/form/calculator.tsx): BIR's own arithmetic
// (computeXA035Bottle … computeOthers, computeSum, computeToSchedule1) against values worked by hand from BIR's code,
// and the routes, alerts and limits of its openDialogForATC3536 / ValidateTable / getLabel / computeSched1Alcohol.
// (test/form2200a.test.ts checks the same arithmetic against BIR's own page.)
import { describe, expect, it } from "vitest";
import { computeForm, computeGroupRows, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_2200A, calcDueExceeds, calcLabel, calcOpenAlert, calcRoute, calcSubTotal, calcTableAlert } from "@/form/form2200a.ts";
import { CALCULATOR, dateToday } from "@/form/calculator.tsx";

const P = "frm2200A:";
const row = (name: string, col: Record<number, string>): GroupRow => Object.fromEntries(Object.entries(col).map(([k, v]) => [`${P}Cal${name}_{i}_Col${k}`, v]));
const state: FormState = { [`${P}txtForYr`]: "2018", [`${P}chkPymntManner_1`]: "true" };
const run = (groups: GroupState) => {
  const c = computeForm(FORM_2200A, state, groups);
  return { c, read: (id: string) => c[id] ?? "", cell: (name: string, i: number, n: number) => shown(c, name, i, n, groups) };
};
const shown = (c: FormState, name: string, i: number, n: number, groups: GroupState) => {
  const g = FORM_2200A.group!.find((x) => x.name === `calc${name}`)!;
  return computeGroupRows(g, groups[g.name] ?? [], c)[i - 1]?.[`${P}Cal${name}_{i}_Col${n}`];
};

describe("calculator arithmetic, worked by hand", () => {
  it("XA061 (Others): 20 cases x 12 bottles = 240 bottles x 0.75 L = 180.00; at 304.16 a liter the due is 54,748.80", () => {
    const { c, read } = run({ calcXA061: [row("XA061", { 2: "wine", 3: "20", 4: "12", 6: "0.75" })] });
    expect(c.CalcSubTotalXA061).toBe("180.00");
    expect(calcSubTotal(read, "XA061")).toBe("180.00");
    // a typed row moves only the sub-total; Compute (computeToSchedule1) writes it into the Schedule 1 box
    expect(c[`${P}xa2_taxable1`]).toBe("0.00");
    const after = computeForm(FORM_2200A, { ...state, [calcRoute("XA061").target]: calcSubTotal(read, "XA061") }, { calcXA061: [row("XA061", { 2: "wine", 3: "20", 4: "12", 6: "0.75" })] });
    expect(after[`${P}xa2_taxable1`]).toBe("180.00");
    expect(after[`${P}xa2_exciseTaxDue1`]).toBe("54,748.80"); // 304.16 x 180 = 54,748.8
  });
  it("XA035 Bottle: 10 x 12 = 120 bottles, strength 40 -> proof 0.80, 120 x 350.75 x 0.80 = 33,672.00", () => {
    const { c, cell } = run({ calcXA035Bottle: [row("XA035Bottle", { 2: "brandy", 3: "10", 4: "12", 6: "350.75", 7: "40" })] });
    expect([5, 7, 8, 9].map((n) => cell("XA035Bottle", 1, n))).toEqual(["120", "40.00%", "0.80", "33,672.00"]);
    expect(c.CalcSubTotalXA035Bottle).toBe("33,672.00");
  });
  it("XA036: bottle proof liters 0.75 x 0.80 = 0.600 and 120 x 0.600 = 72.00; bulk 1,000.5 x 0.90 = 900.45; one box takes both", () => {
    const { c, read, cell } = run({
      calcXA036Bottle: [row("XA036Bottle", { 2: "b", 3: "10", 4: "12", 6: "0.75", 7: "40" })],
      calcXA036Bulk: [row("XA036Bulk", { 2: "r", 3: "1000.5", 4: "45" })],
    });
    expect([9, 10].map((n) => cell("XA036Bottle", 1, n))).toEqual(["0.600", "72.00"]);
    expect([3, 5, 6].map((n) => cell("XA036Bulk", 1, n))).toEqual(["1,000.500", "0.90", "900.45"]);
    expect(calcSubTotal(read, "XA036")).toBe("972.45");
    expect(c[`${P}xa1_taxable2`]).toBe("0.00"); // until Compute writes it
    expect(calcRoute("XA036Bulk").target).toBe(`${P}xa1_taxable2`);
  });
  it("a typed volume is cut (not rounded) to two decimals: 0.339 L -> 0.33, so 3 x 7 x 0.33 = 6.93", () => {
    const { cell } = run({ calcXA070: [row("XA070", { 2: "w", 3: "3", 4: "7", 6: "0.339" })] });
    expect(cell("XA070", 1, 7)).toBe("6.93");
  });
});

describe("where Compute writes", () => {
  it("each calculator's route to its Schedule 1 taxable box (computeToSchedule1's arguments)", () => {
    expect(calcRoute("XA035Bottle")).toEqual({ source: "XA035", target: `${P}xa1_taxable1` });
    expect(calcRoute("XA035Bulk")).toEqual({ source: "XA035", target: `${P}xa1_taxable1` });
    expect(calcRoute("XA036Bulk")).toEqual({ source: "XA036", target: `${P}xa1_taxable2` });
    expect(calcRoute("XA061").target).toBe(`${P}xa2_taxable1`);
    expect(calcRoute("XA080").target).toBe(`${P}xa2_taxable4`);
    expect(calcRoute("XA055").target).toBe(`${P}xa3_taxable1`);
    expect(calcRoute("XA057").target).toBe(`${P}xa3_taxable3`);
    expect(calcRoute("XA0552")).toEqual({ source: "XA0552", target: `${P}xa3_taxableXA0552` });
  });
  it("the page's eleven links, in BIR's order, all have a calculator and a group", () => {
    const spec = CALCULATOR["2200A"]!;
    expect(spec.link).toHaveLength(11);
    for (const name of spec.link) expect(FORM_2200A.group?.some((g) => g.name === spec.group(name)), name).toBe(true);
    expect(spec.all).toHaveLength(13);
  });
});

describe("BIR's alerts and limits", () => {
  const emptyBut = (...filled: string[]) => (name: string) => !filled.includes(name);
  it("openDialogForATC3536: every refusal and every way through", () => {
    expect(calcOpenAlert("XA035Bottle", emptyBut("XA035Bulk"))).toBe("Please fill up XA036 Specific Tax (Bulk) Calculator first.");
    expect(calcOpenAlert("XA035Bottle", emptyBut("XA036Bulk"))).toBe("Please fill up XA035 Ad Valorem Tax (Bulk) Calculator first.");
    expect(calcOpenAlert("XA035Bulk", emptyBut("XA035Bottle"))).toBe("Please fill up XA036 Specific Tax (Bottle) Calculator first.");
    expect(calcOpenAlert("XA035Bulk", emptyBut("XA036Bottle"))).toBe("Please fill up XA035 Ad Valorem Tax (Bottle) Calculator first.");
    expect(calcOpenAlert("XA036Bottle", emptyBut("XA036Bulk"))).toBe("Please fill up XA035 Ad Valorem Tax (Bulk) Calculator first.");
    expect(calcOpenAlert("XA036Bottle", emptyBut("XA035Bulk"))).toBe("Please fill up XA036 Specific Tax (Bulk) Calculator first.");
    expect(calcOpenAlert("XA036Bulk", emptyBut("XA036Bottle"))).toBe("Please fill up XA035 Ad Valorem Tax (Bottle) Calculator first.");
    expect(calcOpenAlert("XA036Bulk", emptyBut("XA035Bottle"))).toBe("Please fill up XA036 Specific Tax (Bottle) Calculator first.");
    expect(calcOpenAlert("XA035Bottle", emptyBut())).toBeNull(); // nothing filled: opens
    expect(calcOpenAlert("XA035Bottle", emptyBut("XA035Bottle"))).toBeNull();
    expect(calcOpenAlert("XA035Bottle", emptyBut("XA035Bulk", "XA036Bulk"))).toBeNull();
    expect(calcOpenAlert("XA061", emptyBut("XA035Bulk"))).toBeNull(); // the plain links never ask
  });
  it("getLabel by the id's last digit", () => {
    expect(calcLabel(`${P}CalXA035Bottle_1_Col6`)).toBe("NRP Per Bottle");
    expect(calcLabel(`${P}CalXA036Bottle_1_Col6`)).toBe("Bottle Content");
    expect(calcLabel(`${P}CalXA035Bulk_1_Col3`)).toBe("NRP");
    expect(calcLabel(`${P}CalXA036Bulk_1_Col3`)).toBe("Content");
    expect(calcLabel(`${P}CalXA036Bulk_1_Col4`)).toBe("Alcohol Strength");
    expect(calcLabel(`${P}CalXA061_1_Col3`)).toBe("No. of Cases");
    expect(calcLabel(`${P}CalXA061_1_Col6`)).toBe("Volume Content");
    expect(calcLabel(`${P}CalXA035Bottle_1_Col10`)).toBe("Description"); // BIR reads the last character only
  });
  it("ValidateTable: the first box wrong, rows in order, boxes left to right", () => {
    const ok = { 2: "WINE", 3: "20", 4: "12", 6: "0.75" };
    expect(calcTableAlert("XA061", [ok])).toBeNull();
    expect(calcTableAlert("XA061", [ok, { ...ok, 2: "" }])).toBe("Please enter a valid Description at Row 2.");
    expect(calcTableAlert("XA061", [{ ...ok, 3: "0" }, { ...ok, 2: "" }])).toBe("No. of Cases at Row 1 should be greater than zero.");
    expect(calcTableAlert("XA061", [{ ...ok, 6: "0.00" }])).toBe("Volume Content at Row 1 should be greater than zero.");
    expect(calcTableAlert("XA035Bottle", [{ ...ok, 6: "1.00", 7: "0.00%" }])).toBe("Alcohol Strength at Row 1 should be greater than zero.");
    expect(calcTableAlert("XA035Bottle", [{ ...ok, 6: "0.00", 7: "40.00%" }])).toBe("NRP Per Bottle at Row 1 should be greater than zero.");
    expect(calcTableAlert("XA036Bulk", [{ 2: "R", 3: "1,000.500", 4: "0.00%" }])).toBe("Alcohol Strength at Row 1 should be greater than zero.");
    expect(calcTableAlert("XA061", [])).toBeNull();
  });
  it("computeSched1Alcohol's limit: a due, or the total due, of 1,000,000,000,000 is refused", () => {
    const small = run({ calcXA061: [row("XA061", { 2: "w", 3: "20", 4: "12", 6: "0.75" })] });
    expect(calcDueExceeds(small.read, "XA061")).toBe(false);
    // 10,000,000 x 1,000 x 1.00 L = 10 billion liters x 304.16
    const big = run({ calcXA061: [row("XA061", { 2: "w", 3: "10000000", 4: "1000", 6: "1" })] });
    expect(calcDueExceeds(big.read, "XA061")).toBe(true);
    // a row's rate x taxable under the limit, but the 2018 XA062 rate (851.66) x 1.2 billion is not
    const rate = run({ calcXA062: [row("XA062", { 2: "w", 3: "1200000", 4: "1000", 6: "1" })] });
    expect(calcDueExceeds(rate.read, "XA062")).toBe(true);
  });
});

describe("Date computed", () => {
  it("dateToday: m/d/yyyy, two spaces, 12-hour hh:mm am/pm", () => {
    expect(dateToday(new Date(2018, 2, 5, 0, 7))).toBe("3/5/2018  12:07 am");
    expect(dateToday(new Date(2018, 10, 15, 13, 45))).toBe("11/15/2018  01:45 pm");
  });
});
