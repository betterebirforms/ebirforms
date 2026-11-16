// Read when BIR Form 1700 (the 2013 layout) turns each "(add more...)" link on (vendor/original/forms/BIR-Form1700.hta,
// disableLinkIfEmptyControls: every listed box must hold something after trim, and a "0" counts) and write
// src/form/page/1700-link.json: per link the boxes of its blur calls. Item 3's link also has a call on the pop-up's CLOSE
// button that lists the employer name alone; the blur call (name and TIN) is the one a filer meets first and is kept.
// Item 6's link (lnkPg3Pt5I6ADDMore) has no `disabled` in its markup and one call, after its pop-up is saved: no blur gate.
// Run: node tool/gen-1700-link.mjs
import fs from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const src = fs.readFileSync(`${ROOT}vendor/original/forms/BIR-Form1700.hta`, "utf8");
const live = src.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
const out = {};
for (const m of live.matchAll(/disableLinkIfEmptyControls\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
  const id = m[1].split(",").map((s) => s.trim());
  const link = m[2];
  const at = out[link];
  // the longest list is the blur call; a shorter one is a different trigger (the pop-up's CLOSE)
  if (!at || id.length > at.length) out[link] = id;
  else if (id.length === at.length && id.join() !== at.join()) throw new Error(`${link}: two lists of one length`);
}
const markup = [...live.matchAll(/<a [^>]*id="(frm1700:lnk[^"]*(?:ADDMore|AddLink))"([^>]*)>/g)].map((m) => ({ link: m[1], start_off: /\bdisabled=/.test(m[2]) }));
const link = markup.map((m) => ({ link: m.link, start_off: m.start_off, ...(out[m.link] && m.link !== "frm1700:lnkPg3Pt5I6ADDMore" ? { id: out[m.link] } : {}) }));
fs.writeFileSync(`${ROOT}src/form/page/1700-link.json`, JSON.stringify(link, null, 1) + "\n");
console.error("link", link.length, link.filter((l) => l.id).length, "gated");
