// BIR Form 1700 (Annual Income Tax Return — Individuals with Purely Compensation Income, the pre-2013 layout),
// P3. Field prefix `frm1700:`; four pages; whole-peso figures (formatCurrencyWOC, negatives "(1,234)" saved
// "-1,234"). Two columns C1 = tax filer, C2 = spouse on the Part IV computation (page 2) and Part V schedules
// (page 3); page 4 holds the filer's address (Table 1) and dependents (Table 2) with `modalTable1:` /
// `modalTable2:` entry mirrors — plain pass-through inputs.
//
// The seven "add more…" modals (each a counter + saved iterate rows). BIR's save carries BOTH copies of each
// modal row: the temp table's creation ids and the Repository (main) table's re-id'd copies — saveRowCol copies
// temp → main and resetRowColMainTableID re-ids the main textboxes as <prefix><row>C<x> where <prefix> is the
// created id up to its first "_" (or minus its last 3 characters when there is none) and x is the textbox's
// position within the row. Both key sets are emitted here with the same values, as BIR's own save does.
//   modalPage2Part4 (txtCtrmodalPage2Part4): employer rows from index 4; their sums land on the MAIN item-3 row
//     (sumIterateOnlyPg2Pt4) and the I4A/4B subtotals split by the per-row TaxFiler/Spouse boxes
//     (sumTaxSpouseIterate);
//   Page2Part4I12ModalI12: OTHERS income rows → items 12's C1/C2 = the halved Σ (computePage2I12);
//   Page3Part5I6ModalA1: AAFM / FinalTaxWithheld rows → page-2's I6SubtotalC1/C2 = the halved Σ; A2 → I11Subtotal
//     (each row's item-11 SaleEx columns), A3 → I17Subtotal, A4 → I20Subtotal; B1/B2 keep rows and feed Part I's
//     BI10 income sum.
//   adjustSummation HALVES each subtotal (parseInt(value / 2)) because the summation runs over both the temp and
//     the main copy of every row — BIR's own arithmetic, replicated verbatim.
// Part I item 21 (txtPg3Pt5I21TotTaxWithheldPaid) = the Σ over Page3Content of the FinalTaxWithheld boxes, items
//   11C/17C/20C (computeSummationPage3Item21; its summationIteration* substrings name undeclared elements).
// Part IV chain (page 2, per column): 4A/4B ← the employer sums; 5 entered; 6 = 4 − 5; 7 hospitalization
//   (≤ 2,400 and a multiple of 200 — BIR alerts and clears otherwise; disabled once item 6 > 250,000);
//   8 entered; 9 = 25,000 × the qualified dependents (the filer's item 14 Yes, or the spouse's claim on a joint
//   return); 10 = 7 + 8 + 9; 11 = 6 − 10; 12 (OTHERS) only under SourceOfIncome_2; 13 = 11 + 12;
//   14 = graduated(13) (the pre-TRAIN table, Math.round); 15 = item 4's tax withheld (4AC2 / 4BC2);
//   19 = 15 + 16 + 17 + 18; 20 = 14 − 19; 21 = 20C1 + 20C2; 22 (input, cleared above 50% of 14A+14B or above 21
//   or when the basis is under 2,000); 23 = 21 − 22; 24/25/26 entered; 27 = 24 + 25 + 26; 28 = 23 + 27.
// Part 1 (page 1): 23 = 14C1, 24 = 14C2; 25 = parseInt(23) + parseInt(24); 26 = 19C1, 27 = 19C2 (copies);
//   28 = 25 − (26 + 27); 29 = page-3 item 21; 30 = page-2 item 27; 31 = 28 − 29 + 30, but 30 alone when
//   (28 − 29) < 0 and 30 > 0 (ComputePart1Item31's 2015 rule).
// Page 3: items 1-6 entered (Exempt / AAFM / FinalTaxWithheld); item 21 = the withholding sum; Part I BI1/2/3/7A/
//   7B/9A/9B entered, BI10 = the halved Σ over the page + the B1/B2 rows. Items 4A/4B-6A/6B and 8A/8B are
//   descriptions/rates (no totals). The schedule's I7-I20 iterates are modal-fed only.
// The computeRegularIncomeTax bands (computePt4I14): 0 ≤ 10k 5%; 30k 10%+500; 70k 15%+2500; 140k 20%+8500;
//   250k 25%+22500; 500k 30%+50000; else 32%+125000 — with ≤ 0 → 0.
import template from "./template/1700.json";
import { NegativeValue, NumWithComma, NumWithParenthesis, formatCurrencyWOC } from "./form1702mx-bir.ts";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { legacyEscape } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export const P = "frm1700:";
type TemplateRecord = [string, string, string?];
type Read = (id: string) => string;
const TEMPLATE = template as TemplateRecord[];
const bare = (k: string): string => (k.startsWith(P) ? k.slice(P.length) : k);

// ── the modal row layouts: the created (temp) id per column; {i} = the creation index ──
interface Modal1700 {
  name: string;
  counter: string;
  /** [temp id stem with {i}, kind] per column, in the row's textbox order (for the reset ids). */
  columns: Array<[string, "text" | "money" | "select" | "check"]>;
  /** The first row's {i} (the employer rows continue items 1-3 at 4). */
  first_index?: number;
  /** The summation substrings summed (within temp+main copies) into `subtotals`, then halved. */
  from: string[];
  subtotals: string[];
  /** The containers summation() scans: "temp"/"main" for this modal's own tables, plus page divs. */
  scan?: string[];
  /** The main-line fields: ≥ 2 rows → OTHERS + the subtotals; 1 row → that row; 0 → cleared. */
  line?: { text: string[]; amount: string[] };
}
export const MODALS: Modal1700[] = [
  {
    // the employer-continuation rows are items 4, 5, … (n = row + 3); the checkboxes ride in the row
    name: "modalPage2Part4", counter: "txtCtrmodalPage2Part4", first_index: 4,
    columns: [
      ["txtPg2Pt4I3NameOfEmployer{i}", "text"], ["txtPg2Pt4I3EMPTIN1{i}", "text"], ["txtPg2Pt4I3EMPTIN2{i}", "text"],
      ["txtPg2Pt4I3EMPTIN3{i}", "text"], ["txtPg2Pt4I3EMPTINBranchCode{i}", "text"],
      ["txtPg2Pt4I{i}ComIncomeC1", "money"], ["txtPg2Pt4I{i}TaxWithholdC2", "money"],
      ["rdoPg2Pt4I{i}TaxFiler", "check"], ["rdoPg2Pt4I{i}Spouse", "check"],
    ],
    from: [], subtotals: [],
  },
  {
    name: "Page2Part4I12ModalI12", counter: "txtCtrPage2Part4I12ModalI12",
    columns: [["txtPg2Pt4I12Description_{i}C1", "text"], ["txtPg2Pt4I12TaxFiler_{i}C2", "money"], ["txtPg2Pt4I12Spouse_{i}C3", "money"]],
    from: ["Pg2Pt4I12TaxFiler_", "Pg2Pt4I12Spouse_"], subtotals: ["txtPg2Pt4I12C1", "txtPg2Pt4I12C2"],
    line: { text: ["txtPg2Pt4I12"], amount: ["txtPg2Pt4I12C1", "txtPg2Pt4I12C2"] },
  },
  {
    name: "Page3Part5I6ModalA1", counter: "txtCtrPage3Part5I6ModalA1",
    columns: [["txtPg3Pt5I6Description_{i}C1", "text"], ["txtPg3Pt5I6AAFM_{i}C2", "money"], ["txtPg3Pt5I6FinalTaxWithheld_{i}C3", "money"]],
    from: ["AAFM_", "FinalTaxWithheld_"], subtotals: ["txtPg2Pt4I6SubtotalC1", "txtPg2Pt4I6SubtotalC2"],
  },
  {
    name: "Page3Part5ModalA2", counter: "txtCtrPage3Part5ModalA2",
    columns: [
      ["txtPg3Pt5I7_{i}C1", "text"], ["txtPg3Pt5I7_{i}C2", "text"],
      ["txtPg3Pt5I8_{i}C1", "text"], ["txtPg3Pt5I8_{i}C2", "text"],
      ["txtPg3Pt5I9_{i}C1", "text"], ["txtPg3Pt5I9_{i}C2", "text"],
      ["txtPg3Pt5I10_{i}C1", "money"], ["txtPg3Pt5I10_{i}C2", "money"],
      ["txtPg3Pt5I11SaleEx1_{i}C1", "money"], ["txtPg3Pt5I11SaleEx2_{i}C2", "money"],
    ],
    from: ["SaleEx1_", "SaleEx2_"], subtotals: ["txtPg2Pt4I11SubtotalC1", "txtPg2Pt4I11SubtotalC2"],
  },
  {
    name: "Page3Part5ModalA3", counter: "txtCtrPage3Part5ModalA3",
    columns: [
      ["drpPg3Pt5I12A1{i}", "select"], ["txtPg3Pt5I12_{i}C1", "text"], ["drpPg3Pt5I12B2{i}", "select"], ["txtPg3Pt5I12_{i}C2", "text"],
      ["txtPg3Pt5I13_{i}C1", "text"], ["txtPg3Pt5I13_{i}C2", "text"],
      ["txtPg3Pt5I14_{i}C1", "money"], ["txtPg3Pt5I14_{i}C2", "money"],
      ["txtPg3Pt5I15DateofIssue_{i}C1", "text"], ["txtPg3Pt5I15DateofIssue_{i}C2", "text"],
      ["txtPg3Pt5I16{i}C1", "money"], ["txtPg3Pt5I16{i}C2", "money"],
      ["txtPg3Pt5I17SaleEx1_{i}C1", "money"], ["txtPg3Pt5I17SaleEx2_{i}C2", "money"],
    ],
    from: ["SaleEx1_", "SaleEx2_"], subtotals: ["txtPg2Pt4I17SubtotalC1", "txtPg2Pt4I17SubtotalC2"],
  },
  {
    name: "Page3Part5ModalA4", counter: "txtCtrPage3Part5ModalA4",
    columns: [
      ["txtPg3Pt5I18R1_{i}C1", "text"], ["txtPg3Pt5I18R2_{i}C2", "text"], ["txtPg3Pt5I18R1_{i}C3", "text"], ["txtPg3Pt5I18R2_{i}C4", "text"],
      ["txtPg3Pt5I19_{i}C1", "money"], ["txtPg3Pt5I19_{i}C2", "money"],
      ["txtPg3Pt5I20SaleEx1_{i}C1", "money"], ["txtPg3Pt5I20SaleEx2_{i}C2", "money"],
    ],
    from: ["SaleEx1_", "SaleEx2_"], subtotals: ["txtPg2Pt4I20SubtotalC1", "txtPg2Pt4I20SubtotalC2"],
  },
  {
    name: "Page3Part5ModalB1", counter: "txtCtrPage3Part5ModalB1",
    columns: [
      ["txtPg3Pt5BI4_{i}C1", "text"], ["txtPg3Pt5BI4_{i}C2", "text"],
      ["txtPg3Pt5BI5_{i}C1", "text"], ["txtPg3Pt5BI5_{i}C2", "text"],
      ["txtPg3Pt5BI6_{i}C1", "text"], ["txtPg3Pt5BI6_{i}C2", "text"],
      ["txtPg3Pt5BI7_{i}C1", "money"], ["txtPg3Pt5BI7_{i}C2", "money"],
    ],
    from: [], subtotals: [],
  },
  {
    name: "Page3Part5ModalB2", counter: "txtCtrPage3Part5ModalB2",
    columns: [
      ["txtPg3Pt5BI8_{i}C1", "text"], ["txtPg3Pt5BI8_{i}C2", "text"],
      ["txtPg3Pt5BI9_{i}C1", "money"], ["txtPg3Pt5BI9_{i}C2", "money"],
    ],
    from: [], subtotals: [],
  },
];
/** A modal row's saved id: the column stem at row n (1-based) — the main (Repository) copy keeps the temp ids. */
export const modalId = (m: Modal1700, stem: string, n: number): string => stem.replace("{i}", String(n + (m.first_index ?? 1) - 1));
export const MODAL_GROUP: GroupSpec[] = MODALS.map((m) => ({
  name: m.name,
  size_field: `${P}${m.counter}`,
  first_index: m.first_index ?? 1,
  row: m.columns.map(([stem, kind]) => ({ id: `${P}${stem}`, kind: kind === "check" ? ("checkbox" as const) : kind })),
}));

