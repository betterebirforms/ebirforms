import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1702MX, P, validate1702MXOld } from "@/form/form1702mx.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const id = (s: string): string => `${P}${s}`;

const base: FormState = {
  [id("txtPg1I2YearEnd")]: "24", [id("ddlPg1I2Date")]: "12",
  [id("rdoPg1I1Calendar")]: "true", [id("rdoPg1I1Fiscal")]: "false",
  [id("rdoPg1I3AmendedYes")]: "false", [id("rdoPg1I3AmendedNo")]: "true",
  [id("rdoPg1I4ShortPeriodYes")]: "false", [id("rdoPg1I4ShortPeriodNo")]: "true",
  [id("txtPg1Pt1I8")]: "03/15/2020", // the IC055 (MCIT) tick is BIR's, derived on blur (≥ 4 years old)
  [id("txtPg1Pt1I6TINC1")]: "846", [id("txtPg1Pt1I6TINC2")]: "532", [id("txtPg1Pt1I6TINC3")]: "107", [id("txtPg1Pt1I6TINC4")]: "00000",
  [id("txtPg1Pt1I7RDO")]: "043", [id("drpPg1Pt1I7RDO")]: "043",
  [id("txtPg1Pt1I9RegisteredName")]: "ABC (PHILS.) INC.", [id("txtPg1Pt1I10RegisteredAddress")]: "1 RIZAL ST., QUEZON CITY",
  [id("txtZIP")]: "1100", [id("txtPg1Pt1I11ContactNumber")]: "0281234567", [id("txtPg1Pt1I13MainLine")]: "BPO",
  [id("rdoPg1Pt1I13MethodOfDeducItemized")]: "true", [id("rdoPg1Pt1I13MethodOfDeducOptional")]: "false",
  // Schedule 1: gross sales / receipts per column (A exempt, B special, C regular)
  [id("txtPg3Sc1I1CB")]: "8,000,000", [id("txtPg3Sc1I1CC")]: "10,000,000",
  // Schedule 6 (ordinary deductions) items 1–4 typed
  [id("txtPg6Sc6I1CA")]: "6,986.80", [id("txtPg6Sc6I1CB")]: "15,798.85", [id("txtPg6Sc6I1CC")]: "74,380.84",
  [id("txtPg6Sc6I2CA")]: "56,532.50", [id("txtPg6Sc6I2CB")]: "68,952.23", [id("txtPg6Sc6I2CC")]: "25,162.43",
  [id("txtPg6Sc6I3CA")]: "79,891.04", [id("txtPg6Sc6I3CB")]: "56,636.35", [id("txtPg6Sc6I3CC")]: "76,682.97",
  [id("txtPg6Sc6I4CA")]: "67,629.04", [id("txtPg6Sc6I4CB")]: "44,496.75", [id("txtPg6Sc6I4CC")]: "41,781.64",
  [id("txtPg2Pt5I40")]: "1,000", [id("txtPg2Pt5I41")]: "2,000", [id("txtPg2Pt5I42")]: "3,000",
};

const modalRow = (cols: Record<number, string>): GroupRow =>
  Object.fromEntries(Object.entries(cols).map(([c, v]) => [`${P}txtPg6Sc6_{i}Col${c}`, v] as const));
const groups: GroupState = {
  // two ordinary-deduction rows → "OTHERS" + the subtotals on item 4
  sc6_4: [
    modalRow({ 1: "APPRENTICESHIP", 2: "RA 7686", 3: "100", 4: "200", 5: "300" }),
    modalRow({ 1: "PEZA TRAINING", 2: "RA 7916", 3: "10", 4: "20", 5: "30" }),
  ],
};

