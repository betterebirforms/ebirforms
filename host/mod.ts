// The mod engine (Node side). A mod is one JSON file under mod/<kind>/ that changes BIR's pages as they are
// served; BIR's files on disk are never edited. src-tauri/src/bir_mod.rs is the Rust twin and must give the
// same output for the same mod. The file format is documented in mod/README.md.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface ModRule {
  /** Regular expression to find. Groups are referenced in `to` as $1–$9; `$$` is a literal `$`. */
  find?: string;
  /** Literal text to find (no regex). */
  text?: string;
  /** Replacement. `{version}` = the installed BIR package version (the rule is skipped if unknown), `{name}` = file name. */
  to?: string;
  /** Replace the first match only. */
  once?: boolean;
  /** Repeat until nothing changes (for overlapping matches such as A || B || C). */
  repeat?: boolean;
  /** Make `find` ignore case. */
  nocase?: boolean;
  /** Let every function whose name matches this regex run only once at a time (stops runaway recursion). */
  guard?: string;
  /** Replace the whole file with this text. */
  empty?: string;
  /** Add this script (path relative to the mod file) to the end of the page. Pages (.hta) only. */
  inject?: string;
}

export interface Mod {
  /** `<kind>/<name>`, the file path under mod/ without `.json`. */
  id: string;
  /** fix | compat | security | speed | remove | improve, or any folder name a contributor adds. */
  kind: string;
  title: string;
  about: string;
  on: boolean;
  /** "form" = every BIR-Form*.hta, "main" = BIRForms.hta, otherwise a regex on the file's path (ignores case). */
  file: string;
  /** Limit to these form codes (e.g. "1700v2018"). */
  form?: string[];
  /** Only apply when the file contains this text. */
  if?: string;
  rule: ModRule[];
  source: "built-in" | "user";
  /** Folder the mod file is in, for `inject`. */
  dir: string;
}

/** The repo's own mods. */
export const BUILT_IN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "mod");

const FORM_FILE = /BIR-Form([^/.]+)\.hta$/i;
const MAIN_FILE = /^BIRForms\.hta$/i;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
  });
}

/** Every mod in a folder. A file that doesn't parse is skipped with a warning, so one bad mod can't stop the app. */
export function readModDir(dir: string, source: Mod["source"]): Mod[] {
  const out: Mod[] = [];
  for (const path of walk(dir)) {
    const id = relative(dir, path).split(sep).join("/").replace(/\.json$/, "");
    if (!id.includes("/")) continue; // top-level JSON (e.g. settings) is not a mod; mods live in a kind folder
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      out.push({ ...raw, id, kind: id.split("/")[0]!, on: raw.on !== false, rule: raw.rule ?? [], source, dir: dirname(path) });
    } catch (e) {
      console.warn(`[mod] skipped ${path}: ${(e as Error).message}`);
    }
  }
  return out;
}

/** `<user mod folder>/mod.json`: `{ "on": [id…], "off": [id…] }` switches mods without editing them. */
function readSwitch(user_dir: string): { on: string[]; off: string[] } {
  const path = join(user_dir, "mod.json");
  if (!existsSync(path)) return { on: [], off: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { on: raw.on ?? [], off: raw.off ?? [] };
  } catch {
    return { on: [], off: [] };
  }
}

/**
 * The mods in effect, sorted by id: the built-in ones, then the user's own from `user_dir` (a user mod with a
 * built-in's id replaces it), then the on/off switches in `user_dir/mod.json`. Read fresh on every call, so a
 * change takes effect on the next page load.
 */
