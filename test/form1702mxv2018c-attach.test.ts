import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formRecords, type FormSchema, type FormState } from "@/form/schema.ts";
import { FORM_1702MXv2018 } from "@/form/form1702mxv2018.ts";
import { FORM_1702MXv2018C } from "@/form/form1702mxv2018c.ts";
import { FORM_1702MXv2018Cxx } from "@/form/form1702mxv2018cxx.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { groups, id, itemized, withCopy } from "./form1702mx2018-case.ts";

/** Two copies of each kind, nearly every box a filer can type filled with a different amount. */
const rich: FormState = (() => {
  const s: FormState = { ...itemized, [id("chkPg2Pt4I30MoreThanOne")]: "true", [id("totalEXAttach")]: "2", [id("totalSPAttach")]: "2" };
  let n = 1;
  for (const copy of ["EX1", "EX2", "SP1", "SP2"]) {
    const amount = (base: number) => String(base * n++ * 1000 + (n % 7) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    s[id(`txtPg1${copy}ScAI1`)] = copy.startsWith("SP") ? "peza" : "ecozone";
    s[id(`txtPg1${copy}ScAI2`)] = "ra 7916";
    if (copy.startsWith("SP")) s[id(`txtPg1${copy}ScAI4`)] = n % 2 ? "5" : "10";
    s[id(`txtPg1${copy}Pt5ScAIt5`)] = "01/01/2020";
    s[id(`txtPg1${copy}Pt5ScAIt6`)] = "12/31/2030";
    for (const box of ["Pg1ScBI1", "Pg1ScBI2", "Pg1ScBI4", "Pg1ScCI1", "Pg1ScCI2", "Pg1ScCI6", "Pg1ScDI1", "Pg1ScDI2", "Pg1ScDI3", "Pg1ScDI4", "Pg2ScDI9", "Pg2ScDI10", "Pg2ScDI11", "Pg2ScDI13", "Pg2ScDI14", "Pg2ScDI15", "Pg2ScDI16", "Pg2ScDI17", "Pg2ScDI18", "Pg2ScDI19", "Pg2ScDI20"])
      s[id(`txt${box.replace("Sc", copy + "Sc")}`)] = amount(box === "Pg1ScBI1" ? 90 : 3);
    s[id(`txtPg2${copy}Desc20`)] = "OTHER EXPENSE";
    s[id(`txtPg4${copy}ScHI1C1`)] = "SUPPLIES";
    s[id(`txtPg4${copy}ScHI1C2`)] = "RA 1";
    s[id(`txtPg4${copy}ScHI1C3`)] = amount(2);
  }
  return s;
})();

const edition: Array<[string, FormSchema]> = [
  ["1702MXv2018", FORM_1702MXv2018],
  ["1702MXv2018C", FORM_1702MXv2018C],
  ["1702MXv2018Cxx", FORM_1702MXv2018Cxx],
];

describe.each(edition)("%s Part V attachments (BIR's addAttachment copies)", (_code, schema) => {
  const rec = (s: FormState = withCopy) => {
    const list = formRecords(schema, s, groups);
    const m = new Map(list.map((r) => [r.key, r.value]));
    return { key: list.map((r) => r.key), v: (k: string) => m.get(id(k)) };
  };

  it("Schedule B of a copy: item 3 = 1 less 2, carried on to its items 5 and 57; Schedule D and H feed items 8 and 12", () => {
    const { v } = rec();
    expect(v("txtPg1EX1ScBI3")).toBe("400,000");
    expect(v("txtPg1EX1ScBI12")).toBe("340,000");
    expect(v("txtPg1SP1ScBI3")).toBe("1,700,000");
    expect(v("txtPg1SP1ScBI12")).toBe("1,580,000");
  });

  it("a special-rate copy takes its own rate (item 13 from item 4)", () => {
    const { v } = rec();
    expect(v("txtPg1SP1ScBI13")).toBe("5.0");
  });

  it("saves only the counted copies, EX before SP, after attachmentTotal, with the counts", () => {
    const { key, v } = rec();
    expect(v("totalEXAttach")).toBe("1");
    expect(v("totalSPAttach")).toBe("1");
    expect(key.indexOf(id("txtPg1SP1TIN1"))).toBeGreaterThan(key.indexOf(id("txtPg1EX1TIN1")));
    expect(key.some((k) => k.includes("EX2") || k.includes("SP2"))).toBe(false);
    expect(v("rdoPg1EX1Exempt")).toBe("true");
    expect(v("rdoPg1SP1SpecialRate")).toBe("true");
    expect(v("txtPg1EX1ScAI1")).toBe("ECOZONE"); // text is upper-cased
    expect(new Set(key).size).toBe(key.length);
  });

  it("an exempt copy clears and locks column A of Part IV", () => {
    const { v } = rec({ ...withCopy, [id("txtPg2Pt4I31CA")]: "SOMETHING", [id("txtPg2Pt4I31CB")]: "PEZA" });
    expect(v("txtPg2Pt4I31CA")).toBe("");
    expect(v("txtPg2Pt4I31CB")).toBe("");
  });

  it("no copies: the form saves what it did before", () => {
    const { key, v } = rec(itemized);
    expect(v("totalEXAttach")).toBe("0");
    expect(key.some((k) => /EX\d|SP\d/.test(k))).toBe(false);
  });
});

describe.skipIf(!hasForm("1702MXv2018C"))("native 1702MX 2018 editions are 1:1 with an exempt and a special-rate copy", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it.each(edition)("%s with two copies of each kind, every box typed", async (code, schema) => {
    const r = await parityCheck(oracle, schema, rich, `84653210700000-${code}-1225.xml`, {});
    expect(parityProblem(r)).toEqual([]);
  }, 300_000);

  it.each(edition)("%s", async (code, schema) => {
    // no modal rows: with one in column A or B, BIR's own attachmentChecking reads txtCtrmodalPg5Sc4I3, an element
    // this layout does not have, and loadData aborts (a BIR defect), so BIR cannot reopen such a file at all
    const r = await parityCheck(oracle, schema, withCopy, `84653210700000-${code}-1225.xml`, {});
    expect(parityProblem(r)).toEqual([]);
  }, 300_000);
});
