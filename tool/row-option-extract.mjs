#!/usr/bin/env node
// Extract the reference lists BIR's row editors (pop-up tables) fill their drop-downs from, out of the recovered
// vendor/original/xml/ into a committed JSON (src/form/row-option.json): the tax-treaty codes (treatyCodes.xml) and
// the RDO codes (rdo.xml). BIR's own pages keep a record only when its form-code field contains the form's code as a
// SUBSTRING (indexOf('1601F') also takes a 1601FQ-only record), so the whole form-code field is kept here.
//   node tool/row-option-extract.mjs [vendor/original]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ?? "vendor/original";
const decode = (s) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").trim();
const record = (file, stem) => {
  const xml = readFileSync(resolve(root, "xml", file), "utf8");
  const out = [];
  for (const m of xml.matchAll(new RegExp(`<div>${stem}(\\d+):([\\s\\S]*?)${stem}\\1:</div>`, "g"))) {
    const part = m[2].split("~");
    out.push([decode(part[0] ?? ""), decode(part[1] ?? ""), part.slice(2).join("~").trim()]);
  }
  return out;
};
const json = { treaty: record("treatyCodes.xml", "treaty"), rdo: record("rdo.xml", "rdo") };
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/form/row-option.json");
writeFileSync(out, JSON.stringify(json) + "\n");
console.log(`${json.treaty.length} treaty, ${json.rdo.length} RDO -> src/form/row-option.json`);
