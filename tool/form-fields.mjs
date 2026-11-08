#!/usr/bin/env node
// Scaffold a P3 form schema from a legacy BIR form: list the frmMain fields in save (DOM) order with their
// kind and whether saveXML escapes them, plus which fields a compute function writes. Hand-tune the compute
// graph and validation afterward.
//   node tool/form-fields.mjs <form-code> [vendor/original]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [code, root = "vendor/original"] = positional;
if (!code) {
  console.error("usage: node tool/form-fields.mjs <form-code> [vendor/original]");
  process.exit(2);
}
const html = readFileSync(resolve(root, `forms/BIR-Form${code}.hta`), "utf8");

// fields in save order: frmMain inputs/selects, buttons excluded (matches saveXML)
const start = html.indexOf('id="frmMain"');
const body = html.slice(start < 0 ? 0 : start);
const field = [];
const seen = new Set();
for (const m of body.matchAll(/<(input|select)\b([^>]*)\bid=(['"])([^'"]+)\3([^>]*)>/gi)) {
  const attr = m[2] + m[5];
  const id = m[4];
  const tag = m[1].toLowerCase();
  const type = tag === "select" ? "select" : (attr.match(/\btype=(['"])(\w+)\1/i)?.[2] ?? "text").toLowerCase();
  if (type === "button" || type === "hidden" || seen.has(id)) continue;
  seen.add(id);
  // money = the numeric line items (txtTax<n>, txtAmount<n>), not TaxType/TaxpayerName
  const money = /(txtTax\d|txtAmount\d|Surcharge|Interest|Compromise|Payable)/i.test(id);
  const kind = type === "radio" || type === "checkbox" ? type : money ? "money" : type === "select" ? "select" : "text";
  field.push({ id, kind, type });
}

// escaped fields: ids wrapped in escape() inside the writer
const escaped = new Set([...html.matchAll(/escape\(\s*(?:elem\[i\]|[\w.]+)\s*\)/g)].flatMap(() => []));
for (const m of html.matchAll(/id\s*==?\s*['"]([^'"]+)['"][^;]*escape\(/g)) escaped.add(m[1]);
for (const m of html.matchAll(/escape\(d\.getElementById\(['"]([^'"]+)['"]\)/g)) escaped.add(m[1]);

// computed fields: ids that a compute* function assigns .value to
const computed = new Set();
for (const m of html.matchAll(/getElementById\(['"]([^'"]+)['"]\)\.value\s*=/g)) computed.add(m[1]);

const secret = (id) => /ebirOnline/i.test(id);
const spec = field.map((f) => {
  const s = { id: f.id, kind: f.kind };
  if (escaped.has(f.id)) s.escaped = true;
  if (secret(f.id)) s.secret = true;
  return s;
});

if (process.argv.includes("--json")) {
  // field list only; the compute graph + validation + required are authored in the form module
  process.stdout.write(JSON.stringify(spec, null, 1) + "\n");
} else {
  console.log(`// ${field.length} fields for ${code} (COMPUTED? = a compute/load fn assigns .value; confirm by hand)`);
  for (const f of field) {
    const tag = [f.kind, escaped.has(f.id) && "escaped", computed.has(f.id) && "computed?", secret(f.id) && "secret"].filter(Boolean).join(" ");
    console.log(`${f.id.padEnd(42)} ${tag}`);
  }
}
