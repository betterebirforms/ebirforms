// BIR's "(add more...)" links on 1700, 1700 (2018), 1701A and 1701 open the row editor on the web version (they did
// nothing before: the rebuilt forms modelled only the fixed rows). Needs `npm run build:web` and Playwright's Chromium.
// Skips otherwise (CI installs no browser).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import modal1701 from "@/form/page/1701-modal.json";
import column1701 from "@/form/page/1701-column.json";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);

const LINK: Array<[string, string[]]> = [
  ["1700", ["frm1700:lnkPg2Pt4I12ADDMore", "frm1700:lnkPg3Pt5I6ADDMore", "frm1700:lnkPg3Pt5I11ADDMore", "frm1700:lnkPg3Pt5I17ADDMore", "frm1700:lnkPg3Pt5I20ADDMore", "frm1700:lnkPg3Pt5I7ADDMore", "frm1700:lnkPg3Pt5I10ADDMore"]],
  ["1700v2018", ["addMoreSched1Link"]],
  ["1701A", ["frm1701A:lnkPartIVAMore", "frm1701A:lnkPartIVBMore"]],
  ["1701", [...(modal1701 as Array<{ link: string }>).filter((m) => !m.link.includes("TYPE")).map((m) => m.link), ...(column1701 as Array<{ link: string }>).map((c) => c.link)]],
];

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: (add more...) links open BIR's tables as row editors", () => {
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

  it.each(LINK)("%s: every link opens its editor", async (code, link) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    const dead: string[] = [];
    for (const id of link) {
      await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
      // the links are greyed out until BIR's boxes are in (test/web-add-more-link.test.ts, gate-*-link tests): switch it on here
      await page.locator(`[id="${id}"]`).first().evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
      await page.waitForTimeout(400);
      if ((await page.locator(".schedule-modal h3").count()) !== 1) dead.push(id);
    }
    expect(dead).toEqual([]);
    await page.close();
  }, 180_000);

  // Schedule 1's link is greyed out until items 1 to 4 are filled, as BIR's disableLinkIfEmpty leaves it (the rule: test/picker-add-more.test.ts)
  it("1701: Schedule 1's (add more...) starts greyed out and opens nothing", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.goto(`${base}/form/1701`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const link = page.locator('[id="frm1701:lnkPg5Sc1More"]').first();
    expect(await link.evaluate((e) => (e as HTMLInputElement).disabled)).toBe(true);
    await link.evaluate((e: HTMLElement) => e.click());
    await page.waitForTimeout(400);
    expect(await page.locator(".schedule-modal").count()).toBe(0);
    await page.close();
  }, 60_000);

  it("1701: each of an exempt copy's eleven links opens its editor, rows add and save", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/1701`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await page.locator('[id="frm1701:btnAddAttachmentEX"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => page.locator('[id="frm1701:txtPg1mRegisteredNameEX1"]').count()).toBeGreaterThan(0);
    for (const m of (modal1701 as Array<{ link: string }>).filter((x) => x.link.includes("TYPE"))) {
      const id = m.link.replace("TYPE", "EX1");
      await page.locator(`[id="${id}"]`).first().evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
      await expect.poll(() => page.locator(".schedule-modal h3").count(), { message: id }).toBe(1);
      await page.locator(".schedule-modal button", { hasText: /close|cancel|done|ok/i }).first().click();
      await expect.poll(() => page.locator(".schedule-modal").count(), { message: `${id} closes` }).toBe(0);
    }
    await page.close();
  }, 180_000);
});
