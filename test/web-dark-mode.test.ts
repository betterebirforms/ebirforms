// BIR drew its pages for IE's defaults: black text on white fields, light controls. The web version's own screens
// follow the system's dark mode, and BIR's layouts used to inherit it: labels went light on BIR's grey and typed
// text white on its white fields. A BIR page must look the same, pixel for pixel, in light and dark mode.
// Needs `npm run build:web` and Playwright's Chromium. Skips otherwise (CI installs no browser).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);
// BIR's main screen, a short form, a long one, and one with schedules
const PAGE = ["/", "/form/0605", "/form/1701Qv2018", "/form/2550Qv2024"];

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: BIR's pages ignore dark mode", () => {
  let server: Server, base: string, browser: Browser;

  beforeAll(async () => {
    const prefix = /src="(\/[^"]*?)assets\//.exec(readFileSync(join(WEB, "index.html"), "utf8"))?.[1] ?? "/";
    server = createServer((req, res) => {
      const url = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]!);
      const path = url.startsWith(prefix) ? `/${url.slice(prefix.length)}` : url;
      const file = join(WEB, path);
      const hit = path !== "/" && existsSync(file) && extname(file) ? file : join(WEB, "index.html");
      res.writeHead(200, { "content-type": MIME[extname(hit)] ?? "application/octet-stream" }).end(readFileSync(hit));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix.replace(/\/$/, "")}`;
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it.each(PAGE)("%s looks the same in light and dark mode", async (path) => {
    const shot: Buffer[] = [];
    for (const colorScheme of ["light", "dark"] as const) {
      const page = await browser.newPage({ colorScheme, viewport: { width: 1100, height: 1400 } });
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
      await page.waitForTimeout(1500); // the engine fills and computes the page after it mounts
      shot.push(await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }));
      // BIR's blue-to-red gradient (<img id="bg">) sits behind the page: an opaque body hides it, in both modes
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      await page.close();
    }
    expect(shot[0]!.equals(shot[1]!)).toBe(true);
  }, 60_000);
});
