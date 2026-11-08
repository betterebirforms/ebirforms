// parityCheck (test/parity.ts) blurs only VISIBLE inputs, so on a multi-page BIR form whose schedules sit on a hidden
// page (the 2000 family: page 2) BIR never recomputes them and the check can't see a wrong schedule figure. This
// variant shows every page first — as a filer paging through would — then does the same blur-twice / read / diff.
import type { Oracle } from "./oracle.ts";
import type { ParityDiff, ParityResult } from "./parity.ts";
import { formRecords, type FormSchema, type FormState, type GroupState } from "@/form/schema.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";

const MONEY = /^\(?-?[\d,]*\.\d{1,2}\)?$/;
const same = (a: string, b: string): boolean => {
  const x = a.trim();
  const y = b.trim();
  if (x === y) return true;
  if ((MONEY.test(x) || x === "") && (MONEY.test(y) || y === "")) return parseMoney(x) === parseMoney(y);
  return false;
};

/** parityCheck with every `#Page<N>Content` (or `page_selector`) shown before BIR recomputes. `prepare`, if given, is
 *  page script run first — a click a filer would make that BIR's reload doesn't replay (e.g. re-picking the ATC).
 *  `save_bare`: read BIR's maxlength-12/15 boxes as its saveXML writes them (parity.ts SAVE_BARE: 1702EX, 1701). */
export async function allPageParityCheck(
  oracle: Oracle,
  schema: FormSchema,
  state: FormState,
  file_name: string,
  groups: GroupState = {},
  prepare?: string,
  page_selector = "[id^=Page][id$=Content]",
  save_bare = false,
): Promise<ParityResult> {
  const native = formRecords(schema, state, groups);
  const escaped = new Set(schema.field.filter((f) => f.escaped).map((f) => f.id));
  const { page, error } = await oracle.openSaved(schema, state, file_name, groups);
  if (prepare) await page.evaluate(prepare);
  const legacy: Array<[string, string]> = await page.evaluate(([page_selector, save_bare]) => {
    const asSaved = (el: HTMLInputElement) =>
      save_bare && el.type === "text" && (el.maxLength === 12 || el.maxLength === 15)
        ? (el.value.includes("(") && el.value.includes(")") ? el.value.replace("(", "-").replace(")", "") : el.value).replace(/,/g, "")
        : el.value;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(page_selector))) el.style.display = "block";
    const out: Array<[string, string]> = [];
    const form = document.getElementById("frmMain") as HTMLFormElement | null;
    const live = (el: HTMLInputElement) => !el.disabled && el.type === "text" && el.offsetParent !== null;
    const all = form ? (Array.from(form.elements) as HTMLInputElement[]) : [];
    for (let pass = 0; pass < 2; pass++) for (const el of all) if (live(el)) el.dispatchEvent(new FocusEvent("blur"));
    for (const el of all) {
      if (!el.id || !["text", "select-one", "radio", "checkbox"].includes(el.type)) continue;
      if (el.type === "radio" || el.type === "checkbox") out.push([el.id, String(el.checked)]);
      else out.push([el.id, asSaved(el)]);
    }
    return out;
  }, [page_selector, save_bare] as const);
  await page.close();
  const nativeMap = new Map(native.map((r) => [r.key, escaped.has(r.key) ? legacyUnescape(r.value) : r.value]));
  const legacyMap = new Map(legacy);
  const diff: ParityDiff[] = [];
  let equal_count = 0;
  for (const [key, value] of nativeMap) {
    const lv = legacyMap.get(key);
    if (lv === undefined) continue;
    if (same(value, lv)) equal_count++;
    else diff.push({ key, native: value, legacy: lv });
  }
  return {
    form_code: schema.form_code,
    key_count: new Set([...nativeMap.keys(), ...legacyMap.keys()]).size,
    equal_count,
    missing: [...legacyMap.keys()].filter((k) => !nativeMap.has(k)),
    extra: [...nativeMap.keys()].filter((k) => !legacyMap.has(k)),
    diff,
    page_error: error,
  };
}
