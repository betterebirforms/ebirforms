// When BIR turns on the "(add more...)" links of Form 1701 (the 2013 layout): BIR's disableLinkIfEmpty(ids, link), run over
// the web's values. The ids, and what each box is (a description, a compensation box, an amount with its partner column),
// are read from BIR's page by tool/gen-1701-link.mjs (page/1701-link.json); this file is the function itself.
//
//   BIR's rule (31616..31741 of BIR-Form1701.hta): the listed boxes plus, after each, the Spouse box next to it. If one of the
//   listed boxes reads "OTHERS" and is disabled (a pop-up with two rows or more locks its parent item that way), the link is
//   left on. Otherwise, over the boxes in order:
//     description (maxlength not 12)  blank after trim: off ...
//     amount      (maxlength 12)      isAmountValid: this box or its partner column > 0 (removeCommaParenthesis). The result REPLACES
//                                      what an earlier box set, so a valid amount after a blank description turns the link back on
//                                      (BIR quirk, kept), and the first invalid amount stops the walk
//     Schedule 1 compensation          `value <= 0` (JS: a string compared with 0)
//   Every description is followed by amount boxes, so a blank description is forgiven by the next valid amount: in practice a link
//   turns off on an item whose amounts are zero, not on a blank description (checked against BIR's page, test/gate-1701-link.test.ts).
//   All 169 calls of one link pass the same list, from the blur of any of its boxes, so the state is a function of the values.
//   One blur calls disableLinkIfEmpty(this, link) first and the list call after it; the list call is the last word.
//
// Not modelled: BIR's disabled flag on a box (the web has values only; "OTHERS" locks come from a pop-up of two rows or more),
// and Validate, which turns links back on while the form is locked for review.
import type { FormState, GroupState } from "./schema.ts";
import linkJson from "./page/1701-link.json";

export interface Link1701 {
  link: string;
  attachment: boolean;
  id: string[];
  box: Array<{ id: string; kind: "text" | "amount" | "income"; partner?: string }>;
}
export const LINK_1701 = linkJson as Link1701[];

/** BIR's removeCommaParenthesis(id) > 0: the first "(" becomes "-" and ")" goes, a comma is WholeNumWithComma (parseInt of the
 *  digits before any dot), a non-number is not > 0. */
export function amountOver0(raw: string): boolean {
  let s = raw;
  if (s.includes("(") || s.includes(")")) s = s.replace("(", "-").replace(")", "");
  let n: number | string = s;
  if (s.includes(",")) n = Number(s) !== 0 ? parseInt(s.replace(/,/g, ""), 10) : parseInt(s, 10);
  return Number(n) > 0;
}

/** disableLinkIfEmpty's verdict for one link, `copy` = "" on the main pages or "EX1" ... "SP5" on an attachment; `row` = the rows of
 *  the link's pop-up. true = the link is on. */
export function linkOn1701(entry: Link1701, state: FormState, copy: string, row: number): boolean {
  const at = (id: string): string => state[id.replace(/TYPE/g, copy)] ?? "";
  if (row > 1) return true; // the parent item reads OTHERS and is disabled: BIR leaves the link on
  let valid = true;
  for (const box of entry.box) {
    const value = at(box.id);
    if (box.kind === "text") {
      if (value.trim() === "") valid = false;
    } else if (box.kind === "income") {
      if (Number(value) <= 0) valid = false;
    } else {
      valid = amountOver0(value) || (box.partner !== undefined && amountOver0(at(box.partner)));
      if (!valid) break;
    }
  }
  return valid;
}

/** The `on` of a 1701 link: BIR's rule over the link's boxes, `group` = its pop-up's group. */
export function linkOn(link: string, group: string, copy: string): (groups: GroupState, state: FormState) => boolean {
  const entry = LINK_1701.find((l) => l.link === link);
  if (!entry) throw new Error(`no disableLinkIfEmpty call for ${link}`);
  return (groups, state) => linkOn1701(entry, state, copy, (groups[group] ?? []).length);
}
