// BIR Form 1701 (the 2013 layout) — BIR's own page logic RUN over the native state.
//
// The legacy form is ~140 mutually-calling enable / reset / compute functions (form1701-bir.ts, ported mechanically
// from the HTA) whose result depends on the order a filer clicks and types: an ATC or deduction-method radio resets
// and disables whole schedules, a schedule opens row by row, every blur recomputes its own chain. No closed formula
// reproduces that, so the native form runs BIR's code over the measured blank page (form1701-dom.ts):
//
//   1. session — load the profile fields, then a filer pass, twice: every radio / checkbox the filer chose is
//      clicked in DOM order (its onclick runs), every select changed, every enabled text input of pages 1–12 typed
//      (onchange, when the value changes) and blurred in DOM order (its onblur runs). saveXML's enabled-state lists (txtDisabledOnSave /
//      txtEnabledOnSave) are taken from the page as it then stands.
//   2. save + reopen — a fresh blank page, loadData (values, HidePage12Part9, disableEnableFieldsOnReload — the
//      enabled state comes back from the two lists — the name lock), then every enabled text input of pages 1–12 is
//      blurred twice: what test/parity.ts does to the saved file in WebKit (it blurs page 1, the visible one).
//
// The result is what BIR's own page shows (and saves again) after the native file is reopened in it. Not modelled
// (v1): the add-more modals (txtCtrmodal* stay 0 — each schedule's fixed rows only) and the Part IX attachments.

import { Bir1701, HANDLER } from "./form1701-bir.ts";
import type { Elem } from "./form1701-dom.ts";

export const PFX = "frm1701:";
type Read = (id: string) => string;

/** saveXML escape()s these (and loadData unescapes every text value) */
export const ESCAPED = ["txtPg1Pt1I8TaxFiler", "txtPg1Pt1I8TaxFilerFirstName", "txtPg1Pt1I8TaxFilerMiddleName", "txtPg1Pt1I17Business", "txtPg1Pt1I10Address"].map((x) => PFX + x);

