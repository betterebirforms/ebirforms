// The web version's main screen, as an accountant with many clients uses it (a tester's recording, 15 Nov 2026):
// the profile has a 5-digit branch code (123-456-789-00000) and returns from BIR's app carry 3 digits in their
// names (123456789000-2551Qv2018-122026Q3.xml), so an added savefile never showed. Checks: 000 and 00000 list as
// one taxpayer, an added return of another taxpayer says whose it is, "Saved profiles" picks a taxpayer without
// typing, the note counts what is stored, a browser with no folder picker is told so, and picking the savefile
// folder itself is refused. Needs `npm run build:web` and Playwright's Chromium. Skips otherwise.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type BrowserContext, type Page } from "playwright";
import { profileToSavefile, serializeSavefile } from "../src/lib/savefile.ts";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

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

const PROFILE = serializeSavefile(
  profileToSavefile({ tin1: "123", tin2: "456", tin3: "789", tin4: "00000", rdo: "059", lob: "ACCOUNTING FIRM", fn: "DELA CRUZ, JUAN", regAddr: "LIPA CITY", zip: "4217", telNo: "09170000000", email: "juan@example.com", formType: "0" }),
);
// CI installs no Playwright browser: skip there, as the other browser tests do
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);

describe.skipIf(!existsSync(`${WEB}/index.html`) || !HAS_CHROMIUM)("web version: the main screen with many taxpayers", () => {
  let server: Server, base: string, context: BrowserContext, profile_dir: string;

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
    profile_dir = mkdtempSync(join(tmpdir(), "ebf-web-main-"));
    context = await chromium.launchPersistentContext(profile_dir);
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    server?.close();
    rmSync(profile_dir, { recursive: true, force: true });
  });

  it("lists a 3-digit-branch return under a 5-digit-branch profile, picked from Saved profiles", async () => {
    const page = await context.newPage();
    const page_error: string[] = [];
    const said: string[] = [];
    page.on("pageerror", (e) => page_error.push(e.message));
    page.on("dialog", (d) => (said.push(d.message()), void d.accept()));
    await page.goto(`${base}/`);
    await opfs(page, ["profile", "12345678900000.xml"], PROFILE);
    await page.reload();

    // pick the taxpayer instead of typing the TIN
    const pick = page.locator("select", { hasText: "Select a taxpayer…" });
    await pick.waitFor();
    expect(await pick.locator("option").allTextContents()).toEqual(["Select a taxpayer…", "123-456-789-00000  DELA CRUZ, JUAN"]);
    await pick.selectOption("12345678900000.xml");
    await expect.poll(() => page.locator("#tin4").inputValue()).toBe("00000");
    expect(await page.locator("#fn").inputValue()).toBe("DELA CRUZ, JUAN");

    // the tester's step: add a return BIR's app named with a 3-digit branch
    const add = page.locator(".web-note input[type=file]");
    await add.setInputFiles({ name: "123456789000-2551Qv2018-122026Q3.xml", mimeType: "text/xml", buffer: Buffer.from("<x/>") });
    await page.getByText("122026Q3", { exact: true }).waitFor();
    expect(await page.locator("#formType").inputValue()).toBe("2551Qv2018");
    await page.getByText(/1 profile and 1 return there now/).waitFor();

    // a return of another taxpayer is kept, and says whose it is instead of showing nothing
    await add.setInputFiles({ name: "987654321000-0605-012026.xml", mimeType: "text/xml", buffer: Buffer.from("<x/>") });
    await expect.poll(() => said.join("|")).toContain("belongs to TIN 987-654-321-000");
    await page.getByText(/1 profile and 2 returns there now/).waitFor();
    expect(page_error).toEqual([]);
    await page.close();
  }, 60_000);

  it("with no taxpayer on screen, an added return shows under its own TIN", async () => {
    const page = await context.newPage();
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/`);
    await page.locator(".web-note input[type=file]").setInputFiles({ name: "123456789000-1701Qv2018-2025Q3.xml", mimeType: "text/xml", buffer: Buffer.from("<x/>") });
    await page.getByText("2025Q3", { exact: true }).waitFor();
    expect(await page.locator("#tin1").inputValue()).toBe("123");
    expect(await page.locator("#tin4").inputValue()).toBe("000");
    await page.close();
  }, 60_000);

  it("offers to update 3-digit-branch files to 5 digits, and does it only on a yes", async () => {
    const page = await context.newPage();
    const said: string[] = [];
    let answer = false;
    page.on("dialog", (d) => (said.push(d.message()), void (d.type() === "confirm" && !answer ? d.dismiss() : d.accept())));
    await page.goto(`${base}/`);
    const old = PROFILE.split("=00000").join("=000");
    await opfs(page, ["profile", "555666777000.xml"], old.split("=123").join("=555").split("=456").join("=666").split("=789").join("=777"));
    await opfs(page, ["savefile", "555666777000-2551Qv2018-122026Q3.xml"], "<?xml version='1.0'?><div>frm2551Qv2018:txtBranchCode=000frm2551Qv2018:txtBranchCode=</div>All Rights Reserved BIR 2012.");
    await page.reload();
    const name = () =>
      page.evaluate(async () => {
        const out: string[] = [];
        const root = await navigator.storage.getDirectory();
        for (const sub of ["profile", "savefile"])
          for await (const f of ((await root.getDirectoryHandle(sub)) as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) if (f.name.startsWith("555666777")) out.push(`${sub}/${f.name}`);
        return out.sort();
      });
    const offer = page.getByText("Update to 5 digits…");
    await offer.waitFor();
    await offer.click(); // answered no: nothing moves
    await expect.poll(() => said.join("|")).toContain("to the 5-digit branch code?");
    expect(await name()).toEqual(["profile/555666777000.xml", "savefile/555666777000-2551Qv2018-122026Q3.xml"]);
    answer = true;
    await offer.click();
    await expect.poll(() => said.join("|")).toMatch(/Updated \d+ files? to the 5-digit branch code/);
    expect(await name()).toEqual(["profile/55566677700000.xml", "savefile/55566677700000-2551Qv2018-122026Q3.xml"]);
    const text = await page.evaluate(async () => (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle("savefile")).getFileHandle("55566677700000-2551Qv2018-122026Q3.xml")).getFile()).text());
    expect(text).toContain("<div>frm2551Qv2018:txtBranchCode=00000frm2551Qv2018:txtBranchCode=</div>");
    await page.close();
  }, 60_000);

  it("says where a folder can be used when this browser has no folder picker (Brave, Firefox, Safari)", async () => {
    const page = await context.newPage();
    await page.addInitScript("delete window.showDirectoryPicker");
    await page.goto(`${base}/`);
    await page.getByText(/open this page in Chrome or Edge/).waitFor();
    expect(await page.getByText("Use a folder on this computer…").count()).toBe(0);
    await page.close();
  }, 60_000);

  it("refuses the savefile folder itself as the folder to use", async () => {
    const page = await context.newPage();
    const said: string[] = [];
    page.on("dialog", (d) => (said.push(d.message()), void d.accept()));
    await page.addInitScript(`window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("savefile", { create: true });`);
    await page.goto(`${base}/`);
    await page.getByText("Use a folder on this computer…").click();
    await expect.poll(() => said.join("|")).toContain('Pick the folder that holds the "profile" and "savefile" folders');
    await page.getByText(/keeps returns in this browser only/).waitFor();
    await page.close();
  }, 60_000);
});
