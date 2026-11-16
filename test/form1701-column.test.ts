import { describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1701 } from "@/form/form1701.ts";
import { COLUMN, SCHED1, simulate } from "@/form/form1701-sim.ts";
import { bizItemized, compensation, id } from "./form1701-case.ts";

// Schedule 12 on page 11: Part 1 of 12A is a row table; the other five pop-ups add column blocks (BIR's addRowCol).
const column = (modal: string) => COLUMN.find((c) => c.modal === modal)!;
/** a group's blocks: each cell by its layout order, money "100" and the rest "ab" unless given */
const block = (modal: string, cell: Array<Record<number, string>>): GroupState => {
  const c = column(modal);
  return { [modal]: cell.map((o): GroupRow => Object.fromEntries(c.cell.map((x, k) => [x.stem, o[k] ?? (x.ml === 12 ? "100" : x.select ? "CS" : x.date ? "01/02/2020" : "ab")]))) };
};
const at = (state: FormState, group: GroupState) => {
  const record = formRecords(FORM_1701, state, group);
  return (k: string) => record.find((r) => r.key === id(k))?.value;
};

describe("1701 Schedule 12 pop-ups", () => {
  it("lists six pop-ups: one row table and five column blocks", () => {
    expect(COLUMN.map((c) => c.kind)).toEqual(["row", "column", "column", "column", "column", "column"]);
    expect(FORM_1701.group!.length).toBe(11 + 110 + 1 + 6);
  });

  it("Part 2: a block's boxes are saved by number with its counter", () => {
    const v = at(bizItemized, block("modalPage11Schedule12APt2", [{ 0: "lot a", 9: "40" }, { 0: "lot b", 8: "60" }]));
    expect([v("txtCtrmodalPage11Schedule12APt2"), v("txtPg11Sc12AI7DescriptionOfProperty_1C1"), v("txtPg11Sc12AI7DescriptionOfProperty_2C1"), v("txtPg11Sc12AI11FinalTax_1C1")]).toEqual(["2", "LOT A", "LOT B", "100"]);
  });

  it("one block still counts 1 (not 0 like a row pop-up)", () => {
    const v = at(bizItemized, block("modalPage11Schedule12APt4", [{}]));
    expect(v("txtCtrmodalPage11Schedule12APt4")).toBe("1");
  });

  it("Part 3: the date of issue is emptied when it is not a real past date, the drop-down is PS or CS", () => {
    const v = at(bizItemized, block("modalPage11Schedule12APt3", [{ 0: "x", 8: "02/30/2020" }, { 0: "cs", 8: "12/31/2999" }, { 0: "CS", 8: "02/29/2020" }]));
    expect([v("txtPg11Sc12AI15DateOfIssueMonth_1C1"), v("txtPg11Sc12AI15DateOfIssueMonth_2C1"), v("txtPg11Sc12AI15DateOfIssueMonth_3C1"), v("ddlPg11Sc12AI12KindPSCS_1C1")]).toEqual(["", "", "02/29/2020", "PS"]);
  });

  it("Part 1: a row table with no parent boxes; two rows write the counter", () => {
    const m = column("modalPage11Schedule12APt1");
    const group: GroupState = { [m.modal]: [{ [m.cell[0]!.stem]: "a", [m.cell[1]!.stem]: "100", [m.cell[2]!.stem]: "10" }, { [m.cell[0]!.stem]: "b", [m.cell[1]!.stem]: "200", [m.cell[2]!.stem]: "20" }] };
    const v = at(bizItemized, group);
    expect([v("txtCtrmodalPage11Schedule12APt1"), v("txtPg11ScAPt1I6_1C1"), v("txtPg11ScAPt1I6_2C2")]).toEqual(["2", "A", "200"]);
  });

  it("Schedule 1: two employers lock item 4 as OTHERS with their totals and save from I5; one goes back to item 4 and saves no rows", () => {
    const emp = (name: string, income: string, tax: string): GroupRow =>
      Object.fromEntries(SCHED1.cell.map(([stem], k) => [stem, [name, "true", "false", "111", "222", "333", "000", income, tax][k] ?? ""]));
    const base = { ...compensation };
    const two = at(base, { [SCHED1.modal]: [emp("acme", "120000", "12000"), emp("beta", "30000", "3000")] });
    expect([two("txtCtrmodalPage5Schedule1"), two("txtPg5Sc1I4NameOfEmp"), two("txtPg5Sc1I4ComIncomeC2"), two("txtPg5Sc1I4TaxWithheldC3"), two("txtPg5Sc1I5NameOfEmp"), two("txtPg5Sc1I6ComIncomeC2"), two("rdoPg5Sc1I6Spouse")]).toEqual(["2", "OTHERS", "150000", "15000", "ACME", "30000", "false"]);
    const one = at(base, { [SCHED1.modal]: [emp("acme", "120000", "12000")] });
    expect([one("txtCtrmodalPage5Schedule1"), one("txtPg5Sc1I4NameOfEmp"), one("txtPg5Sc1I4ComIncomeC2"), one("txtPg5Sc1I5NameOfEmp")]).toEqual(["0", "ACME", "120000", undefined]);
  });

  it("every pop-up takes its rows without a script error of its own", () => {
    for (const c of COLUMN) {
      const o = computeForm(FORM_1701, bizItemized, block(c.modal, [{}, {}]));
      expect(o[c.counter], c.modal).toBe("2");
      expect(simulate((k) => o[k] ?? "").fault.filter((f) => !/reading 'toString'/.test(f.message)), c.modal).toEqual([]);
    }
  }, 120_000);
});