class Sim extends Bir1701 {
  fire(el: Elem, handler: number): void {
    const h = HANDLER[handler];
    if (!h) return;
    try {
      h(this, el);
    } catch (e) {
      this.fault.push({ where: el.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  el(id: string): Elem {
    const e = this.elem.get(id);
    if (!e) throw new Error(`form1701-sim: no element ${id}`);
    return e;
  }
}

/** Page number of a main-page element (0: not on pages 1–12) */
export function pageOf(e: Elem): number {
  for (const a of e.anc) {
    const m = /^Page(\d+)Content$/.exec(a);
    if (m) return Number(m[1]);
    if (a === "tblPart7A") return 4;
  }
  return 0;
}

/** saveXML's string for an element: radios / checkboxes "true"/"false"; maxlength-12/15 text bare (commas dropped,
 *  "(1,234)" → "-1234"); everything else as shown. */
export function savedValue(e: Elem): string {
  if (e.type === "radio" || e.type === "checkbox") return String(e.checked);
  const v = e.value;
  if (e.type === "text" && (e.maxLength === 12 || e.maxLength === 15)) {
    if (v.includes("(") && v.includes(")")) return v.replace("(", "-").replace(")", "").replace(/,/g, "");
    return v.replace(/,/g, "");
  }
  return v;
}

/** the inputs saveXML writes (frmMain, not button / hidden) */
const saved = (e: Elem): boolean => e.inForm && !!e.id && ["text", "select-one", "radio", "checkbox"].includes(e.type);
const MONEY_LENGTH = new Set([12, 15]);
/** BIR's amount inputs (saveXML's bare branch); the native schema types them as money */
export const isAmount = (e: Elem): boolean => e.type === "text" && MONEY_LENGTH.has(e.maxLength);

export interface SimResult {
  /** every saved element's string (saveXML's form), by full id */
  value: Record<string, string>;
  /** the elements BIR leaves disabled after the reopen (for the native UI) */
  disabled: Set<string>;
  /** handler exceptions and alerts, for tests */
  fault: Array<{ where: string; message: string }>;
  alerted: string[];
}

export function simulate(read: Read): SimResult {
  const s = new Sim();
  const page = new Map(s.all.map((e) => [e, pageOf(e)]));
  const current = s.el(`${PFX}txtCurrentPage`);

  // loadBGData-like: the profile / identity fields BIR keeps locked (text, not amounts) come straight from the state
  for (const e of s.all) {
    if (!saved(e) || !e.disabled || (e.type !== "text" && e.type !== "select-one") || MONEY_LENGTH.has(e.maxLength)) continue;
    const want = read(e.id);
    if (want !== "") e.value = want;
  }
  // loadBGData also sets the hidden branch code, which saveXML writes and createXMLFileName names the file by
  const tin4 = read(`${PFX}txtTIN4`);
  if (tin4 !== "") s.el(`${PFX}txtTIN4`).value = tin4;
  const live = (e: Elem) => saved(e) && !e.disabled && (page.get(e)! > 0 || e.visible);
  const typed = new Set<Elem>();
  const controls = () => {
    for (const e of s.all) {
      if (!live(e) || e.type === "text") continue;
      const want = read(e.id);
      current.value = String(page.get(e) || 1);
      if (e.type === "radio") {
        if (want === "true" && !e.checked) {
          e.checked = true;
          e.onclick?.();
        }
      } else if (e.type === "checkbox") {
        if (want !== "" && (want === "true") !== e.checked) {
          e.checked = want === "true";
          e.onclick?.();
        }
      } else if (e.type === "select-one" && want !== "" && want !== e.value) {
        e.value = want;
        e.onchange?.();
      }
    }
  };
  const typing = () => {
    for (const e of s.all) {
      if (e.type !== "text" || !live(e) || e.id === current.id || e.id === `${PFX}txtMaxPage`) continue;
      current.value = String(page.get(e) || 1);
      if (!typed.has(e)) {
        typed.add(e);
        const want = read(e.id);
        if (want !== "" && want !== e.value) {
          e.value = want;
          e.onchange?.(); // typing fires change before the blur (Sched 1's amounts compute on change only)
        }
      }
      e.onblur?.();
    }
  };
  controls();
  typing();
  controls();
  typing();
  current.value = "1";

  // saveXML
  s.el(`${PFX}txtMaxPage`).value = "12";
  const input = s.all.filter((e) => e.tagName === "INPUT" && e.type !== "button");
  s.el(`${PFX}txtDisabledOnSave`).value = input.filter((e) => e.disabled && !e.hasClass("disableByDefault")).map((e) => `${e.id},`).join("");
  s.el(`${PFX}txtEnabledOnSave`).value = input.filter((e) => !e.disabled && !e.readOnly).map((e) => `${e.id},`).join("");
  // the native savefile writes an empty amount as "0.00" (schema.ts toRecords), so that is what the reopen loads
  const file = new Map<string, string>();
  for (const e of s.all) if (saved(e)) file.set(e.id, isAmount(e) && e.value === "" ? "0.00" : savedValue(e));

  // reopen: loadXML (isReload, then loadData) on a fresh page
  const r = new Sim();
  r.isReload = true;
  for (const e of r.all) {
    if (!e.inForm || e.type === "hidden") continue;
    const v = file.get(e.id);
    if (v === undefined) continue;
    if (e.type === "text" || e.type === "select-one") {
      if (e.id !== `${PFX}txtVersion`) e.value = v;
    } else if ((e.type === "radio" || e.type === "checkbox") && v === "true") e.checked = true;
  }
  const call = (f: () => void) => {
    try {
      f();
    } catch (e) {
      r.fault.push({ where: "loadData", message: e instanceof Error ? e.message : String(e) });
    }
  };
  call(() => r.validateAttachmentPerson());
  call(() => r.validateModalState(true));
  call(() => r.HidePage12Part9());
  call(() => r.disableEnableFieldsOnReload());
  r.el(`${PFX}txtCurrentPage`).disabled = false;
  r.el(`${PFX}txtMaxPage`).disabled = false;
  const name = ["txtPg1Pt1I8TaxFiler", "txtPg1Pt1I8TaxFilerFirstName", "txtPg1Pt1I8TaxFilerMiddleName"].map((x) => r.el(PFX + x));
  if (name[0]!.value.trim() !== "" && name[1]!.value.trim() !== "") for (const e of name) e.disabled = true;
  const ctc = r.el(`${PFX}txtPg1Pt2I34CTC`);
  ctc.maxLength = r.el(`${PFX}rdoPg1I34GovID`).checked ? 17 : 8;
  r.isReload = false;
  // email = the profile's (globalEmail); the native file carries what the filer's profile gave it
  r.el(`${PFX}txtPg1Pt1I12Email`).disabled = true;
  // the page's onload, after loadXML: every amount box re-formatted ("1234" → "1,234", "-1234" → "(1,234)",
  // "" → "0"), then the name boxes unlocked when empty
  for (const e of r.query(`input[maxlength="12"]`).concat(r.query(`input[id*="Pg9Sc10"][maxlength="15"]`)) as Elem[]) {
    let v = e.value;
    if (v.length >= 4) v = r.formatCurrencyWOC(v);
    v = r.NegativeValue(v);
    e.value = v === "" ? "0" : v;
  }
  if (name[0]!.value.trim() === "") name[0]!.disabled = false;
  if (name[1]!.value.trim() === "") name[1]!.disabled = name[2]!.disabled = false;

  const rpage = new Map(r.all.map((e) => [e, pageOf(e)]));
  for (let pass = 0; pass < 2; pass++)
    for (const e of r.all) if (e.type === "text" && saved(e) && !e.disabled && (rpage.get(e)! > 0 || e.visible)) e.onblur?.();

  const value: Record<string, string> = {};
  const disabled = new Set<string>();
  for (const e of r.all) {
    if (!saved(e)) continue;
    value[e.id] = savedValue(e);
    if (e.disabled) disabled.add(e.id);
  }
  // the lists are the session's (the reopened page shows exactly what was saved)
  value[`${PFX}txtDisabledOnSave`] = file.get(`${PFX}txtDisabledOnSave`) ?? "";
  value[`${PFX}txtEnabledOnSave`] = file.get(`${PFX}txtEnabledOnSave`) ?? "";
  return { value, disabled, fault: [...s.fault, ...r.fault], alerted: [...s.alerted, ...r.alerted] };
}
