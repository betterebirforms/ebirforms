// Screenshots of the built web version (dist-web) at given sizes, headless, for looking at a change.
//   node bench/shot.mjs <out-dir> "<path>,<width>,<height>,<name>" ...
// A width under 600 is shown as a phone (touch, mobile viewport).
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const WEB = "dist-web";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".gif": "image/gif", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp" };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]);
  const file = join(WEB, url);
  const hit = url !== "/" && existsSync(file) && extname(file) ? file : join(WEB, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(hit)] ?? "application/octet-stream" }).end(readFileSync(hit));
}).listen(0, "127.0.0.1");
await new Promise((r) => server.on("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const [out, ...spec] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const s of spec) {
  const [path, w, h, name] = s.split(",");
  const phone = Number(w) < 600;
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, isMobile: phone, hasTouch: phone });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
}
await browser.close();
server.close();
