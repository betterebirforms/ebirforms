import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1701 } from "@/form/form1701.ts";
import { COLUMN, MODAL, SCHED1, forCopy, modalCopy, simulate } from "@/form/form1701-sim.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { parityProblem } from "./parity.ts";
import { bizItemized, compensation, id } from "./form1701-case.ts";

// 1701's "(add more...)" pop-ups: BIR's table of extra rows for one schedule item. Two or more rows give the item's
// boxes "OTHERS" and the rows' total, and BIR saves the rows, the pop-up's own subtotal box and a row counter.
const of = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, v]) => [id(k), v]));
const modal = (name: string) => MODAL.find((m) => m.modal === name)!;
/** a group's rows from cells in the layout's order */
const rows = (name: string, copy: string, cell: string[][]): GroupState => {
  const m = modal(name);
  return { [forCopy(name, copy)]: cell.map((c): GroupRow => Object.fromEntries(m.cell.map((x, k) => [forCopy(x.stem, copy), c[k] ?? ""]))) };
};
/** a Schedule 12 pop-up's blocks (page 11): each box by its layout order, money 100 + block number unless given */
const block = (name: string, cell: Array<Record<number, string>>): GroupState => {
  const c = COLUMN.find((x) => x.modal === name)!;
  return { [name]: cell.map((o, b): GroupRow => Object.fromEntries(c.cell.map((x, k) => [x.stem, o[k] ?? (x.ml === 12 ? String(100 + b) : x.select ? "CS" : x.date ? "01/02/2020" : `box${k}`)]))) };
};
/** Schedule 1's employers (page 5): [name, taxpayer or spouse, three TIN boxes, branch, income, tax withheld] */
const employer = (cell: string[][]): GroupState => ({
  [SCHED1.modal]: cell.map(([name, who, t1, t2, t3, t4, income, tax]): GroupRow => {
    const v = [name, String(who === "T"), String(who === "S"), t1, t2, t3, t4, income, tax];
    return Object.fromEntries(SCHED1.cell.map(([stem], k) => [stem, v[k] ?? ""]));
  }),
});
const at = (state: FormState, group: GroupState) => {
  const record = formRecords(FORM_1701, state, group);
  return (k: string) => record.find((r) => r.key === id(k))?.value;
};

const exempt: FormState = { ...bizItemized, ...of({ rdoPg1Pt1I22IncomeExemptYes: "true", rdoPg1Pt1I22IncomeExemptNo: "false", txtAttachmentTypes: "EX1,SP0" }) };
// BIR opens a schedule row by row: an item's boxes (the ones its "(add more...)" hangs on) unlock once the item above
// is filled, and the link once the item itself is.
const item3: FormState = {
  ...bizItemized,
  ...of({ txtPg10Sc11AI2TaxableOtherIncomeC1: "RENT", txtPg10Sc11AI2TaxableOtherIncomeC2: "500", txtPg10Sc11AI3TaxableOtherIncomeC1: "ROYALTY", txtPg10Sc11AI3TaxableOtherIncomeC2: "100" }),
};
const sched3: FormState = {
  ...bizItemized,
  ...of({ txtPg5Sc3I1Description: "SALARY", txtPg5Sc3I1TaxPayerC1: "800", txtPg5Sc3I2Description: "COMMISSION", txtPg5Sc3I2TaxPayerC1: "1000", txtPg5Sc3I2SpouseC2: "0" }),
};

