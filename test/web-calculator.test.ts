// The web version's 2200A Schedule 1 calculators: each "Calculator" link opens BIR's calculator over the page, its rows
// add, compute into Schedule 1, clear and close as BIR's script does, and the rows survive a save and a reopen.
// Needs `npm run build:web` and Playwright's Chromium. Skips otherwise (CI installs no browser).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { profileToSavefile, writeSavefile } from "@/lib/savefile.ts";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);
const P = "frm2200A:";
const PROFILE = { fn: "DELA CRUZ, JUAN", tin1: "846", tin2: "532", tin3: "107", tin4: "00000", rdo: "043", lob: "DISTILLER", regAddr: "1 RIZAL ST., QUEZON CITY", zip: "1100", telNo: "0281234567", email: "", formType: "2200A" };
const PROFILE_FILE = "846532107.xml";

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: 2200A Schedule 1 calculators", () => {
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

  /** The form with a profile in place; `said` collects every alert and confirm (confirms about printing are refused). */
  const open = async (hash = "") => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    const said: string[] = [];
    page.on("dialog", (d) => {
      said.push(d.message());
      void (/print/i.test(d.message()) ? d.dismiss() : d.accept());
    });
    await page.goto(`${base}/`);
    await page.evaluate(
      async ([name, bytes]) => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("profile", { create: true });
        const w = await (await dir.getFileHandle(name as string, { create: true })).createWritable();
        await w.write(new Uint8Array(bytes as number[]));
        await w.close();
      },
      [PROFILE_FILE, [...writeSavefile(profileToSavefile(PROFILE))]] as const,
    );
    await page.goto(`${base}/form/2200A#profile=${PROFILE_FILE}${hash}`);
    await page.locator(".bir-layout").waitFor();
    await page.locator(`.bir-layout [id="${P}txtForYr"]`).waitFor({ state: "attached" });
    return { page, said };
  };
  const box = (page: Page, id: string) => page.locator(`.bir-layout [id="${P}${id}"]`);
  const shown = (page: Page, id: string) => page.evaluate((i) => (document.querySelector(".bir-layout")!.shadowRoot!.getElementById(i) as HTMLElement).style.display !== "none", id);
  // BIR's calculator buttons: " Add ", " Delete ", " Compute ", " Print ", " Close ", " Clear "
  const calcButton = async (page: Page, name: string, label: string) => page.locator(`.bir-layout [id="Calculator${name}"] input[type=button][value*="${label}"]`);
  const rows = (page: Page, name: string) => page.locator(`.bir-layout [id="divCalculator${name}"] > div`).count();
  const link = (page: Page, k: number) => page.locator(".bir-layout #modalSched1 a", { hasText: "Calculator" }).nth(k);
  const cell = (page: Page, name: string, row: number, col: number) => page.locator(`.bir-layout [id="divCalculator${name}"] > div`).nth(row - 1).locator("input[type=text]").nth(col - 2);
  const header = async (page: Page) => {
    await box(page, "txtMonth1").selectOption("03");
    await box(page, "txtDate").fill("15");
    await box(page, "txtForYr").fill("2018");
    await box(page, "txtForYr").blur();
    await box(page, "txtPSIC").fill("1101");
    await box(page, "chkPymntManner_1").check();
    await box(page, "btnSched1").evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => shown(page, "modalSched1")).toBe(true);
  };

  it("eleven Calculator links open a calculator over the page; Close brings Schedule 1 back", async () => {
    const { page } = await open();
    await header(page);
    expect(await page.locator(".bir-layout #modalSched1 a", { hasText: "Calculator" }).count()).toBe(11);
    const name = ["XA035Bottle", "XA035Bulk", "XA036Bottle", "XA036Bulk", "XA061", "XA062", "XA070", "XA080", "XA055", "XA056", "XA057"];
    for (const [k, n] of name.entries()) {
      if (k < 4) continue; // the XA035 / XA036 links hold each other to account (next test)
      await link(page, k).click();
      expect(await shown(page, `Calculator${n}`), n).toBe(true);
      expect(await shown(page, "modalSched1"), n).toBe(false);
      await (await calcButton(page, n, "Close")).click();
      expect(await shown(page, `Calculator${n}`), n).toBe(false);
      expect(await shown(page, "modalSched1"), n).toBe(true);
    }
    await page.close();
  }, 60_000);

  it("openDialogForATC3536: a lone Bulk calculator must be paired before the Bottle one opens", async () => {
    const { page, said } = await open();
    await header(page);
    await link(page, 1).click(); // XA035 Bulk
    await (await calcButton(page, "XA035Bulk", "Add")).click();
    await (await calcButton(page, "XA035Bulk", "Close")).click();
    await link(page, 0).click(); // XA035 Bottle
    expect(said.at(-1)).toBe("Please fill up XA036 Specific Tax (Bulk) Calculator first.");
    expect(await shown(page, "CalculatorXA035Bottle")).toBe(false);
    expect(await shown(page, "modalSched1")).toBe(true);
    await page.close();
  }, 60_000);

  it("XA061: rows, BIR's keypress filter, Compute into Schedule 1, its alerts, Delete, Clear, and a save that reopens the same", async () => {
    const { page, said } = await open();
    await header(page);
    await link(page, 4).click();
    const add = await calcButton(page, "XA061", "Add");
    await add.click();
    await expect.poll(() => rows(page, "XA061")).toBe(1);
    await cell(page, "XA061", 1, 2).fill("champagne");
    await cell(page, "XA061", 1, 3).pressSequentially("a2x0"); // wholenumber(): digits only
    await cell(page, "XA061", 1, 4).fill("12");
    await cell(page, "XA061", 1, 6).pressSequentially("0.7b5");
    await cell(page, "XA061", 1, 6).blur();
    expect(await cell(page, "XA061", 1, 2).inputValue()).toBe("CHAMPAGNE");
    expect(await cell(page, "XA061", 1, 3).inputValue()).toBe("20");
    // C = A x B, E = C x D: 240 bottles x 0.75 L = 180.00
    expect(await cell(page, "XA061", 1, 5).inputValue()).toBe("240");
    expect(await cell(page, "XA061", 1, 7).inputValue()).toBe("180.00");
    expect(await page.locator('.bir-layout [id="CalcSubTotalXA061"]').inputValue()).toBe("180.00");
    // Compute writes the sub-total into the taxable box, and its 2018 rate (304.16) gives the due
    await (await calcButton(page, "XA061", "Compute")).click();
    expect(said.at(-1)).toBe("You are advised to print this computation.");
    expect(await box(page, "xa2_taxable1").inputValue()).toBe("180.00");
    expect(await box(page, "xa2_exciseTaxDue1").inputValue()).toBe("54,748.80");
    expect((await page.locator('.bir-layout [id="dateComputedXA061"]').textContent())?.trim()).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4} {2}\d\d:\d\d [ap]m$/);
    // a second, empty row: Compute refuses with BIR's words, and Delete takes out the ticked row
    await add.click();
    await (await calcButton(page, "XA061", "Compute")).click();
    expect(said.at(-1)).toBe("Please enter a valid Description at Row 2.");
    await cell(page, "XA061", 2, 2).fill("x");
    await (await calcButton(page, "XA061", "Compute")).click();
    expect(said.at(-1)).toBe("No. of Cases at Row 2 should be greater than zero.");
    await page.locator('.bir-layout [id="divCalculatorXA061"] > div').nth(1).locator("input[type=checkbox]").check();
    await (await calcButton(page, "XA061", "Delete")).click();
    await expect.poll(() => rows(page, "XA061")).toBe(1);
    // Add on a half-filled table is refused the same way
    await add.click();
    await add.click();
    expect(said.at(-1)).toBe("Please enter a valid Description at Row 2.");
    await page.locator('.bir-layout [id="divCalculatorXA061"] > div').nth(1).locator("input[type=checkbox]").check();
    await (await calcButton(page, "XA061", "Delete")).click();
    // Close, OK on Schedule 1: item 18 holds the total
    await (await calcButton(page, "XA061", "Close")).click();
    await page.locator(`.bir-layout [id="${P}btnOK"]`).click();
    await expect.poll(() => box(page, "txtTax18").inputValue()).toBe("54,748.80");
    // Save, and reopen from the savefile: the row, its computed columns and Schedule 1 come back
    await page.locator(".bir-layout input[type=button][value=Save] >> visible=true").last().click();
    await expect.poll(() => said.at(-1)).toMatch(/savefile\/\S+\.xml/);
    const name = said.at(-1)!.match(/savefile\/(\S+\.xml)/)?.[1];
    expect(name, `Save said: ${said.at(-1)}`).toBeTruthy();
    const text = await page.evaluate(async (n) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("savefile");
      return (await (await dir.getFileHandle(n)).getFile()).text();
    }, name!);
    expect(text).toContain("CHAMPAGNE");
    expect(text).toContain("frm2200A:CalXA061_1_Col7=180.00");
    expect(text).toContain("frm2200A:txtCtrmodalCalculatorXA061=1");
    await page.goto(`${base}/form/2200A#profile=${PROFILE_FILE}&file=${encodeURIComponent(name!)}`);
    await page.locator(`.bir-layout [id="${P}txtForYr"]`).waitFor({ state: "attached" });
    await expect.poll(() => box(page, "xa2_taxable1").inputValue()).toBe("180.00");
    await box(page, "btnSched1").evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await link(page, 4).click();
    await expect.poll(() => rows(page, "XA061")).toBe(1);
    expect(await cell(page, "XA061", 1, 2).inputValue()).toBe("CHAMPAGNE");
    expect(await cell(page, "XA061", 1, 7).inputValue()).toBe("180.00");
    // Clear asks, then empties the table and zeroes the Schedule 1 box
    await (await calcButton(page, "XA061", "Clear")).click();
    expect(said.at(-1)).toBe("Values inputted will be deleted. Do you want to continue?");
    await expect.poll(() => rows(page, "XA061")).toBe(0);
    expect(await box(page, "xa2_taxable1").inputValue()).toBe("0.00");
    await page.close();
  }, 90_000);

  it("XA036 Bottle + Bulk are one Schedule 1 box; BIR opens them only in the order its alerts allow", async () => {
    const { page, said } = await open();
    await header(page);
    const fill = async (name: string, value: Array<[number, string]>) => {
      await (await calcButton(page, name, "Add")).click();
      for (const [col, v] of value) await cell(page, name, 1, col).fill(v);
      await cell(page, name, 1, value.at(-1)![0]).blur();
    };
    await link(page, 3).click(); // XA036 Bulk opens first
    await fill("XA036Bulk", [[2, "rum"], [3, "1000.5"], [4, "45"]]);
    await expect.poll(() => cell(page, "XA036Bulk", 1, 6).inputValue()).toBe("900.45");
    await (await calcButton(page, "XA036Bulk", "Close")).click();
    await link(page, 2).click(); // XA036 Bottle: BIR wants XA035 Bulk done first
    expect(said.at(-1)).toBe("Please fill up XA035 Ad Valorem Tax (Bulk) Calculator first.");
    await link(page, 1).click(); // XA035 Bulk
    await fill("XA035Bulk", [[2, "gin"], [3, "10000"], [4, "45"]]);
    await expect.poll(() => cell(page, "XA035Bulk", 1, 6).inputValue()).toBe("9,000.00");
    await (await calcButton(page, "XA035Bulk", "Compute")).click();
    expect(await box(page, "xa1_taxable1").inputValue()).toBe("9,000.00");
    await (await calcButton(page, "XA035Bulk", "Close")).click();
    await link(page, 2).click(); // XA036 Bottle now opens
    await fill("XA036Bottle", [[2, "brandy"], [3, "10"], [4, "12"], [6, "0.75"], [7, "40"]]);
    await expect.poll(() => cell(page, "XA036Bottle", 1, 9).inputValue()).toBe("0.600");
    expect(await cell(page, "XA036Bottle", 1, 10).inputValue()).toBe("72.00");
    // XA036's one Schedule 1 box takes Bottle + Bulk: 72.00 + 900.45
    await (await calcButton(page, "XA036Bottle", "Compute")).click();
    expect(await box(page, "xa1_taxable2").inputValue()).toBe("972.45");
    await page.close();
  }, 90_000);
});