export function modList(user_dir?: string): Mod[] {
  const byId = new Map<string, Mod>();
  for (const m of readModDir(BUILT_IN_DIR, "built-in")) byId.set(m.id, m);
  if (user_dir) {
    for (const m of readModDir(user_dir, "user")) byId.set(m.id, m);
    const sw = readSwitch(user_dir);
    for (const id of sw.on) if (byId.has(id)) byId.get(id)!.on = true;
    for (const id of sw.off) if (byId.has(id)) byId.get(id)!.on = false;
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `$1`–`$9` → group, `$$` → `$`, any other `$` stays. Identical in the Rust engine. */
function expand(to: string, group: (string | undefined)[]): string {
  return to.replace(/\$(\$|\d)/g, (_, c: string) => (c === "$" ? "$" : (group[Number(c)] ?? "")));
}

/** Rename `function NAME(` to `NAME__body` and declare a re-entry-guarded NAME in its place. */
export function guardReentry(html: string, name: string): string {
  const m = new RegExp(String.raw`function\s+${name}\s*\(\s*\)\s*\{`).exec(html);
  if (!m) return html;
  const guard =
    `function ${name}() { if (${name}.__busy) return; ${name}.__busy = true; ` +
    `try { return ${name}__body.apply(this, arguments); } finally { ${name}.__busy = false; } }\n` +
    `function ${name}__body() {`;
  return html.slice(0, m.index) + guard + html.slice(m.index + m[0].length);
}

function applyRule(rule: ModRule, text: string, ctx: { version: string; name: string; dir: string; page: boolean }): string {
  const fill = (to: string) => to.replaceAll("{version}", ctx.version).replaceAll("{name}", ctx.name);
  if (rule.to?.includes("{version}") && !ctx.version) return text;
  if (rule.empty !== undefined) return fill(rule.empty);
  if (rule.guard !== undefined) {
    const decl = new RegExp(String.raw`function\s+(${rule.guard})\s*\(\s*\)\s*\{`, "g");
    const name = new Set([...text.matchAll(decl)].map((m) => m[1]!));
    let out = text;
    for (const n of name) out = guardReentry(out, n);
    return out;
  }
  if (rule.inject !== undefined) {
    if (!ctx.page) return text;
    const path = join(ctx.dir, rule.inject);
    if (!existsSync(path)) return text;
    const tag = `<script>\n${readFileSync(path, "utf8")}\n</script>`;
    const at = text.toLowerCase().lastIndexOf("</body>");
    return at < 0 ? text + tag : text.slice(0, at) + tag + text.slice(at);
  }
  const to = fill(rule.to ?? "");
  if (rule.text !== undefined) {
    if (rule.once) return text.replace(rule.text, () => to);
    return text.replaceAll(rule.text, () => to);
  }
  if (rule.find !== undefined) {
    const re = new RegExp(rule.find, (rule.once ? "" : "g") + (rule.nocase ? "i" : ""));
    const step = (s: string) => s.replace(re, (...m) => expand(to, m.slice(0, -2) as string[]));
    let out = step(text);
    if (rule.repeat) for (let prev = text; out !== prev; ) [prev, out] = [out, step(out)];
    return out;
  }
  return text;
}

/** Does this mod apply to this file? */
export function modMatches(mod: Mod, rel_path: string, text: string): boolean {
  const code = FORM_FILE.exec(rel_path)?.[1];
  if (mod.file === "form") {
    if (!code) return false;
  } else if (mod.file === "main") {
    if (!MAIN_FILE.test(rel_path)) return false;
  } else if (!new RegExp(mod.file, "i").test(rel_path)) return false;
  if (mod.form && (!code || !mod.form.includes(code))) return false;
  if (mod.if !== undefined && !text.includes(mod.if)) return false;
  return true;
}

/** Run one mod's rules on a text, ignoring which files it is meant for (tests and wrappers use this). */
export function runMod(mod: Mod, text: string, version = "", rel_path = ""): string {
  const ctx = { version, name: rel_path.split("/").pop() ?? "", dir: mod.dir, page: /\.hta$/i.test(rel_path) };
  return mod.rule.reduce((t, r) => applyRule(r, t, ctx), text);
}

/** Apply every switched-on mod that matches this file, in id order. */
export function applyMod(list: Mod[], rel_path: string, text: string, version = ""): string {
  let out = text;
  for (const m of list) if (m.on && modMatches(m, rel_path, out)) out = runMod(m, out, version, rel_path);
  return out;
}

/** What `GET /__mod` answers: the mods in effect, without their rules. */
export function modSummary(list: Mod[]) {
  return list.map(({ id, kind, title, about, on, source }) => ({ id, kind, title, about, on, source }));
}
