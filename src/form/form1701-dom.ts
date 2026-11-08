// A mini-DOM of BIR Form 1701's page — just enough document, element and jQuery 1.7 for BIR's own page script
// (form1701-bir.ts, mechanically ported) to run unchanged over it.
//
// The elements, their order, names, classes, maxlengths, initial values / disabled state and the ancestor ids that
// define every container are MEASURED from BIR's blank form in WebKit (page/1701.json). The jQuery here
// implements only the selector forms and methods BIR's 1701 script uses: `#id`, `.class`, `tag`, `[attr]`,
// `[attr=v]`, `[attr*=v]`, `[attr$=v]`, `[attr^=v]`, `[attr!=v]`, `:checked`, `:disabled`, `:enabled`,
// `:not(…)`, one descendant combinator; .attr/.prop/.val/.is/.not/.addClass/.removeClass, the rest as no-ops
// (show/hide/html/delegate are presentation).

import dom from "./page/1701.json";
import { formatCurrencyWOC, NegativeValue, NumWithParenthesis, WholeNumWithComma } from "./form1702mx-bir.ts";

type DomRow = [string, string, string, string, string, number, string, number, number, number, number, number, number, number];
interface TableRow {
  cell: string[];
  input: string[];
}
const DOM = dom as unknown as { anc: string[]; box: string[]; table: Record<string, TableRow[]>; el: DomRow[] };

export class Elem {
  readonly tagName: string;
  readonly anc: string[];
  className: string;
  readOnly = false;
  style: Record<string, string> = { display: "" };
  innerHTML = "";
  private ml: string;
  private on: boolean;
  private text: string;
  private off: boolean;
  constructor(
    private readonly doc: Dom1701,
    readonly id: string,
    readonly type: string,
    readonly name: string,
    cls: string,
    ml: string,
    dis: boolean,
    value: string,
    chk: boolean,
    anc: string,
    readonly hBlur: number,
    readonly hClick: number,
    readonly hChange: number,
    readonly inForm: boolean,
    /** shown while page 1 is (the harness blurs only these) */
    readonly visible: boolean,
  ) {
    this.tagName = type === "select-one" ? "SELECT" : type === "textarea" ? "TEXTAREA" : "INPUT";
    this.className = cls;
    this.ml = ml;
    this.off = dis;
    this.text = value;
    this.on = chk;
    this.anc = anc.split(" ");
  }
  /** the DOM's string conversion: null → "", anything else String(x) (BIR assigns numbers) */
  get value(): string {
    return this.text;
  }
  set value(v: unknown) {
    this.text = v === null ? "" : String(v);
  }
  get disabled(): boolean {
    return this.off;
  }
  set disabled(v: unknown) {
    this.off = !!v;
  }
  get checked(): boolean {
    return this.on;
  }
  /** a radio that turns on turns its group off (same name, same form) */
  set checked(on: unknown) {
    const v = !!on;
    if (v && this.type === "radio" && this.name) for (const o of this.doc.byName(this.name)) if (o !== this && o.type === "radio") o.on = false;
    this.on = v;
  }
  get maxLength(): number {
    return this.ml === "" ? -1 : Number(this.ml);
  }
  set maxLength(n: number) {
    this.ml = String(n);
  }
  get onblur(): (() => void) | null {
    return this.hBlur < 0 ? null : () => this.doc.fire(this, this.hBlur);
  }
  /** a script-assigned onclick (claimingExemptionDisable sets item 24's): a function, or null for anything else */
  private clickSet: (() => void) | null | undefined = undefined;
  get onclick(): (() => void) | null {
    if (this.clickSet !== undefined) {
      const f = this.clickSet;
      return f && (() => this.doc.call(this.id, f));
    }
    return this.hClick < 0 ? null : () => this.doc.fire(this, this.hClick);
  }
  set onclick(f: unknown) {
    this.clickSet = typeof f === "function" ? (f as () => void) : null;
  }
  get onchange(): (() => void) | null {
    return this.hChange < 0 ? null : () => this.doc.fire(this, this.hChange);
  }
  getAttribute(name: string): string | null {
    if (name === "maxlength") return this.ml === "" ? null : this.ml;
    if (name === "id") return this.id;
    if (name === "name") return this.name || null;
    if (name === "type") return this.type;
    if (name === "class") return this.className;
    return null;
  }
  hasClass(c: string): boolean {
    return this.className.split(/\s+/).includes(c);
  }
  focus(): void {}
  select(): void {}
  blur(): void {}
}

