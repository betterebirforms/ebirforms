#!/usr/bin/env node
// Copy BIR's artwork that the native forms show from the recovered tree into the committed asset/bir/ (README
// "Legal": government works, bundled freely). Re-run after importing a newer BIR package.
//   - header.png       the "Republic of the Philippines / Bureau of Internal Revenue" banner with the seal
//   - barcode/<DIR>/   the per-page barcode BIR prints on every form page (img/<DIR>_BarCode/), e.g. "1601-FQ 01/18 P1"
//   - barcode.json     form code → its barcode images in page order, read from the <img> tags of each form page
//                      (BIR's file names don't encode the page reliably; the form that prints them does)
//   node tool/asset-extract.mjs [vendor/original]
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? "vendor/original");
const img = join(root, "img");
if (!existsSync(img)) {
  console.error(`no ${img} — run npm run extract first`);
  process.exit(2);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../asset/bir");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "barcode"), { recursive: true });

copyFileSync(join(img, "bir_logo_complete.png"), join(out, "header.png"));
let count = 1;
for (const dir of readdirSync(img).filter((d) => d.endsWith("_BarCode")).sort()) {
  const code = dir.slice(0, -"_BarCode".length);
  mkdirSync(join(out, "barcode", code));
  for (const file of readdirSync(join(img, dir)).filter((f) => /\.(png|jpe?g)$/i.test(f))) {
    copyFileSync(join(img, dir, file), join(out, "barcode", code, file));
    count++;
  }
}

const barcode = {};
for (const file of readdirSync(join(root, "forms")).filter((f) => /^BIR-Form.+\.hta$/.test(f)).sort()) {
  const html = readFileSync(join(root, "forms", file), "latin1");
  const page = [];
  for (const m of html.matchAll(/img\/([^"'/]+)_BarCode\/([^"'?]+\.(?:png|jpe?g))/gi)) {
    // BIR's <img> casing differs from the files (1702EX_p1 vs 1702Ex_p1, 1702EXv2018V2 vs …v2) — record the on-disk
    // names, which a case-sensitive filesystem and the bundler need
    const same = (a) => (b) => a.toLowerCase() === b.toLowerCase();
    const dir = readdirSync(join(out, "barcode")).find(same(m[1]));
    const name = dir && readdirSync(join(out, "barcode", dir)).find(same(m[2]));
    const rel = name && `${dir}/${name}`;
    if (rel && !page.includes(rel)) page.push(rel);
  }
  if (page.length) barcode[file.slice("BIR-Form".length, -".hta".length)] = page;
}
writeFileSync(join(out, "barcode.json"), JSON.stringify(barcode, null, 1) + "\n");
console.log(`${count} BIR image → asset/bir/ ; barcode pages for ${Object.keys(barcode).length} form`);
