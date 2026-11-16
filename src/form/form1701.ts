// BIR Form 1701 (Annual Income Tax Return — individuals, estates and trusts), the 2013 layout (`frm1701:`).
// Two columns throughout: `…C1` / TaxPayer = the filer, `…C2` / Spouse = the spouse (joint filing).
//
//   Page 1   items 1–40: period, ATC (4: compensation / business / mixed), filer type (7), civil status (14–16),
//            deduction method (20: itemized / OSD), exempt / special-rate income (22/23 → Part IX attachments);
//            Part II 26–32 = totals pulled from page 3 (26 = 72A+72B, 27 = 76A+76B, 28 = 26−27, 29 = item 79,
//            30 = 28−29, 31 = item 84, 32 = 30+31 — just 30 when 30 < 0); CTC 34–37; payments 38–40.
//   Page 2   Part IV 41–67: gross compensation / business income, deductions, personal (25,000 per qualified
//            dependent, item 46) and additional exemptions, taxable income, tax due (the pre-TRAIN graduated table:
//            5% to 10,000 … 32% over 500,000).
//   Page 3   Part V 68–85 (tax due, credits, payable, penalties), Part VI 86–94 (tax relief).
//   Page 4   Part VII spouse background 95–111, 7A dependents, Part VIII.
//   Pages 5–12  Schedules 1–12 (employers, sales, other income, cost of sales, itemized deductions, NOLCO, credits,
//            balance sheet, reconciliation, final-tax income) and Part IX (per-regime consolidation).
//
// Every value is what BIR's own page logic leaves (form1701-sim.ts runs it over the native state): amounts are
// whole pesos, saved bare like BIR's saveXML ("1234", "-1234"). The add-more pop-ups are schedules (MODAL_GROUP,
// closed by the simulator as BIR closes them; the seven column-block ones, Schedules 1 and 12, are not). The Part IX attachments are: up to 5 exempt (EX1..EX5) and 5 special-rate (SP1..SP5) copies of BIR's page
// 1m-5m block, each box a field named like the source box with TYPE replaced by the copy ("frm1701:txtPg1mTIN1EX1");
// frm1701:txtAttachmentTypes ("EX2,SP1", BIR's own counter) says how many are saved.

