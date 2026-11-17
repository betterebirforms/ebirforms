// What BIR's blank page greys out, and what fills or opens each box (read from BIR's captured layout and the engine).
import { readFileSync } from "node:fs";
import { NATIVE_FORM } from "../src/form/registry.ts";
import { computeForm, groupAggs, isGateOpen, type FieldSpec } from "../src/form/schema.ts";
import { lockRule, neverOpened, permanentLock, pickerFilled } from "../src/form/lock.ts";

/** Ids of the text boxes, lists and text areas BIR's blank page has greyed out (disabled). */
export function blankLock(code: string): string[] {
  const html = readFileSync(`asset/bir/layout/${code}.html`, "utf8");
  const out = new Set<string>();
  for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    const id = /\sid="([^"]*)"/.exec(tag)?.[1];
    if (!id || !/\sdisabled(=|\s|>|\/)/i.test(tag)) continue;
    const type = m[1]!.toLowerCase() === "input" ? (/\stype="?([a-z]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "text") : m[1]!.toLowerCase();
    if (["text", "select", "textarea", ""].includes(type)) out.add(id);
  }
  return [...out];
}

/** The value BIR's blank page shows in each greyed text box (by id; a list's selected option is not read). */
export function blankValue(code: string): Record<string, string> {
  const html = readFileSync(`asset/bir/layout/${code}.html`, "utf8");
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const id = /\sid="([^"]*)"/.exec(m[0])?.[1];
    if (id && /\sdisabled(=|\s|>|\/)/i.test(m[0])) out[id] = /\svalue="([^"]*)"/.exec(m[0])?.[1] ?? "";
  }
  return out;
}

const rowStem = (id: string) => id.replace(/:\d+$/, "").replace(/\d+$/, "");

export interface BoxClass {
  /** what fills or opens the box in BIR's app */
  by: "rule" | "gate" | "editable" | "profile" | "picker" | "computed" | "never opened" | "opened elsewhere" | "group row" | "no field";
  /** the web locks it on a blank form */
  locked: boolean;
}

const cache = new Map<string, { lock: Record<string, string[]>; picker: Set<string>; never: Set<string>; computed: Record<string, string>; total: Set<string>; field: Map<string, FieldSpec>; sub: Set<string> }>();
function context(code: string) {
  let c = cache.get(code);
  if (!c) {
    const def = NATIVE_FORM[code]!;
    c = {
      lock: lockRule(code, JSON.parse(readFileSync(`src/form/lock/${code}.json`, "utf8")) as Record<string, string[]>),
      picker: pickerFilled(code),
      never: neverOpened(code),
      computed: computeForm(def.schema, {}, Object.fromEntries((def.schema.group ?? []).map((g) => [g.name, []]))),
      total: new Set((def.schema.group ?? []).flatMap((g) => groupAggs(g).map((a) => a.into))),
      field: new Map(def.schema.field.map((x) => [x.id, x])),
      sub: new Set((def.schema.group ?? []).flatMap((g) => g.row.map((r) => r.id))),
    };
    cache.set(code, c);
  }
  return c;
}

/** Boxes whose lock hangs on BIR's source never enabling them: a field the engine drives, no opener, not gated, not
 *  an editable default, no profile or pick list filling it, not computed. */
export function neverCandidate(code: string, id: string): boolean {
  const def = NATIVE_FORM[code]!;
  const { lock, picker, computed, total, field } = context(code);
  const f = field.get(id);
  if (!f || id in lock || f.gate || f.is_editable || id in def.prefill || picker.has(id)) return false;
  return !((Boolean(f.compute) && !f.is_editable) || total.has(id) || !isGateOpen(f, computed));
}

/** Sorts one greyed box; `locked` is what LayoutView does with it (src/form/lock.ts) on a blank form with a profile. */
export function boxClass(code: string, id: string): BoxClass {
  const def = NATIVE_FORM[code]!;
  const { lock, picker, never, computed, total, field, sub } = context(code);
  const f = field.get(id);
  if (id in lock) return { by: "rule", locked: true };
  if (!f) {
    // not a box the engine drives: the page's own greyed state stands
    return { by: sub.has(id) || sub.has(rowStem(id)) ? "group row" : "no field", locked: true };
  }
  const ro = (Boolean(f.compute) && !f.is_editable) || total.has(id) || !isGateOpen(f, computed);
  const known = id in def.prefill || picker.has(id) || never.has(id);
  const locked = ro || permanentLock(f, false, known);
  if (f.gate) return { by: "gate", locked };
  if (f.is_editable) return { by: "editable", locked };
  if (id in def.prefill) return { by: "profile", locked };
  if (picker.has(id)) return { by: "picker", locked };
  if (ro) return { by: "computed", locked };
  return { by: never.has(id) ? "never opened" : "opened elsewhere", locked };
}
