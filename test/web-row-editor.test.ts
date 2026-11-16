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
  // the links are greyed until BIR's boxes are in (test/web-add-more-link.test.ts covers that rule): switch one on here
  const click = (page: Awaited<ReturnType<typeof open>>, id: string) =>
    page.locator(`[id="${id}"]`).first().evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));

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
    // a new row's boxes stay greyed until Taxpayer or Spouse is ticked (BIR's addRow_schedule1 adds them disabled)
    const text = page.locator('.schedule-modal tbody tr input:not([type="checkbox"])');
    expect(await text.first().isDisabled()).toBe(true);
    await tick.nth(0).check();
    expect(await tick.nth(0).isChecked()).toBe(true);
    expect(await text.first().isDisabled()).toBe(false);
    // unticking empties the row as enabledSched1ColumnField does: names and TIN blank, amounts 0.00, greyed again
    await text.first().fill("ACME CORP");
    await text.last().fill("1500");
    await text.last().press("Tab");
    await tick.nth(0).uncheck();
    expect(await text.first().inputValue()).toBe("");
    expect(await text.last().inputValue()).toBe("0.00");
    expect(await text.first().isDisabled()).toBe(true);
    await tick.nth(0).check();
    await page.locator(".schedule-modal button", { hasText: "Done" }).click();
    await click(page, link);
    await expect.poll(() => page.locator('.schedule-modal tbody tr input[type="checkbox"]').first().isChecked()).toBe(true);
    await page.close();
  }, 60_000);

  it("1700 Part IV employers: amounts stay greyed until a tick is on and the name and TIN are in", async () => {
    const page = await open("1700");
    await click(page, "frm1700:lnkPg2Pt4AddLink");
    await page.locator(".schedule-modal button", { hasText: "Add row" }).click();
    const row = page.locator(".schedule-modal tbody tr").first();
    const box = row.locator('input:not([type="checkbox"])');
    const amount = box.nth(5);
    expect(await amount.isDisabled()).toBe(true);
    await row.locator('input[type="checkbox"]').first().check();
    expect(await box.first().isDisabled()).toBe(false);
    expect(await amount.isDisabled()).toBe(true); // a tick alone is not enough
    await box.nth(0).fill("ACME CORP");
    for (const [i, v] of [[1, "123"], [2, "456"], [3, "789"]] as const) await box.nth(i).fill(v);
    expect(await amount.isDisabled()).toBe(false);
    await page.close();
  }, 60_000);

  it("1701 (2018) attachment: BIR's regime radios are set by the attachment's kind and stay read-only", async () => {
    const page = await open("1701v2018");
    await page.locator('[id="frm1701:rdoPg1mOption2"]').first().evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await click(page, "frm1701:btnAddAttachmentEX");
    const exempt = page.locator('[id="frm1701:rdoPg3mExemptEX1"]').first();
    const special = page.locator('[id="frm1701:rdoPg3mSpecialRateEX1"]').first();
    await expect.poll(() => exempt.count()).toBe(1);
    await expect.poll(() => exempt.evaluate((e) => (e as HTMLInputElement).checked)).toBe(true);
    expect(await special.evaluate((e) => (e as HTMLInputElement).checked)).toBe(false);
    // the user cannot move the regime: both radios are greyed, as BIR's setTaxRegime leaves them
    expect(await special.evaluate((e) => (e as HTMLInputElement).disabled)).toBe(true);
    expect(await exempt.evaluate((e) => (e as HTMLInputElement).getAttribute("value"))).not.toBe("false");
    await page.close();
  }, 60_000);
});
