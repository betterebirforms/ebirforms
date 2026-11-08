#!/usr/bin/env node
// Extract BIR's Documentary Stamp Tax ATC records from the user's recovered vendor/original/xml/atcCodes.xml into
// src/form/dst-atc.json, exactly as the DST forms (2000, 2000v2018) load them: loadATC walks atc1..atcCount, keeps a
// record when its body contains "2000^", and splits it on "~" into
//   [0] code  [1] description  [2] rate  [3] category  [4] base  [5] compType  [6] constTaxDue  [7] minimum  [8] maximum
//   [9] formatRate
// BIR reads the file through a div's innerHTML, so values are kept as that serialization renders them
// ("&gt;" stays "&gt;", "<br/>" becomes "<br>"). In the shipped XML the base / compType / constTaxDue / minimum /
// maximum slots are EMPTY for every DST code — the per-ATC arithmetic lives in each form's computeSched1TaxDue /
// computeAmount12D switch — but they are extracted verbatim so the engine reads BIR's own record, not a guess.
//   node tool/dst-extract.mjs [vendor/original]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ?? "vendor/original";
const xml = readFileSync(resolve(root, "xml/atcCodes.xml"), "utf8");
// what innerHTML gives back for the markup BIR keeps in these records
const asInnerHtml = (s) => s.replace(/<br\s*\/>/g, "<br>");

const count = Number(xml.split("atcCount=")[1]?.match(/^\d+/)?.[0] ?? 0);
const record = [];
for (let i = 1; i <= count; i++) {
  const body = xml.split(`atc${i}:`)[1];
  if (body === undefined || !body.includes("2000^")) continue;
  const v = asInnerHtml(body).split("~");
  record.push({
    atc_code: v[0] ?? "",
    description: v[1] ?? "",
    rate: v[2] ?? "",
    category: v[3] ?? "",
    base: v[4] ?? "",
    comp_type: v[5] ?? "",
    const_tax_due: v[6] ?? "",
    minimum: v[7] ?? "",
    maximum: v[8] ?? "",
    format_rate: v[9] ?? "",
  });
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../src/form/dst-atc.json");
writeFileSync(out, JSON.stringify({ "2000": record }, null, 1) + "\n");
console.log(`${record.length} DST ATC records (BIR's "2000^" list, in its order) → src/form/dst-atc.json`);
