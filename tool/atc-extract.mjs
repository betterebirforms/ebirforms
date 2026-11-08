#!/usr/bin/env node
// Extract BIR's ATC (Alphanumeric Tax Code) reference table from the user's recovered
// vendor/original/xml/atcCodes.xml into a committed JSON the native forms can look rates up in.
// Record format (per <div>): atc<n>:CODE~DESC~RATE~CATEGORY~~~~~FORMULA~FORMS atc<n>:
//   - RATE (field 2) is the numeric withholding percentage (e.g. "5.0") for 1600/1601/1602-class ATCs.
//   - FORMULA (field 8) is a human-readable DST rate string (e.g. "P2.00/P200") for 2000-class ATCs; those
//     have an empty RATE and need the DST rate engine, not a plain percentage — kept verbatim for reference.
//   - FORMS (field 9) is a ^/|-separated list of the form codes the ATC belongs to.
//   node tool/atc-extract.mjs [vendor/original]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ?? "vendor/original";
const xml = readFileSync(resolve(root, "xml/atcCodes.xml"), "utf8");

const decode = (s) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").trim();
const code = {};
for (const m of xml.matchAll(/<div>atc(\d+):([\s\S]*?)atc\1:<\/div>/g)) {
  const part = m[2].split("~");
  const atc = decode(part[0] ?? "");
  if (!atc || atc.includes("atcCount")) continue;
  const rate = (part[2] ?? "").trim();
  // The form-code list is always the LAST ~-segment. DST ATCs (empty rate) carry a human-readable rate FORMULA
  // in the second-to-last segment; withholding ATCs do not.
  const forms = decode(part[part.length - 1] ?? "")
    .replace(/\^/g, "")
    .split("|")
    .map((f) => f.trim())
    .filter(Boolean);
  const formula = rate === "" ? decode(part[part.length - 2] ?? "") : "";
  // first definition wins; codes recur across forms with the same rate
  if (!code[atc]) code[atc] = { desc: decode(part[1] ?? ""), rate: rate === "" ? null : Number(rate), formula: formula || null, form: forms };
  else for (const f of forms) if (!code[atc].form.includes(f)) code[atc].form.push(f);
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/form/atc-codes.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(code, null, 0) + "\n");
console.log(`${Object.keys(code).length} ATC codes → src/form/atc-codes.json`);

// Per-form ATC pick lists in the LEGACY order, duplicates kept. A form whose picker serializes the list INDEX
// (1601FQ's `AtcCd<i>` checkboxes) must reproduce BIR's own list exactly: loadATC walks atc1..atcCount and keeps
// a record when its body contains the form code as a SUBSTRING, then splits by category (P private / G government).
// The same code recurs at different rates (1601FQ: WC212 30% and 25%), so the deduplicated table above can't.
const count = Number(xml.split("atcCount=")[1]?.match(/^\d+/)?.[0] ?? 0);
// every form code named in the table — check the form's own loadATC `indexOf("<code>")` string against this
const LIST_FORM = [...new Set(Object.values(code).flatMap((c) => c.form))].sort();
const list = {};
for (const form of LIST_FORM) {
  list[form] = {};
  for (let i = 1; i <= count; i++) {
    const body = xml.split(`atc${i}:`)[1];
    if (body === undefined || !body.includes(form)) continue;
    const [atc_code = "", , rate = "", category = ""] = body.split("~");
    (list[form][category] ??= []).push([decode(atc_code), rate]);
  }
}
const listOut = resolve(dirname(out), "atc-list.json");
writeFileSync(listOut, JSON.stringify(list, null, 0) + "\n");
console.log(`${LIST_FORM.length} forms' legacy-order ATC lists → src/form/atc-list.json`);
