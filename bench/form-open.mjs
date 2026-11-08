// Real interactive time per form: set the profile's formType so the form reads it, then time from
// navigation until a field is populated from the profile. Needs the dev server + a seeded profile.
//   node bench/form-open.mjs [form...]   (default: the heaviest forms)
import { readFileSync } from "node:fs";
import { webkit } from "playwright";

const base = process.env.EBIRFORMS_URL ?? "http://127.0.0.1:10900";
const profile = "profile/84653210700000.xml";
const token = /name="ebf-token" content="([^"]+)"/.exec(await (await fetch(base + "/")).text())?.[1] ?? "";
const vfs = (req) => fetch(base + "/__vfs", { method: "POST", headers: { "content-type": "application/json", "x-ebf-token": token }, body: JSON.stringify(req) }).then((r) => r.json());
const profile_text = (await vfs({ op: "read", path: profile })).text;

const forms = process.argv.slice(2).length ? process.argv.slice(2) : ["1701", "1601F", "1702MX", "1700v2018", "1702RT", "0605"];
const browser = await webkit.launch();
for (const code of forms) {
  await vfs({ op: "write", path: profile, text: profile_text.replace(/formType=[^<]*formType=/, `formType=${code}formType=`) });
  const p = await browser.newPage();
  p.on("dialog", (d) => d.accept());
  const t0 = Date.now();
  await p.goto(`${base}/legacy/forms/BIR-Form${code}.hta?xmlBGInfoFileName=${profile}`, { waitUntil: "domcontentloaded" });
  const ok = await p.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => /DELA CRUZ/.test(i.value)), { timeout: 20000 }).then(() => true).catch(() => false);
  console.log(`${code.padEnd(12)} ${ok ? (Date.now() - t0) + "ms" : "NO-PREFILL"}`);
  await p.close();
}
await browser.close();
