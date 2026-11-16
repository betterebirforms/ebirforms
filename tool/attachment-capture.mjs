// Captures the boxes of BIR's 1702-MX attachment template (the `attachmentPages_TEMP` block) into
// src/form/template/<out>.json: one record per input, in DOM order, with BIR's token ("AttM") still in the ids.
// BIR's addAttachment clones that block once per exempt (EX) or special-rate (SP) activity and swaps the token for
// "EX1", "SP2" … (and turns type=hidden into type=text, which is why the copies are saved).
//   node tool/attachment-capture.mjs MX 1702MX           (vendor/original/forms/BIR-Form1702MX.hta)
//   node tool/attachment-capture.mjs MXv2018C 1702MXv2018C
// The output is captured data, never hand-edited. Needs vendor/original (npm run extract).
import { readFileSync, writeFileSync } from "node:fs";

const [suffix, out] = process.argv.slice(2);
if (!suffix || !out) throw new Error("usage: attachment-capture.mjs <form suffix e.g. MXv2018C> <out name>");
const source = readFileSync(`vendor/original/forms/BIR-Form1702${suffix}.hta`, "latin1");
const start = source.indexOf('<div id="attachmentPages_TEMP">');
if (start < 0) throw new Error("no attachmentPages_TEMP");

const attr = (tag, name) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const tag = /<(\/?)(div|input|select|textarea|option)\b([^>]*)>/gis;
tag.lastIndex = start;
const stack = [];
const field = [];
let m;
let current = null;
while ((m = tag.exec(source))) {
  const [, close, name, rest] = m;
  if (name === "div") {
    if (close) {
      stack.pop();
      if (stack.length === 0) break;
    } else stack.push(attr(rest, "id") ?? "");
    continue;
  }
  if (close) continue;
  if (name === "option") {
    if (current) current.option.push(attr(rest, "value") ?? "");
    continue;
  }
  const type = (attr(rest, "type") ?? (name === "select" ? "select-one" : "text")).toLowerCase();
  if (type === "button") continue;
  const id = (attr(rest, "id") ?? "").replace(/^frm1702MX:/, "");
  if (!id) continue;
  const record = {
    id,
    type,
    name: (attr(rest, "name") ?? "").replace(/^frm1702MX:/, ""),
    value: attr(rest, "value") ?? "",
    disabled: /\bdisabled\b/i.test(rest),
    numbertext: /class\s*=\s*"[^"]*\bnumbertext\b/.test(rest),
    max: attr(rest, "maxlength") ?? "",
    change: (attr(rest, "onchange") ?? "").replace(/\s+/g, " ").trim(),
    blur: (attr(rest, "onblur") ?? "").replace(/\s+/g, " ").trim(),
    inside: stack.filter((s) => /^AttMSchedule/.test(s)),
    option: [],
    checked: /\bchecked\b/i.test(rest),
    notenabled: /class\s*=\s*"[^"]*\bnotenabled\b/.test(rest),
  };
  field.push(record);
  current = name === "select" ? record : null;
}
// the main form's two columns BIR's disableAttachColumns() clears and disables while a copy exists (A = exempt, B = special rate)
const column = { A: [], B: [] };
const stop = source.indexOf('<div id="attachmentPages_TEMP">');
const input = /<input\b([^>]*)>/gis;
let n;
while ((n = input.exec(source)) && n.index < stop) {
  const name = attr(n[1], "name");
  const id = (attr(n[1], "id") ?? "").replace(/^frm1702MX:/, "");
  if (name === "frm1702MX:txtColumnAExempt") column.A.push(id);
  if (name === "frm1702MX:txtColumnBSpecialRate") column.B.push(id);
}
const compact = field.map((f) => `    ${JSON.stringify(f)}`).join(",\n");
const col = (c) => `    "${c}": ${JSON.stringify(column[c])}`;
writeFileSync(`src/form/attachment/${out}.json`, `{\n  "box": [\n${compact}\n  ],\n  "column": {\n${col("A")},\n${col("B")}\n  }\n}\n`);
console.log(`${out}: ${column.A.length} / ${column.B.length} column boxes, ${field.length} boxes, ${field.filter((f) => f.type === "radio").length} radios, ${field.filter((f) => f.type === "select-one").length} selects`);
