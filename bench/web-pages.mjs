// `node bench/web-pages.mjs [dist-web]`: the web build as GitHub Pages serves it (an /ebirforms/ prefix, folder
// index files, 404.html for every other path), driven in Chromium: the form list, a deep link, the service worker,
// the list again offline, and one return the way a user files it on BIR's main screen layout (profile, Fill-up,
// Save, back to the list, View). Build it first: EBF_WEB_BASE=/ebirforms/ npm run build:web
// Run it in a pinned browser lane (CLAUDE.md "Browser"). Exit 1 on any failed check.
// EBF_PAGES_ORIGIN=https://betterebirforms.github.io runs the same checks against the live site instead.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.argv[2] ?? "dist-web";
const BASE = "/ebirforms/";
const TYPE = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

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
const live = process.env.EBF_PAGES_ORIGIN?.replace(/\/$/, "");
if (!live) await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = live ?? `http://127.0.0.1:${server.address().port}`;

const result = [];
const check = (name, ok, detail = "") => result.push({ name, ok: Boolean(ok), detail });
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const error = [];
page.on("pageerror", (e) => error.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && error.push(`${r.status()} ${new URL(r.url()).pathname}`));

try {
  // the home is BIR's main screen layout: its List of BIR Forms (in a shadow root, which locators pierce) is the form list
  const formList = async () => {
    await page.locator("#formType option").nth(80).waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
    const code = await page.locator("#formType option").evaluateAll((o) => o.map((x) => x.value).filter((v) => v !== "0"));
    return code.map((c) => `${BASE}form/${encodeURIComponent(c)}`);
  };
  await page.goto(`${origin}${BASE}form`, { waitUntil: "networkidle" });
  const form_link = await formList();
  check("form list has every native form", form_link.length >= 84, `${form_link.length} forms, first ${form_link[0]}`);
  // every form URL is a real page on Pages (200), not the 404.html fallback
  const not_ok = [];
  for (const h of form_link) {
    const r = await fetch(`${origin}${h}`, { redirect: "follow" });
    if (r.status !== 200) not_ok.push(`${h} ${r.status}`);
  }
  check("every form URL answers 200", not_ok.length === 0, not_ok.slice(0, 5).join(", "));

  await page.goto(`${origin}${BASE}form/0605`, { waitUntil: "networkidle" });
  const input_count = await page.locator("input, select, textarea").count();
  check("deep link /form/0605 renders the form", input_count > 10, `${input_count} inputs`);

  await page.goto(`${origin}${BASE}form`, { waitUntil: "networkidle" });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  check("service worker scope is the base", scope === `${origin}${BASE}`, scope);
  await page.waitForTimeout(1500); // let the worker finish caching the shell

  // a form's BIR layout is cached the first time it opens (not precached: 84 of them are ~27 MB)
  await page.goto(`${origin}${BASE}form/0605`, { waitUntil: "networkidle" });
  await page.locator('[id="frm0605:txtTax19"]').waitFor();
  await context.setOffline(true);
  await page.goto(`${origin}${BASE}form`, { waitUntil: "load" }).catch(() => {});
  const offline_count = (await formList()).length;
  check("form list loads offline", offline_count >= 84, `${offline_count} forms`);
  await page.goto(`${origin}${BASE}form/0605`, { waitUntil: "load" }).catch(() => {});
  const offline_form = await page.locator('[id="frm0605:txtTax19"]').waitFor({ timeout: 10_000 }).then(() => true, () => false);
  check("a form opened once opens offline in BIR's layout", offline_form);
  await context.setOffline(false);

  // a return, start to finish, on BIR's own screens (a fresh context: an empty browser store)
  const flow = await browser.newContext({ acceptDownloads: true });
  const tab = await flow.newPage();
  const said = [];
  tab.on("pageerror", (e) => error.push(`pageerror: ${e.message}`));
  tab.on("dialog", (d) => (said.push(d.message()), d.type() === "confirm" ? d.accept() : d.dismiss()));
  await tab.goto(`${origin}${BASE}`, { waitUntil: "networkidle" });
  const L = (sel) => tab.locator(sel);
  await L("#formType").selectOption("0605");
  await L("#btnFillup").click();
  await tab.waitForTimeout(200);
  check("Fill-up checks the profile the way BIR does", said.at(-1) === "Please enter valid TIN", said.at(-1));
  for (const [id, v] of [["tin1", "123"], ["tin2", "456"], ["tin3", "788"], ["tin4", "00000"], ["lob", "consulting"], ["fn", "dela cruz, juan"], ["regAddr", "1 rizal st"], ["zip", "1000"], ["telNo", "0281234567"], ["txtEmail", "a@example.com"]])
    await L(`#${id}`).fill(v);
  await L("#rdo").selectOption({ index: 5 });
  await L("#btnFillup").click();
  await tab.waitForURL(/\/form\/0605/);
  const F = (id) => L(`[id="frm0605:${id}"]`);
  await F("txtTaxPayerName").waitFor();
  check("the form opens with the profile filled in and locked", (await F("txtTaxPayerName").inputValue()) === "DELA CRUZ, JUAN" && (await F("txtTIN1").isDisabled()));
  for (const [id, v] of [["txtReturnPeriodMonth", "10"], ["txtReturnPeriodDay", "31"], ["txtReturnPeriodYear", "2026"], ["txtTax19", "1500"], ["txtTax20A", "100"]]) {
    await F(id).fill(v);
    await F(id).blur();
  }
  check("the engine computes item 21", (await F("txtTax21").inputValue()) === "1,600.00", await F("txtTax21").inputValue());
  const download = tab.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
  await L("#btnSave").click();
  const file = (await download)?.suggestedFilename() ?? "";
  check("Save downloads BIR's savefile", /^12345678800000-0605-10312026\d{6}\.xml$/.test(file), file);
  await L("#formMenu a.toplevel").first().click();
  await L("#formMenu a:text('Main Screen')").click();
  await L("input[name=rdoRecord]").first().waitFor({ timeout: 10_000 });
  check("the main screen lists the saved return", (await L("#outPut tr").count()) === 1);
  await L("input[name=rdoRecord]").first().check();
  await L("#btnListViewRecord").click();
  await tab.waitForURL(/file=/);
  await F("txtTax19").waitFor();
  await tab.waitForFunction(() => document.querySelector(".bir-layout")?.shadowRoot?.getElementById("frm0605:txtTax21")?.value === "1,600.00", null, { timeout: 10_000 }).catch(() => {});
  check("View reopens it with its values", (await F("txtTax21").inputValue()) === "1,600.00", await F("txtTax21").inputValue());

  // BIR's page-jump links: by id (1601-C's "From Part IV-Schedule 1") and by the schedule they name (1702-MX)
  const jump = async (code, from, pick) => {
    await tab.goto(`${origin}${BASE}form/${code}`, { waitUntil: "networkidle" });
    await tab.waitForFunction(() => document.querySelector(".bir-layout")?.shadowRoot?.querySelector("[id^=Page][id$=Content]"), null, { timeout: 10_000 });
    return tab.evaluate(([from, pick]) => {
      const s = document.querySelector(".bir-layout").shadowRoot;
      const box = s.querySelector("input[id$=':txtCurrentPage']");
      box.value = String(from);
      box.dispatchEvent(new Event("change"));
      const a = Array.from(s.querySelectorAll(`#Page${from}Content [data-js]`)).find((x) => x.id === pick || x.textContent.replace(/\s+/g, " ").trim() === pick);
      a?.click();
      return Array.from(s.querySelectorAll("[id^=Page][id$=Content]")).findIndex((p) => p.style.display !== "none") + 1;
    }, [from, pick]);
  };
  const by_id = await jump("1601Cv2018", 1, "btnNavigatePage2_1");
  check("a page link goes to its page", by_id === 2, `1601-C page 1 -> ${by_id}`);
  const by_name = await jump("1702MXv2018", 3, "(To Part IV-Schedule 2 Item 8)");
  check("a schedule note goes to that schedule's page", by_name === 2, `1702-MX page 3 -> ${by_name}`);
  await flow.close();

  // a phone: BIR's 800 px page shrinks to the screen instead of running off its right side
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  for (const path of ["", "form/0605", "form/1702RTv2018C"]) {
    await small.goto(`${origin}${BASE}${path}`, { waitUntil: "networkidle" });
    await small.waitForFunction(() => document.querySelector(".bir-layout")?.shadowRoot?.querySelector(".bir-body"), null, { timeout: 10_000 });
    await small.waitForTimeout(300);
    const wide = await small.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (process.argv.includes("--shot")) await small.screenshot({ path: `${process.argv[process.argv.indexOf("--shot") + 1]}/phone-${path.replace(/\W/g, "_") || "main"}.png` });
    check(`fits a phone: /${path}`, wide[0] <= wide[1] + 1, `page ${wide[0]} px, screen ${wide[1]} px`);
  }
  await phone.close();
} catch (e) {
  check("run", false, e.message);
}
check("no page errors or failed requests", error.length === 0, error.slice(0, 5).join("; "));

await browser.close();
if (!live) server.close();
for (const r of result) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
process.exit(result.every((r) => r.ok) ? 0 : 1);
