// When BIR turns on the "(add more...)" links of Form 1700, both layouts.
//
//   1700 (2013)  disableLinkIfEmptyControls(ids, link) (BIR-Form1700.hta, 12903): the link is off while ANY listed box is empty after
//       trim, so a box BIR fills with "0" counts as filled in. The page runs it on every blur of the listed boxes (src/form/page/
//       1700-link.json, tool/gen-1700-link.mjs). A pop-up with rows keeps its link on (BIR switches it on after SAVE when the
//       item reads "OTHERS"). Item 6's link (lnkPg3Pt5I6ADDMore) has no `disabled` in BIR's markup and no blur call: never greyed out.
//   1700v2018    Part VI Schedule 1 "(add more...)" (addMoreSched1Link) starts disabled and enableAddMore() is the only thing that turns it
//       on: reg > 0 or cifr > 0, and tw > 0 (NumWithComma over item 4's three amount boxes), called from enabledContinuationOfSchedule1(4)
//       only when saveSched1Items holds rows, i.e. once the pop-up has been saved or the file reloaded with rows. That function first
//       writes 0.00 into the regular-income box unless a taxpayer type E is ticked, and into the flat-rate box unless type N is.
import type { FormState, GroupState } from "./schema.ts";
import linkJson from "./page/1700-link.json";
import template1700 from "./template/1700.json";

const DEFAULT_1700: Record<string, string> = Object.fromEntries((template1700 as Array<[string, string]>).map((r) => [r[0], r[1]]));
/** a box as BIR's page holds it: what the state says, else BIR's blank value */
const box1700 = (state: FormState, id: string): string => state[id] ?? DEFAULT_1700[id] ?? "";

/** The `on` of a 1700 link (a link BIR never greys out answers true). */
export function on1700(link: string, group: string): (groups: GroupState, state: FormState) => boolean {
  const entry = (linkJson as Array<{ link: string; start_off: boolean; id?: string[] }>).find((l) => l.link === link);
  if (!entry) throw new Error(`no such 1700 link: ${link}`);
  const id = entry.id;
  if (!id) return () => true;
  return (groups, state) => (groups[group] ?? []).length > 0 || id.every((x) => box1700(state, x).trim() !== "");
}

/** BIR's NumWithComma(value) > 0: `num != 0` then parseFloat of the digits without commas (a non-number is not > 0). */
export function numWithCommaOver0(raw: string): boolean {
  const n = Number(raw) !== 0 ? parseFloat(raw.replace(/,/g, "")) : parseFloat(raw);
  return n > 0;
}

/** 1700v2018's enabledContinuationOfSchedule1(4) then enableAddMore(): rows in the pop-up; item 4's regular-income box counts only
 *  when a taxpayer type E is ticked (taxpayer or spouse), its flat-rate box only for type N (BIR writes 0.00 into the other one first);
 *  (reg or cifr) and tw over 0. */
export const on1700v2018 = (groups: GroupState, state: FormState): boolean => {
  const ticked = (id: string) => state[`frm1700:${id}`] === "true";
  const reg = (ticked("rdoPg1I6TaxpayerTypeE") || ticked("rdoPg1I20SpouseTaxpayerTypeE")) && numWithCommaOver0(state["frm1700:txtPg2ISched1c_4REG"] ?? "0.00");
  const cifr = (ticked("rdoPg1I6TaxpayerTypeN") || ticked("rdoPg1I20SpouseTaxpayerTypeN")) && numWithCommaOver0(state["frm1700:txtPg2ISched1d_4CIFR"] ?? "0.00");
  return (groups.sched1more ?? []).length > 0 && (reg || cifr) && numWithCommaOver0(state["frm1700:txtPg2ISched1e_4TW"] ?? "0.00");
};