/** Any other element (div, span, table, link): style / innerHTML holders, a container's inputs, a table's rows. */
export class Box {
  style: Record<string, string> = { display: "" };
  innerHTML = "";
  value: unknown = undefined;
  disabled = false;
  readonly className = "";
  readonly rows: Array<{ cells: Array<{ children: Array<Elem | Box | undefined> }>; getElementsByTagName: (tag: string) => Elem[] }>;
  constructor(
    private readonly doc: Dom1701,
    readonly id: string,
    readonly tag: string,
  ) {
    this.rows = (DOM.table[id] ?? []).map((r) => ({
      cells: r.cell.map((c) => ({ children: [c ? (doc.d.getElementById(c) ?? undefined) : undefined] })),
      getElementsByTagName: (tag: string) => (tag === "input" ? r.input.map((i) => doc.elem.get(i)!).filter(Boolean) : []),
    }));
  }
  getElementsByTagName(tag: string): unknown[] {
    if (tag === "tr") return this.rows;
    if (tag === "input" || tag === "select" || tag === "textarea") return this.doc.inside(this.id).filter((e) => e.tagName === tag.toUpperCase());
    return [];
  }
  hasClass(): boolean {
    return false;
  }
}

// ── selectors ──
interface Compound {
  tag?: string;
  id?: string;
  cls: string[];
  attr: Array<{ name: string; op: string; value: string }>;
  pseudo: Array<{ name: string; arg?: string }>;
}
const unescapeCss = (s: string): string => s.replace(/\\(.)/g, "$1");
function parseCompound(s: string): Compound {
  const c: Compound = { cls: [], attr: [], pseudo: [] };
  const re = /^([a-zA-Z]+)|#((?:\\.|[\w-])+)|\.([\w-]+)|\[\s*([\w-]+)\s*(?:(=|\*=|\$=|\^=|!=)\s*(?:'([^']*)'|"([^"]*)"|([^\]]*?)))?\s*\]|:(\w+)(?:\(([^)]*\)?)\))?/y;
  let m: RegExpExecArray | null;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1]) c.tag = m[1].toUpperCase();
    else if (m[2]) c.id = unescapeCss(m[2]);
    else if (m[3]) c.cls.push(m[3]);
    else if (m[4]) c.attr.push({ name: m[4].toLowerCase(), op: m[5] ?? "", value: unescapeCss(m[6] ?? m[7] ?? m[8] ?? "") });
    else if (m[9]) c.pseudo.push(m[10] === undefined ? { name: m[9] } : { name: m[9], arg: m[10] });
  }
  if (re.lastIndex !== s.length) throw new Error(`form1701-dom: unsupported selector "${s}"`);
  return c;
}
/** split a selector into its descendant steps (whitespace outside brackets / parentheses) */
function steps(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel.trim()) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function attrOf(e: Elem | Box, name: string): string | null {
  if (e instanceof Box) return name === "id" ? e.id : null;
  if (name === "readonly") return e.readOnly ? "readonly" : null;
  if (name === "disabled") return e.disabled ? "disabled" : null;
  return e.getAttribute(name);
}
function matches(e: Elem | Box, c: Compound): boolean {
  if (c.tag && (e instanceof Box ? e.tag.toUpperCase() : e.tagName) !== c.tag) return false;
  if (c.id !== undefined && e.id !== c.id) return false;
  for (const k of c.cls) if (!e.hasClass(k)) return false;
  for (const a of c.attr) {
    const v = attrOf(e, a.name);
    if (a.op === "") {
      if (v === null) return false;
    } else if (a.op === "!=") {
      if (v === a.value) return false;
    } else if (v === null) return false;
    else if (a.op === "=" && v !== a.value) return false;
    else if (a.op === "*=" && !v.includes(a.value)) return false;
    else if (a.op === "$=" && !v.endsWith(a.value)) return false;
    else if (a.op === "^=" && !v.startsWith(a.value)) return false;
  }
  for (const p of c.pseudo) {
    if (p.name === "checked" && !(e instanceof Elem && e.checked)) return false;
    if (p.name === "disabled" && !(e instanceof Elem && e.disabled)) return false;
    if (p.name === "enabled" && !(e instanceof Elem && !e.disabled)) return false;
    if (p.name === "not" && matches(e, parseCompound(p.arg ?? ""))) return false;
  }
  return true;
}

