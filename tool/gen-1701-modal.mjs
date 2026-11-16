// Read BIR Form 1701's "(add more...)" pop-ups out of its page (vendor/original/forms/BIR-Form1701.hta) and write
// src/form/page/1701-modal.json: per pop-up the link, the pop-up and its two tables, the item's own boxes it copies
// into row 1 (transferToModal), the row's boxes (the layout function's cells) and the compute function a closed
// pop-up runs. "TYPE" is BIR's token for an attachment copy ("EX1" ...). Run: node tool/gen-1701-modal.mjs
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const src = fs.readFileSync(`${ROOT}vendor/original/forms/BIR-Form1701.hta`, "utf8");
const live = src.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " ")); // a link BIR commented out is not on its page
const link = [...live.matchAll(/<a [^>]*id="(frm1701:lnk[^"]*More[^"]*)"[^>]*onclick="([^"]*)"/g)].map((m) => ({ id: m[1], onclick: m[2] }));
const toStem = (id) => id.replace(/'\s*\+\s*\(i \+ 1\)\s*\+\s*'/g, "{i}").replace(/'\s*\+\s*TYPE\s*\+\s*'/g, "TYPE");
const out = [];
for (const l of link) {
  const modal = /openModal\w*\(this,\s*'([^']+)'/.exec(l.onclick)?.[1];
  const layout = /transferToModal\('([^']+)'/.exec(l.onclick)?.[1];
  const parent = /transferToModal\('[^']+','([^']+)'/.exec(l.onclick)?.[1]?.split(",");
  if (!modal || !layout || !parent) continue; // the Part-V-style pop-ups (addRowCol) are a different mechanism
  const compute = /(compute\w*Modal\w*)\(/.exec(l.onclick)?.[1];
  const at = src.indexOf(`function ${layout}(`);
  const body = src.slice(at, src.indexOf("return cell;", at));
  const table = toStem(/var tableID = ([^;]+);/.exec(body)?.[1].replace(/^"([^"]*)"\s*\+\s*TYPE$/, "$1TYPE").replace(/^"|"$/g, "") ?? "");
  const cell = [...body.matchAll(/<input type="text"[^>]*>/g)].map((m) => ({ stem: toStem(/\sid="([^"]*)"/.exec(m[0])[1]), ml: Number(/maxlength="(\d+)"/.exec(m[0])[1]), upper: /capitalize\(/.test(m[0]) }));
  out.push({ link: l.id, modal, table, compute, parent, cell, counter: `frm1701:txtCtr${modal.replace(/TYPE$/, "")}` });
}
fs.writeFileSync(`${ROOT}src/form/page/1701-modal.json`, JSON.stringify(out, null, 1) + "\n");
console.error("modal", out.length);
