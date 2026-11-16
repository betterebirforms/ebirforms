#!/usr/bin/env node
// Copy what BIR's forms use to print from the recovered tree into the committed asset/bir/ (BIR's own files, bundled
// freely: NOTICE.md). The web version's Print Preview and Print read them.
//   - print.css         BIR's print stylesheet (css/print.css, linked media="print" by every form page)
//   - print-note.json   form code → the paper-size message BIR's Print Preview shows first (15 forms), read from
//                       the first alert() in each page's printme()
//   node tool/print-extract.mjs [vendor/original]      (npm run asset runs it too)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The paper-size note in one page's printme(), or null. BIR writes it as string literals joined by `+`. */
export function printNote(page) {
  const at = page.search(/function\s+printme\s*\(/);
  if (at < 0) return null;
  const body = page.slice(at, at + 1500);
  const call = body.match(/^[^{]*\{\s*alert\(((?:\s*"(?:[^"\\]|\\.)*"\s*\+?)+)\)/);
  if (!call) return null;
  const part = call[1].match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  return part.map((s) => JSON.parse(s)).join("");
}

export function extractPrint(root, out) {
  const forms = join(root, "forms");
  mkdirSync(out, { recursive: true });
  copyFileSync(join(root, "css", "print.css"), join(out, "print.css"));
  const note = {};
  for (const file of readdirSync(forms).filter((f) => /^BIR-Form.+\.hta$/.test(f)).sort()) {
    const text = printNote(readFileSync(join(forms, file), "latin1"));
    if (text) note[file.slice("BIR-Form".length, -".hta".length)] = text;
  }
  writeFileSync(join(out, "print-note.json"), JSON.stringify(note, null, 1) + "\n");
  return Object.keys(note).length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? "vendor/original");
  if (!existsSync(join(root, "forms"))) {
    console.error(`no ${join(root, "forms")}: run npm run extract first`);
    process.exit(2);
  }
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../asset/bir");
  console.log(`print.css + ${extractPrint(root, out)} paper notes → ${out}`);
}
