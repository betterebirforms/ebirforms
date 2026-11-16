// Read when BIR Form 1701 turns each "(add more...)" link on (vendor/original/forms/BIR-Form1701.hta, disableLinkIfEmpty,
// 169 calls) and write src/form/page/1701-link.json: per link the id list every call passes (all calls of one link pass
// the same list, checked here), and what disableLinkIfEmpty makes of it on BIR's measured page (page/1701.json): the
// boxes in its order, each a "text" (maxlength not 12: must not be blank), an "income" (Schedule 1's compensation box:
// `value <= 0` turns it off) or an "amount" (isAmountValid: this box or its partner column, > 0).
// The partner of a box is getSpouseIDviaTaxfilerID / getTaxfilerIDviaSpouseID, run here over the measured elements; the
// spouse box BIR adds after each listed box is in the list. "TYPE" is BIR's token for an attachment copy ("EX1" ...).
// Run: node tool/gen-1701-link.mjs
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const src = fs.readFileSync(`${ROOT}vendor/original/forms/BIR-Form1701.hta`, "utf8");
const dom = JSON.parse(fs.readFileSync(`${ROOT}src/form/page/1701.json`, "utf8"));
const el = new Map(dom.el.map((r) => [r[0], { type: r[1], name: r[2], ml: r[4] === "" ? -1 : Number(r[4]) }]));
const live = src.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));

// every call with a list; 'this' calls are the same link on the same blur followed by the list call (checked below)
const list = new Map();
for (const m of live.matchAll(/disableLinkIfEmpty\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
  const set = list.get(m[2]) ?? new Set();
  set.add(m[1]);
  list.set(m[2], set);
}
for (const [link, set] of list) if (set.size !== 1) throw new Error(`${link}: ${set.size} different id lists`);

/** BIR's getSpouseIDviaTaxfilerID: the page's Spouse box that sits next to a taxfiler box (or null) */
function spouseOf(id, attachment) {
  const spouseOnly = (x) => (el.has(x) && el.get(x).name === "frm1701:Spouse" ? x : null);
  if (!attachment) {
    const spouse = id.substring(0, id.indexOf("Tax")); // JS: indexOf -1 gives ""
    let desc = "SpouseC2";
    desc = el.has(spouse + desc) ? desc : "SpouseSumC2";
    desc = el.has(spouse + desc) ? desc : "Spouse";
    return spouseOnly(spouse + desc);
  }
  if (id.includes("C3")) return spouseOnly(id.replace(/C3/g, "C4"));
  if (id.includes("C2")) return spouseOnly(id.replace(/C2/g, "C3"));
  return "";
}
/** BIR's getTaxfilerIDviaSpouseID (existence only, as BIR) */
function taxfilerOf(id, attachment) {
  if (!attachment) {
    const spouse = id.substring(0, id.indexOf("Spouse"));
    let desc = "TaxPayerC1";
    desc = el.has(spouse + desc) ? desc : "TaxSumPayerC1";
    desc = el.has(spouse + desc) ? desc : "TaxPayer";
    return el.has(spouse + desc) ? spouse + desc : null;
  }
  if (id.includes("C4")) return el.has(id.replace(/C4/g, "C3")) ? id.replace(/C4/g, "C3") : null;
  if (id.includes("C3")) return el.has(id.replace(/C3/g, "C2")) ? id.replace(/C3/g, "C2") : null;
  return "";
}

const out = [];
for (const [link, set] of list) {
  const id = [...set][0].split(",");
  const attachment = link.includes("TYPE");
  const complete = [];
  for (const x of id) {
    complete.push(x);
    const spouse = spouseOf(x, attachment);
    if (spouse != null && String(spouse).trim() !== "") complete.push(spouse);
  }
  const box = [];
  for (const x of complete) {
    const e = el.get(x);
    if (!e || e.type !== "text") continue;
    if (e.ml !== 12) box.push({ id: x, kind: "text" });
    else if (x.includes("Pg5Sc1")) {
      if (x.includes("ComIncome")) box.push({ id: x, kind: "income" }); // any other 12-wide box on Schedule 1 never changes the state
    }
    else {
      const partner = e.name === "frm1701:Spouse" ? taxfilerOf(x, attachment) : spouseOf(x, attachment);
      box.push({ id: x, kind: "amount", ...(partner && el.has(partner) ? { partner } : {}) });
    }
  }
  out.push({ link, attachment, id, box });
}
fs.writeFileSync(`${ROOT}src/form/page/1701-link.json`, JSON.stringify(out, null, 1) + "\n");
console.error("link", out.length, "box", out.reduce((n, l) => n + l.box.length, 0));
