// Open a legacy form in a real engine and report what breaks.
//   node bench/probe-form.mjs <form-code> [webkit|chromium] [screenshot.png] [query]
import { webkit, chromium } from "playwright";

const [code = "0605", engine = "webkit", shot, query = ""] = process.argv.slice(2);
const base = process.env.EBIRFORMS_URL ?? "http://127.0.0.1:10900";
const browser = await (engine === "chromium" ? chromium : webkit).launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = { error: [], console_error: [], dialog: [], failed_request: [] };
page.on("pageerror", (e) => report.error.push(String(e.message).slice(0, 300)));
page.on("console", (m) => m.type() === "error" && report.console_error.push(m.text().slice(0, 300)));
page.on("dialog", async (d) => { report.dialog.push(d.message().slice(0, 200)); await d.accept(); });
page.on("requestfailed", (r) => report.failed_request.push(r.url()));
page.on("response", (r) => r.status() >= 400 && report.failed_request.push(`${r.status()} ${r.url()}`));
const t0 = Date.now();
await page.goto(`${base}/legacy/forms/BIR-Form${code}.hta${query}`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2500); // forms bootstrap on setInterval("sleeptime()", 200)
report.load_ms = Date.now() - t0;
report.title = await page.title();
report.input_count = await page.locator("input, select, textarea").count();
if (shot) await page.screenshot({ path: shot, fullPage: false });
console.log(JSON.stringify(report, null, 2));
await browser.close();
