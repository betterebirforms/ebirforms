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
// The result is what BIR's own page shows (and saves again) after the native file is reopened in it. The Part IX
// attachments (frm1701:txtAttachmentTypes "EX2,SP1") are copies of BIR's page 1m–5m block, built into the page like
// BIR's addAttachment builds them (form1701-dom.ts) and typed / blurred like any page, with TYPE = the copy; the
// filer is then taken back to the main form (processBack), which recomputes the main pages from them.
//
// The add-more pop-ups (22: 11 on the main pages, 11 kinds per copy; page/1701-modal.json, tool/gen-1701-modal.mjs) are
// closed last, as a filer opens one after typing the item it hangs on: the schema's group rows (a scratch key holding a
// JSON list) become the pop-up's Repository table, and BIR's own saveChanges outcome is run (the counter, the parent
// boxes locked with "OTHERS" from two rows, compute...Modal(false) for the schedule's total). Not modelled: the seven
// column-block pop-ups (Schedule 1 on page 5, Schedule 12 on page 11: addRowCol), BIR's two Schedule 8 links (commented
// out in its page), and the enabled-link / enabled-input lists for a one-row pop-up (BIR's enableParentInput).

import { Bir1701, HANDLER } from "./form1701-bir.ts";
import type { Elem } from "./form1701-dom.ts";
import modalJson from "./page/1701-modal.json";

export const PFX = "frm1701:";

/** One "(add more...)" pop-up (tool/gen-1701-modal.mjs, read from BIR's page). "TYPE" is the attachment copy token. */
export interface Modal {
  link: string;
  modal: string;
  table: string;
  compute: string;
  parent: string[];
  cell: Array<{ stem: string; ml: number; upper: boolean }>;
  counter: string;
}
export const MODAL = modalJson as Modal[];
/** The pop-up as it is for one copy ("" on the main pages): ids with BIR's TYPE token replaced */
export const forCopy = (id: string, copy: string): string => id.replace(/TYPE/g, copy);
/** The scratch state key a pop-up's rows travel under, from the schema's group to the simulator (a JSON list of rows,
 *  each the cells in the layout's order) */
export const rowKey = (name: string): string => `${PFX}_modalRow:${name}`;
/** The copies a pop-up kind exists on: the main pages (the 13 without TYPE) or each added copy */
export function modalCopy(m: Modal, copy: { EX: number; SP: number }): string[] {
  if (!m.modal.includes("TYPE")) return [""];
  return [...Array.from({ length: copy.EX }, (_, i) => `EX${i + 1}`), ...Array.from({ length: copy.SP }, (_, i) => `SP${i + 1}`)];
}
type Read = (id: string) => string;

/** saveXML escape()s these (and loadData unescapes every text value) */
export const ESCAPED = ["txtPg1Pt1I8TaxFiler", "txtPg1Pt1I8TaxFilerFirstName", "txtPg1Pt1I8TaxFilerMiddleName", "txtPg1Pt1I17Business", "txtPg1Pt1I10Address"].map((x) => PFX + x);

/** Copies modelled per kind (the schema's attachment.max). */
export const MAX_COPY = 5;
/** Copies the filer added of each kind, from BIR's saved counter "EX2,SP1" (what attachmentTypes_Update writes). */
export function attachmentCount(types: string): { EX: number; SP: number } {
  const n = (kind: string): number => Number(new RegExp(`${kind}(\\d+)`).exec(types)?.[1] ?? 0);
  return { EX: Math.min(n("EX"), MAX_COPY), SP: Math.min(n("SP"), MAX_COPY) };
}
const COUNTER = `${PFX}txtAttachmentTypes`;