const CASE: Array<[string, FormState, GroupState]> = [
  ["Schedule 11A item 3 (three rows)", item3, rows("modalPage10Schedule11AI3", "", [["royalty", "100"], ["gift", "250"], ["prize", "10"]])],
  ["Schedule 3 item 2 (two rows, two columns)", sched3, rows("modalPage5Schedule3", "", [["Employer A", "1000", "500"], ["Employer B", "2000", "0"]])],
  ["Schedule 11A item 3 with one row", item3, rows("modalPage10Schedule11AI3", "", [["gift", "250"]])],
  ["exempt copy EX1, Schedule E item 2 (two rows)", exempt, rows("modalPage2mScheduleETYPE", "EX1", [["Rental", "500", "0"], ["Fees", "700", "100"]])],
  ["Schedule 3 (two rows) then Schedule 11A item 3 (one row)", { ...sched3, ...item3 }, { ...rows("modalPage5Schedule3", "", [["Employer A", "1000", "500"], ["Employer B", "2000", "0"]]), ...rows("modalPage10Schedule11AI3", "", [["gift", "250"]]) }],
  ["Schedule 1 (two employers)", compensation, employer([["acme two", "T", "111", "222", "333", "000", "120000", "12000"], ["beta", "T", "444", "555", "666", "000", "30000", "3000"]])],
  ["Schedule 1 (three employers, one the spouse's)", compensation, employer([["acme two", "T", "111", "222", "333", "000", "120000", "12000"], ["beta", "S", "444", "555", "666", "000", "30000", "3000"], ["gamma", "T", "777", "888", "999", "000", "5000", "500"]])],
  ["Schedule 1 (one employer goes back to item 4)", compensation, employer([["acme two", "T", "111", "222", "333", "000", "120000", "12000"]])],
  ["Schedule 12A Part 1 (two rows)", bizItemized, block("modalPage11Schedule12APt1", [{ 0: "payor a" }, { 0: "payor b" }])],
  ["Schedule 12A Part 2 (two blocks)", bizItemized, block("modalPage11Schedule12APt2", [{}, {}])],
  ["Schedule 12A Part 3 (two blocks, a date)", bizItemized, block("modalPage11Schedule12APt3", [{}, { 0: "PS" }])],
  ["Schedule 12A Part 4 (one block)", bizItemized, block("modalPage11Schedule12APt4", [{}])],
  ["Schedule 12B Parts 1 and 2", bizItemized, { ...block("modalPage11Schedule12BPt1", [{}, {}]), ...block("modalPage11Schedule12BPt2", [{}]) }],
];

describe("1701 (add more...) pop-ups", () => {
  it("lists 11 pop-ups on the main pages and 11 kinds on each of the ten attachment copies (BIR comments its two Schedule 8 links out)", () => {
    expect(MODAL.filter((m) => !m.modal.includes("TYPE")).length).toBe(11);
    expect(MODAL.filter((m) => m.modal.includes("TYPE")).length).toBe(11);
    expect(MODAL.flatMap((m) => modalCopy(m, { EX: 5, SP: 5 })).length).toBe(11 + 11 * 10);
    expect(FORM_1701.group!.length).toBe(11 + 11 * 10 + 1 + COLUMN.length);
  });

  it("two or more rows: the item reads OTHERS and the rows' total, the counter is the row count", () => {
    const v = at(item3, rows("modalPage10Schedule11AI3", "", [["royalty", "100"], ["gift", "250"], ["prize", "10"]]));
    expect([v("txtPg10Sc11AI3TaxableOtherIncomeC1"), v("txtPg10Sc11AI3TaxableOtherIncomeC2"), v("txtCtrmodalPage10Schedule11AI3"), v("txtPg10Sc11AI3Total")]).toEqual(["OTHERS", "360", "3", "360"]);
    expect([v("txtPg10Sc11AI3_1C1"), v("txtPg10Sc11AI3_2C2"), v("txtPg10Sc11AI3_3C1")]).toEqual(["ROYALTY", "250", "PRIZE"]);
    expect(v("txtPg10Sc11AI4Total")).toBe("860"); // item 4 = items 1 + 2 + 3: the chain follows
  });

  it("one row is not a pop-up: the counter stays 0 and the item shows the row", () => {
    const v = at(item3, rows("modalPage10Schedule11AI3", "", [["gift", "250"]]));
    expect([v("txtPg10Sc11AI3TaxableOtherIncomeC1"), v("txtPg10Sc11AI3TaxableOtherIncomeC2"), v("txtCtrmodalPage10Schedule11AI3"), v("txtPg10Sc11AI3_1C1")]).toEqual(["GIFT", "250", "0", "GIFT"]);
  });

  it("a one-row pop-up closed after a two-row one runs BIR's enableParentInput: its splice(-1) drops the earlier pop-up's locked input", () => {
    const state = { ...sched3, ...item3 };
    const two = rows("modalPage5Schedule3", "", [["Employer A", "1000", "500"], ["Employer B", "2000", "0"]]);
    const one = rows("modalPage10Schedule11AI3", "", [["gift", "250"]]);
    const locked = (group: GroupState) => computeForm(FORM_1701, state, group)[id("txtDisabledInputs")] ?? "";
    expect(locked(two)).toContain("txtPg5Sc3I2Description");
    expect(locked(one)).toBe("");
    expect(locked({ ...two, ...one })).toBe("");
  });

  it("no rows leaves the form as it was", () => {
    expect(computeForm(FORM_1701, item3, {})).toEqual(computeForm(FORM_1701, item3));
  });

  it("every pop-up, on the main pages and on a copy, takes its rows and writes its counter without a script error of its own", () => {
    for (const m of MODAL) {
      const copy = m.modal.includes("TYPE") ? "EX1" : "";
      const group = rows(m.modal, copy, [m.cell.map((c) => (c.ml === 12 ? "100" : "ab")), m.cell.map((c) => (c.ml === 12 ? "20" : "cd"))]);
      const o = computeForm(FORM_1701, copy ? exempt : bizItemized, group);
      expect(o[m.counter], m.modal).toBe(copy ? "EX1:2," : "2");
      expect(simulate((k) => o[k] ?? "").fault.filter((f) => !/reading 'toString'/.test(f.message)), m.modal).toEqual([]);
    }
  }, 120_000);
});

