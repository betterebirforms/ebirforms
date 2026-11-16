// The web version's row editor (ScheduleTable, opened from a BIR page's "(add more...)" link) lets a filer pick BIR's
// drop-down values and tick BIR's per-row ticks; what is picked stays in the row. Needs `npm run build:web` and
// Playwright's Chromium. Skips otherwise (CI installs no browser).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: the row editor's drop-downs and ticks", () => {
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

  const open = async (code: string) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    return page;
  };
  const click = (page: Awaited<ReturnType<typeof open>>, id: string) => page.locator(`[id="${id}"]`).first().evaluate((e: HTMLElement) => e.click());

  it("1700 item 17: PS / CS is a drop-down, and the pick stays when the editor is reopened", async () => {
    const page = await open("1700");
    const link = "frm1700:lnkPg3Pt5I17ADDMore";
    await click(page, link);
    await page.locator(".schedule-modal button", { hasText: "Add row" }).click();
    const select = page.locator(".schedule-modal tbody tr select");
    expect(await select.count()).toBe(2);
    expect(await select.first().locator("option").allTextContents()).toEqual(["PS", "CS"]);
    expect(await select.first().inputValue()).toBe("PS"); // BIR's selected default
    await select.first().selectOption("CS");
    await page.locator(".schedule-modal button", { hasText: "Done" }).click();
    await expect.poll(() => page.locator(".schedule-modal").count()).toBe(0);
    await click(page, link);
    await expect.poll(() => page.locator(".schedule-modal tbody tr select").first().inputValue()).toBe("CS");
    await page.close();
  }, 60_000);

  it("1601F Schedule I: the treaty and ATC lists are drop-downs, and an ATC fills the rate as BIR's getATCdrpTaxRate does", async () => {
    const page = await open("1601F");
    await click(page, "btnAddSchedI");
    await page.locator(".schedule-modal button", { hasText: "Add row" }).click();
    const select = page.locator(".schedule-modal tbody tr select");
    expect(await select.count()).toBe(2);
    expect(await select.nth(0).inputValue()).toBe("-");
    expect(await select.nth(0).locator("option").nth(1).textContent()).toBe("NA - Not Applicable");
    const atc = select.nth(1);
    const second = (await atc.locator("option").nth(2).getAttribute("value"))!; // the pick list's first code
    await atc.selectOption(second);
    const rate = page.locator(".schedule-modal tbody tr input.money").nth(1);
    await expect.poll(() => rate.inputValue()).toMatch(/^\d+\.\d\d$/);
    expect(Number(await rate.inputValue())).toBeGreaterThan(0);
    await atc.selectOption("NA");
    await expect.poll(() => rate.inputValue()).toBe("0.00");
    await page.close();
  }, 60_000);

  it("1700-v2018 Schedule 1 continuation: Taxpayer / Spouse are ticks, the Spouse one greyed off a joint filing", async () => {
    const page = await open("1700v2018");
    const link = "addMoreSched1Link";
    await click(page, link);
    await page.locator(".schedule-modal button", { hasText: "Add row" }).click();
    const tick = page.locator('.schedule-modal tbody tr input[type="checkbox"]');
    expect(await tick.count()).toBe(2); // the row-selection tick BIR keeps for its Delete is not among them
    expect(await tick.nth(1).isDisabled()).toBe(true);
    await tick.nth(0).check();
    expect(await tick.nth(0).isChecked()).toBe(true);
    await page.locator(".schedule-modal button", { hasText: "Done" }).click();
    await click(page, link);
    await expect.poll(() => page.locator('.schedule-modal tbody tr input[type="checkbox"]').first().isChecked()).toBe(true);
    await page.close();
  }, 60_000);
});
