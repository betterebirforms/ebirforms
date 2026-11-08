// Save/reopen sweep over every BIR form in WebKit: open the blank form under a profile, press Save (the form bar's
// btnSave, or File→Save's saveXML(false) where BIR keeps btnSave disabled until filled), then reopen what was written.
// Not part of the gate (~6 min): EBF_SAVE=1 npx vitest run test/save-sweep.test.ts  (or EBF_SAVE=0605,1701Q).
// EBIRFORMS_HOST_URL + EBIRFORMS_HOST_DATA run it against the packaged Rust host
// (`cargo run --example host -- dist vendor/original <data> <port>`, started with EBF_DISPATCH_HOST=127.0.0.1:9).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webkit, type Browser } from "playwright";
import { createLegacyHost } from "../host/legacy-server";
import { profileToSavefile, writeSavefile } from "../src/lib/savefile";

const ORIGINAL = "vendor/original";
const want = process.env.EBF_SAVE;
const external_url = process.env.EBIRFORMS_HOST_URL;
const form = existsSync(`${ORIGINAL}/forms`)
  ? readdirSync(`${ORIGINAL}/forms`)
      .filter((f) => /^BIR-Form.+\.hta$/.test(f))
      .map((f) => f.replace(/^BIR-Form|\.hta$/g, ""))
      .filter((c) => want === "1" || want?.split(",").includes(c))
  : [];
/** Page errors BIR's own code throws on reopen (they fire on Windows too) — same ledger as test/parity.test.ts. */
const BIR_REOPEN_ERROR: Record<string, string> = {
  "1602Qv2018": "null is not an object (evaluating 'd.getElementById(rate).value')", // row 15 passes a literal 6 as an id
};
const TIN = "84653210700000";

describe.runIf(want && form.length)("every BIR form saves through the shim and reopens", () => {
  let server: Server | undefined;
  let browser: Browser;
  let base = "";
  const data_dir = process.env.EBIRFORMS_HOST_DATA ?? mkdtempSync(join(tmpdir(), "ebf-save-"));

  beforeAll(async () => {
    browser = await webkit.launch();
    if (external_url) base = external_url.replace(/\/$/, "");
    else {
      const handle = createLegacyHost({ original_dir: ORIGINAL, data_dir, shim_url: "/legacy-shim.js", token: "test-token" });
      const shim = readFileSync("public/legacy-shim.js");
      server = createServer((req, res) => {
        if (req.url === "/legacy-shim.js") res.writeHead(200, { "content-type": "text/javascript" }).end(shim);
        else void handle(req, res);
      });
      await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }
    mkdirSync(join(data_dir, "profile"), { recursive: true });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    if (!external_url) rmSync(data_dir, { recursive: true, force: true });
  });

  it.each(form)("%s", async (code) => {
    rmSync(join(data_dir, "savefile"), { recursive: true, force: true });
    mkdirSync(join(data_dir, "savefile"), { recursive: true });
    const profile = { fn: "DELA CRUZ, JUAN", tin1: "846", tin2: "532", tin3: "107", tin4: "00000", rdo: "043", lob: "RETAIL", regAddr: "1 RIZAL ST.", zip: "1100", telNo: "0281234567", email: "juan@example.com", formType: code };
    writeFileSync(join(data_dir, "profile", `${TIN}.xml`), writeSavefile(profileToSavefile(profile)));

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const error: string[] = [];
    const dialog: string[] = [];
    page.on("pageerror", (e) => error.push(e.message));
    page.on("dialog", (d) => {
      dialog.push(d.message());
      void d.accept();
    });
    await page.goto(`${base}/legacy/forms/BIR-Form${code}.hta?xmlBGInfoFileName=profile/${TIN}.xml`);
    await page.waitForTimeout(2000);
    const save = page.locator("#btnSave:enabled");
    if (await save.count()) await save.first().click();
    else await page.evaluate("saveXML(false)");
    await page.waitForTimeout(1200);
    await page.close();
    expect(error).toEqual([]);

    const saved = readdirSync(join(data_dir, "savefile")).filter((f) => f.endsWith(".xml"));
    if (!saved.length) {
      // a blank form BIR refuses to save says why (its own required-field check), never fails silently
      expect(dialog.length, "no savefile and no message").toBeGreaterThan(0);
      expect(dialog.some((m) => /saved successfully/.test(m))).toBe(false);
      return;
    }
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(new RegExp(`^${TIN}-${code}-`));
    expect(dialog.some((m) => m.startsWith("BIR Form saved successfully as : savefile/"))).toBe(true);

    const reopen = await browser.newPage();
    const reopen_error: string[] = [];
    reopen.on("pageerror", (e) => reopen_error.push(e.message));
    reopen.on("dialog", (d) => void d.accept());
    await reopen.goto(`${base}/legacy/forms/BIR-Form${code}.hta?xmlFileName=savefile/${saved[0]}`);
    await reopen.waitForTimeout(2000);
    const tin_restored = await reopen.evaluate(() => Array.from(document.querySelectorAll("input")).some((i) => i.value === "846"));
    await reopen.close();
    expect(reopen_error.filter((e) => e !== BIR_REOPEN_ERROR[code])).toEqual([]);
    expect(tin_restored).toBe(true);
  }, 30_000);
});