export class JQ extends Array<Elem | Box> {
  static override get [Symbol.species](): ArrayConstructor {
    return Array;
  }
  private elems(): Elem[] {
    return this.filter((e): e is Elem => e instanceof Elem);
  }
  attr(name: string, value?: unknown): unknown {
    const n = name.toLowerCase();
    if (value === undefined) {
      const e = this[0];
      return e === undefined ? undefined : (attrOf(e, n) ?? undefined);
    }
    for (const e of this.elems()) {
      if (n === "disabled") e.disabled = value !== false;
      else if (n === "checked") e.checked = value !== false;
      else if (n === "maxlength") e.maxLength = Number(value);
      else if (n === "class") e.className = String(value);
    }
    return this;
  }
  prop(name: string, value?: unknown): unknown {
    return this.attr(name, value);
  }
  val(value?: unknown): unknown {
    if (value === undefined) return (this[0] as Elem | Box | undefined)?.value;
    for (const e of this.elems()) e.value = String(value);
    return this;
  }
  is(sel: string): boolean {
    const c = parseCompound(sel);
    return this.some((e) => matches(e, c));
  }
  not(sel: string): JQ {
    const c = parseCompound(sel);
    return JQ.of2(this.filter((e) => !matches(e, c)));
  }
  addClass(c: string): JQ {
    for (const e of this.elems()) if (!e.hasClass(c)) e.className = (e.className ? `${e.className} ` : "") + c;
    return this;
  }
  removeClass(c: string): JQ {
    for (const e of this.elems()) e.className = e.className.split(/\s+/).filter((x) => x && x !== c).join(" ");
    return this;
  }
  // presentation only
  html(value?: unknown): unknown {
    return value === undefined ? "" : this;
  }
  show(): JQ {
    return this;
  }
  hide(): JQ {
    return this;
  }
  remove(): JQ {
    return this;
  }
  delegate(): JQ {
    return this;
  }
  unbind(): JQ {
    return this;
  }
  focus(): JQ {
    return this;
  }
  static of2(items: Array<Elem | Box>): JQ {
    const q = new JQ();
    for (const x of items) q.push(x);
    return q;
  }
}

export interface Fault {
  where: string;
  message: string;
}

/** The page: elements in DOM order, the document / jQuery / window globals BIR's script reads, and BIR's global
 *  variables (fields, so sloppy-mode globals keep their shared-across-functions behaviour). */
export abstract class Dom1701 {
  [global: string]: unknown;
  readonly all: Elem[] = [];
  readonly elem = new Map<string, Elem>();
  private readonly box = new Map<string, Box>();
  private readonly boxTag = new Map<string, string>();
  private readonly nameIndex = new Map<string, Elem[]>();
  private readonly insideIndex = new Map<string, Elem[]>();
  /** BIR's alert() messages and every handler that threw (the browser logs and moves on; so does the sim) */
  readonly alerted: string[] = [];
  readonly fault: Fault[] = [];

  readonly d = {
    // legacy-shim.js's IE lookup falls back to the first element whose `name` matches case-blind; for "" that is
    // any element with no name — the first is <HTA:APPLICATION id="Form1701"> (BIR's split id lists end in "")
    // and before that the exact `name` (BIR asks for 'frm1701:rdoPg4Pt7I109CompensationATC', item 109's radio name)
    getElementById: (id: string): Elem | Box | null =>
      id === "" ? this.hta : (this.elem.get(id) ?? this.boxOf(id) ?? this.byName(id)[0] ?? this.caseBlind(id)),
    getElementsByName: (name: string): Elem[] => this.byName(name),
  };
  /** jxboxV2.js sets document.onmouseup = Custom.clear (the styled-checkbox redraw) */
  readonly document: Record<string, unknown> = { getElementById: this.d.getElementById, getElementsByName: this.d.getElementsByName, onmouseup: (): void => {} };
  readonly window = { setTimeout: (): number => 0 };
  readonly Custom = { check: (): void => {}, pushed: (): void => {} };
  readonly $: ((sel: unknown) => JQ) & { trim: (s: unknown) => string; inArray: (v: unknown, a: unknown[]) => number };

