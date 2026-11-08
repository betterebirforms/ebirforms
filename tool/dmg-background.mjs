// `npm run asset:dmg`: renders asset/brand/dmg/background.html into the macOS download's window background,
// src-tauri/dmg/background.tiff (a 760 x 620 point design on a 1500 x 1200 canvas, so a resized window shows more backdrop, not white; with a 2x
// picture inside so it stays sharp on Retina screens).
// macOS only: it needs tiffutil.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { webkit } from "playwright";

const html = resolve("asset/brand/dmg/background.html");
const out = resolve("src-tauri/dmg");
mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: scale });
  await page.goto("file://" + html);
  await page.screenshot({ path: `${out}/background${scale === 2 ? "@2x" : ""}.png` });
  await page.close();
}
await browser.close();
execFileSync("tiffutil", ["-cathidpicheck", `${out}/background.png`, `${out}/background@2x.png`, "-out", `${out}/background.tiff`]);
for (const f of ["background.png", "background@2x.png"]) rmSync(`${out}/${f}`);
console.log(`dmg background: ${out}/background.tiff`);
