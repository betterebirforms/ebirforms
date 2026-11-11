// `npm run mod:check [-- <mod folder>] [--bir <BIR tree>]`: checks mods before you ship or install them.
//
// For every mod in the folder (default: the built-in `mod/`, then `.mod/` if it exists) it checks:
//   - the file: valid JSON, in a kind folder, `title`, `about`, `file` and `rule` present, no em dash in `about`;
//   - each rule: exactly one action, a regular expression that compiles AND that the Rust engine accepts too
//     (no lookaround, no backreferences), an `inject` script that exists, on a mod that targets pages;
//   - a dry run over BIR's real files: which files the mod applies to, and for each rule how many files it changed.
//     A rule that changes nothing anywhere is reported, because it usually means BIR's code moved or the pattern is off.
// Exit 1 on any error (warnings don't fail). Needs BIR's tree for the dry run: vendor/original (npm run extract),
// the packaged tree (src-tauri/package-bir), or --bir <dir>; without one it checks the files only.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { BUILT_IN_DIR, modMatches, readModDir, runMod, type Mod, type ModRule } from "../host/mod.ts";

const arg = process.argv.slice(2);
const bir_flag = arg.indexOf("--bir");
const bir_dir = bir_flag >= 0 ? arg[bir_flag + 1] : ["vendor/original", "src-tauri/package-bir"].find((d) => existsSync(join(d, "forms")));
if (bir_flag >= 0 && !(bir_dir && existsSync(bir_dir))) {
  console.log(`--bir: no such folder: ${bir_dir ?? "(missing)"}`);
  process.exit(2);
}
const folder = arg.filter((a, i) => !a.startsWith("--") && i !== bir_flag + 1);
const dir_list = folder.length ? folder : [BUILT_IN_DIR, ...(existsSync(".mod") ? [".mod"] : [])];

const ACTION = ["find", "text", "guard", "empty", "inject"] as const;
/** Syntax JavaScript accepts but Rust's `regex` crate refuses (mod/README.md "both engines"). */
const NOT_PORTABLE: [RegExp, string][] = [
  [/\(\?[=!]/, "lookahead (?= or (?!"],
  [/\(\?<[=!]/, "lookbehind (?<= or (?<!"],
  [/\\[1-9]/, "a backreference like \\1"],
  [/\\\//, "an escaped / (write / on its own)"],
];

let error_count = 0;
let warn_count = 0;
const error = (id: string, msg: string) => (error_count++, console.log(`  ✗ ${id}: ${msg}`));
const warn = (id: string, msg: string) => (warn_count++, console.log(`  ! ${id}: ${msg}`));

function checkRule(mod: Mod, rule: ModRule, n: number) {
  const where = `${mod.id} rule ${n + 1}`;
  const action = ACTION.filter((k) => rule[k] !== undefined);
  if (action.length !== 1) return error(where, `needs exactly one of ${ACTION.join(", ")} (has ${action.join(", ") || "none"})`);
  for (const pattern of [rule.find, rule.guard].filter((p): p is string => p !== undefined)) {
    try {
      new RegExp(pattern);
    } catch (e) {
      error(where, `regular expression does not compile: ${(e as Error).message}`);
    }
    for (const [re, what] of NOT_PORTABLE) if (re.test(pattern)) error(where, `uses ${what}, which the desktop app's Rust engine refuses`);
  }
  if ((rule.find !== undefined || rule.text !== undefined) && rule.to === undefined) error(where, "`find`/`text` needs a `to`");
  if (rule.inject !== undefined) {
    if (!existsSync(join(mod.dir, rule.inject))) error(where, `inject script not found: ${rule.inject} (it must sit next to the mod file)`);
    if (mod.file !== "form" && mod.file !== "main" && !/hta/i.test(mod.file)) warn(where, "`inject` only works on pages (.hta); this mod targets other files");
  }
}

function checkFile(mod: Mod) {
  const raw = mod as unknown as Record<string, unknown>;
  for (const key of ["title", "about", "file"]) if (typeof raw[key] !== "string" || !(raw[key] as string).trim()) error(mod.id, `missing \`${key}\``);
  if (!Array.isArray(raw.rule) || raw.rule.length === 0) error(mod.id, "missing `rule` (a list of changes)");
  if (typeof mod.about === "string" && mod.about.includes("—")) error(mod.id, "`about` has an em dash; use short sentences");
  if (mod.file !== "form" && mod.file !== "main") {
    try {
      new RegExp(mod.file, "i");
    } catch (e) {
      error(mod.id, `\`file\` is not a valid regular expression: ${(e as Error).message}`);
    }
  }
  mod.rule.forEach((r, i) => checkRule(mod, r, i));
}

/** BIR's files the engines serve through mods: pages and scripts. */
function birFile(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(hta|js)$/i.test(name)) out.push(relative(root, p).split(sep).join("/"));
    }
  };
  walk(root);
  return out;
}

function dryRun(mod: Mod, root: string, file: string[]) {
  const hit = file.filter((f) => modMatches(mod, f, readFileSync(join(root, f), "utf8")));
  if (hit.length === 0) return warn(mod.id, "applies to no file in BIR's tree (check `file`, `form` and `if`)");
  const changed = mod.rule.map(() => 0);
  for (const f of hit) {
    let text = readFileSync(join(root, f), "utf8");
    mod.rule.forEach((r, i) => {
      const next = runMod({ ...mod, rule: [r] }, text, "7.9.6.2.1", f);
      if (next !== text) changed[i]!++;
      text = next;
    });
  }
  const summary = changed.map((c, i) => `rule ${i + 1}: ${c}/${hit.length}`).join(", ");
  console.log(`  ✓ ${mod.id}: ${hit.length} file(s); ${summary}`);
  changed.forEach((c, i) => c === 0 && warn(mod.id, `rule ${i + 1} changed nothing in any file it applies to`));
}

const file = bir_dir ? birFile(bir_dir) : [];
console.log(bir_dir ? `BIR tree: ${bir_dir} (${file.length} pages and scripts)` : "No BIR tree found: checking the mod files only (run npm run extract for a dry run)");
for (const dir of dir_list) {
  const list = readModDir(dir, dir === BUILT_IN_DIR ? "built-in" : "user");
  console.log(`\n${dir}: ${list.length} mod(s)`);
  for (const mod of list) {
    const before = error_count;
    checkFile(mod);
    if (bir_dir && error_count === before) dryRun(mod, bir_dir, file);
  }
}
console.log(`\n${error_count} error(s), ${warn_count} warning(s)`);
process.exit(error_count ? 1 : 0);
