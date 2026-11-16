// BIR drew its pages for IE's defaults: black text on white fields, light controls. The web version's own screens
// follow the system's dark mode, and BIR's layouts used to inherit it: labels went light on BIR's grey and typed
// text white on its white fields. A BIR page must look the same, pixel for pixel, in light and dark mode.
// Needs `npm run build:web` and Playwright's Chromium. Skips otherwise (CI installs no browser).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "playwright";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);
// BIR's main screen, a short form, a long one, and one with schedules
const PAGE = ["/", "/form/0605", "/form/1701Qv2018", "/form/2550Qv2024"];

/** 0605 items 8 and 6 through BIR's own pop-ups: Tax Type IT (its list, OK), then the first ATC the list offers. */
async function pick0605(page: Page) {
  const box = (id: string) => page.locator(`[id="${id}"]`);
  await box("btnTaxType").evaluate((e: HTMLElement) => e.click());
  await box("TaxTypeCode9").check({ force: true });
  await page.locator('#modalTaxTypeCode [id="btnOkPop"]').click();
  await expect.poll(() => box("txtTaxTypeCode").inputValue()).toBe("IT");
  await box("btnATC").evaluate((e: HTMLElement) => e.click());
  await page.locator(".atc-picker tbody tr").first().click();
  await page.locator(".atc-picker button", { hasText: "OK" }).click();
}

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: BIR's pages as BIR's app shows them", () => {
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

  // BIR greys out boxes that only apply after a choice (src/form/lock/, captured from BIR's pages); so does the web
  it("0605: No. of Installment and Others (Specify) open only on their choice, as on BIR's page", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.goto(`${base}/form/0605`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const box = (id: string) => page.locator(`[id="${id}"]`);
    await expect.poll(() => box("frm0605:txtNumOfInstallment").isDisabled()).toBe(true);
    expect(await box("frm0605:txtOthersName").isDisabled()).toBe(true);
    await box("frm0605:itemModeOfPayment:_1").check();
    await expect.poll(() => box("frm0605:txtNumOfInstallment").isDisabled()).toBe(false);
    expect(await box("frm0605:txtOthersName").isDisabled()).toBe(true);
    await box("frm0605:itemMannerOfPayment:_5").check();
    await expect.poll(() => box("frm0605:txtOthersName").isDisabled()).toBe(false);
    await page.close();
  }, 60_000);

  // BIR's Validate locks the form and opens Edit, Print and Submit; Edit opens it again. Print opens BIR's Print
  // Preview (read-only boxes, buttons hidden, File swapped for Print / Cancel Print); Cancel Print puts it back.
  it("0605: Validate locks the form, Edit opens it, Print Preview and Cancel Print as in BIR's app", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const alert: string[] = [];
    page.on("dialog", (d) => void (alert.push(d.message()), d.accept()));
    await page.goto(`${base}/form/0605`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const box = (id: string) => page.locator(`[id="${id}"]`);
    expect(await box("frm0605:cmdEdit").isDisabled()).toBe(true);
    expect(await box("btnPrint").isDisabled()).toBe(true);
    expect(await box("frm0605:btnFinalCopy").isDisabled()).toBe(true);
    const typed = { "frm0605:txtReturnPeriodMonth": "10", "frm0605:txtReturnPeriodDay": "15", "frm0605:txtReturnPeriodYear": "2026", "frm0605:txtTIN1": "846", "frm0605:txtTIN2": "532", "frm0605:txtTIN3": "107", "frm0605:txtBranchCode": "00000", "frm0605:txtTaxPayerName": "JUAN DELA CRUZ" };
    for (const [id, v] of Object.entries(typed)) await box(id).fill(v);
    await box("frm0605:txtRDOCode").selectOption({ index: 1 });
    await pick0605(page);
    await box("frm0605:cmdValidate").click();
    await expect.poll(() => alert.at(-1)).toMatch(/^Validation successful/);
    await expect.poll(() => box("frm0605:cmdValidate").isDisabled()).toBe(true);
    expect(await box("frm0605:txtReturnPeriodDay").isDisabled()).toBe(true);
    expect(await box("frm0605:cmdEdit").isDisabled()).toBe(false);
    expect(await box("frm0605:btnFinalCopy").isDisabled()).toBe(false);
    // Print: BIR's preview
    await box("btnPrint").click();
    await expect.poll(() => box("printMenu").isVisible()).toBe(true);
    expect(await box("formMenu").isVisible()).toBe(false);
    expect(await box("btnSave").isVisible()).toBe(false);
    expect(await box("frm0605:txtTaxPayerName").evaluate((e: HTMLInputElement) => [e.disabled, e.readOnly, e.value])).toEqual([false, true, "JUAN DELA CRUZ"]);
    await page.locator("#printMenu a.toplevel").click();
    await page.locator("#printMenu a", { hasText: "Cancel Print" }).click();
    await expect.poll(() => box("printMenu").isVisible()).toBe(false);
    expect(await box("btnSave").isVisible()).toBe(true);
    expect(await box("frm0605:txtReturnPeriodDay").isDisabled()).toBe(true);
    // Edit: open again, Validate back, Print / Submit off
    await box("frm0605:cmdEdit").click();
    await expect.poll(() => box("frm0605:cmdValidate").isDisabled()).toBe(false);
    expect(await box("frm0605:txtReturnPeriodDay").isDisabled()).toBe(false);
    expect(await box("btnPrint").isDisabled()).toBe(true);
    expect(await box("frm0605:btnFinalCopy").isDisabled()).toBe(true);
    // printing shows BIR's page only, nothing of the app around it
    await page.emulateMedia({ media: "print" });
    expect(await page.evaluate(() => Array.from(document.querySelectorAll("#root > :not(.bir-layout)")).every((e) => getComputedStyle(e).display === "none"))).toBe(true);
    await page.close();
  }, 60_000);

  // Submit / Final Copy: the web can't send, so it makes BIR's offline final copy (txtFinalFlag 3, trailer "0"),
  // locked for good, and says how it reaches BIR. Opened again, it is still locked. Go on the main screen says the same.
  it("0605: Submit makes BIR's offline final copy, locked, and it opens locked again", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
    const dialog: string[] = [];
    page.on("dialog", (d) => void (dialog.push(`${d.type()}: ${d.message()}`), d.accept()));
    await page.goto(`${base}/form/0605`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const box = (id: string) => page.locator(`[id="${id}"]`);
    const typed = { "frm0605:txtReturnPeriodMonth": "10", "frm0605:txtReturnPeriodDay": "15", "frm0605:txtReturnPeriodYear": "2026", "frm0605:txtTIN1": "846", "frm0605:txtTIN2": "532", "frm0605:txtTIN3": "107", "frm0605:txtBranchCode": "00000", "frm0605:txtTaxPayerName": "JUAN DELA CRUZ" };
    for (const [id, v] of Object.entries(typed)) await box(id).fill(v);
    await box("frm0605:txtRDOCode").selectOption({ index: 1 });
    await pick0605(page);
    await box("frm0605:cmdValidate").click();
    await expect.poll(() => dialog.at(-1)).toMatch(/Validation successful/);
    const download = page.waitForEvent("download");
    await box("frm0605:btnFinalCopy").click();
    const file = await download;
    expect(dialog.at(-2)).toMatch(/^confirm: The web version can't send returns to BIR\. Submit makes BIR's final copy/);
    await expect.poll(() => dialog.at(-1)).toMatch(/^alert: Final copy saved as : savefile\/84653210700000-0605-.*\.xml\n\nIt is locked\. To file it/);
    const text = readFileSync((await file.path())!, "latin1");
    expect(text.endsWith("All Rights Reserved BIR 2012.0")).toBe(true);
    expect(text).toContain("txtFinalFlag=3txtFinalFlag=");
    // locked: no Edit, Save or Validate; Print stays, Submit says how to send
    const state = () => Promise.all(["frm0605:cmdEdit", "btnSave", "frm0605:cmdValidate", "btnPrint", "frm0605:btnFinalCopy", "frm0605:txtTaxPayerName"].map((id) => box(id).isDisabled()));
    await expect.poll(state).toEqual([true, true, true, false, false, true]);
    await box("frm0605:btnFinalCopy").click();
    await expect.poll(() => dialog.at(-1)).toMatch(/^alert: This return is a final copy, and the web version can't send/);
    // opened again from the list: still locked
    await page.goto("about:blank");
    await page.goto(`${base}/form/0605#file=${encodeURIComponent(file.suggestedFilename())}`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await expect.poll(() => box("frm0605:txtTaxPayerName").inputValue()).toBe("JUAN DELA CRUZ");
    await expect.poll(state).toEqual([true, true, true, false, false, true]);
    // the main screen's Go menu
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await page.locator("[data-go-menu] a.toplevel").click();
    await page.locator("[data-go-menu] a", { hasText: "Send Returns to BIR" }).click();
    await expect.poll(() => dialog.at(-1)).toMatch(/^alert: The web version can't send returns to BIR.*Submit \/ Final Copy/s);
    await page.locator("[data-go-menu] a.toplevel").click();
    await page.locator("[data-go-menu] a", { hasText: "Show Saved Returns" }).click();
    await expect.poll(() => dialog.at(-1)).toMatch(/^alert: 1 saved return, in this browser\./);
    await page.close();
  }, 90_000);

  // BIR's pick lists: its script builds them, so the web version lists the same codes and fills what BIR fills
  it("ATC pick lists fill the form as BIR's do", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const alert: string[] = [];
    page.on("dialog", (d) => void (alert.push(d.message()), d.accept()));
    const value = (id: string) => page.locator(`[id="${id}"]`).inputValue();
    const go = async (code: string) => {
      await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
    };
    const click = (id: string) => page.locator(`[id="${id}"]`).evaluate((e: HTMLElement) => e.click());
    // 0605: item 6 needs item 8 first, in BIR's words; Tax Type IT lists no PT codes
    await go("0605");
    await click("btnATC");
    await expect.poll(() => alert.at(-1)).toBe("Please select a valid Tax Type  on Item 8.");
    await pick0605(page);
    expect(await value("txtTaxTypeCode")).toBe("IT");
    expect(await value("txtATCCode")).toMatch(/^(?!PT)[A-Z]{2}\d{3}$/);
    // 1601-EQ: eight picks fill the six rows on the page; the rest are under "Other Selected ATC", shown only then
    await go("1601EQ");
    expect(await page.locator('[id="btnOtherTax"]').isVisible()).toBe(false);
    await click("btnAddATCPartII");
    for (let i = 0; i < 8; i++) await page.locator(".atc-picker tbody tr").nth(i).click();
    await page.locator(".atc-picker button", { hasText: "OK" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => value("frm1601EQ:txtAtcCd6")).not.toBe("");
    await click("btnOtherTax");
    await expect.poll(() => page.locator(".schedule-modal tbody tr").count()).toBe(2);
    // 2000-OT: the list is on BIR's page; OK copies the code and its rate (DS125 as BIR writes 0.50)
    await go("2000OT");
    await click("btnATC");
    await page.locator('[id="AtcCode2"]').check({ force: true });
    await page.locator("#modalAtc .ebf-close").click();
    await expect.poll(async () => [await value("frm2000OT:txtATC"), await value("frm2000OT:txtTax15")]).toEqual(["DS125", "0.5"]);
    await page.close();
  }, 90_000);

  // BIR's page jumps and a table's Add button: 2551-Q names its pages #Page<n>; "(From Schedule 1 Item 7)" goes on a
  // page and "(To Part II Item 14)" back; 1707's Add Seller opens the sellers' table
  it("page jumps go to BIR's page, and a table's Add button opens its rows", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.goto(`${base}/form/2551Qv2018`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const shown = (id: string) => page.locator(`[id="${id}"]`).evaluate((e) => getComputedStyle(e).display !== "none");
    await expect.poll(() => shown("Page2")).toBe(false);
    await page.locator("a", { hasText: "(From Schedule 1 Item 7)" }).evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => shown("Page2")).toBe(true);
    expect(await shown("Page1")).toBe(false);
    await page.locator("a", { hasText: "(To Part II Item 14)" }).evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => shown("Page1")).toBe(true);
    await page.goto(`${base}/form/1707v2018`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await page.locator('input[value="Add Seller"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => page.locator(".schedule-modal").count()).toBe(1);
    await page.close();
  }, 60_000);

  // the schedules BIR's script builds: 1602's sections open only when BIR allows (its message otherwise), 2552's
  // Part III and its detail open their rows, 1707A reads BIR's CSV (row 7 becomes OTHERS once "(more...)" is in use),
  // 1700's tax table opens in BIR's dialog, and 1602-Q's schedule boxes go to the schedules' page
  it("BIR's script-built schedules open, read a CSV, and show BIR's dialog", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const alert: string[] = [];
    page.on("dialog", (d) => void (alert.push(d.message()), d.accept()));
    const go = async (code: string) => {
      await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
    };
    const click = (id: string) => page.locator(`[id="${id}"]`).first().evaluate((e: HTMLElement) => e.click());
    const editor = () => page.locator(".schedule-modal h3").first().textContent();
    await go("1602");
    await click("btnSectionB");
    await expect.poll(() => alert.at(-1)).toMatch(/^Section B is only enabled if Item 4 is set to Yes/);
    expect(await page.locator(".schedule-modal").count()).toBe(0);
    await go("2552");
    await click("btnDetailTrans");
    await expect.poll(editor).toBe("Details of Transaction not subject to Percentage Tax");
    await go("2552");
    await click("frm2552:buttAdd");
    await expect.poll(editor).toBe("Part III Summary of Transactions not subject to Tax");
    await go("1707A");
    const csv = Array.from({ length: 9 }, (_, i) => `01/0${i + 1}/2026,STOCK ${String.fromCharCode(65 + i)},${1000 + i},500,${500 + i},${75 + i}`).join("\n");
    const chooser = page.waitForEvent("filechooser");
    await click("btnOpenSched1CSV");
    await (await chooser).setFiles({ name: "sched1.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const value = (id: string) => page.locator(`[id="${id}"]`).inputValue();
    await expect.poll(() => value("frm1707A:txtS1C2NameOfCorporateStockI1")).toBe("STOCK A");
    await expect.poll(() => value("frm1707A:txtS1C2NameOfCorporateStockI7")).toBe("OTHERS");
    await click("btnSched1More");
    await expect.poll(() => page.locator(".schedule-modal tbody tr").count()).toBe(3);
    await go("1700");
    await click("btntablepop");
    await expect.poll(() => page.locator('[id="dialog2"] tr').count()).toBeGreaterThan(4);
    await page.locator('[id="dialog2"] input[value=Close]').click();
    await expect.poll(() => page.locator('[id="dialog2"]').isVisible()).toBe(false);
    await go("2200T");
    await click("frm2200T:btnSchedule1");
    expect(await page.locator('[id="modalSched1"]').isVisible()).toBe(false);
    await page.locator('[id="frm2200T:chkPymntManner_1"]').evaluate((e: HTMLInputElement) => e.click());
    await click("frm2200T:btnSchedule1");
    await expect.poll(() => page.locator('[id="modalSched1"]').isVisible()).toBe(true);
    await click("frm2200T:lnkXT140");
    await expect.poll(() => page.locator(".schedule-modal").count()).toBe(1);
    await go("1602Qv2018");
    await click("frm1602Q:txtSched1");
    await expect.poll(() => page.locator('[id="Page2"]').evaluate((e) => getComputedStyle(e).display !== "none")).toBe(true);
    await page.close();
  }, 120_000);

  // the "(add more...)" / Add / Delete links of the rebuilt forms open their group's editor, and a row typed there lands on the page
  it("Add More, Add and Delete links open their schedule editors", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    const go = async (code: string) => {
      await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
    };
    const click = (id: string) => page.locator(`[id="${id}"]`).first().evaluate((e: HTMLElement) => e.click());
    const editor = () => page.locator(".schedule-modal h3").first().textContent();
    const closeEditor = () => page.reload({ waitUntil: "networkidle" }).then(() => page.locator(".bir-layout").waitFor());
    const open: Array<[string, string, string]> = [
      ["1601Cv2018", "frm1601c:btnAdd", "Schedule 1 Adjustments"],
      ["1601Cv2018", "frm1601c:btnDelete", "Schedule 1 Adjustments"],
      ["1702Qv2018C", "frm1702q:Sched4:btnAdd", "Other Tax Credits / Payments"],
      ["2200Av2020", "frm2200Av2020:btnAdd", "Schedule 1 Other Rows"],
      ["2200Av2020", "frm2200Av2020:btnDelete", "Schedule 1 Other Rows"],
      ["2550Qv2024", "btnNewSched1", "Date Purchased/Imported"],
    ];
    // 1707 / 2552 "(Add More...)" start greyed out, as BIR's Check_Pg2Pt4S2 / Check_Pg2Pt5AddMore leave them on a blank
    // form (the rows-filled condition itself: test/picker-add-more.test.ts)
    for (const [code, id] of [["1707v2018", "btnPg2Pt4Sch2More"], ["1707v2021", "btnPg2Pt4Sch3More"], ["2552v2018", "btnPg2Pt5Sch1More"]] as const) {
      await go(code);
      await expect.poll(() => page.locator(`[id="${id}"]`).first().isDisabled(), { message: `${code} ${id}` }).toBe(true);
    }
    for (const [code, id, title] of open) {
      await go(code);
      await click(id);
      await expect.poll(editor, { message: `${code} ${id}` }).toContain(title);
      await closeEditor();
    }
    // 1707Av2021: its CSV reader fills rows 1-3, row 4 becomes OTHERS once "(more...)" is in use, and the button then opens
    await go("1707Av2021");
    const csv = Array.from({ length: 6 }, (_, i) => `01/0${i + 1}/2021,STOCK ${String.fromCharCode(65 + i)},${1000 + i},500,${500 + i},${75 + i}`).join("\n");
    const chooser = page.waitForEvent("filechooser");
    await click("btnOpenSched1CSV");
    await (await chooser).setFiles({ name: "sched1.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const value = (id: string) => page.locator(`[id="${id}"]`).inputValue();
    await expect.poll(() => value("frm1707Av2021:txtS1C2NameOfCorporateStockI1")).toBe("STOCK A");
    await expect.poll(() => value("frm1707Av2021:txtS1C2NameOfCorporateStockI4")).toBe("OTHERS");
    await click("btnSched1More");
    await expect.poll(() => page.locator(".schedule-modal tbody tr").count()).toBe(3);
    await page.close();
  }, 240_000);

  it("1702Q (2018): Schedule 4 Delete blanks the ticked row and empties the Add pop-up, as BIR's deleteOtherTaxCredits", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/1702Qv2018C`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const box = (id: string) => page.locator(`[id="${id}"]`).first();
    const desc = "frm1702q:Sched4:txtOthrTxCrdts0", amount = "frm1702q:Sched4:txtOthrTxCrdtAmnt0", tick = "frm1702q:Sched4:chkOthrTxCrdts0";
    // Schedule 4 counts only once an ATC is picked (ATCEnableDisableSchedules)
    await box("frm1702q:cbATC_2").selectOption("IC010_25%");
    // the tick box follows its row: greyed out with it, open with it
    await expect.poll(async () => (await box(desc).isDisabled()) === (await box(tick).isDisabled())).toBe(true);
    await page.locator('input[value="Next"]').first().evaluate((e: HTMLElement) => e.click());
    await box(desc).waitFor({ state: "visible" });
    await box(desc).fill("CREDIT A");
    await box(amount).fill("1500");
    await box(amount).press("Tab");
    // Delete stays greyed out until row b holds an amount (enableSched4)
    expect(await box("frm1702q:Sched4:btnDelete").isDisabled()).toBe(true);
    await box("frm1702q:Sched4:txtOthrTxCrdts1").fill("CREDIT B");
    await box("frm1702q:Sched4:txtOthrTxCrdtAmnt1").fill("200");
    await box("frm1702q:Sched4:txtOthrTxCrdtAmnt1").press("Tab");
    await expect.poll(() => box("frm1702q:Sched4:btnDelete").isDisabled()).toBe(false);
    await box(tick).check();
    await box("frm1702q:Sched4:btnDelete").evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => box(desc).inputValue()).toBe("");
    await expect.poll(() => box(amount).inputValue()).toBe("0.00");
    expect(await box(tick).isChecked()).toBe(false);
    expect(await box("frm1702q:Sched4:txtOthrTxCrdtAmnt1").inputValue()).not.toBe("0.00"); // row b, not ticked, stays
    await page.close();
  }, 60_000);

  // a pop-up's own buttons BIR runs from its script: Clear resets its boxes as BIR's clearSched5Modal does
  it("2550M: Clear in schedule 5 resets its boxes to 0.00", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/2550M`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const click = (id: string) => page.locator(`[id="${id}"]`).first().evaluate((e: HTMLElement) => e.click());
    await click("btnSched5");
    const box = page.locator('[id="txtinputtaxSched5"]');
    await box.fill("1,234.00");
    await box.blur();
    await click("btnClearPop5");
    await expect.poll(() => box.inputValue()).toBe("0.00");
    await page.close();
  }, 60_000);

  // a choice never opens a pop-up by itself: BIR's 1701 item 4 radios open its attachment pop-up only in some cases
  it("1701: ticking item 4 keeps the form on screen; an attachment opens in BIR's frame", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/1701`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const display = (id: string) => page.locator(`[id="${id}"]`).evaluate((e) => getComputedStyle(e).display);
    await page.locator('[id="frm1701:rdoPg1Pt1I4Compensation"]').evaluate((e: HTMLElement) => e.click());
    await page.waitForTimeout(300);
    expect([await display("formPaper"), await display("attachmentModalADD")]).toEqual(["block", "none"]);
    // BIR's attachments: Add opens a copy in BIR's frame, its boxes keep what is typed, its pages and Back work
    const shown = (id: string) => page.locator(`[id="${id}"]`).first().evaluate((e) => (e as HTMLElement).offsetParent !== null);
    await page.locator('[id="frm1701:btnAddAttachmentEX"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => display("ATTACHMENT")).toBe("block");
    expect(await display("mainPages")).toBe("none");
    const box = page.locator('[id="frm1701:txtPg1mRegisteredNameEX1"]');
    await expect.poll(() => shown("frm1701:txtPg1mRegisteredNameEX1")).toBe(true);
    expect(await page.locator('[id="attachmentTotal"]').inputValue()).toBe("1");
    await box.fill("ACME TRADING");
    await box.blur();
    await page.locator('[id="attachmentPage2"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => display("Page2mEX1Content")).toBe("block");
    expect(await shown("frm1701:txtPg1mRegisteredNameEX1")).toBe(false);
    await page.locator('[id="frm1701:btnBackToMain"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => display("mainPages")).toBe("block");
    expect(await display("ATTACHMENT")).toBe("none");
    // View opens the copy again, with what was typed
    await page.locator('[id="frm1701:btnViewAttachments"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => display("ATTACHMENT")).toBe("block");
    await expect.poll(() => box.inputValue()).toBe("ACME TRADING");
    await page.close();
  }, 60_000);

  // 1701 (2018): its attachments are rows of two groups; Add shows a new row as a copy of BIR's template
  it("1701v2018: an attachment opens in BIR's frame and keeps what is typed", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/form/1701v2018`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const display = (id: string) => page.locator(`[id="${id}"]`).first().evaluate((e) => getComputedStyle(e).display);
    await page.locator('[id="frm1701:btnAddAttachmentSP"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => display("ATTACHMENT")).not.toBe("none");
    expect(await display("mainPages")).toBe("none");
    expect(await page.locator('[id="attachmentTotal"]').inputValue()).toBe("1");
    const box = page.locator('[id="frm1701:txtPg3mSchedA_1ASP1"]');
    await box.evaluate((e: HTMLInputElement) => (e.disabled = false));
    await box.fill("1,000.00");
    await box.blur();
    await page.locator('[id="frm1701:btnBackToMain"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => display("mainPages")).not.toBe("none");
    await page.locator('[id="frm1701:btnAddAttachmentSP"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => page.locator('[id="attachmentTotal"]').inputValue()).toBe("2");
    await page.locator('[id="attachmentCurrent"]').fill("1");
    await page.locator('[id="attachmentGo"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => box.inputValue()).toBe("1,000.00");
    await page.close();
  }, 60_000);

  // 1702-MX: View Attachments opens BIR's frame on its Add buttons; the first exempt copy asks BIR's question first
  for (const [code, field] of [["1702MX", "frm1702MX:txtPg1EX1ScAI1"], ["1702MXv2018", "frm1702MX:txtPg1EX1ScAI1"], ["1702MXv2018C", "frm1702MX:txtPg1EX1ScAI1"], ["1702MXv2018Cxx", "frm1702MX:txtPg1EX1ScAI1"]] as const)
  it(`${code}: an exempt attachment is added in BIR's frame and keeps what is typed`, async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const asked: string[] = [];
    page.on("dialog", (d) => void (asked.push(d.message()), d.accept()));
    await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    const display = (id: string) => page.locator(`[id="${id}"]`).first().evaluate((e) => getComputedStyle(e).display);
    await page.locator('[id="viewAttachBtn"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => display("ATTACHMENT")).not.toBe("none");
    await page.locator('[id="ATTACHMENT"] input[value="Add Exempt Tax Regime"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => asked.at(-1) ?? "").toMatch(/^Adding Exempt Attachments will remove current values/);
    await expect.poll(() => page.locator('[id="attachmentTotal"]').inputValue()).toBe("1");
    const box = page.locator(`[id="${field}"]`);
    await expect.poll(() => box.evaluate((e) => (e as HTMLElement).offsetParent !== null)).toBe(true);
    await box.evaluate((e: HTMLInputElement) => (e.disabled = false));
    await box.fill("RA 1234");
    await box.blur();
    await page.locator('[id="viewMainBtn"]').evaluate((e: HTMLElement) => e.click());
    await expect.poll(() => display("ATTACHMENT")).toBe("none");
    await page.locator('[id="viewAttachBtn"]').evaluate((e: HTMLInputElement) => ((e.disabled = false), e.click()));
    await expect.poll(() => box.inputValue()).toBe("RA 1234");
    await page.close();
  }, 60_000);

  // Help > <tax type> > BIR Form <X> opens BIR's own help page, from the main screen and from a form (which asks
  // first, as BIR's goToHelpPage does); a target missing from BIR's package says so
  it("Help opens BIR's help pages from the main screen and from a form", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const dialog: string[] = [];
    page.on("dialog", (d) => void (dialog.push(d.message()), d.accept()));
    const help = async (path: string, group: string, item: string) => {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
      await page.locator("a.toplevel", { hasText: /^Help$/ }).first().click();
      await page.locator("a.atoplevel", { hasText: group }).first().click();
      await page.locator("ul.asubnav a", { hasText: new RegExp(`^${item}$`) }).first().click();
    };
    await help("/", "Payment", "BIR Form 0605");
    await page.waitForURL(/\/help\/0605$/);
    await page.locator('.bir-layout[data-form="help-0605"]').waitFor();
    await expect.poll(() => page.locator(".bir-layout").evaluate((e) => e.shadowRoot?.textContent?.includes("0605") ?? false)).toBe(true);
    await help("/form/1701Qv2018", "Income", "BIR Form 1701Q");
    await page.waitForURL(/\/help\/1701Q$/);
    expect(dialog.at(-1)).toMatch(/^Navigating away/);
    await help("/form/2551Qv2018", "Percentage", "BIR Form 2551Q");
    await page.waitForURL(/\/help\/2551$/);
    // File > Main Screen goes home
    await page.locator("a.toplevel", { hasText: "File" }).first().click();
    await page.locator("ul.subnav a", { hasText: "Main Screen" }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("/help/"));
    await page.close();
  }, 90_000);

  // a phone: the main screen and help pages wrap to its width at a readable size (src/form/phone.css); a form keeps
  // BIR's page shrunk to fit, with a Zoom in button that shows it full size, scrolling sideways
  it("on a phone, the main screen and help wrap to the width, and a form zooms in and out", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const look = () =>
      page.locator(".bir-layout").evaluate((e) => {
        const body = e.shadowRoot!.querySelector(".bir-body") as HTMLElement;
        const zoom = e.shadowRoot!.querySelector(".ebf-zoom") as HTMLButtonElement | null;
        return { zoom: body.style.zoom, wide: body.scrollWidth > e.clientWidth + 1, button: zoom && !zoom.hidden ? zoom.textContent : null };
      });
    for (const path of ["/", "/help/0605"]) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
      await expect.poll(look).toEqual({ zoom: "", wide: false, button: null });
    }
    // the main screen's boxes are big enough to tap, and 16 px text stops iOS zooming in on each one
    const box = await page.goto(`${base}/`, { waitUntil: "networkidle" }).then(() => page.locator(".bir-layout #regAddr").boundingBox());
    expect(box!.height).toBeGreaterThanOrEqual(32);
    await page.goto(`${base}/form/0605`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await expect.poll(async () => (await look()).button).toBe("Zoom in");
    expect(Number((await look()).zoom)).toBeLessThan(1);
    await page.locator(".bir-layout .ebf-zoom").tap();
    expect(await look()).toMatchObject({ zoom: "", button: "Fit to screen" });
    await page.locator(".bir-layout .ebf-zoom").tap();
    expect(Number((await look()).zoom)).toBeLessThan(1);
    await page.close();
  }, 60_000);

  // every form: each box BIR greys out (and the capture found a way to open) starts greyed out on the web too
  it("a new form greys out each box BIR greys out, on every form", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const miss: string[] = [];
    for (const file of readdirSync("src/form/lock").filter((f) => f.endsWith(".json"))) {
      const code = file.slice(0, -".json".length);
      const box = Object.keys(JSON.parse(readFileSync(`src/form/lock/${file}`, "utf8")) as Record<string, string[]>);
      if (box.length === 0 || !existsSync(`asset/bir/layout/${code}.html`)) continue;
      await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
      await page.waitForTimeout(800);
      const open = await page.evaluate((ids) => {
        const root = document.querySelector(".bir-layout")!.shadowRoot!;
        return ids.filter((id) => {
          const el = root.getElementById(id) as HTMLInputElement | null;
          return el && !el.disabled && !el.readOnly;
        });
      }, box);
      miss.push(...open.map((id) => `${code} ${id}`));
    }
    await page.close();
    expect(miss).toEqual([]);
  }, 600_000);

  // BIR's blank page preselects some choices (1701Q item 3 "Amended Return? No"); its blank save holds them as
  // "true". A fresh web form must show each one ticked, as BIR's page does, on every form with a layout.
  it("a new form shows BIR's preselected choices ticked, on every form", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const miss: string[] = [];
    for (const file of readdirSync("src/form/template").filter((f) => f.endsWith(".json"))) {
      const code = file.slice(0, -".json".length);
      if (!existsSync(`asset/bir/layout/${code}.html`)) continue;
      const blank = JSON.parse(readFileSync(`src/form/template/${file}`, "utf8")) as string[][];
      const want = blank.filter((r) => r[1] === "true" && r[2]).map((r) => r[0]!);
      if (want.length === 0) continue;
      await page.goto(`${base}/form/${code}`, { waitUntil: "networkidle" });
      await page.locator(".bir-layout").waitFor();
      await page.waitForTimeout(800);
      const off = await page.evaluate((ids) => {
        const root = document.querySelector(".bir-layout")!.shadowRoot!;
        return ids.filter((id) => {
          const el = root.getElementById(id) as HTMLInputElement | null;
          return el && !el.checked;
        });
      }, want);
      miss.push(...off.map((id) => `${code} ${id}`));
    }
    await page.close();
    expect(miss).toEqual([]);
  }, 300_000);
});

// BIR's pages declare XHTML 1.0 Transitional, which browsers render in "almost standards" mode: table rows size
// to their text, not to a full line box. Under `<!doctype html>` every row of BIR's layouts grew (1701Q's Part II
// moved 41 px down) and 0605 differed from the desktop in 111,704 pixels instead of 4,487. Runs without a browser.
describe("web version: BIR's rendering mode", () => {
  it("the web shell uses BIR's doctype", () => {
    expect(readFileSync("index.html", "utf8").split("\n")[0]).toBe(
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    );
  });
});
