// The P3 form model: a form is DATA — an ordered list of typed fields with a compute graph and validation —
// instead of 3 MB of inline IE JavaScript. A rewritten form stays byte-compatible with BIR by emitting the
// same savefile record keys (docs/analysis/web-layer.md §2.2); the legacy form is the compatibility oracle.

import { parseMoney, type Centavo } from "./money.ts";
import upperCaseJson from "./upper-case.json";
import { getValue, legacyEscape, legacyUnescape, type SaveRecord, type Savefile } from "@/lib/savefile.ts";

export type FieldKind = "text" | "money" | "select" | "radio" | "checkbox";

export interface FieldSpec {
  /** The savefile key — BIR's element id, kept verbatim. */
  id: string;
  kind: FieldKind;
  /** Stored through legacy `escape()` (names/addresses). */
  escaped?: boolean;
  /** A computed money field: derived from other fields, read-only. */
  compute?: (read: (id: string) => string) => Centavo;
  /** Required for the form to validate. */
  required?: boolean;
  /** Never written to disk (the eBIRForms-Online password, WL security 2). */
  secret?: boolean;
  /** This field is only live when the gate condition holds; otherwise the legacy form forces it to 0.00 / "" / unchecked
   *  (and so do we, keeping a native save byte-compatible — e.g. 0620 items 14/15 apply only to an amended
   *  return). A single `{on, equals}` or an array of conditions that must ALL hold (AND), e.g. 2551Qv2018's
   *  item 16 needs both the percentage-tax rate option and an amended return. A gate also overrides `compute`. */
  gate?: GateCond | GateCond[];
  /** Renders a computed value where BIR's own code writes something other than formatCurrency, e.g. 1702Q's
   *  compute26A sets the literal number 0 ("0", not "0.00") when item 24A is not positive. Defaults to the
   *  schema's money format. */
  format?: (cents: Centavo, read: (id: string) => string) => string;
  /** A computed field the user may still overwrite: `compute` supplies BIR's default (it reads the field's own
   *  value first), e.g. 0620's due day, which BIR sets to the 10th but leaves editable. */
  is_editable?: boolean;
  /** The literal string BIR's own code leaves in this field, given its value after gate/compute (`value`, "" when
   *  unset). Runs in the same DOM-order pass, right after gate/compute. For what a Centavo compute can't say: a
   *  checkbox BIR ticks on blur (1706 `opt29A` when land FMV > 0), a radio BIR clears (the refund/TCC option when
   *  the total isn't an overpayment), a bare "0" BIR assigns instead of "0.00" (1800 item 25A). Returning "" for
   *  a field that was never set leaves it unset, so BIR's template default still applies. */
  derive?: (read: (id: string) => string, value: string) => string;
  /** Rewrites this key's saved value once PER TEMPLATE OCCURRENCE — for an id BIR's DOM carries several times, which
   *  one overlay value can't express: 2000v2018's four `frm2000:modLabel` pop-up labels (each its own default, all
   *  upper-cased by capital()), 2000's two `frm2000:optSection:_2` radios (only the first is section B). Gets the
   *  computed form, the record's value (the native overlay, else BIR's default, as saved) and the occurrence index. */
  derive_default?: (read: (id: string) => string, value: string, occurrence: number) => string;
}

/** One gate condition: field `on` must equal `equals` for the gated field to be live — or, for a condition on a
 *  computed amount (BIR's "overpayment" radios live only while the amount payable is negative), a `when` test over
 *  the form as computed so far (DOM order, like `compute`). */
export type GateCond = { on: string; equals: string } | { when: (read: (id: string) => string) => boolean };

/**
 * A repeating schedule — the variable-row tables the heavy forms build at runtime (e.g. 1600WP's ATC
 * breakdown, 1601EQ). Each row has the same sub-fields; BIR serializes them as `<id><i>` plus a size field.
 */
export interface GroupSpec {
  /** Logical name, for state keys. */
  name: string;
  /** Per-row sub-fields; `id` is the un-indexed stem, e.g. "frm1600WP:txtTaxBase". A sub-field may carry
   *  `row_compute`, a per-row derivation (e.g. withheld = base × rate ÷ 100). The second arg reads form-level
   *  (scalar) fields, for schedules whose per-row rate lives on the form (e.g. 1621's `txtTaxRate`). A sub-field's
   *  `derive` runs after row_compute with the row's stem reader (e.g. 1707v2018's upper-cased seller names). */
  row: Array<FieldSpec & { row_compute?: (read: (stem: string) => string, form: (id: string) => string) => Centavo }>;
  /** The hidden field holding the row count, e.g. "hPartIITableSize". Omit it for forms that reconstruct rows
   *  purely by counting a per-row marker (e.g. 1707's `chxSched1<i>`) and never serialize a count field. */
  size_field?: string;
  /** BIR indexes rows from this number (usually 1). */
  first_index: number;
  /** Optional aggregate(s): each writes the sum of one sub-field's stem across rows into a scalar field.
   *  An array lets a schedule feed several totals (e.g. 1621's Withdrawn and Withheld column totals). */
  total?: GroupAgg | GroupAgg[];
}