// ── the sim ──
const fmt = (x: number): string => NegativeValue(formatCurrencyWOC(Math.round(x)));
const nwc = (v: string | undefined): number => {
  const x = NumWithComma(NumWithParenthesis(v ?? ""));
  return Number.isNaN(x) ? 0 : x;
};
/** NumWithComma WITHOUT the paren handling: a "(1,234)" value parses as NaN (computePt4I10C2/I11C2's parse). */
const nwcNoParen = (v: string | undefined): number => {
  const x = NumWithComma(v ?? "");
  return Number.isNaN(x) ? 0 : x;
};
const graduated1700 = (income: number): number => {
  if (income <= 0) return 0;
  if (income < 10000) return income * (5 / 100);
  if (income < 30000) return (income - 10000) * (10 / 100) + 500;
  if (income < 70000) return (income - 30000) * (15 / 100) + 2500;
  if (income < 140000) return (income - 70000) * (20 / 100) + 8500;
  if (income < 250000) return (income - 140000) * (25 / 100) + 22500;
  if (income < 500000) return (income - 250000) * (30 / 100) + 50000;
  return (income - 500000) * (32 / 100) + 125000;
};

export class Sim1700 {
  v: Record<string, string> = {};
  chk: Record<string, boolean> = {};
  dis: Record<string, boolean> = {};
  /** The modal rows: per modal, per row, per column — the VALUES (the ids come from the layout + reset). */
  tbl: Record<string, string[][]> = {};
  /** False during the filer's fill, true after the save → reopen (the enabled sets differ). */
  reloaded = false;
  readonly mainRow = { name: "", tin: ["", "", "", ""], filer: false, spouse: false, com: "0", wh: "0" };

  g(id: string): string { return this.v[id] ?? ""; }
  set(id: string, value: string | number): void { this.v[id] = String(value); }

  /** formatDisplayAmount on blur: formatCurrencyWOC of the typed value. */
  fmtInput(id: string): void { this.set(id, formatCurrencyWOC(NumWithComma(NumWithParenthesis(this.g(id))))); }
  /** setToZeroIfEmpty on change. */
  zeroIfEmpty(id: string): void {
    const v = this.g(id).trim();
    if (v === "" || (Number(v) * 1).toString() === "NaN" || Number(NumWithComma(NumWithParenthesis(v))) < 0) this.set(id, "0");
  }

  // ── page 2 Part IV ──
  employerRows(): Array<{ filer: boolean; spouse: boolean; com: string; wh: string }> {
    const out: Array<{ filer: boolean; spouse: boolean; com: string; wh: string }> = [];
    for (const i of [1, 2, 3]) {
      out.push({
        filer: !!this.chk[`rdoPg2Pt4I${i}TaxFiler`], spouse: !!this.chk[`rdoPg2Pt4I${i}Spouse`],
        com: this.g(`txtPg2Pt4I${i}ComIncomeC1`) || "0", wh: this.g(`txtPg2Pt4I${i}TaxWithholdC2`) || "0",
      });
    }
    const rows = this.tbl.modalPage2Part4 ?? [];
    rows.forEach((row, j) => {
      out.push({
        filer: !!this.chk[`rdoPg2Pt4I${j + 4}TaxFiler`], spouse: !!this.chk[`rdoPg2Pt4I${j + 4}Spouse`],
        com: row[5] ?? "0", wh: row[6] ?? "0",
      });
    });
    return out;
  }

  /** sumTaxSpouseIterate: 4A = Σ the filer rows' ComIncome/TaxWithhold; 4B = the spouse rows'. */
  sumTaxSpouseIterate(): void {
    let filerCom = 0, filerWh = 0, spouseCom = 0, spouseWh = 0;
    for (const row of this.employerRows()) {
      if (row.filer) { filerCom += nwc(row.com); filerWh += nwc(row.wh); }
      if (row.spouse) { spouseCom += nwc(row.com); spouseWh += nwc(row.wh); }
    }
    this.set("txtPg2Pt4I4AC1", fmt(filerCom));
    this.set("txtPg2Pt4I4AC2", fmt(filerWh));
    this.set("txtPg2Pt4I4BC1", fmt(spouseCom));
    this.set("txtPg2Pt4I4BC2", fmt(spouseWh));
    this.computePt4I15C1();
    this.computePt4I15C2();
    this.processTaxReturn1();
    this.processTaxReturn2();
  }

  /** sumIterateOnlyPg2Pt4: the MAIN item-3 row carries the modal rows' Σ and the I4 subtotals copy it. */
  sumIterateOnlyPg2Pt4(): void {
    let com = 0, wh = 0;
    for (const row of (this.tbl.modalPage2Part4 ?? [])) { com += nwc(row[5]); wh += nwc(row[6]); }
    this.set("txtPg2Pt4I3ComIncomeC1", fmt(com));
    this.set("txtPg2Pt4I3TaxWithholdC2", fmt(wh));
    this.set("txtPg2Pt4I4SubtotalC1", fmt(com));
    this.set("txtPg2Pt4I4SubtotalC2", fmt(wh));
  }