class Sim extends Bir1701 {
  /** BIR's addAttachment(type), whose clone of the source block is already in the page (form1701-dom.ts) */
  addAttachment(type: "EX" | "SP"): void {
    const g = this as unknown as Record<string, any>;
    const list: string[] = g[`total${type}Array`];
    const by: Record<string, number> = g[`total${type}byPerson`];
    const total = list.length + 1;
    const other = g.PERSON === "TF" ? "S" : "TF";
    list.push(type + total);
    by[g.PERSON] = by[g.PERSON] == null ? 1 : by[g.PERSON]! + 1;
    by[other] = (by[other] ?? 0) !== 0 ? by[g.PERSON]! : 0;
    g.showAttachments(true, type);
    g.setView(type, total, total);
    g.displayAttachmentByNumber();
    g.attachmentTypes_Update();
    g.disablePage5mSchedJItem6();
    this.exemptRule();
  }
  /** the 03/13/2014 rule in addAttachment: an exempt copy's Schedule A item 4 rate boxes are 0.0 and locked */
  private exemptRule(): void {
    if (!this.el(`${PFX}rdoPg1mExempt${this.TYPE}`).checked) return;
    for (const c of ["C1", "C2"]) {
      const e = this.el(`${PFX}txtPg1mScAI4ISpecialTaxRate${c}${this.TYPE}`);
      e.value = "0.0";
      e.disabled = true;
    }
  }
  /** every copy, EX first then SP, each added by the person whose "Yes" asked for it (item 22 / 107, 23 / 108) */
  addAll(copy: { EX: number; SP: number }, read: Read): void {
    for (const type of ["EX", "SP"] as const) {
      const [tf, spouse] = type === "EX" ? ["rdoPg1Pt1I22IncomeExemptYes", "rdoPg4Pt7I107Yes"] : ["rdoPg1Pt1I23IncomeSpecialYes", "rdoPg4Pt7I108Yes"];
      (this as unknown as { PERSON: string }).PERSON = read(PFX + tf) !== "true" && read(PFX + spouse) === "true" ? "S" : "TF";
      for (let i = 0; i < copy[type]; i++) this.addAttachment(type);
    }
  }
  /** BIR's SAVE AND CLOSE of an add-more pop-up holding `row` (saveChanges(modal, true); closeModal; compute…Modal(false)):
   *  the rows go to the Repository table, the counter is the row count when there are two or more (else 0), two or more
   *  rows lock the parent boxes ("OTHERS" in the description) and the schedule's boxes take the rows' total; one row
   *  hands its description back to the parent boxes. */
  close(m: Modal, copy: string, row: string[][]): void {
    if (row.length === 0) return;
    const g = this as unknown as Record<string, any>;
    const sub = (id: string): string => forCopy(id, copy);
    const link = this.d.getElementById(sub(m.link));
    if (!link) throw new Error(`form1701-sim: no link ${sub(m.link)}`);
    const parent = m.parent.map(sub);
    const table = sub(m.table);
    this.view({ copy } as Elem);
    g.activeModalLink = [link];
    g.activeParentInput = parent;
    if (copy) g.TYPE = copy;
    this.setTable(
      [table, `${table}Repository`],
      row.map((cell, r) => m.cell.map((c, k) => ({ id: sub(c.stem).replace("{i}", String(r + 1)), value: cell[k] ?? "", maxLength: c.ml }))),
    );
    const n = row.length;
    this.guard(m.link, () => g[m.compute](true));
    this.guard(m.link, () => {
      if (copy) g.updateAttachemntModalCounter(m.counter, n > 1 ? n : 0);
      else this.el(m.counter).value = n > 1 ? n : 0;
      if (n > 1) {
        if (!this.el(parent[0]!).disabled) g.disableParentInput(parent);
      } else {
        m.cell.forEach((c, k) => {
          if (c.ml !== 12) this.el(parent[k]!).value = row[0]![k] ?? "";
        });
        for (const p of parent) g.update_enabledInputsOnValidation(p, "ADD");
      }
    });
    this.guard(m.link, () => g[m.compute](false));
  }
  /** every pop-up the filer filled (main pages first, then each copy), from the rows the schema's groups carry */
  closeAll(copy: { EX: number; SP: number }, read: Read): void {
    for (const m of MODAL)
      for (const c of modalCopy(m, copy)) {
        const text = read(rowKey(forCopy(m.modal, c)));
        if (text !== "") this.close(m, c, JSON.parse(text) as string[][]);
      }
  }
  fire(el: Elem, handler: number): void {
    const h = HANDLER[handler];
    if (!h) return;
    try {
      if (el.copy) this.TYPE = el.copy; // the attachment copy the filer is viewing (BIR's setView)
      h(this, el, el.copy || "TYPE");
    } catch (e) {
      this.fault.push({ where: el.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  /** BIR's view state: on a copy the page-number boxes are locked and isOnAttachment is set (showAttachments); on the
   *  main pages they are not (processBack's enablePaging). Handlers read both (getSpouseIDviaTaxfilerID, ...). */
  view(e: Elem): void {
    const on = e.copy !== "";
    this.el(`${PFX}txtCurrentPage`).disabled = on;
    this.el(`${PFX}txtMaxPage`).disabled = on;
    (this as unknown as { isOnAttachment: boolean }).isOnAttachment = on;
  }
  guard(where: string, f: () => void): void {
    this.call(where, f);
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
  const copy = attachmentCount(read(COUNTER));
  const s = new Sim(copy);
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
  s.addAll(copy, read);
  s.enablePaging();
  (s as unknown as { isOnAttachment: boolean }).isOnAttachment = false;
  const live = (e: Elem) => saved(e) && !e.disabled && (page.get(e)! > 0 || e.visible || e.copy !== "");
  const typed = new Set<Elem>();
  const controls = () => {
    for (const e of s.all) {
      if (!live(e) || e.type === "text") continue;
      const want = read(e.id);
      current.value = String(page.get(e) || 1);
      s.view(e);
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
      s.view(e);
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
  // the add-more pop-ups, closed last (a filer opens one after typing the item it hangs on)
  s.closeAll(copy, read);
  current.value = "1";
  // "Back to Main Form": the main pages take the copies' figures
  if (copy.EX + copy.SP > 0) s.guard("processBack", () => s.processBack());

  // saveXML
  s.el(`${PFX}txtMaxPage`).value = "12";
  const input = s.all.filter((e) => e.tagName === "INPUT" && e.type !== "button");
  s.el(`${PFX}txtDisabledOnSave`).value = input.filter((e) => e.disabled && !e.hasClass("disableByDefault")).map((e) => `${e.id},`).join("");
  s.el(`${PFX}txtEnabledOnSave`).value = input.filter((e) => !e.disabled && !e.readOnly).map((e) => `${e.id},`).join("");
  // the native savefile writes an empty amount as "0.00" (schema.ts toRecords), so that is what the reopen loads
  const file = new Map<string, string>();
  for (const e of s.all) if (saved(e)) file.set(e.id, isAmount(e) && e.value === "" ? "0.00" : savedValue(e));

  // reopen: loadXML (isReload, then loadData) on a fresh page
  const r = new Sim(copy);
  r.isReload = true;
  r.addAll(copy, read);
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
  if (copy.EX + copy.SP > 0) call(() => r.processBack());
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
    for (const e of r.all) if (e.type === "text" && saved(e) && !e.disabled && (rpage.get(e)! > 0 || e.visible)) {
        r.view(e);
        e.onblur?.();
      }
  r.enablePaging();

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
