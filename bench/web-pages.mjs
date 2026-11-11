// `node bench/web-pages.mjs [dist-web]`: the web build as GitHub Pages serves it (an /ebirforms/ prefix, folder
// index files, 404.html for every other path), driven in Chromium: the form list, a deep link, the service worker,
// and the list again offline. Build it first: EBF_WEB_BASE=/ebirforms/ npm run build:web
// Run it in a pinned browser lane (CLAUDE.md "Browser"). Exit 1 on any failed check.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.argv[2] ?? "dist-web";
const BASE = "/ebirforms/";
const TYPE = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

// GitHub Pages: a folder serves its index.html, a folder without the slash redirects, anything else is 404.html
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith(BASE)) return res.writeHead(404).end();
  const rel = normalize(decodeURIComponent(url.pathname.slice(BASE.length))).replace(/^(\.\.[/\\])+/, "");
  let path = join(root, rel);
  if (existsSync(path) && statSync(path).isDirectory()) {
    if (!url.pathname.endsWith("/")) return res.writeHead(301, { location: `${url.pathname}/` }).end();
    path = join(path, "index.html");
  }
  if (!existsSync(path)) return res.writeHead(404, { "content-type": "text/html" }).end(readFileSync(join(root, "404.html")));
  res.writeHead(200, { "content-type": TYPE[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const result = [];
const check = (name, ok, detail = "") => result.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const error = [];
page.on("pageerror", (e) => error.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && error.push(`${r.status()} ${new URL(r.url()).pathname}`));

try {
  await page.goto(`${origin}${BASE}form`, { waitUntil: "networkidle" });
  const link = await page.$$eval("a[href]", (a) => a.map((x) => x.getAttribute("href")));
  const form_link = link.filter((h) => h.startsWith(`${BASE}form/`));
  check("form list links under the base", form_link.length >= 80, `${form_link.length} form links, first ${form_link[0]}`);
  // every form URL is a real page on Pages (200), not the 404.html fallback
  const not_ok = [];
  for (const h of form_link) {
    const r = await fetch(`${origin}${h}`, { redirect: "follow" });
    if (r.status !== 200) not_ok.push(`${h} ${r.status}`);
  }
  check("every form URL answers 200", not_ok.length === 0, not_ok.slice(0, 5).join(", "));

  await page.goto(`${origin}${BASE}form/0605`, { waitUntil: "networkidle" });
  const input_count = await page.$$eval("input, select, textarea", (x) => x.length);
  check("deep link /form/0605 renders the form", input_count > 10, `${input_count} inputs`);

  await page.goto(`${origin}${BASE}form`, { waitUntil: "networkidle" });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  check("service worker scope is the base", scope === `${origin}${BASE}`, scope);
  await page.waitForTimeout(1500); // let the worker finish caching the shell

  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  const offline_count = await page.$$eval(`a[href^="${BASE}form/"]`, (a) => a.length);
  check("form list loads offline", offline_count >= 80, `${offline_count} form links`);
  await context.setOffline(false);
} catch (e) {
  check("run", false, e.message);
}
check("no page errors or failed requests", error.length === 0, error.slice(0, 5).join("; "));

await browser.close();
server.close();
for (const r of result) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
process.exit(result.every((r) => r.ok) ? 0 : 1);
