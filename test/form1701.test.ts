import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState } from "@/form/schema.ts";
import { FORM_1701 } from "@/form/form1701.ts";
import { simulate } from "@/form/form1701-sim.ts";
import { NATIVE_FORM } from "@/form/registry.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem, randomFill } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { bizItemized, bizOsd, compensation, id, identity, joint } from "./form1701-case.ts";

// BIR's 1701 (2013) saves its amounts bare and in whole pesos: formatCurrencyWOC drops the centavos (toward zero)
const v = (o: FormState, k: string) => o[id(k)];
const calc = (s: FormState) => computeForm(FORM_1701, s);

describe("1701 compute (BIR's own page script run over the native state)", () => {
  it("business, itemized: Sched 2 → 50, Sched 4A/4B → 53, the 2013 graduated table on 66, Sched 9 credits", () => {
    const o = calc(bizItemized);
    expect(v(o, "txtPg5Sc2I2TaxPayerC1")).toBe("250000"); // 250,000.40 → whole pesos
    expect(v(o, "txtPg5Sc2I3TaxPayerC1")).toBe("1750000");
    expect(v(o, "txtPg2Pt4I50NetSalesC1")).toBe("1700000"); // − 50,000 returns
    expect(v(o, "txtPg5Sc4AI5TaxPayerC1")).toBe("720000"); // 100,000 + 700,000 − 80,000
    expect(v(o, "txtPg6Sc4BI19TaxPayerC1")).toBe("155000"); // 120,000 + 35,000.50 → 35,000
    expect(v(o, "txtPg2Pt4I53LessCostSalesC1")).toBe("875000");
    expect(v(o, "txtPg2Pt4I54GrossIncomeC1")).toBe("825000");
    expect(v(o, "txtPg2Pt4I65LessExcessC1")).toBe("50000"); // the unused ₱50,000 personal exemption
    expect(v(o, "txtPg2Pt4I66TotalTaxableC1")).toBe("775000");
    expect(v(o, "txtPg2Pt4I67TaxDueRegularC1")).toBe("213000"); // 125,000 + 32% × 275,000
    expect(v(o, "txtPg9Sc9I10TaxPayerC1")).toBe("27345"); // 15,000 + 12,345.67 → 12,345
    expect(v(o, "txtPg1Pt2I26IncomeTax")).toBe("213000");
    expect(v(o, "txtPg1Pt2I28NetTax")).toBe("185655");
    expect(v(o, "txtPg1Pt2I31TotalPenalties")).toBe("1000");
    expect(v(o, "txtPg1Pt2I32TotalUponFiling")).toBe("186655");
  });

  it("OSD: 40% of gross sales, no cost of sales, Sched 4 locked", () => {
    const o = calc(bizOsd);
    expect(v(o, "txtPg2Pt4I53LessCostSalesC1")).toBe("0");
    expect(v(o, "txtPg5Sc4AI1TaxPayerC1")).toBe("0"); // the filer's Sched 4A figures are reset
    expect(v(o, "txtPg2Pt4I61OSDC1")).toBe("680000");
    expect(v(o, "txtPg2Pt4I66TotalTaxableC1")).toBe("970000");
    expect(v(o, "txtPg2Pt4I67TaxDueRegularC1")).toBe("275400"); // 125,000 + 32% × 470,000
    expect(v(o, "txtPg1Pt2I32TotalUponFiling")).toBe("249055");
  });

  it("compensation: Sched 1 (computed on change) → 41, the exemption off 48, the premium only under ₱250,000 gross", () => {
    const o = calc(compensation);
    expect(v(o, "txtPg5Sc1I5ATotalComIncome")).toBe("480000");
    expect(v(o, "txtPg2Pt4I41GrossCompensationC1")).toBe("480000");
    expect(v(o, "txtPg2Pt4I44PremiumC1")).toBe("0");
    expect(v(o, "txtPg2Pt4I48NetTaxC1")).toBe("430000");
    expect(v(o, "txtPg2Pt4I67TaxDueRegularC1")).toBe("104000"); // 50,000 + 30% × 180,000
    expect(v(o, "txtPg9Sc9I5TaxPayerC1")).toBe("60000"); // Sched 1 withheld → Sched 9 5
    expect(v(o, "txtPg1Pt2I28NetTax")).toBe("44000");
  });

  it("joint: the taxpayer's mixed income on itemized, the spouse's business on OSD, Part VI sums both columns", () => {
    const o = calc(joint);
    expect(v(o, "txtPg2Pt4I64NetTaxC1")).toBe("600000"); // 350,000 business + 250,000 net compensation
    expect(v(o, "txtPg2Pt4I67TaxDueRegularC1")).toBe("157000");
    expect(v(o, "txtPg2Pt4I61OSDC2")).toBe("360000");
    expect(v(o, "txtPg2Pt4I66TotalTaxableC2")).toBe("490000");
    expect(v(o, "txtPg2Pt4I67TaxDueRegularC2")).toBe("122000"); // 50,000 + 30% × 240,000
    expect(v(o, "txtPg1Pt2I26IncomeTax")).toBe("279000");
    expect(v(o, "txtPg1Pt2I27LessTotalTax")).toBe("34000");
    expect(v(o, "txtPg1Pt2I32TotalUponFiling")).toBe("245000");
  });

  it("the entry's labels and prefill name real fields", () => {
    const def = NATIVE_FORM["1701"]!;
    const have = new Set(FORM_1701.field.map((f) => f.id));
    expect([...Object.keys(def.label ?? {}), ...Object.keys(def.prefill)].filter((k) => !have.has(k))).toEqual([]);
  });

  it("runs BIR's handlers without a script error, and a second pass is a no-op", () => {
    for (const s of [bizItemized, bizOsd, compensation, joint, randomFill(FORM_1701, identity)]) {
      expect(simulate((k) => s[k] ?? "").fault).toEqual([]);
      const once = computeForm(FORM_1701, s);
      expect(computeForm(FORM_1701, once)).toEqual(once);
    }
  });
});

const PAGE = "[id^=Page][id$=Content]";

describe.skipIf(!hasForm("1701"))("native 1701 is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = (s: FormState) => `84653210700000-1701-12${s[id("txtPg1I1Year")] ?? ""}.xml`;
  const married = { ...identity, [id("rdoPg1Pt1I14StatusMarried")]: "true", [id("rdoPg1Pt1I15WithIncome")]: "true", [id("rdoPg1Pt1I16Joint")]: "true" };

  const cases: Array<[string, FormState]> = [
    ["business, itemized", bizItemized],
    ["business, OSD", bizOsd],
    ["compensation", compensation],
    ["joint: mixed itemized + spouse business OSD", joint],
    ["seeded random fill, single", randomFill(FORM_1701, identity)],
    ["seeded random fill, joint", randomFill(FORM_1701, married)],
  ];
  for (const [name, state] of cases) {
    it(`is 1:1 on page 1: ${name}`, async () => {
      expect(parityProblem(await parityCheck(oracle, FORM_1701, state, file(state)))).toEqual([]);
    }, 120_000);
    it(`is 1:1 with every page reviewed: ${name}`, async () => {
      const r = await allPageParityCheck(oracle, FORM_1701, state, file(state), {}, undefined, PAGE, true);
      expect(parityProblem(r)).toEqual([]);
    }, 120_000);
  }
});