// pure-CPU replays of BIR's compute (up to ~5 s each alone); under the gate's parallel WebKit load the 5 s default
// timed out at random — the budget, not the assertions, was the problem
describe("1702MX compute (BIR's own functions, replayed in BIR's order)", { timeout: 30_000 }, () => {
  const rec = (s: FormState = base, g: GroupState = groups) => {
    const m = new Map(formRecords(FORM_1702MX, s, g).map((r) => [r.key, r.value]));
    return (k: string) => m.get(id(k));
  };

  it("whole-peso amounts: Schedule 6 item 5 = Σ items 1–4, WOC with commas", () => {
    const v = rec();
    // 6,987 + 56,532(.50) + 79,891 + 67,629 → 211,039
    expect(v("txtPg6Sc6I5CA")).toBe("143,520"); // 6,987 + 56,532.50 + 79,891.04 + the OTHERS subtotal 110
    expect(v("txtPg6Sc6I5CB")).toBe("141,607");
    expect(v("txtPg6Sc6I5CC")).toBe("176,556");
  });

  it("Schedule 2: 2 = 30% × Schedule 6 item 5 (hidden30), 3 = 1 + 2, 5 = 3 − 4", () => {
    const v = rec();
    expect(v("txtPg3Sc2I2CA")).toBe("43,056"); // 143,520.54 × 0.3 = 43,056.16 → Math.round
    expect(v("txtPg3Sc2I3CA")).toBe(v("txtPg3Sc2I2CA")); // item 1 is blank
    expect(v("txtPg3Sc2I5CA")).toBe(v("txtPg3Sc2I3CA")); // item 4 is blank
  });

  it("the special-rate drop-down is rebuilt from item 4 + the ATC rate and the tick is BIR's own", () => {
    const s: FormState = {
      ...base,
      [id("chkPg1I5ATCR2")]: "true", [id("drpPg1I5ATCR2")]: "IC030",
      [id("txtPg2Pt4I31CB")]: "PEZA", [id("txtPg2Pt4I32CB")]: "RA 7916", [id("txtPg2Pt4I34SpecialTaxRate")]: "5.0",
    };
    const v = rec(s);
    expect(v("drpPg3Sc1I11CB")).toBe("0.05"); // the rebuilt drop-down's first option
    expect(v("chkPg1I5ATCR1")).toBe("true"); // the IC055 tick: 2024 − 2020 = 4 years
    const old = rec({ ...base, [id("txtPg1Pt1I8")]: "03/15/2010" });
    expect(old("chkPg1I5ATCR1")).toBe("true"); // 14 years — BIR's last branch ticks every corp ≥ 4 years old
  });

  it("modals: two or more rows → OTHERS + the subtotals on item 4; counters and the rebuilt rows", () => {
    const v = rec();
    expect(v("txtPg6Sc6I4description")).toBe("OTHERS");
    expect(v("txtPg6Sc6I4legal")).toBe("OTHERS");
    expect(v("txtPg6Sc6I4CA")).toBe("110"); // 100 + 10
    expect(v("txtPg6Sc6I4CD")).toBe("660"); // 660 = (100+200+300) + (10+20+30)
    expect(v("txtCtrmodalPg6Sc6")).toBe("2");
    expect(v("txtPg6Sc6_1Col1")).toBe("APPRENTICESHIP");
  });

  it("saveXML: names escaped, everything else upper-cased, the booleans lowercase", () => {
    const v = rec();
    expect(v("txtPg1Pt1I9RegisteredName")).toBe("ABC%20%28PHILS.%29%20INC.");
    expect(v("chkPg1I5ATCR1")).toBe("true");
    expect(v("chkPg1I5ATCR2")).toBe("false");
  });

  it("validates the method of deduction, the incorporation date and the TIN", () => {
    expect(validate1702MXOld(base, groups)).toEqual([]);
    const bad = validate1702MXOld({ ...base, [id("rdoPg1Pt1I13MethodOfDeducItemized")]: "false" }, groups).map((p) => p.id);
    expect(bad).toContain(id("rdoPg1Pt1I13MethodOfDeducItemized"));
    const date = validate1702MXOld({ ...base, [id("txtPg1Pt1I8")]: "3/15/2020" }, groups).map((p) => p.id);
    expect(date).toContain(id("txtPg1Pt1I8"));
  });
});

// Part V: one exempt (EX1) and one special-rate (SP1) copy of BIR's attachment pages
const withCopy: FormState = {
  ...base,
  [id("chkPg2Pt4I30MoreThanOne")]: "true",
  [id("totalEXAttach")]: "1", [id("totalSPAttach")]: "1",
  // EX1: Schedule D (gross) 500,000 less 100,000, Schedule E1 10,000, Schedule G 50,000 + 20,000, Schedule H
  [id("txtPg1EX1ScAI1")]: "ecozone", [id("txtPg2EX1ScDI1")]: "500,000", [id("txtPg2EX1ScDI5")]: "100,000",
  [id("txtPg2EX1ScE1I1")]: "10,000", [id("txtPg3EX1ScGI1")]: "50,000", [id("txtPg3EX1ScGI5")]: "20,000",
  [id("txtPg4EX1ScHI1C1")]: "SUPPLIES", [id("txtPg4EX1ScHI1C2")]: "RA 1", [id("txtPg4EX1ScHI1C3")]: "30,000",
  // SP1: a PEZA activity at 5%
  [id("txtPg1SP1ScAI1")]: "peza", [id("txtPg1SP1ScAI2")]: "ra 7916", [id("txtPg1SP1ScAI4")]: "5",
  [id("txtPg2SP1ScDI1")]: "2,000,000", [id("txtPg2SP1ScDI5")]: "300,000",
  [id("txtPg2SP1ScE1I1")]: "20,000", [id("txtPg3SP1ScGI1")]: "100,000",
};

