// BIR's 1702-MX attachments, shared by the four editions (1702MX, 1702MXv2018, 1702MXv2018C, 1702MXv2018Cxx).
// A filer with two or more exempt (EX) or special-rate (SP) activities adds one copy of BIR's attachment pages
// (the `attachmentPages_TEMP` block) per activity: addAttachment() clones the block, swaps the token "AttM" in
// every id for "EX1", "SP2" …, turns type=hidden into type=text (IE serialised `type=hidden` unquoted, which is
// why BIR's own replace works there) and ticks the regime radio. Each copy's boxes are then ordinary saved boxes.
//
// The boxes are captured from BIR's markup (tool/attachment-capture.mjs → attachment/<layout>.json, never
// hand-edited): id, default, class, which of them BIR disables, and the onchange / onblur BIR wires. A copy's
// handlers are BIR's own strings, replayed here statement by statement (`runHandler`), so a copy needs no
// hand-wired table; the compute functions they call are ported with the form's own (`OldSim`, `Sim2018`).
import box1702MX from "./attachment/1702MX.json";
import box1702MXv2018C from "./attachment/1702MXv2018C.json";
import type { AttachmentSpec, FieldKind, FieldSpec } from "./schema.ts";

export const PREFIX = "frm1702MX:";
export const TOKEN = "AttM";
/** Copies the web version prepares per kind (BIR itself has no cap). */
export const MAX = 5;
export const KIND = ["EX", "SP"] as const;
export type Kind = (typeof KIND)[number];
export type Layout = "1702MX" | "1702MXv2018C";

export interface Box {
  id: string;
  type: string;
  name: string;
  value: string;
  disabled: boolean;
  numbertext: boolean;
  max: string;
  change: string;
  blur: string;
  /** The `AttMSchedule…` divs the box sits in (BIR disables everything in Schedule I / IA of a copy). */
  inside: string[];
  checked: boolean;
  notenabled: boolean;
}

export const BOX: Record<Layout, Box[]> = { "1702MX": box1702MX.box as Box[], "1702MXv2018C": box1702MXv2018C.box as Box[] };
/** The main form's columns A (exempt) and B (special rate) that BIR clears and disables while a copy of that kind exists. */
export const COLUMN: Record<Layout, { A: string[]; B: string[] }> = { "1702MX": box1702MX.column, "1702MXv2018C": box1702MXv2018C.column };

export const copyId = (s: string, copy: string): string => s.replaceAll(TOKEN, copy);
export const copyName = (kind: Kind, n: number): string => `${kind}${n}`;
/** "txtPg1EX2ScBI1" → "EX2"; null for a main-form id. */
export const copyOf = (id: string): string | null => {
  const m = /^(?:txt|rdo)Pg\d((?:EX|SP)\d+)/.exec(id) ?? /^txt((?:EX|SP)\d+)Ctr/.exec(id);
  return m ? m[1]! : null;
};
const INDEX: Record<Layout, Map<string, Box>> = {
  "1702MX": new Map(BOX["1702MX"].map((b) => [b.id, b])),
  "1702MXv2018C": new Map(BOX["1702MXv2018C"].map((b) => [b.id, b])),
};
/** The captured box behind a copy's id ("txtPg1EX2ScBI1"), and the copy it belongs to; null for any other id. */
export function copyBox(layout: Layout, id: string): { box: Box; copy: string } | null {
  const copy = copyOf(id);
  if (!copy) return null;
  const box = INDEX[layout].get(id.replace(copy, TOKEN));
  return box ? { box, copy } : null;
}
export const kindOf =(copy: string): Kind => (copy.startsWith("SP") ? "SP" : "EX");
export const countField = (kind: Kind): string => `${PREFIX}total${kind}Attach`;

/** Cascade targets: the boxes a `checkNullRow_OnBlur3 / 4` enables once the row above is described. */
function laterOf(box: Box[]): Set<string> {
  const later = new Set<string>();
  for (const b of box)
    for (const st of statementOf(b.blur)) {
      if (st.fn === "checkNullRow_OnBlur3" && typeof st.arg[1] === "string") st.arg[1].split(",").forEach((x) => later.add(x));
      if (st.fn === "checkNullRow_OnBlur4" && typeof st.arg[2] === "string") st.arg[2].split(",").forEach((x) => later.add(x));
    }
  return later;
}

