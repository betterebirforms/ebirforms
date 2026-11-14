// The web version can keep profiles and returns in a folder the user picks (Chrome, Edge), e.g. their eBIRForms
// folder synced by Google Drive. Run in Chromium against the built app: the folder picker is stubbed to hand back a
// folder inside OPFS (a real directory handle, storable in IndexedDB like a picked one). Checks: what the browser
// held is copied in without overwriting, the choice survives a reload, and going back leaves the folder alone.
// Needs `npm run build:web`. Skips otherwise.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type BrowserContext, type Page } from "playwright";

const WEB = "dist-web";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

// the picker hands back OPFS/picked; the stub is installed before any page script runs
const STUB = `window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("picked", { create: true });`;

const opfs = (page: Page, path: string[], text?: string) =>
  page.evaluate(
    async ({ path, text }) => {
      let dir = await navigator.storage.getDirectory();
      const p = path.slice();
      const name = p.pop()!;
      for (const d of p) dir = await dir.getDirectoryHandle(d, { create: true });
      if (text !== undefined) {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
        return text;
      }
      try {
        return await (await (await dir.getFileHandle(name)).getFile()).text();
      } catch {
        return null;
      }
    },
    { path, text },
  );

describe.skipIf(!existsSync(`${WEB}/index.html`))("web version: a folder on this computer", () => {
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
    profile_dir = mkdtempSync(join(tmpdir(), "ebf-web-folder-"));
    context = await chromium.launchPersistentContext(profile_dir);
    await context.addInitScript(STUB);
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    server?.close();
    rmSync(profile_dir, { recursive: true, force: true });
  });

  it("copies the browser's files in, keeps the folder's own, remembers the choice, and lets go", async () => {
    const page = await context.newPage();
    const page_error: string[] = [];
    page.on("pageerror", (e) => page_error.push(e.message));
    page.on("dialog", (d) => void d.accept());
    await page.goto(`${base}/`);
    // the browser holds a return and a profile; the folder already has its own copy of the profile
    await opfs(page, ["savefile", "123456789000-0605-012026.xml"], "<return/>");
    await opfs(page, ["profile", "123456789000.xml"], "<browser/>");
    await opfs(page, ["picked", "profile", "123456789000.xml"], "<folder/>");
    await opfs(page, ["picked", "savefile", "123456789000-0605-022026.xml"], "<only-in-folder/>");
    await page.reload();

    const use = page.getByText("Use a folder on this computer…");
    await use.waitFor();
    await use.click();
    await page.getByText(/kept in your folder "picked"/).waitFor();
    expect(await opfs(page, ["picked", "savefile", "123456789000-0605-012026.xml"])).toBe("<return/>");
    expect(await opfs(page, ["picked", "profile", "123456789000.xml"])).toBe("<folder/>");

    await page.reload();
    await page.getByText(/kept in your folder "picked"/).waitFor();
    // BIR's main screen lists that taxpayer's returns of the chosen form: now the folder's, the one only it has too
    for (const [id, v] of [["tin1", "123"], ["tin2", "456"], ["tin3", "789"], ["tin4", "000"]] as const) await page.locator(`#${id}`).fill(v);
    await page.locator("#formType").selectOption("0605");
    await page.getByText("022026", { exact: true }).waitFor();

    await page.getByText("Keep returns in this browser instead").click();
    await page.getByText(/keeps returns in this browser only/).waitFor();
    expect(await opfs(page, ["picked", "savefile", "123456789000-0605-012026.xml"])).toBe("<return/>");
    expect(page_error).toEqual([]);
    await page.close();
  }, 60_000);
});
