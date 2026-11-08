// Open every recovered form in WebKit (macOS engine) behind the shim; report breakage per form.
//   node bench/sweep-forms.mjs [webkit|chromium] > bench/result/sweep.json
// Needs the dev server (npm run dev) and a seeded profile in .data/profile/.
import { readdirSync } from "node:fs";
import { webkit, chromium } from "playwright";

const engine = process.argv[2] ?? "webkit";
const base = process.env.EBIRFORMS_URL ?? "http://127.0.0.1:10900";
const profile = process.env.EBIRFORMS_PROFILE ?? "profile/84653210700000.xml";
const form = readdirSync("vendor/original/forms").filter((f) => f.endsWith(".hta")).map((f) => f.slice("BIR-Form".length, -4));
const browser = await (engine === "chromium" ? chromium : webkit).launch();
// like the shell: each form only reads the profile when profile.formType names it
const token = /name="ebf-token" content="([^"]+)"/.exec(await (await fetch(base + "/")).text())?.[1] ?? "";
const vfs = (req) => fetch(base + "/__vfs", { method: "POST", headers: { "content-type": "application/json", "x-ebf-token": token }, body: JSON.stringify(req) }).then((r) => r.json());
const profile_text = (await vfs({ op: "read", path: profile })).text;
const result = [];
for (const code of form) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const r = { code, error: [], failed_request: [], dialog: [] };
  page.on("pageerror", (e) => r.error.push(String(e.message).slice(0, 200)));
  page.on("dialog", async (d) => { r.dialog.push(d.message().slice(0, 120)); await d.accept().catch(() => {}); });
  page.on("response", (res) => res.status() >= 400 && r.failed_request.push(`${res.status()} ${new URL(res.url()).pathname}`));
  await vfs({ op: "write", path: profile, text: profile_text.replace(/formType=[^<]*formType=/, `formType=${code}formType=`) });
  const t0 = Date.now();
  try {
    await page.goto(`${base}/legacy/forms/BIR-Form${code}.hta?xmlBGInfoFileName=${profile}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(2500);
    r.load_ms = Date.now() - t0;
    r.input_count = await page.locator("input, select").count();
    r.name_prefilled = await page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.type === "text" && /DELA CRUZ/.test(i.value)));
  } catch (e) {
    r.error.push("NAVIGATION: " + String(e.message).slice(0, 160));
  }
  r.error = [...new Set(r.error)];
  r.failed_request = [...new Set(r.failed_request)];
  result.push(r);
  process.stderr.write(`${code.padEnd(16)} err=${r.error.length} 404=${r.failed_request.length} ${r.load_ms ?? "-"}ms prefill=${r.name_prefilled}\n`);
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ engine, at: new Date().toISOString(), result }, null, 1));