  constructor() {
    for (const [id, type, name, cls, ml, dis, v, chk, anc, b, c, h, f, vis] of DOM.el)
      this.all.push(new Elem(this, id, type, name, cls, ml, dis === 1, v, chk === 1, DOM.anc[anc] ?? "", b, c, h, f === 1, vis === 1));
    for (const e of this.all) {
      if (e.id) this.elem.set(e.id, e);
      if (e.name) this.nameIndex.set(e.name, [...(this.nameIndex.get(e.name) ?? []), e]);
      for (const a of e.anc) this.insideIndex.set(a, [...(this.insideIndex.get(a) ?? []), e]);
    }
    for (const b of DOM.box) {
      const [tag, id] = b.split(" ") as [string, string];
      this.boxTag.set(id, tag);
    }
    const $ = (sel: unknown): JQ => this.query(sel);
    this.$ = Object.assign($, { trim: (s: unknown) => String(s ?? "").trim(), inArray: (v: unknown, a: unknown[]) => (a ? a.indexOf(v) : -1) });
    // BIR's globals with an initial value (script top level); the rest start undefined, as in BIR
    Object.assign(this, {
      totalEXArray: [], totalSPArray: [], totalEXbyPerson: {}, totalSPbyPerson: {}, TYPE: "", PERSON: "",
      isOnAttachment: false, disabledID: [], counterDisabled: -1, isValidToClose: true, isReload: false,
      atcCounterTaxFiler: 0, atcCounterSpouse: 0, deletedRowCount: 0, enabledinputIDs: [], scheduleErrorList: [],
      disabledinputIDs: [], enabledlinkIDs: [], MaxPage: 12,
    });
  }

  private lower?: Map<string, Elem>;
  /** the shim's last resort: an input whose id or name matches ignoring case */
  private caseBlind(id: string): Elem | null {
    if (!this.lower) {
      this.lower = new Map();
      for (const e of this.all) for (const k of [e.id, e.name] as Array<string | null>) if (k &&!this.lower.has(k.toLowerCase())) this.lower.set(k.toLowerCase(), e);
    }
    return id == null ? null : (this.lower.get(String(id).toLowerCase()) ?? null);
  }
  private htaBox?: Box;
  get hta(): Box {
    return (this.htaBox ??= new Box(this, "Form1701", "HTA:APPLICATION"));
  }
  /** run a script-assigned handler; a throw is logged like fire()'s */
  call(where: string, f: () => void): void {
    try {
      f();
    } catch (e) {
      this.fault.push({ where, message: e instanceof Error ? e.message : String(e) });
    }
  }

  boxOf(id: string): Box | null {
    let b = this.box.get(id);
    if (!b) {
      const tag = this.boxTag.get(id);
      if (tag === undefined) return null;
      b = new Box(this, id, tag);
      this.box.set(id, b);
    }
    return b;
  }
  byName(name: string): Elem[] {
    return this.nameIndex.get(name) ?? [];
  }
  /** the inputs / selects inside a container, DOM order */
  inside(id: string): Elem[] {
    return this.insideIndex.get(id) ?? [];
  }

  query(sel: unknown): JQ {
    if (sel instanceof Elem || sel instanceof Box) return JQ.of2([sel]);
    if (typeof sel !== "string") return new JQ();
    const s = steps(sel);
    const last = parseCompound(s[s.length - 1]!);
    let pool: Array<Elem | Box>;
    if (last.id !== undefined && !last.tag) {
      const one = this.d.getElementById(last.id);
      pool = one ? [one] : [];
    } else pool = this.all;
    for (const step of s.slice(0, -1).reverse()) {
      const c = parseCompound(step);
      if (c.id === undefined || c.cls.length || c.attr.length) throw new Error(`form1701-dom: unsupported ancestor "${step}"`);
      const inside = new Set(this.inside(c.id));
      pool = pool.filter((e) => e instanceof Elem && inside.has(e));
    }
    return JQ.of2(pool.filter((e) => matches(e, last)));
  }

  /** run an inline handler as the browser does: `this` = the element; an exception ends that handler only */
  abstract fire(el: Elem, handler: number): void;

  // BIR's string-util2014.js helpers and the dialogs
  NegativeValue = NegativeValue;
  formatCurrencyWOC = formatCurrencyWOC;
  NumWithParenthesis = NumWithParenthesis;
  WholeNumWithComma = WholeNumWithComma;
  capitalize(a: Elem): void {
    a.value = a.value.toUpperCase().trim();
  }
  alert(message: unknown): void {
    this.alerted.push(String(message));
  }
  /** the oracle (and a filer reading the prompt) answers OK */
  confirm(): boolean {
    return true;
  }
  letternumber(): boolean {
    return true;
  }
  wholenumber(): boolean {
    return true;
  }
}
