// When BIR turns on 1701A's "(add more...)" links (Part IV.A item 42, Part IV.B item 51): disableLinkIfEmpty(ids, link)
// (BIR-Form1701A.hta, 2721), run on the blur of any of the link's six boxes. The link starts disabled. The rule:
//   the listed boxes are the two descriptions and the two taxpayer amounts, and BIR adds the spouse amount (the id with its last
//   letter turned into "B") after each amount;
//   a description empty after trim: off;
//   an amount: off when the column is on (the "graduated" tick optTaxRate_1 for A, optSpouseTaxRate_1 for B; BOTH links read
//   the _1 ticks, BIR's own wiring) and WholeNumWithComma(value) <= 0. In JS, parseInt gives NaN for a non-number and NaN <= 0 is
//   false, so a non-number counts as filled in. An invalid box is never forgiven by a later one (unlike 1701).
//   If one listed box reads "OTHERS" and is disabled (a pop-up of two rows or more locks its item), the link is left on.
import type { FormState, GroupState } from "./schema.ts";

const P = "frm1701A:";

/** BIR's WholeNumWithComma(v) <= 0 */
export function wholeNumAtMost0(raw: string): boolean {
  const n = Number(raw) !== 0 ? parseInt(raw.replace(/,/g, ""), 10) : parseInt(raw, 10);
  return n <= 0;
}

export function on1701A(group: string, desc1: number, desc2: number): (groups: GroupState, state: FormState) => boolean {
  return (groups, state) => {
    if ((groups[group] ?? []).length > 1) return true;
    const filer = state[`${P}optTaxRate_1`] === "true";
    const spouse = state[`${P}optSpouseTaxRate_1`] === "true";
    for (const n of [desc1, desc2]) {
      if ((state[`${P}txt${n}Desc`] ?? "").trim() === "") return false;
      if (filer && wholeNumAtMost0(state[`${P}txt${n}A`] ?? "0.00")) return false;
      if (spouse && wholeNumAtMost0(state[`${P}txt${n}B`] ?? "0.00")) return false;
    }
    return true;
  };
}