import frozen from "./template/1701.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1701", frozen as Array<[string, string, string?]>);
import dom from "./page/1701.json";
import { COLUMN, ESCAPED, MAX_COPY, MODAL, PFX, SCHED1, forCopy, modalCopy, rowKey, simulate, type Column, type Modal, type SimResult } from "./form1701-sim.ts";
import { parseMoney } from "./money.ts";
import { groupRecords, validate as validateRequired, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export const P = PFX;
type Read = (id: string) => string;
type TemplateRecord = [string, string, string?];
type DomRow = [string, string, string, string, string, number, string, number, number, number, number, number, number, number];

const PAGE = new Map((dom as unknown as { el: DomRow[] }).el.map((e) => [e[0], e]));
/** BIR's money inputs: the maxlength-12/15 text boxes saveXML writes bare */
const isMoney = (id: string): boolean => {
  const e = PAGE.get(id);
  return !!e && e[1] === "text" && (e[4] === "12" || e[4] === "15");
};
/** BIR computes these and never lets the filer type them (class disableByDefault: disabled on every page state) */
const isComputed = (id: string): boolean => /\bdisableByDefault\b/.test(PAGE.get(id)?.[3] ?? "");

// one simulation per computeAll pass: computeAll hands every derive the same `read`, and the first derive (item 1's
// month, first in DOM order, no compute before it) sees the state before any field was rewritten
const cache = new WeakMap<Read, SimResult>();
export const run = (r: Read): SimResult => {
  let hit = cache.get(r);
  if (!hit) cache.set(r, (hit = simulate(r)));
  return hit;
};

const COPY = ["EX", "SP"].flatMap((kind) => Array.from({ length: MAX_COPY }, (_, i) => `${kind}${i + 1}`));
/** a copy's box -> BIR's source box in the page block ("...EX2" -> "...TYPE"); a main-page id has none */
const SOURCE = new Map<string, string>();
const withCopy = (list: TemplateRecord[]): TemplateRecord[] => [
  ...list,
  ...COPY.flatMap((c) =>
    list
      .filter(([id]) => id.includes("TYPE"))
      .map(([id, value, radio]): TemplateRecord => {
        const copy_id = id.replace(/TYPE/g, c);
        SOURCE.set(copy_id, id);
        const copy_value = value.replace(/TYPE/g, c);
        return radio === undefined ? [copy_id, copy_value] : [copy_id, copy_value, radio.replace(/TYPE/g, c)];
      }),
  ),
];

const field: FieldSpec[] = withCopy(template as TemplateRecord[]).map(([id, value, radio]): FieldSpec => {
  const box = SOURCE.get(id) ?? id;
  const type = PAGE.get(box)?.[1];
  const derive = (r: Read) => run(r).value[id] ?? value;
  if (radio) return { id, kind: "radio", derive };
  if (type === "checkbox") return { id, kind: "checkbox", derive };
  if (type === "select-one") return { id, kind: "select", derive };
  if (isMoney(box)) return { id, kind: "money", derive, ...(isComputed(box) ? { compute: (r: Read) => parseMoney(run(r).value[id] ?? "0") } : {}) };
  return { id, kind: "text", derive, ...(ESCAPED.includes(id) ? { escaped: true } : {}) };
});
const REQUIRED = ["txtPg1Pt1I5TIN1", "txtPg1Pt1I5TIN2", "txtPg1Pt1I5TIN3", "txtPg1Pt1I8TaxFiler", "txtPg1I1Year"].map((x) => P + x);
for (const f of field) if (REQUIRED.includes(f.id)) f.required = true;

/** An add-more pop-up's table as a schedule (one group per pop-up, and per copy for the attachment pop-ups). A row's
 *  cells are what BIR's pop-up leaves: descriptions upper-cased where the box capitalizes, amounts whole pesos (the
 *  box takes digits only; setToZeroIfEmpty), saved bare. The counter, the parent boxes ("OTHERS" and the total) and
 *  the pop-up's subtotal are BIR's page logic (the simulator, form1701-sim.ts close()), fed the rows by a scratch key. */
const wholePeso = (value: string): string => {
  const cents = parseMoney(value);
  return String(cents <= 0 ? 0 : Math.floor(cents / 100));
};
const modalGroup = (m: Modal, copy: string): GroupSpec => {
  const name = forCopy(m.modal, copy);
  const row: GroupSpec["row"] = m.cell.map((c) =>
    c.ml === 12
      ? { id: forCopy(c.stem, copy), kind: "money", derive: (_r, v) => wholePeso(v) }
      : { id: forCopy(c.stem, copy), kind: "text", derive: (_r, v) => (c.upper ? v.toUpperCase() : v).slice(0, c.ml) },
  );
  return {
    name,
    first_index: 1,
    row,
    total: { into: rowKey(name), of: row[0]!.id, sum: (rows) => JSON.stringify(rows.map((r) => row.map((sub) => r[sub.id] ?? ""))) },
  };
};
/** Schedule 12's pop-ups on page 11 (page/1701-column.json): a row is one block of boxes (Part 1: one row of the table; the
 *  others: BIR's addRowCol block, two Sale/Exchange columns). validateDate (MM/DD/YYYY, a real day, not in the future,
 *  else the box is emptied) rules the date of issue; the PS/CS drop-down takes only its two options. */
const issueDate = (v: string): string => {
  const m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(v);
  if (!m) return "";
  const [mo, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(year, mo - 1, day);
  return mo < 1 || mo > 12 || at.getMonth() !== mo - 1 || at.getDate() !== day || at.getTime() > Date.now() ? "" : v;
};
const columnGroup = (c: Column): GroupSpec => {
  const row: GroupSpec["row"] = c.cell.map((x) =>
    x.ml === 12
      ? { id: x.stem, kind: "money", derive: (_r, v) => wholePeso(v) }
      : x.select
        ? { id: x.stem, kind: "select", derive: (_r, v) => (v.toUpperCase() === "CS" ? "CS" : "PS") }
        : { id: x.stem, kind: "text", derive: (_r, v) => (x.date ? issueDate(v) : (x.upper ? v.toUpperCase() : v).slice(0, x.ml)) },
  );
  const text = row.find((sub) => sub.kind === "text")!;
  return {
    name: c.modal,
    first_index: 1,
    row,
    total: { into: rowKey(c.modal), of: text.id, sum: (rows) => JSON.stringify(rows.map((r) => row.map((sub) => r[sub.id] ?? ""))) },
  };
};
export const COLUMN_GROUP: GroupSpec[] = COLUMN.map(columnGroup);

/** Schedule 1 on page 5: the employers below item 3. Two or more rows are saved (ids from I5, BIR's resetMainTableIDPg5Sc1)
 *  and item 4 reads "OTHERS" with their totals; ONE row goes back to item 4 and BIR deletes it from the pop-up, so the group is
 *  `unsaved` and `extra_record` writes the rows only from two. The Taxpayer / Spouse radios are two cells holding
 *  "true" / "false" (Taxpayer wins); the name takes 90 characters for a single or professional filer, else 50. */
const flag = (v: string): boolean => v === "true";
const sched1Group: GroupSpec = {
  name: SCHED1.modal,
  first_index: 5,
  unsaved: true,
  row: SCHED1.cell.map(([stem, kind, ml], k): GroupSpec["row"][number] =>
    kind === "radio"
      ? { id: stem, kind: "text", derive: (read, v) => String(k === 1 ? flag(v) : flag(v) && !flag(read(SCHED1.cell[1]![0]))) }
      : ml === 12
        ? { id: stem, kind: "money", derive: (_r, v) => wholePeso(v) }
        : k === 0
          ? { id: stem, kind: "text", derive: (read, v) => v.toUpperCase().slice(0, read(`${P}rdoPg1Pt1I7TypeSingle`) === "true" || read(`${P}rdoPg1Pt1I7TypeProfessional`) === "true" ? 90 : 50) }
          : { id: stem, kind: "text", derive: (_r, v) => v.replace(/\D/g, "").slice(0, ml) },
  ),
  total: { into: rowKey(SCHED1.modal), of: SCHED1.cell[0]![0], sum: (rows) => JSON.stringify(rows.map((r) => SCHED1.cell.map(([stem]) => r[stem] ?? ""))) },
};
export const MODAL_GROUP: GroupSpec[] = MODAL.flatMap((m) => modalCopy(m, { EX: MAX_COPY, SP: MAX_COPY }).map((copy) => modalGroup(m, copy)));

export const FORM_1701: FormSchema = {
  form_code: "1701",
  title: "Annual Income Tax — Individuals, Estates and Trusts (2013)",
  field,
  group: [...MODAL_GROUP, sched1Group, ...COLUMN_GROUP],
  extra_record: (state, groups) => ((groups[SCHED1.modal] ?? []).length >= 2 ? groupRecords(sched1Group, groups[SCHED1.modal]!, state, "1701") : []),
  attachment: {
    template: "attachmentPages_TEMP",
    token: "TYPE",
    max: MAX_COPY,
    kind: [
      { code: "EX", container: "attachmentEX", count_field: `${PFX}txtAttachmentTypes`, add_button: `${PFX}btnAddAttachmentEX` },
      { code: "SP", container: "attachmentSP", count_field: `${PFX}txtAttachmentTypes`, add_button: `${PFX}btnAddAttachmentSP` },
    ],
  },
};

export function validate1701(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1701, state);
  const tin = `${state[`${P}txtPg1Pt1I5TIN1`] ?? ""}${state[`${P}txtPg1Pt1I5TIN2`] ?? ""}${state[`${P}txtPg1Pt1I5TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I5TIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