export interface Statement {
  fn: string;
  arg: Array<string | number>;
}
const ARG = /'([^']*)'|"([^"]*)"|([\w.]+)/g;
/** BIR's inline handler `a(this); b('AttM', 1)` as calls. `this.value=addCommas(this.value)` is the call addCommas. */
export function statementOf(source: string): Statement[] {
  const out: Statement[] = [];
  for (const part of source.split(";")) {
    const m = /^\s*(?:this\.value\s*=\s*)?([A-Za-z_]\w*)\s*\(([^]*)\)\s*$/.exec(part);
    if (!m) continue;
    const arg: Array<string | number> = [];
    for (const a of m[2]!.matchAll(ARG)) arg.push(a[1] ?? a[2] ?? (/^-?\d+(\.\d+)?$/.test(a[3]!) ? Number(a[3]) : a[3]!));
    out.push({ fn: m[1]!, arg });
  }
  return out;
}

/** What a copy's box is to the web version: typed by the filer, or BIR's own figure (read-only), or fixed. */
export type Role = "typed" | "computed" | "fixed";
export function roleOf(layout: Layout, b: Box, later = LATER[layout]): Role {
  // Schedule I / IA of a copy are disabled when the copy is added and BIR enables them only for a few special-rate cases
  if (b.type === "radio" || b.inside.length > 0 || /(TIN\d$|TINMASK$|RegisteredName$|^txtAttMCtr|_SubTotal$)/.test(b.id)) return "fixed";
  if (b.disabled && !later.has(b.id)) return "computed";
  return "typed";
}
const LATER: Record<Layout, Set<string>> = { "1702MX": laterOf(BOX["1702MX"]), "1702MXv2018C": laterOf(BOX["1702MXv2018C"]) };

const kindOfBox = (b: Box): FieldKind => (b.type === "radio" ? "radio" : b.numbertext ? "money" : "text");

/** Every box of every copy up to MAX, as schema fields in BIR's DOM order: EX1 … EX<MAX>, then SP1 … SP<MAX>. */
export function copyField(layout: Layout, derive: (id: string, f: FieldSpec) => Partial<FieldSpec>): FieldSpec[] {
  const out: FieldSpec[] = [];
  for (const kind of KIND)
    for (let n = 1; n <= MAX; n++) {
      const copy = copyName(kind, n);
      for (const b of BOX[layout]) {
        const id = `${PREFIX}${copyId(b.id, copy)}`;
        const f: FieldSpec = { id, kind: kindOfBox(b) };
        const role = roleOf(layout, b);
        if (role !== "typed") f.compute = () => 0;
        out.push({ ...f, ...derive(id, f) });
      }
    }
  return out;
}

const firstConfirm = (kind: string, column: string) =>
  `Adding ${kind} Attachments will remove current values in Column ${column} of Part IV Items 31-36 (Page 2), Schedules 3, 3A, 3B, 3C, 4, 5 and 6 (Page 4 to 6) and these fields will be rendered uneditable.\nContinue?`;

export function attachmentSpec(layout: Layout, after: string): AttachmentSpec {
  void layout;
  return {
    template: "attachmentPages_TEMP",
    token: TOKEN,
    max: MAX,
    kind: [
      // BIR's add buttons have no id: "Add Exempt Tax Regime" / "Add Special Rate Tax Regime" (addExemptAttachment)
      { code: "EX", container: "attachmentEX", count_field: countField("EX"), add_button: "Add Exempt Tax Regime", first_confirm: firstConfirm("Exempt", "A (Exempt Column)") },
      { code: "SP", container: "attachmentSP", count_field: countField("SP"), add_button: "Add Special Rate Tax Regime", first_confirm: firstConfirm("Special", "B (Special Rate Column)") },
    ],
    unhide: true,
    after,
  };
}

/** The element a copy handler's `this` stands for is its bare id; these are the BIR functions that read the page
 *  rather than the copy (alerts, focus, key filters) and so do nothing to a value. */
const NO_EFFECT = new Set(["numbersonly", "wholenumber", "Name"]);
export class Unported extends Error {}

export interface Handled {
  [fn: string]: unknown;
}
/** Replays BIR's `onchange` / `onblur` string of one copy box on the form's simulation. */
export function runHandler(sim: Handled, source: string, copy: string, element: string): void {
  for (const st of statementOf(copyId(source, copy))) {
    const f = sim[st.fn];
    const arg = st.arg.map((a) => (a === "this" || a === "this.value" ? element : a));
    if (typeof f === "function") (f as (...x: unknown[]) => unknown).apply(sim, arg);
    else if (!NO_EFFECT.has(st.fn)) throw new Unported(`${st.fn} (${element})`);
  }
}