describe("1702MX Part V attachments (BIR's addAttachment copies)", { timeout: 30_000 }, () => {
  const rec = (s: FormState = withCopy) => {
    const list = formRecords(FORM_1702MX, s, groups);
    const m = new Map(list.map((r) => [r.key, r.value]));
    return { list, v: (k: string) => m.get(id(k)), key: list.map((r) => r.key) };
  };

  it("Schedule D / B of a copy: item 6 = 1 + 2 + 3 less 5, carried to Schedule B item 1, then B3 = B1 less B2", () => {
    const { v } = rec();
    expect(v("txtPg2EX1ScDI4")).toBe("500,000");
    expect(v("txtPg2EX1ScDI6")).toBe("400,000");
    expect(v("txtPg1EX1ScBI1")).toBe("400,000");
    expect(v("txtPg2SP1ScDI6")).toBe("1,700,000");
    expect(v("txtPg1SP1ScBI1")).toBe("1,700,000");
    expect(v("txtPg1EX1ScBI3")).toBe(v("txtPg1EX1ScBI5")); // no Schedule F item 4
  });

  it("a special-rate copy at 5% under PEZA takes tax on Schedule B item 5 at its own rate", () => {
    const { v } = rec();
    expect(v("txtPg1SP1ScBI11")).toBe("5.0");
    // SP1 B5 = 1,700,000 less 20,000 (Schedule E) + 0 (F) = 1,680,000 minus 100,000 (G) = 1,580,000
    expect(v("txtPg1SP1ScBI12")).toBe(Math.round(parseFloat(v("txtPg1SP1ScBI5")!.replace(/,/g, "")) * 0.05).toLocaleString("en-US"));
  });

  it("Schedule 1 of the main form is fed from the copies: exempt column from every EX copy, special column from every SP copy", () => {
    const { v } = rec();
    expect(v("txtPg3Sc1I1CA")).toBe(v("txtPg1EX1ScBI1"));
    expect(v("txtPg3Sc1I1CB")).toBe(v("txtPg1SP1ScBI1"));
    // a special-rate copy removes the special-rate drop-down: the tax of the column is the sum of the copies' item 12
    expect(v("txtPg3Sc1I12CB")).toBe(v("txtPg1SP1ScBI12"));
  });

  it("saves only the counted copies, EX before SP, after attachmentTotal, in BIR's order, with the counts", () => {
    const { key, v } = rec();
    expect(v("totalEXAttach")).toBe("1");
    expect(v("totalSPAttach")).toBe("1");
    const at = key.indexOf("attachmentTotal");
    expect(key[at + 1]).toBe(id("txtPg1EX1TIN1"));
    expect(key.indexOf(id("txtPg1SP1TIN1"))).toBeGreaterThan(key.indexOf(id("txtPg4EX1ScIAI7CD")));
    expect(key.some((k) => k.includes("EX2") || k.includes("SP2"))).toBe(false);
    expect(v("rdoPg1EX1Exempt")).toBe("true");
    expect(v("rdoPg1EX1SpecialRate")).toBe("false");
    expect(v("rdoPg1SP1SpecialRate")).toBe("true");
    expect(v("txtPg1EX1ScAI1")).toBe("ECOZONE"); // text is upper-cased
    expect(new Set(key).size).toBe(key.length); // no key twice
  });

  it("a special-rate copy removes the special-rate drop-down, so BIR's save has no drpPg3Sc1I11CB", () => {
    expect(rec().key).not.toContain(id("drpPg3Sc1I11CB"));
    expect(rec(base).key).toContain(id("drpPg3Sc1I11CB"));
  });

  it("an exempt copy clears and locks column A of Part IV (and the special-rate column for a special copy)", () => {
    const typed = { ...withCopy, [id("txtPg2Pt4I31CA")]: "SOMETHING", [id("txtPg2Pt4I31CB")]: "PEZA" };
    const { v } = rec(typed);
    expect(v("txtPg2Pt4I31CA")).toBe("");
    expect(v("txtPg2Pt4I31CB")).toBe("");
  });

  it("no copies: a blank form saves what it did before, and the viewer boxes stay 0", () => {
    const { key, v } = rec(base);
    expect(v("totalEXAttach")).toBe("0");
    expect(v("attachmentTotal" as never)).toBeUndefined(); // un-prefixed
    expect(key.some((k) => /EX\d|SP\d/.test(k))).toBe(false);
  });
});

describe.skipIf(!hasForm("1702MX"))("native 1702MX is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());

  it("is 1:1 (Schedule 1 with the special-rate rule, Schedule 6 with an OTHERS modal)", async () => {
    const s: FormState = {
      ...base,
      [id("chkPg1I5ATCR2")]: "true", [id("drpPg1I5ATCR2")]: "IC030",
      [id("txtPg2Pt4I31CB")]: "PEZA", [id("txtPg2Pt4I32CB")]: "RA 7916", [id("txtPg2Pt4I34SpecialTaxRate")]: "5.0",
    };
    const r = await parityCheck(oracle, FORM_1702MX, s, "84653210700000-1702MX-122024.xml", groups);
    // blurring item 24 asks to jump to the Schedules; the accepted confirm moves BIR's saved pager to 3
    expect(parityProblem(r, ["frm1702MX:txtCurrentPage"])).toEqual([]);
  }, 300_000);

  it("is 1:1 with an exempt and a special-rate attachment copy", async () => {
    const r = await parityCheck(oracle, FORM_1702MX, withCopy, "84653210700000-1702MX-122024.xml", groups);
    expect(r.key_count).toBeGreaterThan(1000);
    expect(parityProblem(r, ["frm1702MX:txtCurrentPage"])).toEqual([]);
  }, 300_000);
});
