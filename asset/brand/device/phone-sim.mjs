// The phone in the share card (og.py): the web version's Profile screen, filled in, photographed inside the iPhone
// simulator (real iOS WebKit, system font, status bar, Dynamic Island and screen mask). Nothing is drawn over the page.
// `simctl boot` opens no window. Needs Xcode and an iPhone 17 Pro simulator. Run after `npm run build:web`:
//   node asset/brand/device/phone-sim.mjs dist-web asset/brand/device/shot   → shot/phone.png (1206 x 2622)
// The web view (phone-sim/main.swift) is built for this and never ships.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import os from "node:os";

const HERE = join(fileURLToPath(new URL(".", import.meta.url)), "phone-sim");
const BUNDLE = "io.github.betterebirforms.phone-sim";
const run = (cmd, ...rest) => execFileSync(cmd, rest, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sim = (...rest) => run("xcrun", "simctl", ...rest);
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000));
const listDevice = () => Object.values(JSON.parse(sim("list", "devices", "available", "-j")).devices).flat();
function buildShell(dir) {
  const app = join(dir, "PhoneSim.app");
  mkdirSync(app, { recursive: true });
  copyFileSync(join(HERE, "Info.plist"), join(app, "Info.plist"));
  run("xcrun", "--sdk", "iphonesimulator", "swiftc", "-target", "arm64-apple-ios17.0-simulator", "-sdk", run("xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"), join(HERE, "main.swift"), "-o", join(app, "PhoneSim"));
  run("codesign", "-s", "-", "--force", app);
  return app;
}
// boots the device (no window), photographs the page, leaves the device as it was
async function withDevice(device, app, body) {
  const wasBooted = device.state === "Booted";
  try {
    if (!wasBooted) sim("boot", device.udid);
    sim("bootstatus", device.udid, "-b");
    sim("status_bar", device.udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active", "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "discharging", "--batteryLevel", "100");
    sim("install", device.udid, app);
    await body(async ({ url, script, wait, file }) => {
      process.env.SIMCTL_CHILD_PF_URL = url;
      process.env.SIMCTL_CHILD_PF_JS = script;
      try { sim("terminate", device.udid, BUNDLE); } catch { /* not running */ }
      sim("launch", device.udid, BUNDLE);
      await pause(wait);
      sim("io", device.udid, "screenshot", "--type=png", "--mask=alpha", file);
      sim("terminate", device.udid, BUNDLE);
    });
  } finally {
    try { sim("status_bar", device.udid, "clear"); sim("uninstall", device.udid, BUNDLE); } catch { /* the device did not come up */ }
    if (!wasBooted) { try { sim("shutdown", device.udid); } catch { /* already down */ } }
  }
}
const [WEB, OUT] = process.argv.slice(2);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp", ".gif": "image/gif", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]);
  const f = join(WEB, p); const hit = p !== "/" && existsSync(f) && extname(f) ? f : join(WEB, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(hit)] ?? "application/octet-stream" }).end(readFileSync(hit));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const value = { tin1: "123", tin2: "456", tin3: "788", tin4: "00000", lob: "RETAIL TRADE", fn: "DELA CRUZ, JUAN SANTOS", regAddr: "123 RIZAL ST., BRGY. SAN ANTONIO, PASIG CITY", zip: "1600", telNo: "09171234567", txtEmail: "juan.delacruz@example.com" };
const script = `void (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const rootOf = () => document.querySelector('.bir-layout')?.shadowRoot ?? document;
  for (let i = 0; i < 80 && !rootOf().querySelector('[id="tin1"]'); i++) await sleep(250);   // the page's boxes, not just its frame
  await sleep(500);
  const root = rootOf();
  const box = (id) => root.querySelector('[id="' + id + '"]');
  for (const [id, v] of Object.entries(${JSON.stringify(value)})) { const el = box(id); if (!el) continue; el.focus(); el.value = v; for (const t of ['input', 'keyup', 'change']) el.dispatchEvent(new Event(t, { bubbles: true })); el.blur(); await sleep(80); }
  const rdo = box('rdo'); if (rdo) { rdo.value = '043'; rdo.dispatchEvent(new Event('change', { bubbles: true })); }
  document.activeElement?.blur?.();
  window.scrollTo(0, 0);
})()`;
// iPhone 17 Pro: og.py sets it in Xcode's own frame for that model (DeviceKit chrome phone11, 402 x 874 pt screen)
const device = listDevice().find((d) => d.deviceTypeIdentifier === "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro");
if (!device) throw new Error('no iPhone 17 Pro simulator: xcrun simctl create "iPhone 17 Pro" "iPhone 17 Pro"');
const tmp = mkdtempSync(join(os.tmpdir(), "ebf-phone-"));
try {
  await withDevice(device, buildShell(tmp), async (shoot) => {
    await shoot({ url: `http://127.0.0.1:${server.address().port}/`, script, wait: 16, file: `${OUT}/phone.png` });
  });
} finally { rmSync(tmp, { recursive: true, force: true }); server.close(); }
console.log(`${OUT}/phone.png`);