export interface GroupAgg {
  into: string;
  of: string;
  /** Optional row filter: only rows for which this returns true are summed. The second arg reads form-level
   *  (scalar) state, for buckets that depend on a form radio (e.g. 2552 splits by a Primary/Secondary option
   *  and by the per-row rate). Omit it to sum every row. The row passed is the COMPUTED row (row_compute applied). */
  where?: (row: GroupRow, form: FormState) => boolean;
  /** Optional custom aggregate: the string written into `into`, from the COMPUTED rows in order. For a BIR figure
   *  that is not an exact centavo sum — 2000OTv2018 floors / rounds a JS float running sum (`+= NumWithComma(…)`),
   *  which can land just under an exact multiple — so the form can carry BIR's own float. Omit for Σ `of`. */
  sum?: (row: GroupRow[], form: FormState) => string;
}

export type GroupRow = Record<string, string>;

export interface FormSchema {
  form_code: string;
  title: string;
  field: FieldSpec[];
  /** Repeating schedules, if any. */
  group?: GroupSpec[];
  /** Money display override. Default renders like BIR's `formatCurrency` (round-half-up, "-" sign). The 1707
   *  family uses accounting parentheses for negatives (`formatMoneyParen`). Rounding is identical either way. */
  format?: (cents: Centavo) => string;
  /** Records DERIVED from the filled form that are neither fields nor schedule rows, appended after the groups.
   *  1601FQ's ATC picker serializes one `AtcCd<i>` checkbox per pick-list entry; the legacy reload rebuilds
   *  Part II from those, so they follow from the rows' (code, rate) rather than being entered. */
  extra_record?: (state: FormState, groups: GroupState) => SaveRecord[];
}

const moneyStr = (cents: Centavo): string => {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(abs % 100).toString().padStart(2, "0")}`;
};

/** Apply each sub-field's `row_compute` to every row, returning rows with the computed sub-fields filled.
 *  A sub-field's `derive` (the row form of FieldSpec.derive) runs right after, in sub-field order: it gets the cell's
 *  current value and a reader that sees the row's stems first, then form-level fields — for what a Centavo can't
 *  say (a rate string BIR writes from the picked code, a cell BIR blanks when a form radio disables its schedule). */
export function computeGroupRows(group: GroupSpec, rows: GroupRow[], form: FormState = {}): GroupRow[] {
  const formRead = (id: string) => form[id] ?? "";
  return rows.map((row) => {
    const next = { ...row };
    const read = (stem: string) => next[stem] ?? "";
    // per sub-field, in DOM order: row_compute, then `derive` — the literal BIR leaves in the cell (1801v2018's RDO
    // picker saves "000", 1707v20xx upper-cases a seller's name, DST reads a form-level field). A derive reads the
    // row first, then the form. An empty result on an absent cell leaves it absent, so money defaults still apply.
    const either = (id: string) => (id in next ? next[id]! : formRead(id));
    for (const sub of group.row) {
      if (sub.row_compute) next[sub.id] = moneyStr(sub.row_compute(read, formRead));
      if (!sub.derive) continue;
      const value = sub.derive(either, next[sub.id] ?? "");
      if (value !== "" || sub.id in next) next[sub.id] = value;
    }
    return next;
  });
}

/** The serialized record key for a row sub-field at a given index. Default appends the index (`<stem><i>`).
 *  A stem containing `{i}` is a template — the index is substituted there instead (for middle-index naming
 *  like 1621's `txtSched1_{i}_Withdrawn` and the 2020+ excise forms). */
export const rowFieldId = (stem: string, index: number): string =>
  stem.includes("{i}") ? stem.replaceAll("{i}", String(index)) : `${stem}${index}`;

/** Serialize a group's rows to BIR's indexed records: one per sub-field (see rowFieldId), plus the size field.
 *  With `form_code`, text cells get BIR's `capital()` upper-casing like scalar text. */
export function groupRecords(group: GroupSpec, rows: GroupRow[], form: FormState = {}, form_code = ""): SaveRecord[] {
  const computed = computeGroupRows(group, rows, form);
  const record: SaveRecord[] = group.size_field ? [{ key: group.size_field, value: String(computed.length) }] : [];
  computed.forEach((row, i) => {
    const index = group.first_index + i;
    for (const sub of group.row) {
      const key = rowFieldId(sub.id, index);
      let value = row[sub.id] ?? (sub.kind === "money" ? "0.00" : "");
      if (sub.kind === "text") value = upperCase(form_code, key, value);
      record.push({ key, value: sub.escaped ? legacyEscape(value) : value });
    }
  });
  return record;
}

/** The aggregate total of a group's `of` sub-field across its (computed) rows, in centavos. An optional `where`
 *  predicate restricts the sum to matching rows (for bucketed totals like 2552's rate × transaction-type cells). */
export function groupTotal(group: GroupSpec, rows: GroupRow[], ofStem: string, form: FormState = {}, where?: GroupAgg["where"]): Centavo {
  return computeGroupRows(group, rows, form)
    .filter((row) => !where || where(row, form))
    .reduce((sum, row) => sum + parseMoney(row[ofStem] ?? "0"), 0);
}

/** Normalize a group's `total` (single, array, or none) to an array of aggregates. */
export const groupAggs = (group: GroupSpec): GroupAgg[] => (group.total ? (Array.isArray(group.total) ? group.total : [group.total]) : []);

export type FormState = Record<string, string>;

/** A field list extracted from the legacy form (tool/form-fields.mjs --json). */
export interface FieldJson {
  id: string;
  kind: FieldKind;
  escaped?: boolean;
  secret?: boolean;
}

/** Build a schema from an extracted field list plus per-field overrides (compute, required). */
export function buildSchema(
  form_code: string,
  title: string,
  json: FieldJson[],
  override: Record<string, Partial<FieldSpec>> = {},
): FormSchema {
  return { form_code, title, field: json.map((f) => ({ ...f, ...override[f.id] })) };
}

const money = (cents: Centavo): string => {
  // kept local to avoid importing formatMoney circularly in specs; same output
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(abs % 100).toString().padStart(2, "0")}`;
};

