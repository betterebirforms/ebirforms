// `npm run asset:nsis`: renders the Windows installer's pictures from asset/brand/installer/*.html into
// src-tauri/installer/sidebar.bmp (164 x 314, welcome and finish screens) and header.bmp (150 x 57, every other
// screen). The installer (NSIS) takes classic 24-bit, bottom-up BMP files, written here by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit } from "playwright";

/** 24-bit BMP from RGBA pixels (rows padded to 4 bytes, stored bottom row first). */
function bmp(width, height, rgba) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * height);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * height, 34);
  for (let y = 0; y < height; y++) {
    const at = 54 + (height - 1 - y) * row;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[at + x * 3] = rgba[i + 2];
      buf[at + x * 3 + 1] = rgba[i + 1];
      buf[at + x * 3 + 2] = rgba[i];
    }
  }
  return buf;
}

const out = resolve("src-tauri/installer");
mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
for (const [name, width, height] of [["sidebar", 164, 314], ["header", 150, 57]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto("file://" + resolve(`asset/brand/installer/${name}.html`));
  await page.waitForLoadState("networkidle");
  const png = (await page.screenshot()).toString("base64");
  const rgba = await page.evaluate(async ([src, w, h]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, w, h).data);
  }, [png, width, height]);
  writeFileSync(`${out}/${name}.bmp`, bmp(width, height, rgba));
  await page.close();
}
await browser.close();
console.log(`installer pictures: ${out}/sidebar.bmp, ${out}/header.bmp`);
