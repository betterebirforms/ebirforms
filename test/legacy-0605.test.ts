// P0 benchmark: BIR Form 0605 runs unmodified in WebKit (the macOS WKWebView engine) behind the shim,
// saves a savefile our codec reads back, and reopens it with every field restored.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { webkit, type Browser } from "playwright";
import { createLegacyHost } from "../host/legacy-server";
import { getValue, legacyUnescape, profileToSavefile, readSavefile, writeSavefile } from "../src/lib/savefile";

const ORIGINAL = "vendor/original";
// EBIRFORMS_HOST_URL + EBIRFORMS_HOST_DATA run the same flow against another host (e.g. the packaged app's Rust host).
// Start that host with EBF_DISPATCH_HOST=127.0.0.1:9 — its Submit asks BIR's real dispatcher otherwise.
const external_url = process.env.EBIRFORMS_HOST_URL;
const has_original = external_url ? true : existsSync(`${ORIGINAL}/forms/BIR-Form0605.hta`);

describe.skipIf(!has_original)("legacy form 0605 in WebKit", () => {
  let server: Server;
  let browser: Browser;
  let base = "";
  const data_dir = process.env.EBIRFORMS_HOST_DATA ?? mkdtempSync(join(tmpdir(), "ebf-data-"));

  beforeAll(async () => {
    browser = await webkit.launch();
    if (external_url) {
      base = external_url.replace(/\/$/, "");
      rmSync(join(data_dir, "savefile"), { recursive: true, force: true });
      mkdirSync(join(data_dir, "savefile"), { recursive: true });
      return;
    }
    const handle = createLegacyHost({ original_dir: ORIGINAL, data_dir, shim_url: "/legacy-shim.js", token: "test-token" });
    const shim = readFileSync("public/legacy-shim.js");
    server = createServer((req, res) => {
      if (req.url === "/legacy-shim.js") res.writeHead(200, { "content-type": "text/javascript" }).end(shim);
      else void handle(req, res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    if (!external_url) rmSync(data_dir, { recursive: true, force: true });
  });

  it("fills, saves a codec-readable savefile, and reopens it", async () => {
    const page = await browser.newPage();
    const error: string[] = [];
    const dialog: string[] = [];
    page.on("pageerror", (e) => error.push(e.message));
    page.on("dialog", async (d) => {
      dialog.push(d.message());
      await d.accept();
    });

    // the shell writes the taxpayer profile with OUR codec; the original form must read it
    mkdirSync(join(data_dir, "profile"), { recursive: true });
    const profile = profileToSavefile({
      fn: "DELA CRUZ, JUAN & SONS",
      tin1: "846",
      tin2: "532",
      tin3: "107",
      tin4: "00000",
      rdo: "043",
      lob: "RETAIL",
      regAddr: "1 RIZAL ST. <BLDG A>",
      zip: "1100",
      telNo: "0281234567",
      email: "juan@example.com",
      formType: "0605",
    });
    writeFileSync(join(data_dir, "profile", "84653210700000.xml"), writeSavefile(profile));

    await page.goto(`${base}/legacy/forms/BIR-Form0605.hta?xmlBGInfoFileName=profile/84653210700000.xml`);
    await page.waitForTimeout(2500);

    const fill = async (id: string, value: string) => {
      const field = page.locator(`[id="${id}"]`);
      await field.fill(value);
      await field.dispatchEvent("change");
      await field.dispatchEvent("blur");
    };
    expect(await page.locator('[id="frm0605:txtTaxPayerName"]').inputValue()).toBe("DELA CRUZ, JUAN & SONS");
    await fill("frm0605:txtReturnPeriodMonth", "10");
    await fill("frm0605:txtReturnPeriodDay", "15");
    await fill("frm0605:txtReturnPeriodYear", "2026");
    await fill("frm0605:txtTax19", "1234.50");

    await page.locator('input[type=button][value="Save"]').last().click(); // the form bar, not the File menu
    await page.waitForTimeout(1000);

    expect(error).toEqual([]);
    const saved = readdirSync(join(data_dir, "savefile")).filter((f) => f.endsWith(".xml"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/^84653210700000-0605-\d{14}\.xml$/);
    expect(dialog.some((m) => m.includes("saved successfully"))).toBe(true);

    const file = readSavefile(readFileSync(join(data_dir, "savefile", saved[0]!)));
    expect(getValue(file, "frm0605:txtTIN1")).toBe("846");
    expect(legacyUnescape(getValue(file, "frm0605:txtTaxPayerName")!)).toBe("DELA CRUZ, JUAN & SONS");
    expect(legacyUnescape(getValue(file, "frm0605:txtAddress")!)).toBe("1 RIZAL ST. <BLDG A>");
    expect(file.is_final_copy).toBe(false);
    // the form's own save also wrote the taxpayer profile
    expect(existsSync(join(data_dir, "profile", "84653210700000.xml"))).toBe(true);

    // reopen exactly like the original menu does
    const reopen = await browser.newPage();
    reopen.on("pageerror", (e) => error.push(e.message));
    reopen.on("dialog", (d) => void d.accept());
    await reopen.goto(`${base}/legacy/forms/BIR-Form0605.hta?xmlFileName=savefile/${saved[0]}`);
    await reopen.waitForTimeout(2500);
    expect(await reopen.locator('[id="frm0605:txtTaxPayerName"]').inputValue()).toBe("DELA CRUZ, JUAN & SONS");
    expect(await reopen.locator('[id="frm0605:txtTIN3"]').inputValue()).toBe("107");
    expect(error).toEqual([]);
  }, 120_000);
  it("validates and makes a read-only final copy through BIR's offline path", async () => {
    const page = await browser.newPage();
    const error: string[] = [];
    const dialog: string[] = [];
    page.on("pageerror", (e) => error.push(e.message));
    page.on("dialog", async (d) => {
      dialog.push(d.message());
      await d.accept();
    });
    rmSync(join(data_dir, "savefile"), { recursive: true, force: true });
    mkdirSync(join(data_dir, "savefile"), { recursive: true });
    await page.goto(`${base}/legacy/forms/BIR-Form0605.hta?xmlBGInfoFileName=profile/84653210700000.xml`);
    await page.waitForTimeout(2000);

    const field = (id: string) => page.locator(`[id="${id}"]`);
    const fill = async (id: string, v: string) => {
      await field(id).fill(v);
      await field(id).dispatchEvent("change");
      await field(id).dispatchEvent("blur");
    };
    await field("frm0605:itemFiscalStartMonth:_1").check();
    await field("frm0605:txtClassification:_1").check();
    await fill("frm0605:txtReturnPeriodMonth", "10");
    await fill("frm0605:txtReturnPeriodDay", "15");
    await fill("frm0605:txtReturnPeriodYear", "2026");
    await fill("frm0605:txtDueDateMonth", "10");
    await fill("frm0605:txtDueDateDay", "31");
    await fill("frm0605:txtDueDateYear", "2026");
    await field("frm0605:itemMannerOfPayment:_1").check();
    await field("frm0605:itemModeOfPayment:_3").check();
    // the Tax Type and ATC pickers are <a> links gated on `.disabled == false` (IE-only semantics, shimmed)
    await page.locator("#btnTaxType").click();
    await field("TaxTypeCode1").check();
    await page.evaluate(() => (window as unknown as { getTaxTypeCode: () => void }).getTaxTypeCode());
    await page.locator("#btnATC").click();
    await field("AtcCode1").check();
    await page.evaluate(() => (window as unknown as { getATCCode: () => void }).getATCCode());
    await fill("frm0605:txtTax19", "1234.50");

    await page.locator('input[type=button][value="Validate"]').last().click();
    expect(dialog.at(-1)).toMatch(/Validation successful/);
    await page.locator('input[type=button][value="Submit / Final Copy"]').last().click();
    await page.waitForTimeout(1000);

    expect(error).toEqual([]);
    // BIR's own prompt, then the dispatcher (the dev host never contacts BIR: mode "0") → BIR's offline branch
    // a build that can't submit says so plainly, before and after (issue #1: a user thought Submit had filed)
    expect(dialog.some((m) => m.startsWith("Make a FINAL COPY of this return?") && m.includes("does NOT file returns with BIR"))).toBe(true);
    expect(dialog.some((m) => m.startsWith("This version of eBIRForms does NOT file returns with BIR. Nothing was sent."))).toBe(true);
    // a user read "eBIRForms online" as a feature of this app (2026-11-12): name only ways BIR actually files
    expect(dialog.some((m) => /eBIRForms online/i.test(m))).toBe(false);
    expect(dialog.some((m) => m.includes("not filed yet") && m.includes("paper") && m.includes("eFPS"))).toBe(true);
    expect(dialog.some((m) => m.startsWith("BIR's submission server could not be reached"))).toBe(false);
    expect(dialog.some((m) => m.startsWith("Final copy saved."))).toBe(true);
    const saved = readdirSync(join(data_dir, "savefile")).filter((f) => f.endsWith(".xml"));
    expect(saved).toHaveLength(1);
    const file = readSavefile(readFileSync(join(data_dir, "savefile", saved[0]!)));
    expect(file.is_final_copy).toBe(true);
    expect(getValue(file, "txtFinalFlag")).toBe("3"); // BIR's "final copy made offline"
    expect(file.record.some((r) => /ebirOnline/i.test(r.key))).toBe(false);

    // reopening a final copy is read-only
    const reopen = await browser.newPage();
    reopen.on("dialog", (d) => void d.accept());
    await reopen.goto(`${base}/legacy/forms/BIR-Form0605.hta?xmlFileName=savefile/${saved[0]}`);
    await reopen.waitForTimeout(2500);
    expect(await reopen.locator('[id="frm0605:txtTax19"]').isDisabled()).toBe(true);
  }, 120_000);
});
