// `node bench/web-parity.mjs [out.json]`: what still does nothing on the web version. Opens every form's page (and
// the main screen) from dist-web in Chromium and lists each control on BIR's page that a user can click (buttons,
// links, BIR's javascript: links) but that has no click handler, plus the boxes BIR greys out that stay open.
// Handlers are read with Chrome's DOMDebugger, so this measures what is wired, not what is drawn.
// Build first (npm run build:web). Run it in a pinned browser lane (CLAUDE.md "Browser").
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
const route = [{ code: "main", path: "/" }, ...code.map((c) => ({ code: c, path: `/form/${c}` }))];

const browser = await chromium.launch();
const report = [];
for (const r of route) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on("dialog", (d) => void d.dismiss());
  await page.goto(base + r.path, { waitUntil: "networkidle" });
  await page.locator(".bir-layout").waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const cdp = await page.context().newCDPSession(page);
  // every clickable thing on BIR's page: buttons, links (not the File / Help menu's own toggles, which wireMenu
  // handles by text), and anything that carried an onclick in BIR's page (the capture marks javascript: links)
  const count = await page.evaluate(() => {
    const root = document.querySelector(".bir-layout")?.shadowRoot;
    const all = root
      ? Array.from(root.querySelectorAll("input[type=button], input[type=submit], button, a, [data-js]")).filter((el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && !el.closest("[hidden]");
        })
      : [];
    window.__ebfAudit = all;
    return all.length;
  });
  const dead = [];
  for (let i = 0; i < count; i++) {
    const { result } = await cdp.send("Runtime.evaluate", { expression: `window.__ebfAudit[${i}]` });
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth: 0 });
    if (listeners.some((l) => /^(click|change|mousedown|pointerdown)$/.test(l.type))) continue;
    const info = await page.evaluate((i) => {
      const e = window.__ebfAudit[i];
      return {
        tag: e.tagName.toLowerCase(),
        id: e.id || "",
        text: ((e.value ?? "") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        href: e.getAttribute("href") ?? "",
        menu: !!e.closest("ul.topnav, #formMenu, #printMenu"),
        disabled: !!e.disabled,
        // false when it sits in one of BIR's pop-ups or schedules that is closed right now
        shown: e.getClientRects().length > 0,
      };
    }, i);
    // a menu entry with sub-entries is a toggle that wireMenu handles by its parent; skip those
    if (info.menu && /^(File|Help|Go)$/.test(info.text)) continue;
    dead.push(info);
  }
  // BIR's pop-up buttons and what each opens (LayoutView.tsx marks them)
  const popup = await page.evaluate(() =>
    Array.from(document.querySelector(".bir-layout")?.shadowRoot?.querySelectorAll("[data-ebf-popup]") ?? [], (e) => ({ id: e.id, open: e.dataset.ebfPopup })),
  );
  report.push({ code: r.code, clickable: count, dead, popup });
  process.stdout.write(`${r.code}: ${count - dead.length}/${count} wired\n`);
  await page.close();
}
await browser.close();
server.close();

const total = report.reduce((n, r) => n + r.clickable, 0);
const deadTotal = report.reduce((n, r) => n + r.dead.length, 0);
const shownDead = report.reduce((n, r) => n + r.dead.filter((d) => d.shown).length, 0);
console.log(`\n${route.length} pages, ${total} clickable controls, ${total - deadTotal} wired, ${deadTotal} do nothing (${shownDead} on screen, ${deadTotal - shownDead} inside closed pop-ups)`);
const kind = {};
for (const r of report) for (const p of r.popup) kind[p.open] = (kind[p.open] ?? 0) + 1;
console.log(`pop-up buttons: ${Object.entries(kind).map(([k, n]) => `${n} ${k}`).join(", ")}`);
const out = process.argv[2];
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
