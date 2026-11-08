// The 1:1 check. A native rewrite is 1:1 with BIR when a random native fill, saved and reopened in BIR's own
// form, then recomputed by BIR's own code (blur every live input, as a user tabbing through does), yields the
// SAME savefile records the native form wrote — every key, every value (money compared to the centavo).
// The legacy side is read the way BIR's saveXML reads it: every frmMain text / select-one / radio / checkbox.
import type { Oracle } from "./oracle.ts";
import { formRecords, radioGroupName, rowFieldId, type FormSchema, type FormState, type GroupState } from "@/form/schema.ts";
import { formatMoney, parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";

export interface ParityDiff {
  key: string;
  native: string | null;
  legacy: string | null;
}
export interface ParityResult {
  form_code: string;
  key_count: number;
  equal_count: number;
  /** Keys BIR saves that the native form never writes. */
  missing: string[];
  /** Keys the native form writes that BIR's form has no element for. */
  extra: string[];
  /** Keys both write, with different values after BIR recomputed. */
  diff: ParityDiff[];
  page_error: string[];
}

/** A tiny deterministic PRNG so a parity run is reproducible (seed = form code). */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const MONEY = /^\(?-?[\d,]*\.\d{1,2}\)?$/;
/** A whole number shown in parentheses — the 1702-RT family's NegativeValue "(1,234)" — which saveXML writes
 *  through NumWithParenthesis as "-1,234". Read it the way it is saved. */
const PAREN_WHOLE = /^\([\d,]+\)$/;
const saved = (s: string): string => (PAREN_WHOLE.test(s) ? `-${s.slice(1, -1)}` : s);
const same = (a: string, b: string): boolean => {
  const x = saved(a.trim());
  const y = saved(b.trim());
  if (x === y) return true;
  // EBF_PARITY_STRICT: an empty box is not "0.00" (BIR's own Validate treats "0.00" as filled in)
  if (process.env.EBF_PARITY_STRICT && (x === "") !== (y === "")) return false;
  if ((MONEY.test(x) || x === "") && (MONEY.test(y) || y === "")) return parseMoney(x) === parseMoney(y);
  return false;
};

/** A random but valid-looking fill: every editable money field gets an amount, every radio group a choice.
 *  Text, selects and checkboxes keep the caller's base state (identity, period). */
export function randomFill(schema: FormSchema, base: FormState): FormState {
  const rnd = seeded(schema.form_code);
  const state: FormState = { ...base };
  const radioGroup = new Map<string, string[]>();
  for (const f of schema.field) {
    if (f.secret || f.compute) continue;
    // formatted as FormView leaves a money input after blur ("92,769.63")
    if (f.kind === "money" && !(f.id in base)) state[f.id] = formatMoney(Math.floor(rnd() * 10_000_000));
    if (f.kind === "radio") {
      const stem = radioGroupName(schema.form_code, f.id);
      radioGroup.set(stem, [...(radioGroup.get(stem) ?? []), f.id]);
    }
  }
  for (const [, option] of radioGroup) {
    if (option.some((id) => id in base)) continue;
    const chosen = option[Math.floor(rnd() * option.length)]!;
    for (const id of option) state[id] = String(id === chosen);
  }
  return state;
}

/** BIR inputs whose blur handler is not idempotent, so the harness's SECOND blur pass (which only exists to let a
 *  later field's result feed an earlier one) would corrupt a value a user tabbing through once leaves intact. Each
 *  entry names the BIR bug. Only these elements skip pass 2; every other form is blurred exactly as before. */
const BLUR_ONCE: Record<string, string[]> = {
  // 1706 items 29A–29D: blockletter() runs parseFloat(value).toFixed(2) before round() adds commas, so blurring
  // the formatted "92,769.63" again yields "92.00" (parseFloat stops at the comma).
  "1706": ["frm1706:txtFMVLand", "frm1706:txtFMVImprovements", "frm1706:txtFMVZonal", "frm1706:txtFMVBIR"],
};

/** Forms whose saveXML writes every maxlength-12/15 text input BARE — commas stripped, "(1,234)" as "-1234" —
 *  while the DOM shows "1,234" / "(1,234)". For these the legacy side is read through the same transform, so it
 *  is the value BIR's own save would hold. Every other form is read exactly as before. */
const SAVE_BARE: Record<string, true> = { "1702EX": true, "1701": true };

/** Save the native records, open them in BIR's form, let BIR recompute, and diff BIR's records against ours. */
export async function parityCheck(oracle: Oracle, schema: FormSchema, state: FormState, file_name: string, groups: GroupState = {}): Promise<ParityResult> {
  const native = formRecords(schema, state, groups);
  const escaped = new Set(schema.field.filter((f) => f.escaped).map((f) => f.id));
  // escaped schedule cells too (2200A's saveXML escape()s every text value, its loadData unescapes them all)
  for (const g of schema.group ?? []) for (const sub of g.row) if (sub.escaped) (groups[g.name] ?? []).forEach((_, i) => escaped.add(rowFieldId(sub.id, g.first_index + i)));
  const { page, error } = await oracle.openSaved(schema, state, file_name, groups);
  const blurOnce = BLUR_ONCE[schema.form_code] ?? [];
  const saveBare = SAVE_BARE[schema.form_code] === true;
  const legacy: Array<[string, string]> = await page.evaluate(([blurOnce, saveBare]) => {
    const out: Array<[string, string]> = [];
    // saveXML's maxlength-12/15 branch: NumWithParenthesis when both parentheses are present, then no commas
    const asSaved = (el: HTMLInputElement) =>
      saveBare && el.type === "text" && (el.maxLength === 12 || el.maxLength === 15)
        ? (el.value.includes("(") && el.value.includes(")") ? el.value.replace("(", "-").replace(")", "") : el.value).replace(/,/g, "")
        : el.value;
    const form = document.getElementById("frmMain") as HTMLFormElement | null;
    const live = (el: HTMLInputElement) => !el.disabled && el.type === "text" && el.offsetParent !== null;
    const all = form ? (Array.from(form.elements) as HTMLInputElement[]) : [];
    // BIR computes on blur; two passes let a later field's result feed an earlier one
    for (let pass = 0; pass < 2; pass++)
      for (const el of all) if (live(el) && !(pass === 1 && blurOnce.includes(el.id))) el.dispatchEvent(new FocusEvent("blur"));
    for (const el of all) {
      if (!el.id || !["text", "select-one", "radio", "checkbox"].includes(el.type)) continue; // exactly what saveXML writes
      if (el.type === "radio" || el.type === "checkbox") out.push([el.id, String(el.checked)]);
      else out.push([el.id, asSaved(el)]);
    }
    return out;
  }, [blurOnce, saveBare] as const);
  await page.close();

  const nativeMap = new Map(native.map((r) => [r.key, escaped.has(r.key) ? legacyUnescape(r.value) : r.value]));
  const legacyMap = new Map(legacy);
  const missing = [...legacyMap.keys()].filter((k) => !nativeMap.has(k));
  const extra = [...nativeMap.keys()].filter((k) => !legacyMap.has(k));
  const diff: ParityDiff[] = [];
  let equal_count = 0;
  for (const [key, value] of nativeMap) {
    const lv = legacyMap.get(key);
    if (lv === undefined) continue;
    if (same(value, lv)) equal_count++;
    else diff.push({ key, native: value, legacy: lv });
  }
  return { form_code: schema.form_code, key_count: new Set([...nativeMap.keys(), ...legacyMap.keys()]).size, equal_count, missing, extra, diff, page_error: error };
}

/** Everything that keeps a parity result from being 1:1, as readable lines (empty = 1:1). `allow` names keys whose
 *  difference is deliberate or a harness artifact — each one must carry a reason in the calling test. */
export function parityProblem(r: ParityResult, allow: string[] = []): string[] {
  const ok = (key: string) => allow.includes(key);
  return [
    ...r.page_error.map((e) => `page error: ${e}`),
    ...r.missing.filter((k) => !ok(k)).map((k) => `BIR saves ${k}, native never writes it`),
    ...r.extra.filter((k) => !ok(k)).map((k) => `native writes ${k}, BIR has no such element`),
    ...r.diff.filter((d) => !ok(d.key)).map((d) => `${d.key}: native ${JSON.stringify(d.native)} vs BIR ${JSON.stringify(d.legacy)}`),
  ];
}
