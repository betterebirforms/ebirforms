// The "(add more...)" links on the web turn on when BIR's do (src/form/gate1701.ts, gate1701a.ts, gate1700.ts): greyed out on a
// blank form, open once the boxes BIR wants are filled in. Needs `npm run build:web` and Playwright's Chromium. Skips otherwise.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: (add more...) links follow BIR's gate", () => {
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

  it("1701 Schedule 6 item 5 and 1701A Part IV.A: off on a blank form, on once their boxes are in, and the click opens the editor", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    const box = (id: string) => page.locator(`[id="${id}"]`).first();
    const disabled = (id: string) => box(id).evaluate((e: HTMLInputElement) => e.disabled);
    // a typed value, as a filer enters it: BIR's greyed boxes open row by row, so write the box and fire its blur
    const type = (id: string, value: string) =>
      box(id).evaluate((e: HTMLInputElement, v: string) => {
        e.disabled = false;
        e.focus();
        e.value = v;
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.blur();
      }, value);
    const editor = () => page.locator(".schedule-modal h3").count();

    await page.goto(`${base}/form/1701`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const l1701 = "frm1701:lnkPg5Sc3I2More";
    expect(await disabled(l1701)).toBe(true);
    await type("frm1701:txtPg5Sc3I1Description", "RENTAL");
    await type("frm1701:txtPg5Sc3I1TaxPayerC1", "1000");
    await type("frm1701:txtPg5Sc3I2Description", "ROYALTY");
    expect(await disabled(l1701)).toBe(true); // item 2 has no amount yet
    await type("frm1701:txtPg5Sc3I2TaxPayerC1", "500");
    await expect.poll(() => disabled(l1701)).toBe(false);
    await box(l1701).evaluate((e: HTMLElement) => e.click());
    await expect.poll(editor).toBeGreaterThan(0);

    await page.goto(`${base}/form/1701A`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const l1701A = "frm1701A:lnkPartIVAMore";
    expect(await disabled(l1701A)).toBe(true);
    await box("frm1701A:optTaxRate_1").evaluate((e: HTMLElement) => e.click());
    await type("frm1701A:txt41Desc", "RENTAL");
    await type("frm1701A:txt41A", "1000");
    await type("frm1701A:txt42Desc", "ROYALTY");
    expect(await disabled(l1701A)).toBe(true); // item 42's amount is still 0.00
    await type("frm1701A:txt42A", "500");
    await expect.poll(() => disabled(l1701A)).toBe(false);
    await box(l1701A).evaluate((e: HTMLElement) => e.click());
    await expect.poll(editor).toBeGreaterThan(0);
    await page.close();
  }, 120_000);
});