  computePt4I6C1(): void {
    const a = nwc(this.g("txtPg2Pt4I4AC1")), b = nwc(this.g("txtPg2Pt4I5C1"));
    if (!Number.isNaN(nwc(this.g("txtPg2Pt4I4AC1")))) {
      this.set("txtPg2Pt4I6C1", NegativeValue(formatCurrencyWOC(a - (Number.isNaN(nwc(this.g("txtPg2Pt4I5C1"))) ? 0 : b))));
    }
    this.computePt4I10C1();
    this.computePt4I11C1();
    this.computePt4I13("taxpayer");
  }
  computePt4I6C2(): void {
    const a = nwc(this.g("txtPg2Pt4I4BC1")), b = nwc(this.g("txtPg2Pt4I5C2"));
    if (!Number.isNaN(nwc(this.g("txtPg2Pt4I4BC1")))) {
      this.set("txtPg2Pt4I6C2", NegativeValue(formatCurrencyWOC(a - (Number.isNaN(nwc(this.g("txtPg2Pt4I5C2"))) ? 0 : b))));
    }
    this.computePt4I10C2();
    this.computePt4I11C2();
    this.computePt4I13("taxspouse");
  }
  computePt4I10C1(): void {
    this.set("txtPg2Pt4I10C1", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I7C1")) + nwc(this.g("txtPg2Pt4I8C1")) + nwc(this.g("txtPg2Pt4I9C1")))));
    this.computePt4I11C1();
  }
  computePt4I10C2(): void {
    // BIR's C2 readers parse with NumWithComma alone: a parenthesized value is NaN → 0 (the C1 column has
    // NumWithParenthesis; the C2 column does not — another BIR asymmetry)
    this.set("txtPg2Pt4I10C2", NegativeValue(formatCurrencyWOC(nwcNoParen(this.g("txtPg2Pt4I7C2")) + nwcNoParen(this.g("txtPg2Pt4I8C2")) + nwcNoParen(this.g("txtPg2Pt4I9C2")))));
    this.computePt4I11C2();
  }
  computePt4I11C1(): void {
    this.set("txtPg2Pt4I11C1", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I6C1")) - nwc(this.g("txtPg2Pt4I10C1")))));
  }
  computePt4I11C2(): void {
    this.set("txtPg2Pt4I11C2", NegativeValue(formatCurrencyWOC(nwcNoParen(this.g("txtPg2Pt4I6C2")) - nwcNoParen(this.g("txtPg2Pt4I10C2")))));
  }
  /** computePt4I9: 9 = 25,000 × the qualified dependents (page 4's Table 2 count). */
  computePt4I9C1(): void {
    if (this.chk.rdoPg1Pt1I14YesInd) {
      this.set("txtPg2Pt4I9C1", NegativeValue(formatCurrencyWOC(25000 * (Number.isNaN(Number(this.g("txtPg1Pt1I15QualifyDependent"))) ? 0 : Number(this.g("txtPg1Pt1I15QualifyDependent"))))));
      this.set("txtPg2Pt4I9C2", "0");
    } else {
      this.set("txtPg2Pt4I9C1", "0");
    }
    this.computePt4I10C1();
    this.computePt4I13("taxpayer");
    this.computeP2Pt4I20C1();
  }
  computePt4I9C2(): void {
    const dependents = this.g("txtPg1Pt1I22SpouseQualifiedDependentChildren");
    if (this.chk.rdoPg1Pt1I3JointFilingYes && this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes) {
      this.set("txtPg2Pt4I9C2", NegativeValue(formatCurrencyWOC(25000 * (Number.isNaN(Number(dependents)) ? 0 : Number(dependents)))));
      this.set("txtPg2Pt4I9C1", "0");
    } else if (!this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes) {
      this.set("txtPg2Pt4I9C2", "0");
    }
    if (this.chk.rdoPg1Pt1I3JointFilingNo) this.set("txtPg2Pt4I9C2", "0");
    this.computePt4I10C2();
    this.computePt4I13("taxspouse");
    this.computeP2Pt4I20C2();
  }
  computePt4I13(person: "taxpayer" | "taxspouse"): void {
    const s = person === "taxpayer" ? "C1" : "C2";
    this.set(`txtPg2Pt4I13${s}`, NegativeValue(formatCurrencyWOC(nwc(this.g(`txtPg2Pt4I11${s}`)) + nwc(this.g("txtPg2Pt4I12C1".replace("C1", s))))));
    this.computePt4I14(person);
  }
  computePt4I14(person: "taxpayer" | "taxspouse"): void {
    const s = person === "taxpayer" ? "C1" : "C2";
    const income = nwc(this.g(`txtPg2Pt4I13${s}`)) * 1;
    this.set(`txtPg2Pt4I14${s}`, NegativeValue(formatCurrencyWOC(Math.round(graduated1700(income)))));
    this.processPart1Item23();
    this.processPart1Item24();
  }
  computePt4I15C1(): void {
    this.set("txtPg2Pt4I15C1", this.g("txtPg2Pt4I4AC2"));
    this.computePt4I19("taxpayer");
  }
  computePt4I15C2(): void {
    this.set("txtPg2Pt4I15C2", this.g("txtPg2Pt4I4BC2"));
    this.computePt4I19("taxspouse");
  }
  computePt4I19(person: "taxpayer" | "taxspouse"): void {
    const s = person === "taxpayer" ? "C1" : "C2";
    this.set(`txtPg2Pt4I19${s}`, NegativeValue(formatCurrencyWOC(nwc(this.g(`txtPg2Pt4I15${s}`)) + nwc(this.g(`txtPg2Pt4I16${s}`)) + nwc(this.g(`txtPg2Pt4I17${s}`)) + nwc(this.g(`txtPg2Pt4I18${s}`)))));
    if (person === "taxpayer") { this.computeP2Pt4I20C1(); this.computeP2Pt4I23(); this.processPart1Item26(); }
    else { this.computeP2Pt4I20C2(); this.computeP2Pt4I23(); this.processPart1Item27(); }
  }
  computeP2Pt4I20C1(): void {
    this.set("txtPg2Pt4I20C1", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I14C1")) - nwc(this.g("txtPg2Pt4I19C1")))));
    this.computeP2Pt4I21();
  }
  computeP2Pt4I20C2(): void {
    this.set("txtPg2Pt4I20C2", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I14C2")) - nwc(this.g("txtPg2Pt4I19C2")))));
    this.computeP2Pt4I21();
  }
  computeP2Pt4I21(): void {
    this.set("txtPg2Pt4I21", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I20C1")) + nwc(this.g("txtPg2Pt4I20C2")))));
    this.processRulePart4Item22();
    this.computeP2Pt4I23();
    this.computeP2Pt4I28();
  }
  computeP2Pt4I23(): void {
    this.set("txtPg2Pt4I23", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I21")) - nwc(this.g("txtPg2Pt4I22")))));
  }
  computeP2Pt4I27(): void {
    this.set("txtPg2Pt4I27", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I24")) + nwc(this.g("txtPg2Pt4I25")) + nwc(this.g("txtPg2Pt4I26")))));
    this.processPart1Item30();
    this.ComputePart1Item31();
  }
  computeP2Pt4I28(): void {
    this.set("txtPg2Pt4I28", NegativeValue(formatCurrencyWOC(nwc(this.g("txtPg2Pt4I23")) + nwc(this.g("txtPg2Pt4I27")))));
    this.ComputePart1Item28();
    this.ComputePart1Item31();
  }
  processRulePart4Item22(): void {
    const i14 = nwc(this.g("txtPg2Pt4I14C1")) + nwc(this.g("txtPg2Pt4I14C2"));
    const i21 = nwc(this.g("txtPg2Pt4I21"));
    const i19 = nwc(this.g("txtPg2Pt4I19C1")) + nwc(this.g("txtPg2Pt4I19C2"));
    // cleared AND disabled under the rule, enabled otherwise (so the harness/the filer blurs it only then)
    if (i14 < 2000 || i14 === 0 || i21 <= 0 || i19 >= i14) { this.set("txtPg2Pt4I22", ""); this.dis.txtPg2Pt4I22 = true; }
    else this.dis.txtPg2Pt4I22 = false;
  }
  /** disablePt4I7: the hospitalization-premium columns per the filing/claim rule (item 6's 250,000 cap). */
  disablePt4I7(): void {
    const sum = nwc(this.g("txtPg2Pt4I4AC1")) + nwc(this.g("txtPg2Pt4I4BC1"));
    if (this.chk.rdoPg1Pt1I3JointFilingYes) {
      if (this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes) {
        this.dis.txtPg2Pt4I7C2 = false;
        this.dis.txtPg2Pt4I7C1 = true;
        this.set("txtPg2Pt4I7C1", "0");
        if (sum > 250000) { this.dis.txtPg2Pt4I7C2 = true; this.set("txtPg2Pt4I7C2", "0"); }
      } else {
        this.dis.txtPg2Pt4I7C1 = false;
        this.dis.txtPg2Pt4I7C2 = true;
        this.set("txtPg2Pt4I7C2", "0");
        if (sum > 250000) { this.dis.txtPg2Pt4I7C1 = true; this.set("txtPg2Pt4I7C1", "0"); }
      }
    } else {
      this.dis.txtPg2Pt4I7C1 = false;
      this.dis.txtPg2Pt4I7C2 = true;
      this.set("txtPg2Pt4I7C2", "0");
      if (sum > 250000) { this.dis.txtPg2Pt4I7C1 = true; this.set("txtPg2Pt4I7C1", "0"); }
    }
  }
  processTaxReturn1(): void {
    this.computePt4I6C1();
    this.computePt4I10C1();
    this.computePt4I13("taxpayer");
    this.computePt4I14("taxpayer");
    this.disablePt4I7();
    this.computeP2Pt4I20C1();
    this.processRulePart4Item22();
    this.computeP2Pt4I28();
  }
  processTaxReturn2(): void {
    this.computePt4I6C2();
    this.computePt4I10C2();
    this.computePt4I13("taxspouse");
    this.computePt4I14("taxspouse");
    this.disablePt4I7();
    this.computeP2Pt4I20C2();
    this.processRulePart4Item22();
    this.computeP2Pt4I28();
  }

  // ── BIR's reload procedures (enableAllControl → initializeControls → the joint-filing flow) ──
  /** processTFEmployer / processSpEmployer: an unticked employer row is cleared and disabled. */
  processEmployer(item: number): void {
    const ticked = !!this.chk[`rdoPg2Pt4I${item}TaxFiler`] || !!this.chk[`rdoPg2Pt4I${item}Spouse`];
    if (!ticked) {
      this.set(`txtPg2Pt4I${item}NameOfEmployer`, "");
      this.set(`txtPg2Pt4I${item}EMPTIN1`, "");
      this.set(`txtPg2Pt4I${item}EMPTIN2`, "");
      this.set(`txtPg2Pt4I${item}EMPTIN3`, "");
      this.set(`txtPg2Pt4I${item}EMPTINBranchCode`, "000");
      this.set(`txtPg2Pt4I${item}ComIncomeC1`, "0");
      this.set(`txtPg2Pt4I${item}TaxWithholdC2`, "0");
    }
  }
  /** processCivilStatus: item 8 is the FIXED personal exemption by civil status, then disabled. */
  processCivilStatusSim(): void {
    const status = ["rdoPg1Pt1I13SingleInd", "rdoPg1Pt1I13MarriedInd", "rdoPg1Pt1I13LegalSeparatedInd", "rdoPg1Pt1I13WidowerInd"].some((id) => this.chk[id]);
    if (!status) return;
    this.set("txtPg2Pt4I8C1", "50,000");
    this.set("txtPg2Pt4I8C2", this.chk.rdoPg1Pt1I3JointFilingYes && this.chk.rdoPg1Pt1I13MarriedInd ? "50,000" : "0");
    this.computePt4I10C1();
    this.computePt4I10C2();
    this.processTaxReturn1();
    this.processTaxReturn2();
  }
  /** clearSpouseData: the spouse identity cleared, the branch code defaulted to 000. */
  clearSpouseData(): void {
    for (const id of ["txtPg1Pt1I16TaxSpouseLastName", "txtPg1Pt1I16TaxSpouseFirstName", "txtPg1Pt1I16TaxSpouseMiddleName", "txtPg1Pt1I17SpouseTIN1", "txtPg1Pt1I17SpouseTIN2", "txtPg1Pt1I17SpouseTIN3", "txtPg1Pt1I18SpouseContactNumber", "txtPg1Pt1I19SpouseDOB", "txtPg1Pt1I20SpouseEmailAddress", "txtPg1Pt1I22SpouseQualifiedDependentChildren"])
      this.set(id, "");
    this.set("txtPg1Pt1I17SpouseBranchCode", "000");
    this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes = false;
    this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionNo = false;
  }
  /** enableOtherIncome: item 12 lives only under SourceOfIncome_2; otherwise cleared to 0. */
  enableOtherIncomeSim(): void {
    if (!this.chk.SourceOfIncome_2) {
      this.set("txtPg2Pt4I12", "");
      this.set("txtPg2Pt4I12C1", "0");
      this.set("txtPg2Pt4I12C2", "0");
      this.computePage2I12();
    }
  }
  /** initializeControls' processTFEmployer + processSpEmployer per main employer row. A row with BOTH boxes saved
   *  ticked loses its TaxFiler tick here without being cleared (the Spouse-checked branch only unticks). */
  initializeEmployerSim(): void {
    for (const item of [1, 2, 3]) {
      const tf = `rdoPg2Pt4I${item}TaxFiler`, sp = `rdoPg2Pt4I${item}Spouse`;
      if (this.chk[sp]) this.chk[tf] = false;
      else if (!this.chk[tf]) this.processEmployer(item);
      if (this.chk.rdoPg1Pt1I3JointFilingYes) {
        if (this.chk[tf]) this.chk[sp] = false;
        else if (!this.chk[sp]) this.processEmployer(item);
      }
    }
  }
  /** disableSingle (the tail of initializeControls). */
  disableSingleSim(): void {
    if (this.chk.rdoPg1Pt1I13SingleInd) { this.chk.rdoPg1Pt1I3JointFilingNo = true; this.chk.rdoPg1Pt1I3JointFilingYes = false; }
    if (!this.chk.rdoPg1Pt1I3JointFilingYes) for (const item of [1, 2, 3]) this.chk[`rdoPg2Pt4I${item}Spouse`] = false;
    if (this.chk.rdoPg1Pt1I3JointFilingNo && this.chk.rdoPg1Pt1I13MarriedInd) this.computeQualifiedDependent();
    else if (this.chk.rdoPg1Pt1I3JointFilingNo && !this.chk.rdoPg1Pt1I13MarriedInd) this.clearSpouseData();
  }
  /** processJointFiling at reload (called by enableAllControl after initializeControls). */
  processJointFilingSim(): void {
    if (this.chk.rdoPg1Pt1I3JointFilingYes && !this.chk.rdoPg1Pt1I3JointFilingNo) {
      // disableForJointFiling + processCivilStatus + enableSpouse(true), which resets the spouse's branch code
      for (const id of ["rdoPg1Pt1I13SingleInd", "rdoPg1Pt1I13LegalSeparatedInd", "rdoPg1Pt1I13WidowerInd"]) this.chk[id] = false;
      this.chk.rdoPg1Pt1I13MarriedInd = true;
      this.processCivilStatusSim();
      // BIR DEFECT: the reload's enableSpouse(true) also resets a TYPED spouse branch code to 000. The filer's own
      // click on Yes did the same reset BEFORE they typed it, so BIR's save holds the typed code: keep it (ledgered
      // in test/parity.test.ts), and default only an untyped one, as the click does
      if ((this.g("txtPg1Pt1I5TIN1") !== "" || this.g("txtPg1Pt1I5TIN2") !== "" || this.g("txtPg1Pt1I5TIN3") !== "") && this.g("txtPg1Pt1I17SpouseBranchCode") === "")
        this.set("txtPg1Pt1I17SpouseBranchCode", "000");
    } else if (!this.chk.rdoPg1Pt1I3JointFilingYes && this.chk.rdoPg1Pt1I3JointFilingNo) {
      // disableSpouseExemptionClaims
      if (this.chk.rdoPg1Pt1I14YesInd) { this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes = false; this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionNo = false; }
      this.processCivilStatusSim();
      // enableSpouse(false) + resetTfSpEmployers: no Spouse tick survives a non-joint return
      for (const item of [1, 2, 3]) this.chk[`rdoPg2Pt4I${item}Spouse`] = false;
    }
  }

  // ── page 1 ──
  processPart1Item23(): void { this.set("txtPg1Pt2I23FilerTaxDue", this.g("txtPg2Pt4I14C1")); this.ComputePart1Item25(); }
  processPart1Item24(): void { this.set("txtPg1Pt2I24SpouseTaxDue", this.g("txtPg2Pt4I14C2")); this.ComputePart1Item25(); }
  ComputePart1Item25(): void {
    const a = parseInt(String(nwc(this.g("txtPg1Pt2I23FilerTaxDue"))), 10);
    const b = parseInt(String(nwc(this.g("txtPg1Pt2I24SpouseTaxDue"))), 10);
    this.set("txtPg1Pt2I25TotalIncomeTaxDue", NegativeValue(formatCurrencyWOC((Number.isNaN(a) ? 0 : a) + (Number.isNaN(b) ? 0 : b))));
  }
  processPart1Item26(): void { this.set("txtPg1Pt2I26TaxFilersTaxCredit", this.g("txtPg2Pt4I19C1")); this.ComputePart1Item28(); }
  processPart1Item27(): void { this.set("txtPg1Pt2I27SpouseTaxCredit", this.g("txtPg2Pt4I19C2")); this.ComputePart1Item28(); }
  ComputePart1Item28(): void {
    const i25 = parseInt(String(nwc(this.g("txtPg1Pt2I25TotalIncomeTaxDue"))), 10);
    const i26 = parseInt(String(nwc(this.g("txtPg1Pt2I26TaxFilersTaxCredit"))), 10);
    const i27 = parseInt(String(nwc(this.g("txtPg1Pt2I27SpouseTaxCredit"))), 10);
    this.set("txtPg1Pt2I28NetTaxPayable", NegativeValue(formatCurrencyWOC((Number.isNaN(i25) ? 0 : i25) - ((Number.isNaN(i26) ? 0 : i26) + (Number.isNaN(i27) ? 0 : i27)))));
  }
  processPart1Item29(): void { this.set("txtPg1Pt2I29", this.g("txtPg2Pt4I22")); }
  processPart1Item30(): void { this.set("txtPg1Pt2I30", this.g("txtPg2Pt4I27")); }
  ComputePart1Item31(): void {
    const i28 = nwc(NumWithParenthesis(this.g("txtPg1Pt2I28NetTaxPayable")));
    const i29 = nwc(NumWithParenthesis(this.g("txtPg1Pt2I29")));
    const i30 = nwc(NumWithParenthesis(this.g("txtPg1Pt2I30")));
    let i31 = i28 - i29 + i30;
    if (i28 - i29 < 0 && i30 > 0) i31 = i30;
    this.set("txtPg1Pt2I31", NegativeValue(formatCurrencyWOC(i31)));
  }

  // ── page 3 ──
  /** summation(): Σ every value whose key contains one of `from`, inside the given containers; the value is
   *  written to every `to` after each match (BIR's running-total write; the last write is the full sum). */
  summation(containers: Array<{ keys: string[] }>, from: string[], to: string[]): number {
    let total = 0;
    for (const container of containers)
      for (const key of container.keys)
        for (const f of from)
          if (key.includes(f)) {
            total += nwc(this.v[key] ?? "");
            for (const t of to) this.set(t, NegativeValue(formatCurrencyWOC(Math.round(total))));
          }
    return total;
  }
  /** adjustSummation: parseInt(value / 2) — the halving that cancels the temp+main double count. */
  adjustSummation(id: string): void {
    this.set(id, NegativeValue(formatCurrencyWOC(Math.round(parseInt(String(nwc(this.g(id))) , 10) / 2))));
  }
  /** computeSummationPage3Item21: Σ Page3Content's inputs whose id holds FinalTaxWithheld / I11C / I17C / I20C, in DOM
   *  order. Its other substrings name summationIterationPage3PItem* — elements BIR never declares — so they match
   *  nothing. */
  computeSummationPage3Item21(): void {
    const keys = [1, 2, 3, 4, 5, 6].map((i) => `txtPg3Pt5I${i}FinalTaxWithheld`)
      .concat(["txtPg3Pt5I11C1", "txtPg3Pt5I11C2", "txtPg3Pt5I17C1", "txtPg3Pt5I17C2", "txtPg3Pt5I20C1", "txtPg3Pt5I20C2"]);
    this.summation([{ keys }], keys, ["summationPage3Item21"]);
    this.set("txtPg3Pt5I21TotTaxWithheldPaid", NegativeValue(formatCurrencyWOC(Math.round(parseInt(String(nwc(this.g("summationPage3Item21"))), 10)))));
  }
  computePage3I6(): void {
    const rows = this.tbl.Page3Part5I6ModalA1 ?? [];
    let aafm = 0, wh = 0;
    for (const row of rows) { aafm += nwc(row[1]) * 2; wh += nwc(row[2]) * 2; } // the temp + main double count
    this.set("txtPg2Pt4I6SubtotalC1", fmt(aafm));
    this.adjustSummation("txtPg2Pt4I6SubtotalC1");
    this.set("txtPg2Pt4I6SubtotalC2", fmt(wh));
    this.adjustSummation("txtPg2Pt4I6SubtotalC2");
    // BIR then writes summationIterationPage3PItem6 — never declared, so the function throws here
  }
  computePage3I11(): void {
    const rows = this.tbl.Page3Part5ModalA2 ?? [];
    let a = 0, b = 0;
    for (const row of rows) { a += nwc(row[8]) * 2; b += nwc(row[9]) * 2; }
    this.set("txtPg2Pt4I11SubtotalC1", fmt(a));
    this.adjustSummation("txtPg2Pt4I11SubtotalC1");
    this.set("txtPg2Pt4I11SubtotalC2", fmt(b));
    this.adjustSummation("txtPg2Pt4I11SubtotalC2");
    // BIR then writes summationIterationPage3PItem11C1 — never declared, so the function throws here
  }
  computePage3I17(): void {
    const rows = this.tbl.Page3Part5ModalA3 ?? [];
    let a = 0, b = 0;
    for (const row of rows) { a += nwc(row[12]) * 2; b += nwc(row[13]) * 2; }
    this.set("txtPg2Pt4I17SubtotalC1", fmt(a));
    this.adjustSummation("txtPg2Pt4I17SubtotalC1");
    this.set("txtPg2Pt4I17SubtotalC2", fmt(b));
    this.adjustSummation("txtPg2Pt4I17SubtotalC2");
    // BIR then writes summationIterationPage3PItem17C1 — never declared, so the function throws here
  }
  computePage3I20(): void {
    const rows = this.tbl.Page3Part5ModalA4 ?? [];
    let a = 0, b = 0;
    for (const row of rows) { a += nwc(row[6]) * 2; b += nwc(row[7]) * 2; }
    this.set("txtPg2Pt4I20SubtotalC1", fmt(a));
    this.adjustSummation("txtPg2Pt4I20SubtotalC1");
    this.set("txtPg2Pt4I20SubtotalC2", fmt(b));
    this.adjustSummation("txtPg2Pt4I20SubtotalC2");
    // BIR then writes summationIterationPage3PItem20C1 — never declared, so the function throws here
  }
  computePage2I12(): void {
    const rows = this.tbl.Page2Part4I12ModalI12 ?? [];
    let a = 0, b = 0;
    for (const row of rows) { a += nwc(row[1]); b += nwc(row[2]); }
    this.set("txtPg2Pt4I12C1", fmt(a * 2)); // BIR's summation scans the temp + main copies: the doubled Σ
    this.adjustSummation("txtPg2Pt4I12C1");
    this.set("txtPg2Pt4I12C2", fmt(b * 2));
    this.adjustSummation("txtPg2Pt4I12C2");
    this.processTaxReturn1();
    this.processTaxReturn2();
  }
  /** The page-3 Part I income Σ (BI10). summation() runs over Page3Content then the B1/B2 modals: the substring
   *  "…BI1" also matches BI10 itself, which by then holds the running Σ of the page fields — so those count twice —
   *  and each modal row counts twice (the temp table and its Repository copy); adjustSummation halves. */
  computePage3BI10(): void {
    let field = 0;
    for (const k of ["txtPg3Pt5BI1", "txtPg3Pt5BI2", "txtPg3Pt5BI3", "txtPg3Pt5BI7A", "txtPg3Pt5BI7B", "txtPg3Pt5BI9A", "txtPg3Pt5BI9B"]) field += nwc(this.g(k));
    let row = 0;
    for (const r of (this.tbl.Page3Part5ModalB1 ?? [])) row += nwc(r[6]) + nwc(r[7]);
    for (const r of (this.tbl.Page3Part5ModalB2 ?? [])) row += nwc(r[2]) + nwc(r[3]);
    this.set("txtPg3Pt5BI10TotalIncome", NegativeValue(formatCurrencyWOC(Math.round(2 * field + 2 * row))));
    this.adjustSummation("txtPg3Pt5BI10TotalIncome");
  }

  /** The qualified-dependents count from page 4's Table 2. */
  computeQualifiedDependent(): void {
    let count = 0;
    for (let i = 1; i <= 4; i++)
      if (this.g(`txtPg4T2FirstName${i}`) !== "" && this.g(`txtPg4T2LastName${i}`) !== "") count++;
    if (this.chk.rdoPg1Pt1I14YesInd) {
      this.set("txtPg1Pt1I15QualifyDependent", count);
      this.computePt4I9C1();
    } else if (this.chk.rdoPg1Pt1I3JointFilingYes && !this.chk.rdoPg1Pt1I14YesInd && this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes) {
      this.set("txtPg1Pt1I22SpouseQualifiedDependentChildren", count);
      this.computePt4I9C2();
    } else if (!this.chk.rdoPg1Pt1I3JointFilingYes && this.chk.rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes) {
      this.set("txtPg1Pt1I22SpouseQualifiedDependentChildren", count);
    }
  }
}

/** sleeptime's maxlength-12 sweep on one value. */
function sweep(value: string): string {
  let v = value;
  if (v.length >= 4) v = formatCurrencyWOC(v);
  v = NegativeValue(v);
  return v === "" ? "0" : v;
}

// ── classification ──
const NUMBERTEXT = new Set(TEMPLATE.filter(([k, v, r]) => !r && (v === "0" || v === "0.00") && k.startsWith(P)).map(([k]) => bare(k)));
// the boolean keys: the named radios/checkboxes AND every key whose blank value is a boolean string
/** The maxlength-12 inputs sleeptime's sweep formats: the money boxes, item 22, minus Part 1's items 29/30 and the
 *  hidden counters/subtotals (which are not maxlength 12). */
const SWEPT = (id: string): boolean =>
  id === "txtPg2Pt4I22" || (NUMBERTEXT.has(id) && id !== "txtPg1Pt2I29" && id !== "txtPg1Pt2I30" && !id.startsWith("txtCtr") && !id.includes("Subtotal"));
const RADIO_KEYS = new Set(TEMPLATE.filter(([k, v, r]) => r || v === "true" || v === "false").map(([k]) => bare(k)));
const DIS_AT_BLANK = new Set(
  ("AmendedRtn_1 AmendedRtn_2 SourceOfIncome_1 txtPg1Pt1I11EmailAddress txtPg1Pt2TaxFiler " +
    "txtPg2Pt4I1NameOfEmployer txtPg2Pt4I1EMPTIN1 txtPg2Pt4I1EMPTIN2 txtPg2Pt4I1EMPTIN3 txtPg2Pt4I1EMPTINBranchCode txtPg2Pt4I1ComIncomeC1 txtPg2Pt4I1TaxWithholdC2 " +
    "txtPg2Pt4I2NameOfEmployer txtPg2Pt4I2EMPTIN1 txtPg2Pt4I2EMPTIN2 txtPg2Pt4I2EMPTIN3 txtPg2Pt4I2EMPTINBranchCode txtPg2Pt4I2ComIncomeC1 txtPg2Pt4I2TaxWithholdC2 " +
    "txtPg2Pt4I3NameOfEmployer txtPg2Pt4I3EMPTIN1 txtPg2Pt4I3EMPTIN2 txtPg2Pt4I3EMPTIN3 txtPg2Pt4I3EMPTINBranchCode txtPg2Pt4I3ComIncomeC1 txtPg2Pt4I3TaxWithholdC2 " +
    "txtPg2Pt4I8C1 txtPg2Pt4I8C2 txtPg2Pt4I12 txtPg2Pt4I12C1 txtPg2Pt4I12C2 txtPg2Pt4I21 txtPg2Pt4I23 txtPg2Pt4I27 txtPg2Pt4I28 " +
    "txtPg3Pt5I21TotTaxWithheldPaid txtPg3Pt5BI10TotalIncome " +
    "txtPg2Pt4I4SubtotalC1 txtPg2Pt4I4SubtotalC2 txtPg2Pt4I6SubtotalC1 txtPg2Pt4I6SubtotalC2 txtPg2Pt4I11SubtotalC1 txtPg2Pt4I11SubtotalC2 txtPg2Pt4I17SubtotalC1 txtPg2Pt4I17SubtotalC2 txtPg2Pt4I20SubtotalC1 txtPg2Pt4I20SubtotalC2").split(" "),
);
const ESCAPED = new Set(["txtPg1Pt1I8TaxFilerLastName"]);
const VERBATIM = new Set(["txtPg1TIN1", "txtPg1TIN2", "txtPg1TIN3", "txtPg1BranchCode"]);
const UNMODELLED = new Set(["driveSelectTPExport", "txtFinalFlag", "txtEnroll", "ebirOnlineConfirmUsername", "ebirOnlineUsername", "ebirOnlineSecret"]);

// the walk order: the template's key order = BIR's DOM order
const PAGE_TEXT: string[] = TEMPLATE.filter(([k, , r]) => k.startsWith(P) && !r && !/^(ddl|drp)/.test(bare(k)) && !UNMODELLED.has(bare(k))).map(([k]) => bare(k));

/** The employer rows' fields enable when the name and the three TIN boxes are filled (enablePage2IterationFields). */
function employerEnabled(s: Sim1700, i: number): boolean {
  return s.g(`txtPg2Pt4I${i}NameOfEmployer`) !== "" && s.g(`txtPg2Pt4I${i}EMPTIN1`) !== "" && s.g(`txtPg2Pt4I${i}EMPTIN2`) !== "" && s.g(`txtPg2Pt4I${i}EMPTIN3`) !== "";
}

function enabledAt(s: Sim1700, id: string): boolean {
  if (/^txtPg2Pt4I[123](NameOfEmployer|EMPTIN|ComIncomeC1|TaxWithholdC2)/.test(id)) {
    const item = id.charAt(10); // "txtPg2Pt4I" is 10 characters
    // before the save the row's fields enable once the name + TIN are typed (enablePage2IterationFields);
    // after the reload they are enabled only when the row's TaxFiler/Spouse box is ticked (processTFEmployer)
    if (s.reloaded) return !!s.chk[`rdoPg2Pt4I${item}TaxFiler`] || !!s.chk[`rdoPg2Pt4I${item}Spouse`];
    return employerEnabled(s, Number(item));
  }
  if (id === "txtPg2Pt4I8C1" || id === "txtPg2Pt4I8C2") {
    // item 8 is the fixed personal exemption: processCivilStatus writes and disables it
    if (s.reloaded) return false;
    return !["rdoPg1Pt1I13SingleInd", "rdoPg1Pt1I13MarriedInd", "rdoPg1Pt1I13LegalSeparatedInd", "rdoPg1Pt1I13WidowerInd"].some((r) => s.chk[r]);
  }
  if (id === "txtPg2Pt4I12" || id === "txtPg2Pt4I12C1" || id === "txtPg2Pt4I12C2") return !!s.chk.SourceOfIncome_2 && (s.tbl.Page2Part4I12ModalI12 ?? []).length === 0;
  if (id === "txtPg2Pt4I22") return !s.dis.txtPg2Pt4I22;
  if (DIS_AT_BLANK.has(id)) return false;
  return true;
}

const HANDLERS: Record<string, [((s: Sim1700) => void) | null, ((s: Sim1700) => void) | null]> = {
  txtPg1Pt1I15QualifyDependent: [null, (s) => s.computeQualifiedDependent()],
  txtPg1Pt1I22SpouseQualifiedDependentChildren: [null, (s) => s.computeQualifiedDependent()],
  txtPg1Pt2I23FilerTaxDue: [null, (s) => { s.processPart1Item23(); }],
  txtPg1Pt2I24SpouseTaxDue: [null, (s) => { s.processPart1Item24(); }],
  txtPg1Pt2I26TaxFilersTaxCredit: [null, (s) => { s.processPart1Item26(); }],
  txtPg1Pt2I27SpouseTaxCredit: [null, (s) => { s.processPart1Item27(); }],
  txtPg1Pt2I29: [null, (s) => { s.processPart1Item29(); s.ComputePart1Item31(); }],
  txtPg1Pt2I30: [null, (s) => { s.processPart1Item30(); s.ComputePart1Item31(); }],
  txtPg2Pt4I1ComIncomeC1: [null, (s) => { s.sumTaxSpouseIterate(); }],
  txtPg2Pt4I1TaxWithholdC2: [null, (s) => { s.sumTaxSpouseIterate(); }],
  txtPg2Pt4I2ComIncomeC1: [null, (s) => { s.sumTaxSpouseIterate(); }],
  txtPg2Pt4I2TaxWithholdC2: [null, (s) => { s.sumTaxSpouseIterate(); }],
  txtPg2Pt4I3ComIncomeC1: [null, (s) => { s.sumTaxSpouseIterate(); s.sumIterateOnlyPg2Pt4(); }],
  txtPg2Pt4I3TaxWithholdC2: [null, (s) => { s.sumTaxSpouseIterate(); s.sumIterateOnlyPg2Pt4(); }],
  txtPg2Pt4I5C1: [null, (s) => { s.processTaxReturn1(); }],
  txtPg2Pt4I5C2: [null, (s) => { s.processTaxReturn2(); }],
  txtPg2Pt4I7C1: [null, (s) => { s.processTaxReturn1(); s.computePt4I11C1(); s.computePt4I13("taxpayer"); }],
  txtPg2Pt4I7C2: [null, (s) => { s.processTaxReturn2(); s.computePt4I11C2(); s.computePt4I13("taxspouse"); }],
  txtPg2Pt4I13C1: [null, (s) => { s.computePt4I14("taxpayer"); }],
  txtPg2Pt4I13C2: [null, (s) => { s.computePt4I14("taxspouse"); }],
  txtPg2Pt4I22: [
    null,
    (s) => {
      const i14 = parseInt(String(nwc(s.g("txtPg2Pt4I14C1"))), 10) + parseInt(String(nwc(s.g("txtPg2Pt4I14C2"))), 10);
      const i21 = parseInt(String(nwc(s.g("txtPg2Pt4I21"))), 10);
      const i22 = parseInt(String(nwc(s.g("txtPg2Pt4I22"))), 10);
      const a = (Number.isNaN(i14) ? 0 : i14) * (50 / 100);
      if (a < i22 || i21 < i22) s.set("txtPg2Pt4I22", "");
      else s.set("txtPg2Pt4I22", NegativeValue(formatCurrencyWOC(s.g("txtPg2Pt4I22"))));
      s.computeP2Pt4I23();
      s.computeP2Pt4I28();
      s.processPart1Item29();
      s.ComputePart1Item31();
    },
  ],
  txtPg2Pt4I24: [null, (s) => { s.computeP2Pt4I27(); }],
  txtPg2Pt4I25: [null, (s) => { s.computeP2Pt4I27(); }],
  txtPg2Pt4I26: [null, (s) => { s.computeP2Pt4I27(); }],
  txtPg3Pt5I1FinalTaxWithheld: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I2FinalTaxWithheld: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I3FinalTaxWithheld: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I4FinalTaxWithheld: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I5FinalTaxWithheld: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I6FinalTaxWithheld: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I11C1: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I11C2: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I17C1: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I17C2: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I20C1: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5I20C2: [null, (s) => s.computeSummationPage3Item21()],
  txtPg3Pt5BI1: [null, (s) => s.computePage3BI10()],
  txtPg3Pt5BI2: [null, (s) => s.computePage3BI10()],
  txtPg3Pt5BI3: [null, (s) => s.computePage3BI10()],
  txtPg3Pt5BI7A: [null, (s) => s.computePage3BI10()],
  txtPg3Pt5BI7B: [null, (s) => s.computePage3BI10()],
  txtPg3Pt5BI9A: [null, (s) => s.computePage3BI10()],
  txtPg3Pt5BI9B: [null, (s) => s.computePage3BI10()],
  txtPg4T2FirstName1: [null, (s) => s.computeQualifiedDependent()],
  txtPg4T2FirstName2: [null, (s) => s.computeQualifiedDependent()],
  txtPg4T2FirstName3: [null, (s) => s.computeQualifiedDependent()],
  txtPg4T2FirstName4: [null, (s) => s.computeQualifiedDependent()],
};

export function run1700Old(read: Read, groups: GroupState, now = new Date()): { value: Record<string, string>; checked: Record<string, boolean>; table: Record<string, string[][]> } {
  void now;
  const s = new Sim1700();
  // the blank form + the filer's values (loadData sets disabled inputs too)
  const input: Record<string, string> = {};
  for (const [k, value, radio] of TEMPLATE) {
    if (!k.startsWith(P)) continue;
    const id = bare(k);
    const typed = read(k);
    s.v[id] = value;
    if (radio || RADIO_KEYS.has(id)) s.chk[id] = typed === "" ? value === "true" : typed === "true";
    else if (typed !== "") input[id] = typed;
  }
  s.v.hidden = "0";
  s.v.hidden30 = "0";
  // the modal rows (temp + main copies both carry them; the ids come out in extra_record)
  for (const m of MODALS) s.tbl[m.name] = (groups[m.name] ?? []).map((row) => m.columns.map(([, ], c) => row[`${P}${m.columns[c]![0]}`] ?? ""));
  // the employer checkboxes for the modal rows
  (groups.modalPage2Part4 ?? []).forEach((row, j) => {
    s.chk[`rdoPg2Pt4I${j + 4}TaxFiler`] = row[`${P}rdoPg2Pt4I{i}TaxFiler`] === "true";
    s.chk[`rdoPg2Pt4I${j + 4}Spouse`] = row[`${P}rdoPg2Pt4I{i}Spouse`] === "true";
  });
  for (const id of PAGE_TEXT) if (id in input) s.v[id] = input[id]!;
  for (const [id, v] of Object.entries(input)) if (!PAGE_TEXT.includes(id)) s.v[id] = v;

  // the filer's walk: every enabled text input changed and left, in DOM order — the flow enables the employer
  // fields once a row's name + TIN are typed, and item 12 only under SourceOfIncome_2
  const walk = () => {
    for (const id of PAGE_TEXT) {
      if (!enabledAt(s, id)) continue;
      const h = HANDLERS[id];
      if (h?.[0]) h[0](s);
      if (NUMBERTEXT.has(id)) s.fmtInput(id);
      if (h?.[1]) h[1](s);
    }
  };
  walk();

  // save → reopen: loadData's saved transform, then BIR's reload — enableAllControl (everything enabled) →
  // initializeControls' re-disables → processJointFiling → enableOtherIncome → the maxlength-12 sweep
  const saved = (id: string, value: string): string => {
    if (RADIO_KEYS.has(id)) return value;
    if (NUMBERTEXT.has(id)) {
      let x = value;
      if (x.includes("(") && x.includes(")")) x = NumWithParenthesis(x).replace(/,/g, "");
      else if (x.includes(",")) x = x.replace(/,/g, "");
      return nwc(x) * 1 !== 0 ? x : "0";
    }
    return VERBATIM.has(id) ? value : value.toUpperCase();
  };
  for (const id of Object.keys(s.v)) s.v[id] = saved(id, s.v[id]!);
  for (const id of PAGE_TEXT) if (id in input) s.v[id] = input[id]!;
  s.reloaded = true;
  s.dis = {}; // enableAllControl
  // the checkboxes whose markup default is checked survive a false save: the reload only ever ticks
  s.chk.SourceOfIncome_1 = true;
  // loadData's "apply changes": the modal rebuilds (saveRowCol(-1) per counter > 0) refresh the subtotals
  if ((s.tbl.modalPage2Part4 ?? []).length > 0) { s.sumIterateOnlyPg2Pt4(); s.sumTaxSpouseIterate(); }
  if ((s.tbl.Page2Part4I12ModalI12 ?? []).length > 0) { s.computePage2I12(); s.set("txtPg2Pt4I12", "OTHERS"); }
  if ((s.tbl.Page3Part5I6ModalA1 ?? []).length > 0) s.computePage3I6();
  if ((s.tbl.Page3Part5ModalA2 ?? []).length > 0) s.computePage3I11();
  if ((s.tbl.Page3Part5ModalA3 ?? []).length > 0) s.computePage3I17();
  if ((s.tbl.Page3Part5ModalA4 ?? []).length > 0) s.computePage3I20();
  // enableAllControl → initializeControls (processTFEmployer/processSpEmployer per row, then disableSingle) →
  // processJointFiling — the zeroings and un-ticks are deterministic from the loaded state, so a native save
  // already holds them
  s.initializeEmployerSim();
  s.disableSingleSim();
  s.processJointFilingSim();
  // the save must be a fixed point of the reload: a row this reload un-ticked without clearing (both boxes saved
  // ticked — BIR's own onclicks never allow that) is cleared by the NEXT reopen's processTFEmployer
  for (const item of [1, 2, 3]) if (!s.chk[`rdoPg2Pt4I${item}TaxFiler`] && !s.chk[`rdoPg2Pt4I${item}Spouse`]) s.processEmployer(item);
  s.enableOtherIncomeSim();
  // sleeptime's "Put comma on numeric fields": every maxlength-12 input — ≥ 4 characters → formatCurrencyWOC,
  // NegativeValue, "" → "0". It reaches the inputs no walk blurs (an un-ticked employer row's kept amounts).
  for (const id of Object.keys(s.v)) if (SWEPT(id)) s.v[id] = sweep(s.v[id]!);
  // …then sleeptime ends with processTaxReturn1(); processTaxReturn2()
  s.processTaxReturn1();
  s.processTaxReturn2();
  s.computeQualifiedDependent();
  walk();
  walk();
  return { value: s.v, checked: s.chk, table: s.tbl };
}

// ── schema ──
/** The keys the model reads; the cache is keyed on their values. */
const INPUT_KEY = TEMPLATE.map(([k]) => k).filter((k) => k.startsWith(P) && !UNMODELLED.has(bare(k)) && !MODALS.some((m) => m.counter === bare(k)));
const cache = new Map<string, { value: Record<string, string>; checked: Record<string, boolean>; table: Record<string, string[][]> }>();
function model(read: Read, groups: GroupState) {
  const key = JSON.stringify([INPUT_KEY.map((k) => read(k)), groups]);
  let m = cache.get(key);
  if (!m) {
    m = run1700Old(read, groups);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    cache.set(key, m);
  }
  return m;
}

/** A displayed "(1,234)" negative is saved "-1,234". */
const negativeSaved = (value: string): string => (/^\([\d,]+\)$/.test(value) ? (value === "(0)" ? "0" : `-${value.slice(1, -1)}`) : value);
const savedValue = (id: string, value: string): string => (NUMBERTEXT.has(id) ? negativeSaved(value) : value);

function fieldList(record: TemplateRecord[]): FieldJson[] {
  return record
    .filter(([key]) => key.startsWith(P) && !UNMODELLED.has(bare(key)) && !MODALS.some((m) => m.counter === bare(key)))
    .map(([key, value, radio]): FieldJson => {
      if (radio || value === "true" || value === "false") return { id: key, kind: "radio" };
      if (/:(ddl|drp)/.test(key)) return { id: key, kind: "select" };
      if (NUMBERTEXT.has(bare(key))) return { id: key, kind: "money" };
      void value;
      return { id: key, kind: "text", ...(ESCAPED.has(bare(key)) ? { escaped: true } : {}) };
    });
}

// the genuinely computed keys — everything else is an input (the employer rows, item 12, item 22-26, items 7-9,
// 16-18, the page-3 schedules and Part I, page 4), whose raw value the overlay keeps
const COMPUTED_1700 = new Set(
  ("txtPg2Pt4I4AC1 txtPg2Pt4I4AC2 txtPg2Pt4I4BC1 txtPg2Pt4I4BC2 " +
    "txtPg2Pt4I6C1 txtPg2Pt4I6C2 txtPg2Pt4I10C1 txtPg2Pt4I10C2 txtPg2Pt4I11C1 txtPg2Pt4I11C2 " +
    "txtPg2Pt4I13C1 txtPg2Pt4I13C2 txtPg2Pt4I14C1 txtPg2Pt4I14C2 txtPg2Pt4I15C1 txtPg2Pt4I15C2 " +
    "txtPg2Pt4I19C1 txtPg2Pt4I19C2 txtPg2Pt4I20C1 txtPg2Pt4I20C2 txtPg2Pt4I21 txtPg2Pt4I23 txtPg2Pt4I27 txtPg2Pt4I28 " +
    "txtPg2Pt4I3ComIncomeC1 txtPg2Pt4I3TaxWithholdC2 " +
    "txtPg2Pt4I4SubtotalC1 txtPg2Pt4I4SubtotalC2 txtPg2Pt4I6SubtotalC1 txtPg2Pt4I6SubtotalC2 txtPg2Pt4I11SubtotalC1 txtPg2Pt4I11SubtotalC2 txtPg2Pt4I17SubtotalC1 txtPg2Pt4I17SubtotalC2 txtPg2Pt4I20SubtotalC1 txtPg2Pt4I20SubtotalC2 " +
    "txtPg1Pt2I23FilerTaxDue txtPg1Pt2I24SpouseTaxDue txtPg1Pt2I25TotalIncomeTaxDue txtPg1Pt2I26TaxFilersTaxCredit " +
    "txtPg1Pt2I27SpouseTaxCredit txtPg1Pt2I28NetTaxPayable txtPg1Pt2I29 txtPg1Pt2I30 txtPg1Pt2I31 " +
    "txtPg3Pt5I21TotTaxWithheldPaid summationPage3Item21 txtPg3Pt5BI10TotalIncome " +
    "txtPg1Pt1I15QualifyDependent txtPg1Pt1I22SpouseQualifiedDependentChildren").split(" "),
);
const isComputedKey = (id: string): boolean => COMPUTED_1700.has(id);

const money = { kind: "money" as const };
// ── the reload's rewrites of INPUT fields, as derives over the raw state ──
const civilStatus = (r: Read): boolean =>
  ["rdoPg1Pt1I13SingleInd", "rdoPg1Pt1I13MarriedInd", "rdoPg1Pt1I13LegalSeparatedInd", "rdoPg1Pt1I13WidowerInd"].some((id) => r(`${P}${id}`) === "true");
const ticked = (r: Read, item: number): boolean => r(`${P}rdoPg2Pt4I${item}TaxFiler`) === "true" || r(`${P}rdoPg2Pt4I${item}Spouse`) === "true";
const employerZero = (item: number, field: string, blank: string) => ({
  derive: (r: Read, v: string) => (ticked(r, item) ? v : blank),
});
const REWRITE_1700: Record<string, Partial<FieldSpec>> = {
  // processTFEmployer / processSpEmployer: an unticked employer row is cleared and disabled
  ...Object.fromEntries([
    ["txtPg2Pt4I1NameOfEmployer", ""], ["txtPg2Pt4I1EMPTIN1", ""], ["txtPg2Pt4I1EMPTIN2", ""], ["txtPg2Pt4I1EMPTIN3", ""], ["txtPg2Pt4I1EMPTINBranchCode", "000"], ["txtPg2Pt4I1ComIncomeC1", "0"], ["txtPg2Pt4I1TaxWithholdC2", "0"],
    ["txtPg2Pt4I2NameOfEmployer", ""], ["txtPg2Pt4I2EMPTIN1", ""], ["txtPg2Pt4I2EMPTIN2", ""], ["txtPg2Pt4I2EMPTIN3", ""], ["txtPg2Pt4I2EMPTINBranchCode", "000"], ["txtPg2Pt4I2ComIncomeC1", "0"], ["txtPg2Pt4I2TaxWithholdC2", "0"],
    ["txtPg2Pt4I3NameOfEmployer", ""], ["txtPg2Pt4I3EMPTIN1", ""], ["txtPg2Pt4I3EMPTIN2", ""], ["txtPg2Pt4I3EMPTIN3", ""], ["txtPg2Pt4I3EMPTINBranchCode", "000"], ["txtPg2Pt4I3ComIncomeC1", "0"], ["txtPg2Pt4I3TaxWithholdC2", "0"],
  ].map(([k, blank]) => [`${P}${k}`, { derive: (r: Read, v: string) => (ticked(r, Number(k!.charAt(10))) ? v : blank as string) }])),
  // enableOtherIncome: item 12 lives only under SourceOfIncome_2
  [`${P}txtPg2Pt4I12`]: { derive: (r, v) => (r(`${P}SourceOfIncome_2`) === "true" ? v : "") },
  [`${P}txtPg2Pt4I12C1`]: { ...money, derive: (r, v) => (r(`${P}SourceOfIncome_2`) === "true" ? v : "0") },
  [`${P}txtPg2Pt4I12C2`]: { ...money, derive: (r, v) => (r(`${P}SourceOfIncome_2`) === "true" ? v : "0") },
  // processCivilStatus: item 8 is the FIXED personal exemption by civil status
  [`${P}txtPg2Pt4I8C1`]: { ...money, derive: (r, v) => (civilStatus(r) ? "50,000" : v) },
  [`${P}txtPg2Pt4I8C2`]: { ...money, derive: (r, v) => (civilStatus(r) ? (r(`${P}rdoPg1Pt1I3JointFilingYes`) === "true" && r(`${P}rdoPg1Pt1I13MarriedInd`) === "true" ? "50,000" : "0") : v) },
  // disablePt4I7: the hospitalization-premium columns per the filing/claim rule
  [`${P}txtPg2Pt4I7C2`]: {
    ...money,
    derive: (r, v) => {
      if (r(`${P}rdoPg1Pt1I3JointFilingNo`) === "true" || r(`${P}rdoPg1Pt1I3JointFilingYes`) !== "true") return "0";
      const claim = r(`${P}rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes`) === "true";
      const sum = nwc(r(`${P}txtPg2Pt4I4AC1`)) + nwc(r(`${P}txtPg2Pt4I4BC1`));
      if (!claim) return "0";
      if (sum > 250000) return "0";
      return v;
    },
  },
  [`${P}txtPg2Pt4I7C1`]: {
    ...money,
    derive: (r, v) => {
      if (r(`${P}rdoPg1Pt1I3JointFilingYes`) !== "true") return v;
      const claim = r(`${P}rdoPg1Pt1I21SpouseClaimAdditionalExemptionYes`) === "true";
      const sum = nwc(r(`${P}txtPg2Pt4I4AC1`)) + nwc(r(`${P}txtPg2Pt4I4BC1`));
      if (claim && sum > 250000) return "0";
      return v;
    },
  },
  // clearSpouseData (JointFilingNo and not married): the spouse branch code defaults to 000
  [`${P}txtPg1Pt1I17SpouseBranchCode`]: {
    derive: (r, v) => (r(`${P}rdoPg1Pt1I3JointFilingNo`) === "true" && r(`${P}rdoPg1Pt1I13MarriedInd`) !== "true" ? "000" : v),
  },
};

export const FORM_1700: FormSchema = (() => {
  const json = fieldList(TEMPLATE);
  const field: FieldSpec[] = json.map((f) => {
    const id = bare(f.id);
    if (!isComputedKey(id)) return { ...f, ...(REWRITE_1700[f.id] ?? {}) };
    return { ...f, compute: () => 0, derive: (r: Read) => { const m = model(r, {}); return f.kind === "radio" ? String(!!m.checked[id]) : savedValue(id, m.value[id] ?? ""); } }; // prettier-ignore
  });
  for (const id of ["txtPg1Pt1I5TIN1", "txtPg1Pt1I5TIN2", "txtPg1Pt1I5TIN3", "txtPg1Pt1I5BranchCode", "txtPg1Pt1I8TaxFilerLastName"]) {
    const f = field.find((x) => x.id === `${P}${id}`);
    if (f) f.required = true;
  }
  return { form_code: "1700", title: "Annual Income Tax Return — Purely Compensation Income (2011 layout)", field, group: MODAL_GROUP, extra_record: (state, groups) => derivedRecord(state, groups, json) };
})();

/** Every saved value BIR derives, plus the modal rows (the main copy keeps the temp ids). */
function derivedRecord(state: FormState, groups: GroupState, json: FieldJson[]): Array<{ key: string; value: string }> {
  const r: Read = (id) => state[id] ?? "";
  const m = model(r, groups);
  const out: Array<{ key: string; value: string }> = [];
  for (const f of json) {
    const id = bare(f.id);
    if (f.kind === "radio") out.push({ key: f.id, value: String(!!m.checked[id]) });
    else out.push({ key: f.id, value: ESCAPED.has(id) ? legacyEscape(savedValue(id, m.value[id] ?? "")) : savedValue(id, m.value[id] ?? "") });
  }
  // item 21's hidden running total (no frm1700: prefix): written by every page-3 withholding blur
  out.push({ key: "summationPage3Item21", value: m.value.summationPage3Item21 ?? "" });
  for (const mod of MODALS) {
    const rows = m.table[mod.name] ?? [];
    // BIR's counter is the main table's row count (tr/3, tr/14 or inner tables — each works out to N)
    out.push({ key: `${P}${mod.counter}`, value: String(rows.length) });
    rows.forEach((row, i) => {
      row.forEach((cell, c) => {
        const [stem, kind] = mod.columns[c]!;
        const created = modalId(mod, stem, i + 1);
        // a money cell is maxlength 12: sleeptime's sweep formats it on every reopen (whole pesos); a checkbox is
        // the reload's tick (initializeControls may un-tick it)
        const value = kind === "text" ? cell.toUpperCase() : kind === "money" ? negativeSaved(sweep(cell)) : kind === "check" ? String(!!m.checked[created]) : ["PS", "CS"].includes(cell) ? cell : "PS"; // the A3 selects: PS | CS, else the first option
        out.push({ key: `${P}${created}`, value });
      });
    });
  }
  return out;
}
