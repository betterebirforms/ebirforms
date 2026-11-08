import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { webkit, type Browser } from "playwright";
import { createLegacyHost } from "../host/legacy-server.ts";
import { addMoney, formatMoney, parseMoney } from "@/form/money.ts";
import { computeAll, toRecords, type FormState } from "@/form/schema.ts";
import { FORM_0605, validate0605 } from "@/form/form0605.ts";
import { parseSavefile, serializeSavefile, writeSavefile } from "@/lib/savefile.ts";

describe("centavo money (exact, matches BIR's display)", () => {
  it("parses and formats like NumWithComma + formatCurrency", () => {
    expect(parseMoney("1,234.50")).toBe(123450);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("-5")).toBe(-500);
    expect(formatMoney(123450)).toBe("1,234.50");
    expect(formatMoney(5)).toBe("0.05");
    expect(formatMoney(100000000)).toBe("1,000,000.00");
    expect(formatMoney(-123450)).toBe("-1,234.50");
  });

  it("exact sum matches the float result BIR would compute, for realistic amounts", () => {
    // every pair of 2-decimal peso amounts: exact centavo add == BIR's float add, formatted
    for (let i = 0; i < 500; i++) {
      const a = (((i * 7919) % 1_000_000) / 100).toFixed(2);
      const b = (((i * 104729) % 1_000_000) / 100).toFixed(2);
      const exact = formatMoney(addMoney(parseMoney(a), parseMoney(b)));
      const float = (Math.round((Number(a) + Number(b)) * 100) / 100).toFixed(2);
      const floatGrouped = Number(float).toLocaleString("en-US", { minimumFractionDigits: 2 });
      expect(exact).toBe(floatGrouped);
    }
  });
});

describe("0605 compute graph", () => {
  const base: FormState = {
    "frm0605:txtTax19": "1,000.00",
    "frm0605:txtTax20A": "10.50",
    "frm0605:txtTax20B": "20.25",
    "frm0605:txtTax20C": "5.00",
  };
  it("20D = 20A+20B+20C and 21 = 19+20D", () => {
    const out = computeAll(FORM_0605, base);
    expect(out["frm0605:txtTax20D"]).toBe("35.75");
    expect(out["frm0605:txtTax21"]).toBe("1,035.75");
  });
  it("is exact where BIR's float drifts (0.10 + 0.20)", () => {
    const out = computeAll(FORM_0605, { "frm0605:txtTax20A": "0.10", "frm0605:txtTax20B": "0.20", "frm0605:txtTax20C": "0" });
    expect(out["frm0605:txtTax20D"]).toBe("0.30"); // 0.1+0.2 in float is 0.30000000000000004
  });
});

describe("0605 validation", () => {
  const full: FormState = {
    "frm0605:txtReturnPeriodMonth": "10",
    "frm0605:txtReturnPeriodDay": "15",
    "frm0605:txtReturnPeriodYear": "2026",
    "frm0605:txtTIN1": "846",
    "frm0605:txtTIN2": "532",
    "frm0605:txtTIN3": "107",
    "frm0605:txtBranchCode": "00000",
    "frm0605:txtRDOCode": "043",
    "frm0605:txtTaxPayerName": "DELA CRUZ, JUAN",
  };
  it("passes a complete, valid form", () => {
    expect(validate0605(full)).toEqual([]);
  });
  it("flags a missing return period and a bad TIN", () => {
    const bad = { ...full, "frm0605:txtReturnPeriodMonth": "", "frm0605:txtTIN3": "999" };
    const ids = validate0605(bad).map((p) => p.id);
    expect(ids).toContain("frm0605:txtReturnPeriodMonth");
    expect(ids).toContain("frm0605:txtTIN1"); // TIN check-digit failure
  });

  it("never emits the eBIRForms-Online secret fields", () => {
    const rec = toRecords(FORM_0605, { ...full, ebirOnlineSecret: "hunter2", ebirOnlinePassword: "hunter2" });
    expect(rec.some((r) => /ebirOnline/i.test(r.key))).toBe(false);
  });
});

// ── the headline proof: a file saved by the NATIVE 0605 loads in the LEGACY 0605 (the oracle) ──
const ORIGINAL = "vendor/original";
describe.skipIf(!existsSync(`${ORIGINAL}/forms/BIR-Form0605.hta`))("native 0605 is byte-compatible with the legacy form", () => {
  let server: Server;
  let browser: Browser;
  let base = "";
  const data_dir = mkdtempSync(join(tmpdir(), "ebf-0605-"));

  beforeAll(async () => {
    const handle = createLegacyHost({ original_dir: ORIGINAL, data_dir, shim_url: "/legacy-shim.js", token: "t" });
    const shim = readFileSync("public/legacy-shim.js");
    server = createServer((req, res) => {
      if (req.url === "/legacy-shim.js") res.writeHead(200, { "content-type": "text/javascript" }).end(shim);
      else void handle(req, res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await webkit.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
    rmSync(data_dir, { recursive: true, force: true });
  });

  it("saves natively, then the legacy form shows the same values and computes the same totals", async () => {
    const state: FormState = {
      "frm0605:txtReturnPeriodMonth": "10",
      "frm0605:txtReturnPeriodDay": "15",
      "frm0605:txtReturnPeriodYear": "2026",
      "frm0605:txtTIN1": "846",
      "frm0605:txtTIN2": "532",
      "frm0605:txtTIN3": "107",
      "frm0605:txtBranchCode": "00000",
      "frm0605:txtRDOCode": "043",
      "frm0605:txtTaxPayerName": "DELA CRUZ, JUAN & SONS",
      "frm0605:txtAddress": "1 RIZAL ST. <BLDG A> & CO.",
      "frm0605:txtTax19": "1,000.00",
      "frm0605:txtTax20A": "10.50",
      "frm0605:txtTax20B": "20.25",
      "frm0605:txtTax20C": "5.00",
    };
    expect(validate0605(state)).toEqual([]);

    // save exactly as the P3 renderer would: compute, serialize, write through the codec
    const file = { record: toRecords(FORM_0605, state), trailer_year: 2012 as const, is_final_copy: false };
    const name = "84653210700000-0605-10152026000000.xml";
    mkdirSync(join(data_dir, "savefile"), { recursive: true });
    writeFileSync(join(data_dir, "savefile", name), writeSavefile(file));

    // the legacy 0605 reads our file
    const page = await browser.newPage();
    const error: string[] = [];
    page.on("pageerror", (e) => error.push(e.message));
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/legacy/forms/BIR-Form0605.hta?xmlFileName=savefile/${name}`);
    await page.waitForTimeout(2500);

    const val = (id: string) => page.locator(`[id="${id}"]`).inputValue();
    expect(await val("frm0605:txtTaxPayerName")).toBe("DELA CRUZ, JUAN & SONS");
    expect(await val("frm0605:txtAddress")).toBe("1 RIZAL ST. <BLDG A> & CO."); // & and < survive
    expect(await val("frm0605:txtTIN3")).toBe("107");
    expect(await val("frm0605:txtTax20D")).toBe("35.75"); // our computed penalty total
    expect(await val("frm0605:txtTax21")).toBe("1,035.75"); // our computed total payable
    expect(error).toEqual([]);

    // and the file our schema wrote round-trips through the codec unchanged
    const reparsed = parseSavefile(serializeSavefile(file));
    expect(reparsed.record.find((r) => r.key === "frm0605:txtTax21")?.value).toBe("1,035.75");
  }, 120_000);
});