const PAGE = "[id^=Page][id$=Content]";
const IE_TOLERANT: Array<[string, string]> = [
  ['var currentAttachmentPage = "";', 'var currentAttachmentPage = "Page1mXContent";'],
  ["function addFocusBlurEvent(tableID) {", "function addFocusBlurEvent(tableID) { return;"],
  // IE's innerHTML carries a typed value; WebKit's carries the attribute, so write the property into it first
  ["function saveRowCol(modalID, bool){", 'function saveRowCol(modalID, bool){ for (const e of document.querySelectorAll("#" + modalID + " input[type=text]")) e.setAttribute("value", e.value); for (const o of document.querySelectorAll("#" + modalID + " option")) o.toggleAttribute("selected", o.selected);'],
  ["function copyModalPg5Sc1(opt){", 'function copyModalPg5Sc1(opt){ for (const e of document.querySelectorAll("#modalPage5Schedule1 input")) { if (e.type === "radio") e.toggleAttribute("checked", e.checked); else e.setAttribute("value", e.value); }'],
];
// Harness artifact, not a form difference: BIR copies the pop-up between its tables with innerHTML. IE writes a typed
// value into it; WebKit writes the value ATTRIBUTE, so after loadData fills the rows (the property) the copy holds the
// blanks. The counter, the subtotal and every box the rows feed are still compared.
const cellKey = (group: GroupState): string[] => Object.entries(group).filter(([name]) => name !== SCHED1.modal && !COLUMN.some((c) => c.kind === "column" && c.modal === name)).map(([, row]) => row).flatMap((row) => row.flatMap((r, i) => Object.keys(r).map((k) => k.replace("{i}", String(i + 1)))));

describe.skipIf(!hasForm("1701"))("native 1701 pop-ups are 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
    const open = oracle.browser.newPage.bind(oracle.browser);
    oracle.browser.newPage = (async (...arg: Parameters<typeof open>) => {
      const page = await open(...arg);
      await page.route(/BIR-Form1701\.hta/, async (route) => {
        const res = await route.fetch();
        let body = await res.text();
        for (const [from, to] of IE_TOLERANT) body = body.replace(from, to);
        await route.fulfill({ response: res, body });
      });
      return page;
    }) as typeof oracle.browser.newPage;
  }, 120_000);
  afterAll(() => oracle?.stop());
  for (const [name, state, group] of CASE)
    it(`reloads in BIR and saves the same: ${name}`, async () => {
      const r = await allPageParityCheck(oracle, FORM_1701, state, `84653210700000-1701-12${state[id("txtPg1I1Year")] ?? ""}.xml`, group, undefined, PAGE, true);
      r.page_error = r.page_error.filter((e) => !/senderValue\.toString/.test(e));
      expect(parityProblem(r, cellKey(group))).toEqual([]);
    }, 300_000);
});
