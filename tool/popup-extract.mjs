// `node tool/popup-extract.mjs`: which of BIR's pop-ups each button opens and closes, read from BIR's form pages
// (vendor/original/forms/*.hta, the extractor's output) → src/form/popup.json. BIR's pop-ups are divs on the
// same page (modalAtc, modalSched1, …): a button's onclick calls a function that shows one ($('#modalSched1')
// .show('blind'), or style.display = "block") and hides the page behind it (mainContent / Content); the pop-up's
// own buttons hide it and show the page again. The web version (LayoutView.tsx) replays exactly that show/hide,
// so the pop-ups appear as on BIR's page. Only ids that are on the captured layout (asset/bir/layout/) are kept.
// Output: { "<form code>": { "<button id>": { "show": [ids], "hide": [ids] } } }
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const FORM = "vendor/original/forms";
const LAYOUT = "asset/bir/layout";
const OUT = "src/form/popup.json";
if (!existsSync(FORM)) {
  console.error(`${FORM} is missing: run npm run extract first`);
  process.exit(1);
}

const strip = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"])\/\/[^\n]*/g, "$1");

// every function body in the page's scripts, by name (the last definition wins, as in the browser)
function functionsOf(page) {
  const body = new Map();
  const script = [...page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => strip(m[1])).join("\n");
  for (const m of script.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < script.length && depth; i++) {
      if (script[i] === "{") depth++;
      else if (script[i] === "}") depth--;
    }
    body.set(m[1], script.slice(m.index + m[0].length, i - 1));
  }
  return body;
}

