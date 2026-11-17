// BIR's blank page greys out boxes: the taxpayer's details (filled from the profile), codes a pick list fills,
// totals and fixed values. The web version greys out the same boxes, in all 84 forms, and fills them from the same
// source: the profile, the pick list, the engine.
// Needs `npm run build:web` and Playwright's Chromium. Skips otherwise (CI installs no browser).
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type BrowserContext, type Page } from "playwright";
import { NATIVE_FORM } from "../src/form/registry.ts";
import { profileToSavefile, serializeSavefile } from "../src/lib/savefile.ts";
import { blankLock, blankValue, boxClass } from "./lock-blank.ts";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const PROFILE_FILE = "12345678900000.xml";
const PROFILE = serializeSavefile(
  profileToSavefile({ tin1: "123", tin2: "456", tin3: "789", tin4: "00000", rdo: "059", lob: "ACCOUNTING FIRM", fn: "DELA CRUZ, JUAN", regAddr: "LIPA CITY", zip: "4217", telNo: "09170000000", email: "juan@example.com", formType: "0" }),
);
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);

const opfs = (page: Page, path: string[], text: string) =>
  page.evaluate(
    async ({ path, text }) => {
      let dir = await navigator.storage.getDirectory();
      const p = path.slice();
      const name = p.pop()!;
      for (const d of p) dir = await dir.getDirectoryHandle(d, { create: true });
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
    { path, text },
  );

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: the boxes BIR greys out are greyed out here", () => {
  let server: Server, base: string, context: BrowserContext, dir: string;

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
    dir = mkdtempSync(join(tmpdir(), "ebf-web-lock-"));
    context = await chromium.launchPersistentContext(dir);
    const page = await context.newPage();
    await page.goto(`${base}/`);
    await opfs(page, ["profile", PROFILE_FILE], PROFILE);
    await page.close();
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    server?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const open = async (code: string) => {
    const page = await context.newPage();
    page.on("dialog", (d) => void d.dismiss().catch(() => {}));
    await page.goto(`${base}/form/${code}#profile=${PROFILE_FILE}`, { waitUntil: "networkidle" });
    await page.locator(".bir-layout").waitFor();
    await page.waitForTimeout(800); // the engine fills and locks the page after it mounts
    return page;
  };
  /** disabled state and value of each box, by id, in BIR's layout on the page */
  const read = (page: Page, id: string[]) =>
    page.evaluate((id) => {
      const root = document.querySelector(".bir-layout")!.shadowRoot!;
      return Object.fromEntries(id.map((x) => {
        // an id some pages use twice (a hidden copy and the box): the box
        const el = Array.from(root.querySelectorAll<HTMLInputElement>(`[id="${x}"]`)).find((e) => e.type !== "hidden") ?? null;
        return [x, el ? { disabled: el.disabled, value: el.value } : null];
      }));
    }, id);

  const form = Object.keys(NATIVE_FORM).filter((c) => existsSync(`asset/bir/layout/${c}.html`)).sort();

  it.each(form)("%s: every box BIR greys out on its blank page is greyed out", async (code) => {
    const page = await open(code);
    const box = blankLock(code);
    const state = await read(page, box);
    // EBF_LOCK_REPORT=<file>: how many of BIR's greyed boxes the web leaves typable, by what fills them
    if (process.env.EBF_LOCK_REPORT) {
      const by: Record<string, number> = {};
      for (const id of box) if (state[id] && !state[id]!.disabled) by[boxClass(code, id).by] = (by[boxClass(code, id).by] ?? 0) + 1;
      appendFileSync(process.env.EBF_LOCK_REPORT, `${code} on-page=${box.filter((id) => state[id]).length} of ${box.length} typable=${JSON.stringify(by)}\n`);
    }
    if (process.env.EBF_LOCK_REPORT) {
      // a greyed box BIR's page fills with a value of its own (no profile): the web shows the same
      const want = blankValue(code);
      const differ = box.filter((id) => state[id] && want[id] && want[id] !== state[id]!.value && !boxClass(code, id).by.match(/profile|computed/));
      appendFileSync(process.env.EBF_LOCK_REPORT, `${code} value-differs=${JSON.stringify(differ.map((id) => [id, want[id], state[id]!.value]))}\n`);
    }
    const open_box = box.filter((id) => state[id] && !state[id]!.disabled && !["gate", "editable", "opened elsewhere"].includes(boxClass(code, id).by));
    expect(open_box, `${code}: typable on the web, greyed on BIR's page`).toEqual([]);
    await page.close();
  }, 60_000);

  it("0605: the taxpayer's details are BIR's greyed boxes, filled from the profile, and nothing can be typed there", async () => {
    const page = await open("0605");
    const id = ["frm0605:txtTIN1", "frm0605:txtTIN2", "frm0605:txtTIN3", "frm0605:txtBranchCode"];
    const state = await read(page, id);
    const found = id.filter((x) => state[x]);
    expect(found.length).toBe(4);
    for (const x of found) expect(state[x]!.disabled, x).toBe(true);
    expect(state["frm0605:txtTIN1"]!.value).toBe("123");
    expect(state["frm0605:txtBranchCode"]!.value).toBe("00000");
    await page.close();
  }, 60_000);

  it("0605: Tax Type and ATC are greyed out and filled only by their pick lists", async () => {
    const page = await open("0605");
    const box = (id: string) => page.locator(`[id="${id}"]`);
    expect(await box("txtTaxTypeCode").isDisabled()).toBe(true);
    expect(await box("txtATCCode").isDisabled()).toBe(true);
    await box("btnTaxType").evaluate((e: HTMLElement) => e.click());
    await box("TaxTypeCode9").check({ force: true });
    await page.locator('#modalTaxTypeCode [id="btnOkPop"]').click();
    await expect.poll(() => box("txtTaxTypeCode").inputValue()).toBe("IT");
    await box("btnATC").evaluate((e: HTMLElement) => e.click());
    await page.locator(".atc-picker tbody tr").first().click();
    await page.locator(".atc-picker button", { hasText: "OK" }).click();
    await expect.poll(() => box("txtATCCode").inputValue()).not.toBe("");
    expect(await box("txtTaxTypeCode").isDisabled()).toBe(true);
    expect(await box("txtATCCode").isDisabled()).toBe(true);
    await page.close();
  }, 60_000);
});
