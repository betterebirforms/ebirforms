// `node bench/web-reach.mjs [out.json [CODE,CODE]]`: can a user reach any control that does nothing on the web version?
// bench/web-parity.mjs lists the controls with no click handler and says whether each is on screen now. This opens every
// pop-up the web version can open: for each form it clicks every wired pop-up button (and every button that turns up
// inside what that opened, three levels deep), on a fresh page each time, and records which do-nothing controls
// became visible. A do-nothing control inside a page of BIR's pager counts as reachable (the pager is wired).
// Anything never shown this way sits in a part of BIR's page no web control opens. Build first (npm run build:web);
// run it in a pinned browser lane (CLAUDE.md "Browser").
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const WEB = "dist-web";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]);
  const file = join(WEB, url);
  const hit = url !== "/" && existsSync(file) && extname(file) ? file : join(WEB, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(hit)] ?? "application/octet-stream" }).end(readFileSync(hit));
}).listen(0, "127.0.0.1");
await new Promise((r) => server.on("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

const code = readdirSync("asset/bir/layout")
  .filter((f) => f.endsWith(".html") && !f.startsWith("help-") && f !== "main.html")
  .map((f) => f.slice(0, -5))
  .sort();
const only = process.argv[3]?.split(",");
const route = [{ code: "main", path: "/" }, ...code.map((c) => ({ code: c, path: `/form/${c}` }))].filter((r) => !only || only.includes(r.code));

// in the page: the clickable list (same selector and order as web-parity), which have no handler is decided by CDP
const LIST = `(() => { const root = document.querySelector(".bir-layout")?.shadowRoot; window.__ebfAll = root ? Array.from(root.querySelectorAll("input[type=button], input[type=submit], button, a, [data-js]")).filter((el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && !el.closest("[hidden]"); }) : []; return window.__ebfAll.length; })()`;
// shown, or hidden only by pages of BIR's pager (Page2, Page2Content, ...)
const SEEN = `((i) => { const e = window.__ebfAll[i]; if (e.getClientRects().length > 0) return true; for (let x = e.parentElement; x; x = x.parentElement) if (x.id && getComputedStyle(x).display === "none" && !/^Page\\d+(Content)?$/.test(x.id)) return false; return getComputedStyle(e).display !== "none"; })`;

async function open(browser, path) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on("dialog", (d) => void d.accept().catch(() => {}));
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.locator(".bir-layout").waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(LIST);
  return page;
}
// the wired pop-up buttons a user can reach now (on screen, or on another page of the pager), by index in the clickable list
const openers = (page) =>
  page.evaluate(`window.__ebfAll.map((e, i) => (e.dataset.ebfPopup && ${SEEN}(i) ? i : -1)).filter((i) => i >= 0)`);
const click = (page, i) =>
  page.evaluate((i) => {
    const e = window.__ebfAll[i];
    e.disabled = false;
    e.click();
  }, i);

const browser = await chromium.launch();
const report = [];
for (const r of route) {
  const page = await open(browser, r.path);
  const count = await page.evaluate("window.__ebfAll.length");
  const cdp = await page.context().newCDPSession(page);
  const dead = [];
  for (let i = 0; i < count; i++) {
    const { result } = await cdp.send("Runtime.evaluate", { expression: `window.__ebfAll[${i}]` });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth: 0 });
    if (listeners.some((l) => /^(click|change|mousedown|pointerdown)$/.test(l.type))) continue;
    const e = await page.evaluate((i) => {
      const e = window.__ebfAll[i];
      return { i, id: e.id || "", text: ((e.value ?? "") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60), menu: !!e.closest("ul.topnav, #formMenu, #printMenu") };
    }, i);
    if (e.menu && /^(File|Help|Go)$/.test(e.text)) continue;
    dead.push(e);
  }
  const reached = new Map(); // dead index -> the opener path that showed it
  const mark = async (pg, via) => {
    for (const d of dead) if (!reached.has(d.i) && (await pg.evaluate(`${SEEN}(${d.i})`))) reached.set(d.i, via);
  };
  await mark(page, "page");
  const first = await openers(page);
  await page.close();
  // breadth-first over opener paths, a fresh page per path
  const queue = first.map((i) => [i]);
  const tried = new Set();
  while (queue.length && dead.length > reached.size) {
    const path = queue.shift();
    const key = path.join(">");
    if (tried.has(key)) continue;
    tried.add(key);
    const pg = await open(browser, r.path);
    try {
      for (const i of path) {
        await click(pg, i);
        await pg.waitForTimeout(250);
      }
      await mark(pg, key);
      if (path.length < 3) for (const i of await openers(pg)) if (!path.includes(i) && !first.includes(i)) queue.push([...path, i]);
    } catch {}
    await pg.close();
  }
  const unreached = dead.filter((d) => !reached.has(d.i));
  report.push({ code: r.code, clickable: count, dead: dead.length, reached: dead.filter((d) => reached.has(d.i)).map((d) => ({ ...d, via: reached.get(d.i) })), unreached, opener_path: tried.size });
  process.stdout.write(`${r.code}: ${dead.length} do nothing, ${reached.size} of them reachable (${tried.size} pop-up paths opened)\n`);
}
await browser.close();
server.close();

const deadTotal = report.reduce((n, r) => n + r.dead, 0);
const reachTotal = report.reduce((n, r) => n + r.reached.length, 0);
console.log(`\n${route.length} pages, ${deadTotal} controls do nothing, ${reachTotal} reachable by a user, ${deadTotal - reachTotal} never shown`);
for (const r of report) for (const d of r.reached) console.log(`  reachable: ${r.code} ${d.id || "-"} "${d.text}" via ${d.via}`);
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
