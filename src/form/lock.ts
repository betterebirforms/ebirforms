// Boxes BIR's pages grey out. On a blank form BIR disables a text box, list or text area when its own code fills
// it (the taxpayer's details from the profile, a code from a pick list, a total, a copy of another box, a fixed
// value) or when something opens it later. The web version locks the same boxes:
//   • a box with an opener (src/form/lock/<CODE>.json) opens on that choice;
//   • a box the form gates, or whose default BIR leaves editable, follows that;
//   • a box the profile fills, a pick list fills, the engine computes, or that BIR's own source never enables
//     (src/form/lock-fixed.json, test/capture-fixed.test.ts) stays greyed;
//   • any other greyed box (BIR opens it by a longer path the capture cannot walk: a schedule row once its
//     attachment is added) is left to the page as before.
import fixedFile from "./lock-fixed.json";
import { PICKER, LIST_FILLED } from "./picker.ts";
import type { FieldSpec } from "./schema.ts";

/** Ids of the text boxes, lists and text areas BIR's blank page has greyed out. Read before anything changes them. */
export function blankDisabled(root: ParentNode): Set<string> {
  const out = new Set<string>();
  for (const el of Array.from(root.querySelectorAll<HTMLInputElement>("input, select, textarea"))) {
    if (!el.id || !el.disabled) continue;
    if (["text", "select-one", "textarea", ""].includes(el.type)) out.add(el.id);
  }
  return out;
}

/** The greyed boxes of a form that BIR's own source never enables. */
export const neverOpened = (form_code: string): Set<string> => new Set((fixedFile as Record<string, string[]>)[form_code] ?? []);

/** Boxes a pick list fills (picker.ts): a field picker's box and what it fills, a pop-up list's boxes. */
export function pickerFilled(form_code: string): Set<string> {
  const out = new Set(LIST_FILLED[form_code] ?? []);
  for (const p of Object.values(PICKER[form_code] ?? {})) {
    if (p.kind !== "field") continue;
    out.add(p.field);
    if (p.fill) for (const k of Object.keys(p.fill(p.list({})[0] ?? ({ atc_code: "", rate: "" } as never)))) out.add(k);
  }
  return out;
}

/** A greyed box nothing on BIR's page opens, whose fill source the web has: no opener, not gated, not an editable
 *  default, and it is filled by the profile or a pick list, or BIR's source never enables it. */
export const permanentLock = (f: FieldSpec, has_opener: boolean, known: boolean): boolean => !has_opener && !f.gate && !f.is_editable && known;

/** Openers read from BIR's source where the capture cannot reach them (its choice is greyed on a blank page, or the
 *  box needs two things at once), added to the captured src/form/lock/<CODE>.json. An opener may join conditions
 *  with "&": all must hold. */
export const LOCK_RULE: Record<string, Record<string, string[]>> = {
  // processAmend / the load: 59A opens on an amended return, 59B on an amended return with the spouse named. BIR
  // greys them again on "No" without clearing them, so this is a lock, not a gate (a gate would zero the value)
  "1701Qv2018": {
    "frm1701q:txt59A": ["frm1701q:AmendedRtn_1"],
    "frm1701q:txt59B": ["frm1701q:AmendedRtn_1&frm1701q:txtSpouseName=*"],
  },
  // modeOfPayment: "Other similar schemes (specify)" opens only once "Others" is ticked
  "2200Mv2018": { "frm2200M:txtPg1Pt2MOPOtherDesc": ["frm2200M:rdoPg1Pt2MOPOther"] },
  "2200Pv2020": { "frm2200P:txtPg1Pt2MOPOtherDesc": ["frm2200P:rdoPg1Pt2MOPOther"] },
};

/** A form's lock openers: the captured ones, then LOCK_RULE's. */
export const lockRule = (form_code: string, captured: Record<string, string[]>): Record<string, string[]> => ({ ...captured, ...LOCK_RULE[form_code] });
