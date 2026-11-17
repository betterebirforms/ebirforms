// Lock openers read from BIR's source, for greyed boxes the page capture (test/capture-lock.test.ts) cannot open by
// clicking or typing:
//   • MCIT: enableMCITFields opens Schedule 4 / 8 / 9 (and the MCIT payment line) while the MCIT choice is ticked;
//     BIR ticks it itself from the date of incorporation, and its click handler never runs enableMCITFields;
//   • Edit only: a box whose every `disabled = false` in BIR's source sits in enableAllControl /
//     enableAllControlAfterLoad (the Edit button after Validate). On a form being filled in it is never open: [].
//     If the Edit button's own function leaves it open (its last `disabled =` for the box is false), "@edit": open
//     once Edit is clicked (0620 due month; 1702-Q TIN). 0605's Edit opens its TIN, then greys it again: [].
//   EBF_CAPTURE_RULE=1 npx vitest run test/capture-rule.test.ts   (or a list of form codes)
// Writes src/form/lock-rule.json: { "<CODE>": { "<box id>": [opener, ...] } }, the same openers as src/form/lock/
// ([] = never opened while filling in). Read by src/form/lock.ts (lockRule). Needs BIR's tree in vendor/original/.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { ORIGINAL } from "./oracle.ts";
import { blankLock } from "./lock-blank.ts";

const want = process.env.EBF_CAPTURE_RULE;
const OUT = "src/form/lock-rule.json";
const EDIT = new Set(["enableAllControl", "enableAllControlAfterLoad"]);

/** Each source line with the function it sits in. */
function lineFunction(src: string[]): string[] {
  let cur = "";
  return src.map((l) => {
    const m = /function\s+([A-Za-z0-9_$]+)\s*\(/.exec(l);
    if (m) cur = m[1]!;
    return cur;
  });
}

export function ruleFromSource(code: string): Record<string, string[]> {
  const text = readFileSync(`${ORIGINAL}/forms/BIR-Form${code}.hta`, "utf8");
  const src = text.split("\n");
  const fn = lineFunction(src);
  const out: Record<string, string[]> = {};
  // MCIT
  const start = src.findIndex((l) => /function\s+enableMCITFields\s*\(/.test(l));
  if (start >= 0) {
    let trigger = "";
    for (let i = start; i < src.length && fn[i] === "enableMCITFields"; i++) {
      const t = /isSubjectToMCIT\s*=\s*\$_Id\(["']([^"']+)["']\)\.checked/.exec(src[i]!);
      if (t) trigger = t[1]!;
      const box = /\$_Id\(["']([^"']+)["']\)\.disabled\s*=\s*!isSubjectToMCIT/.exec(src[i]!);
      if (box && trigger) out[box[1]!] = [trigger];
    }
  }
  // Edit only
  const lock = existsSync(`src/form/lock/${code}.json`) ? (JSON.parse(readFileSync(`src/form/lock/${code}.json`, "utf8")) as Record<string, string[]>) : {};
  for (const id of blankLock(code)) {
    if (id in out || id in lock) continue;
    const quoted = new RegExp(`["']${id.replace(/[$:.]/g, (c) => `\\${c}`)}["']`);
    const line = src.map((l, i) => [l, i] as const).filter(([l]) => quoted.test(l) && !/^\s*</.test(l));
    const enabling = line.filter(([l]) => /disabled\s*=\s*(false|!)|removeAttr\(["']disabled|["']disabled["']\s*,\s*false/.test(l));
    // every mention outside the markup is an enable in an Edit function, or a plain disable / value line
    if (enabling.length && enabling.every(([, i]) => EDIT.has(fn[i]!))) out[id] = editLeavesOpen(text, id) ? ["@edit"] : [];
  }
  return out;
}

/** The body of a function in BIR's source, by its braces. */
function body(text: string, name: string): string {
  const at = text.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at < 0) return "";
  const open = text.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i);
  }
  return "";
}

/** Whether the function BIR's Edit button calls ends with the box enabled. */
function editLeavesOpen(text: string, id: string): boolean {
  const button = /<input[^>]*value="Edit"[^>]*>/s.exec(text)?.[0] ?? "";
  const call = /onclick="\s*([A-Za-z0-9_$]+)\s*\(/.exec(button)?.[1];
  if (!call) return false;
  const quoted = id.replace(/[$:.]/g, (c) => `\\${c}`);
  let last: string | undefined;
  for (const m of body(text, call).matchAll(new RegExp(`["']${quoted}["']\\)\\.disabled\\s*=\\s*(true|false)`, "g"))) last = m[1];
  return last === "false";
}

const code = existsSync(`${ORIGINAL}/forms`)
  ? readdirSync(`${ORIGINAL}/forms`)
      .filter((f) => /^BIR-Form.+\.hta$/.test(f))
      .map((f) => f.slice("BIR-Form".length, -".hta".length))
  : [];

describe.runIf(want)("capture lock openers from BIR's source", () => {
  it("writes src/form/lock-rule.json", () => {
    const all = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, Record<string, string[]>>) : {};
    for (const c of code.filter((c) => want === "1" || want!.split(",").includes(c))) {
      if (!existsSync(`asset/bir/layout/${c}.html`)) continue;
      const r = ruleFromSource(c);
      if (Object.keys(r).length) all[c] = Object.fromEntries(Object.keys(r).sort().map((k) => [k, r[k]!]));
      else delete all[c];
    }
    writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]!])), null, 1)}\n`);
    expect(existsSync(OUT)).toBe(true);
  });
});