const SHOW = [
  /\$\(\s*['"]#([^'"]+)['"]\s*\)\s*\.\s*(?:show|fadeIn|slideDown)\s*\(/g,
  /getElementById\(\s*['"]([^'"]+)['"]\s*\)\.style\.display\s*=\s*['"](?:block|inline|inline-block|)['"]/g,
];
const HIDE = [
  /\$\(\s*['"]#([^'"]+)['"]\s*\)\s*\.\s*(?:hide|fadeOut|slideUp)\s*\(/g,
  /getElementById\(\s*['"]([^'"]+)['"]\s*\)\.style\.display\s*=\s*['"]none['"]/g,
];

// what a click runs: the onclick's own code, and the bodies of the functions it calls (two levels down), in order
function effect(code, fn, depth = 0, seen = new Set()) {
  let out = code;
  if (depth > 2) return out;
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (seen.has(name) || !fn.has(name)) continue;
    seen.add(name);
    out += "\n" + effect(fn.get(name), fn, depth + 1, seen);
  }
  return out;
}

const SKIP = new Set(["modalExport", "modalImport", "loader", "paymentOption", "container"]);
// a function that picks its pop-up from its argument (1602 showSection('SecB') / ('SecC')): both branches read as one
const OVERRIDE = {
  1602: {
    btnSectionB: { show: ["modalSectionB"], hide: ["wrapper"] },
    btnSectionC: { show: ["modalSectionC"], hide: ["wrapper"] },
  },
};
const result = {};
// BIR's page jumps (goTo(2), linkTo(this,3), goToControl(2,'…')) by their label → src/form/page-link.json
const PAGE_OUT = "src/form/page-link.json";
const pageLink = {};
const label = (tag, after) =>
  (tag.match(/\bvalue\s*=\s*"([^"]*)"/i)?.[1] ?? after.match(/^([^<]*)/)?.[1] ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
for (const file of readdirSync(FORM).filter((f) => /^BIR-Form.+\.hta$/i.test(f))) {
  const code = file.replace(/^BIR-Form|\.hta$/gi, "");
  const layoutFile = readdirSync(LAYOUT).find((f) => f.toLowerCase() === `${code.toLowerCase()}.html`);
  if (!layoutFile) continue;
  const layout = readFileSync(`${LAYOUT}/${layoutFile}`, "utf8");
  // a container on the layout (not a field): only these are pop-ups or the page behind them
  const container = new Set([...layout.matchAll(/<(?:div|table|span|form|fieldset)\b[^>]*\bid="([^"]+)"/gi)].map((m) => m[1]));
  const onLayout = new Set([...layout.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const page = readFileSync(`${FORM}/${file}`, "latin1");
  const fn = functionsOf(page);
  const entry = {};
  const jump = {};
  for (const m of page.matchAll(/<(?:input|a)\b[^>]*\bonclick\s*=\s*"\s*(?:goTo|goToControl)\s*\(\s*(\d+)|<(?:input|a)\b[^>]*\bonclick\s*=\s*"\s*linkTo\s*\(\s*this\s*,\s*(\d+)/gi)) {
    const end = page.indexOf(">", m.index);
    const text = label(page.slice(m.index, end + 1), page.slice(end + 1));
    const n = Number(m[1] ?? m[2]);
    if (text) jump[text] ??= n;
  }
  // processNext() / processPrev() (2551Q's schedule links): one page on or back, from the link's own page
  for (const m of page.matchAll(/<a\b[^>]*\bonclick\s*=\s*"\s*process(Next|Prev)\s*\(/gi)) {
    const end = page.indexOf(">", m.index);
    const text = label(page.slice(m.index, end + 1), page.slice(end + 1).replace(/^(?:\s*<font[^>]*>)+/i, "").replace(/&nbsp;/g, " "));
    if (text) jump[text] ??= m[1].toLowerCase() === "next" ? "+1" : "-1";
  }
  // a nav button that only scrolls (1702RT's "(To Schedule 7 Item 4)", window.scrollTo): its schedule is on the same
  // page, so it goes to the top of the page it is on
  for (const m of page.matchAll(/<input\b[^>]*\bname\s*=\s*"navButton"[^>]*\bonclick\s*=\s*"\s*window\.scrollTo\s*\(|<input\b[^>]*\bonclick\s*=\s*"\s*window\.scrollTo\s*\([^"]*"[^>]*\bname\s*=\s*"navButton"/gi)) {
    const end = page.indexOf(">", m.index);
    const text = label(page.slice(m.index, end + 1), page.slice(end + 1));
    if (text) jump[text] ??= "+0";
  }
  if (Object.keys(jump).length) pageLink[layoutFile.slice(0, -5)] = jump;
  for (const tag of page.matchAll(/<(?:input|a|button|img|span|td)\b[^>]*>/gi)) {
    const id = tag[0].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    const onclick = tag[0].match(/\bonclick\s*=\s*"([^"]*)"|\bonclick\s*=\s*'([^']*)'/i);
    if (!id || !onclick || !onLayout.has(id)) continue;
    // a radio or tick box: what it shows depends on the rest of the form (1701's item 4 radios open the attachment
    // pop-up only in some cases); the boxes it opens or greys come from the captured locks (src/form/lock/) instead
    if (/\btype\s*=\s*["']?(?:radio|checkbox)/i.test(tag[0])) continue;
    // 1701 Schedule 1's "(add more...)": openModalPg5Sc1 reaches only item 4's radio spans (disableItem4), not its pop-up, so
    // the captured show list would hide the page and open nothing; the web version opens that table's editor instead (picker.ts)
    if (/^\s*openModalPg5Sc1\s*\(/.test(onclick[1] ?? onclick[2])) continue;
    const run = effect(strip(onclick[1] ?? onclick[2]), fn);
    const pick = (re) => [...new Set(re.flatMap((r) => [...run.matchAll(r)].map((m) => m[1])).filter((x) => container.has(x)))];
    const show = pick(SHOW);
    const hide = pick(HIDE).filter((x) => !show.includes(x));
    // Validate, Save, Submit, Edit, Final Copy (BIR's cmd* buttons), import/export and Print are the web version's own (LayoutView.tsx), not pop-ups
    if (/print|validate|^(?:\w+:)?cmd/i.test(id) || [...show, ...hide].some((x) => SKIP.has(x))) continue;
    if (show.length) entry[id] = { show, hide };
  }
  Object.assign(entry, OVERRIDE[layoutFile.slice(0, -5)] ?? {});
  if (Object.keys(entry).length) result[layoutFile.slice(0, -5)] = entry;
}
writeFileSync(OUT, JSON.stringify(result, null, 1) + "\n");
writeFileSync(PAGE_OUT, JSON.stringify(pageLink, null, 1) + "\n");
const count = Object.values(result).reduce((n, e) => n + Object.keys(e).length, 0);
console.log(`${Object.keys(result).length} forms, ${count} buttons that open or close a pop-up → ${OUT}`);
console.log(`${Object.keys(pageLink).length} forms with page jumps → ${PAGE_OUT}`);
