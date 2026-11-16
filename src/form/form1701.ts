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
// whole pesos, saved bare like BIR's saveXML ("1234", "-1234"). The add-more modals are not modelled (their counters
// stay 0). The Part IX attachments are: up to 5 exempt (EX1..EX5) and 5 special-rate (SP1..SP5) copies of BIR's page
// 1m-5m block, each box a field named like the source box with TYPE replaced by the copy ("frm1701:txtPg1mTIN1EX1");
// frm1701:txtAttachmentTypes ("EX2,SP1", BIR's own counter) says how many are saved.

import frozen from "./template/1701.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1701", frozen as Array<[string, string, string?]>);
import dom from "./page/1701.json";
import { ESCAPED, MAX_COPY, PFX, simulate, type SimResult } from "./form1701-sim.ts";
import { parseMoney } from "./money.ts";
import { validate as validateRequired, type FieldSpec, type FormSchema, type FormState, type Problem } from "./schema.ts";
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

export const FORM_1701: FormSchema = {
  form_code: "1701",
  title: "Annual Income Tax — Individuals, Estates and Trusts (2013)",
  field,
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
