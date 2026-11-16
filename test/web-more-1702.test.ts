// The "(Add more...)" / "(more...)" links of 1702-RT and 1702-EX (every edition) open their row editor on the web
// version, and what the editor's rows feed shows on BIR's page. Needs `npm run build:web` and Playwright's Chromium;
// skips otherwise (CI installs no browser).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { BUTTON_GROUP } from "@/form/picker.ts";
import { GATE_EX, GATE_EX2018, GATE_RT, GATE_RT2018 } from "@/form/gate1702.ts";

const GATE: Record<string, Record<string, { text: string[]; amount: string[] }>> = { "1702RT": GATE_RT, "1702RTv2018": GATE_RT2018, "1702RTv2018C": GATE_RT2018, "1702EX": GATE_EX, "1702EXv2018": GATE_EX2018, "1702EXv2018C": GATE_EX2018 };

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);
const FORM = ["1702RT", "1702RTv2018", "1702RTv2018C", "1702EX", "1702EXv2018", "1702EXv2018C"];

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: 1702-RT and 1702-EX 'more' links open their tables", () => {
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

  it.each(FORM)("%s: every 'more' link opens its editor", async (code) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await page.waitForTimeout(800);
    const fillHidden = (box: string, value: string) =>
      page.locator(`[id="${box}"]`).first().evaluate((e: HTMLInputElement, v: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, v);
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      }, value);
    const entry = Object.entries(BUTTON_GROUP[code] ?? {});
    expect(entry.length).toBeGreaterThan(4);
    for (const [id, { title }] of entry) {
      // greyed out on a blank form, as BIR's is; it opens once its own boxes hold what BIR's condition asks for
      const gate = GATE[code]?.[id];
      if (gate) {
        expect(await page.locator(`[id="${id}"]`).first().isDisabled(), `${id} blank`).toBe(true);
        for (const box of [...gate.text, ...gate.amount]) {
          // the box sits on a page that is not showing: set it the way React hears a typed value, then leave it
          await fillHidden(box, gate.amount.includes(box) ? "1000" : /Date/.test(box) ? "03/15/2017" : "ITEM");
        }
        await expect.poll(() => page.locator(`[id="${id}"]`).first().isDisabled(), { message: `${id} filled` }).toBe(false);
      }
      await page.locator(`[id="${id}"]`).first().evaluate((e: HTMLElement) => e.click());
      await expect.poll(() => page.locator(".schedule-modal h3").first().textContent(), { message: id }).toBe(title);
      await page.locator(".schedule-modal button", { hasText: /^(Close|Done|OK)/ }).first().click();
      await expect.poll(() => page.locator(".schedule-modal").count()).toBe(0);
    }
    await page.close();
  }, 120_000);

  // what a row typed in the editor feeds: Sch 12 item 4's final tax and a Sch 12 II div both reach item 19, and the
  // Sch 6A item 7 rows turn the line into OTHERS with their subtotals
  it("1702RT: rows typed in the editors feed Sch 12 item 19 and Sch 6A item 7", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/1702RT`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await page.waitForTimeout(800);
    const value = (id: string) => page.locator(`[id="${id}"]`).first().inputValue();
    const open = async (id: string) => {
      // the link is greyed out until its own boxes hold what BIR asks for: type them first, as a filer would
      for (const box of [...(GATE["1702RT"]![id]?.text ?? []), ...(GATE["1702RT"]![id]?.amount ?? [])]) {
        await page.locator(`[id="${box}"]`).first().evaluate((e: HTMLInputElement, v: string) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, v);
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        }, GATE["1702RT"]![id]!.amount.includes(box) ? "1000" : "TYPED LINE");
      }
      await expect.poll(() => page.locator(`[id="${id}"]`).first().isDisabled(), { message: id }).toBe(false);
      await page.locator(`[id="${id}"]`).first().evaluate((e: HTMLElement) => e.click());
      await page.locator(".schedule-modal").waitFor();
    };
    const fill = async (cell: string[]) => {
      await page.locator(".schedule-modal button", { hasText: /^(Add|\+)/ }).first().click();
      const box = page.locator(".schedule-modal tbody tr").last().locator("input");
      for (const [i, v] of cell.entries()) await box.nth(i).fill(v);
    };
    const done = async () => {
      await page.locator(".schedule-modal button", { hasText: /^Done/ }).click();
      await expect.poll(() => page.locator(".schedule-modal").count()).toBe(0);
    };
    await open("btnPg8Sc12I4More");
    await fill(["ROYALTIES", "100000", "10000", "10000"]);
    await done();
    await open("frm1702RT:btnModalPg8Sc12II");
    await fill(["LOT 1", "LOT 2", "T-1", "T-2", "C-1", "C-2", "900000", "800000", "54000", "48000"]);
    await done();
    await expect.poll(() => value("frm1702RT:txtSc12I19TotalFinalTaxWitheld")).toBe("114,000"); // 112,000 from the rows, 2,000 from the two amount boxes the link's own condition made us fill
    await open("btnPg5Sc6AI7More");
    await fill(["2014", "100000", "10000", "5000", "20000"]);
    await done();
    await expect.poll(() => value("frm1702RT:txtPg5Sc6AI7C1")).toBe("OTHERS");
    expect(await value("frm1702RT:txtPg5Sc6AI7C6")).toBe("65,000");
    await page.close();
  }, 120_000);
});