/** Recompute every `compute` field in schema order, so a later field sees earlier computed results
 *  (20D before 21). Exact centavo math, no float drift. */
/** A gate is closed (field forced to 0/"") when ANY of its conditions is unmet. */
function gateClosed(gate: FieldSpec["gate"], state: FormState): boolean {
  if (!gate) return false;
  const cond = Array.isArray(gate) ? gate : [gate];
  return cond.some((c) => ("when" in c ? !c.when((id) => state[id] ?? "") : (state[c.on] ?? "") !== c.equals));
}

/** What a closed gate forces: 0.00 for money, unchecked for a radio / checkbox (BIR clears `.checked`), else "". */
const closedValue = (f: FieldSpec, fmt: (cents: Centavo) => string): string =>
  f.kind === "money" ? fmt(0) : f.kind === "radio" || f.kind === "checkbox" ? "false" : "";

export function computeAll(schema: FormSchema, state: FormState): FormState {
  const next = { ...state };
  const fmt = schema.format ?? money;
  const read = (id: string) => next[id] ?? "";
  // single pass in field (DOM) order: a closed gate forces 0/"" and overrides compute; otherwise compute runs.
  // Gated fields always precede the fields that read them, so a later compute sees the forced value.
  for (const f of schema.field) {
    if (gateClosed(f.gate, next)) next[f.id] = closedValue(f, fmt);
    else if (f.compute) next[f.id] = (f.format ?? fmt)(f.compute(read), read);
    if (f.derive) {
      const value = f.derive(read, next[f.id] ?? "");
      if (value !== "" || f.id in next) next[f.id] = value;
    }
  }
  return next;
}

/** True when a gated field is currently live (all its conditions hold). FormView uses this to enable/disable it. */
export function isGateOpen(field: FieldSpec, state: FormState): boolean {
  return !gateClosed(field.gate, state);
}

export type GroupState = Record<string, GroupRow[]>;

/** Group totals injected into scalar state, then scalar compute runs — so a form field can read a schedule sum. */
export function computeForm(schema: FormSchema, state: FormState, groups: GroupState = {}): FormState {
  const withTotals = { ...state };
  for (const g of schema.group ?? []) {
    for (const a of groupAggs(g)) {
      const row = groups[g.name] ?? [];
      withTotals[a.into] = a.sum ? a.sum(computeGroupRows(g, row, state), state) : moneyStr(groupTotal(g, row, a.of, state, a.where));
    }
  }
  return computeAll(schema, withTotals);
}

