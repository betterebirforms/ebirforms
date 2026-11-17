// The laptop in the share card (og.py): BIR Form 1701Q in the web version at a MacBook Air 13" viewport, 2x, reached the
// way a person reaches it (profile typed in, the form picked, Fill-up, a few choices made). Headless. After build:web:
//   node asset/brand/device/laptop.mjs dist-web asset/brand/device/shot   → shot/laptop.png (2940 x 1662)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const [WEB, OUT] = process.argv.slice(2);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp", ".gif": "image/gif", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]);
  const f = join(WEB, p); const hit = p !== "/" && existsSync(f) && extname(f) ? f : join(WEB, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(hit)] ?? "application/octet-stream" }).end(readFileSync(hit));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
// MacBook Air 13": 1470 x 956 points; less the menu bar (37) and the browser's tab and address bars (88)
const page = await browser.newPage({ viewport: { width: 1470, height: 956 - 37 - 88 }, deviceScaleFactor: 2 });
page.on("dialog", (d) => { console.log("dialog:", d.message().slice(0, 120)); d.accept(); });
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const box = (id) => page.locator(`[id="${id}"]`);
for (const [id, v] of Object.entries({ tin1: "123", tin2: "456", tin3: "788", tin4: "00000", lob: "RETAIL TRADE", fn: "DELA CRUZ, JUAN SANTOS", regAddr: "123 RIZAL ST., BRGY. SAN ANTONIO, PASIG CITY", zip: "1600", telNo: "09171234567", txtEmail: "juan.delacruz@example.com" })) await box(id).fill(v);
await box("rdo").selectOption("043").catch(() => box("rdo").selectOption({ index: 1 }));
const opt = await box("formType").evaluate((s) => Array.from(s.options).map((o) => o.value + "|" + o.text).filter((x) => /1701Q/i.test(x)));
await box("formType").selectOption(opt.find((x) => /2018/.test(x))?.split("|")[0] ?? opt[0].split("|")[0]);
await page.locator('input[value="Fill-up"], button:has-text("Fill-up")').first().click();
await page.waitForTimeout(3000);
console.log("url:", page.url());
// what a filer does next: clicks and typing, as a person would
for (const id of ["frm1701q:DateQuarter_2", "frm1701q:optType_1", "frm1701q:optATC_1", "frm1701q:optForeignTaxCredits_2", "frm1701q:optTaxRate_2"]) await box(id).click();
for (const [id, v] of [["frm1701q:txtBirthMonth", "03"], ["frm1701q:txtBirthDay", "15"], ["frm1701q:txtBirthYear", "1990"], ["frm1701q:txtCitizenship", "FILIPINO"]]) { await box(id).click(); await page.keyboard.type(v); }
await page.mouse.click(5, 300);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/laptop.png` });
await browser.close(); server.close();
