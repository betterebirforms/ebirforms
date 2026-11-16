// Read the Schedule 12 pop-ups of BIR Form 1701 (page 11, vendor/original/forms/BIR-Form1701.hta) that tool/gen-1701-modal.mjs
// skips and write src/form/page/1701-column.json: the five that add a COLUMN block (two Sale/Exchange columns, BIR's
// addRowCol) and Part 1 of Schedule 12A, a plain row table with no parent boxes. Per pop-up: its link, the table the
// layout function fills, the counter BIR saves, the boxes of one block / row in the layout's order ("{i}" = the block's
// number), and what the SAVE AND CLOSE button runs after saving (summation, or compute…Modal).
// Schedule 1 on page 5 (addRowPg5Sc1) is written by hand in form1701-sim.ts: its rows are employer blocks with radios.
// Run: node tool/gen-1701-column.mjs
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const src = fs.readFileSync(`${ROOT}vendor/original/forms/BIR-Form1701.hta`, "utf8");
const live = src.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
/** a layout function's body without BIR's commented-out markup */
const code = (name) => {
  const at = src.indexOf(`function ${name}(`);
  const body = src.slice(at, src.indexOf("return cell;", at));
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
};
const out = [];
for (const l of live.matchAll(/<a [^>]*id="(frm1701:lnkPg11Sc12[^"]*More)"[^>]*onclick="([^"]*)"/g)) {
  const [, link, onclick] = l;
  const modal = /openModal\(this,\s*'([^']+)'/.exec(onclick)[1];
  const layout = /addRowCol\('(\w+)\(\)'\)/.exec(onclick)?.[1] ?? "schedule12APart1ModalLayout";
  const body = code(layout);
  const tag = [...body.matchAll(/<(?:input|select)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/type=['"]button['"]/.test(t));
  const attr = (t, a) => new RegExp(`\\b${a}\\s*=\\s*'([^']*)'`).exec(t)?.[1] ?? new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"`).exec(t)?.[1];
  const cell = tag.map((t) => ({
    stem: attr(t, "id").replace(/['"]\s*\+\s*\(\s*i\s*\+\s*1\s*\)\s*\+\s*['"]/g, "{i}"),
    select: t.startsWith("<select"),
    ml: Number(attr(t, "maxlength") ?? 0),
    upper: /capitalize\(/.test(t),
    date: /validateDate\(/.test(t),
    value: /values\[/.test(attr(t, "value") ?? "") ? "0" : (attr(t, "value") ?? ""),
  }));
  const option = [...body.matchAll(/<select\b[\s\S]*?<\/select>/g)].map((m) => [...m[0].matchAll(/<option value='([^']*)'/g)].map((o) => o[1]));
  let k = 0;
  for (const c of cell) if (c.select) c.option = option[k++];
  const close = new RegExp(`saveRowCol\\('${modal}', true\\);closeModal\\('${modal}'\\);summation\\('([^']*)',\\s*'([^']*)',\\s*'([^']*)'\\)`).exec(src);
  const compute = /(computePage11Schedule12Part1Modal)\(/.exec(onclick)?.[1];
  out.push({
    kind: compute ? "row" : "column",
    link,
    modal,
    table: compute ? "tblPage11Schedule12APt1" : /var tableID = "([^"]+)"/.exec(body)[1],
    counter: `frm1701:txtCtr${modal}`,
    cell,
    ...(close ? { summation: [close[1], close[2], close[3]] } : {}),
    ...(compute ? { compute } : {}),
  });
}
fs.writeFileSync(`${ROOT}src/form/page/1701-column.json`, JSON.stringify(out, null, 1) + "\n");
console.error("column", out.length);