/** BIR's save template per form: what its saveXML writes for the blank form, in DOM order, with defaults
 *  (test/capture-template.test.ts). Includes runtime-built keys and the eBIRForms-Online fields saved EMPTY. */
type TemplateRecord = [key: string, value: string, radio_name?: string];
const TEMPLATE: Record<string, TemplateRecord[]> = Object.fromEntries(
  Object.entries(import.meta.glob("./template/*.json", { eager: true, import: "default" }) as Record<string, TemplateRecord[]>).map(
    ([path, record]) => [path.slice("./template/".length, -".json".length), record],
  ),
);

/** The full savefile record list. With a captured template (every BIR form has one), the native values overlay
 *  BIR's own blank save: keys BIR writes but the schema doesn't model keep BIR's default, scalar keys BIR never
 *  writes are dropped, and schedule rows / derived records past the template are appended. Without one: scalar
 *  records in schema order, then every group's indexed rows, then extra_record. */
export function formRecords(schema: FormSchema, state: FormState, groups: GroupState = {}): SaveRecord[] {
  const computed = computeForm(schema, state, groups);
  const scalar = toRecords(schema, computed);
  const dynamic: SaveRecord[] = [];
  for (const g of schema.group ?? []) dynamic.push(...groupRecords(g, groups[g.name] ?? [], computed, schema.form_code));
  if (schema.extra_record) dynamic.push(...schema.extra_record(computed, groups));
  const template = TEMPLATE[schema.form_code];
  if (!template) return [...scalar, ...dynamic];

  const escaped = new Set(schema.field.filter((f) => f.escaped).map((f) => f.id));
  const overlay = new Map<string, string>();
  // a scalar the user never set (and no compute or gate produced) keeps BIR's own default ("1", "-", "false", "2019")
  for (const r of scalar) if (r.key in computed) overlay.set(r.key, r.value);
  for (const r of dynamic) overlay.set(r.key, r.value);
  // radio semantics: once any radio in a BIR group is chosen, its unset siblings are unchecked, not BIR's default
  const chosen = new Set(template.filter(([key, , name]) => name && overlay.get(key) === "true").map(([, , name]) => name));
  for (const [key, , name] of template) if (name && chosen.has(name) && !overlay.has(key)) overlay.set(key, "false");
  const inTemplate = new Set(template.map(([key]) => key));
  const byDefault = new Map(schema.field.filter((f) => f.derive_default).map((f) => [f.id, f.derive_default!]));
  const read = (id: string) => computed[id] ?? "";
  const seen = new Map<string, number>();
  const record = template.map(([key, value]) => {
    const saved = overlay.get(key) ?? (escaped.has(key) ? legacyEscape(value) : value);
    const fix = byDefault.get(key);
    if (!fix) return { key, value: saved };
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return { key, value: fix(read, saved, occurrence) };
  });
  // each key once: an extra_record entry may override a schedule cell (last write wins, as for template keys)
  const emitted = new Set<string>();
  for (const r of dynamic) {
    if (inTemplate.has(r.key) || emitted.has(r.key)) continue;
    emitted.add(r.key);
    record.push({ key: r.key, value: overlay.get(r.key)! });
  }
  return record;
}

/** Whether a form has a captured BIR save template. */
export const hasTemplate = (form_code: string): boolean => form_code in TEMPLATE;

/** BIR's blank-form value for a key (what a native save writes while the user leaves it unset), if templated.
 *  For a compute that must see the value the file will hold, e.g. 0620's due date derives from the period. */
export const templateValue = (form_code: string, key: string): string | undefined => TEMPLATE[form_code]?.find((r) => r[0] === key)?.[1];

/** BIR's radio group for a radio id (its HTML `name`), from the template; falls back to the id minus a trailing
 *  `_N` for forms without one. Ids alone mislead: optAmend:Y / optAmend:N and CatAgent_P / CatAgent_G are pairs. */
export function radioGroupName(form_code: string, id: string): string {
  return TEMPLATE[form_code]?.find((r) => r[0] === id)?.[2] ?? id.replace(/_?\d+$/, "");
}

export interface Problem {
  id: string;
  message: string;
}

/** Required-field validation. Form-specific rules (TIN check, etc.) are layered by the caller. */
export function validate(schema: FormSchema, state: FormState): Problem[] {
  const problem: Problem[] = [];
  for (const f of schema.field) {
    if (f.required && !(state[f.id] ?? "").trim()) problem.push({ id: f.id, message: `${f.id} is required` });
  }
  return problem;
}

/** What BIR upper-cases under the 1:1 model, MEASURED per form (test/capture-template.test.ts, EBF_CAPTURE_UPPER):
 *  "all" where `capital`'s whole-form sweep runs (string-util.js declares `capital` twice; the no-argument one wins),
 *  or the exact field ids a `capitalize(this)`-style blur upper-cases. Absent: BIR leaves text as typed. */
const UPPER_CASE = upperCaseJson as Record<string, "all" | string[]>;
/** BIR's upper-casing applied to one text value (txtEmail is always exempt). */
const upperCase = (form_code: string, id: string, value: string): string => {
  const rule = UPPER_CASE[form_code];
  if (!rule || /(^|:)txtEmail$/.test(id)) return value;
  return rule === "all" || rule.includes(id) ? value.toUpperCase() : value;
};

/** State → savefile records in schema order, escaping and money-formatting as BIR does, dropping secrets. */
export function toRecords(schema: FormSchema, state: FormState): SaveRecord[] {
  const computed = computeAll(schema, state);
  const record: SaveRecord[] = [];
  for (const f of schema.field) {
    if (f.secret) continue;
    let value = computed[f.id] ?? "";
    if (f.kind === "money") value = value === "" ? "0.00" : value;
    if (f.kind === "text") value = upperCase(schema.form_code, f.id, value);
    if (f.escaped) value = legacyEscape(value);
    record.push({ key: f.id, value });
  }
  return record;
}

/** Load a savefile into form state (unescaping escaped fields); unknown keys are ignored. */
export function fromSavefile(schema: FormSchema, file: Savefile): FormState {
  const state: FormState = {};
  for (const f of schema.field) {
    if (f.secret) continue;
    const raw = getValue(file, f.id);
    if (raw === undefined) continue;
    state[f.id] = f.escaped ? legacyUnescape(raw) : raw;
  }
  return state;
}

/** A saved return, reopened for editing: its state (blank fields left absent, as on a fresh form, so a blank
 *  money field stays blank rather than becoming 0.00) and its schedule rows. */
export function reopenSavefile(schema: FormSchema, file: Savefile, form_code = ""): { state: FormState; groups: GroupState } {
  // a key BIR writes more than once with DIFFERENT values (2000's per-ATC `modLabel`) is fixed text the form writes
  // itself; one written more than once with the SAME value is the user's, repeated per page (2200Av2020's TIN on
  // each of its three pages) and must survive a reopen
  const value = new Map<string, Set<string>>();
  for (const r of file.record) value.set(r.key, (value.get(r.key) ?? new Set()).add(r.value));
  const state = Object.fromEntries(Object.entries(fromSavefile(schema, file)).filter(([k, v]) => v !== "" && value.get(k)?.size === 1));
  return { state, groups: groupsFromSavefile(schema, file, form_code) };
}

/** Rebuild a form's schedule rows from a savefile: the size field's count, else rows while the first sub-field
 *  holds a value. The inverse of groupRecords (unescaping escaped sub-fields). */
export function groupsFromSavefile(schema: FormSchema, file: Savefile, form_code = ""): GroupState {
  const out: GroupState = {};
  for (const g of schema.group ?? []) {
    const first = g.row[0];
    const sized = g.size_field ? Number(getValue(file, g.size_field) ?? "") : NaN;
    const rows: GroupRow[] = [];
    // no size field: BIR's template already carries blank rows, so a row counts only while it holds a value
    // (a value equal to the blank template's, e.g. a drop-down's first option, is not one)
    // nor is what the form writes for an added blank row, e.g. 1702EX's "PS" drop-down)
    const blank = new Map(groupRecords(g, [{}], {}, form_code).map((r) => [r.key, r.value]));
    const filled = (i: number) =>
      g.row.some((sub) => {
        const key = rowFieldId(sub.id, g.first_index + i);
        const v = getValue(file, key) ?? "";
        return !/^(|0|0\.00|false)$/.test(v) && v !== templateValue(form_code, key) && v !== blank.get(rowFieldId(sub.id, g.first_index));
      });
    for (let i = 0; first && (Number.isFinite(sized) ? i < sized : filled(i)); i++) {
      const row: GroupRow = {};
      for (const sub of g.row) {
        const raw = getValue(file, rowFieldId(sub.id, g.first_index + i));
        if (raw !== undefined) row[sub.id] = sub.escaped ? legacyUnescape(raw) : raw;
      }
      rows.push(row);
    }
    out[g.name] = rows;
  }
  return out;
}

export { parseMoney };
