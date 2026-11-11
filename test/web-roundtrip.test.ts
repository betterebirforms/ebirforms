// The web version's savefile, opened by BIR's own eBIRForms page — the Windows round trip, run here. BIRForms.exe is
// only a shell around BIR's HTA pages; it is those pages' loader (loadXML) that reads a savefile, and the legacy host
// serves exactly those pages to WebKit. So: type a return into the built web app (dist-web, real OPFS), take the
// bytes it stored, put them where eBIRForms keeps savefiles, open BIR's page for that form, and compare every field.
// Needs `npm run build:web` and the extracted BIR tree; `npm run check:roundtrip` does both steps. Skips otherwise.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { webkit, type BrowserContext } from "playwright";
import { startOracle, hasForm, type Oracle } from "./oracle.ts";
import { parseMoney } from "@/form/money.ts";
import { decodeCp1252 } from "@/lib/cp1252.ts";
import { parseSavefile, profileToSavefile, writeSavefile } from "@/lib/savefile.ts";

const WEB = "dist-web";
const CASE = ["0605", "1701Qv2018"].filter((c) => hasForm(c) && existsSync(`test/fixture/web-roundtrip/${c}.json`));
const ready = existsSync(`${WEB}/index.html`) && CASE.length > 0;

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const MONEY = /^\(?-?[\d,]*\.\d{1,2}\)?$/;
const same = (a: string, b: string) => a.trim() === b.trim() || ((MONEY.test(a.trim()) || !a.trim()) && (MONEY.test(b.trim()) || !b.trim()) && parseMoney(a.trim()) === parseMoney(b.trim()));

describe.skipIf(!ready)("web savefile → BIR's eBIRForms page", () => {
  let server: Server, base: string, context: BrowserContext, oracle: Oracle & { stop: () => Promise<void> }, profile_dir: string;

  beforeAll(async () => {
    // dist-web as the static host would serve it: a file if it exists, else the app shell. The build may sit under a
    // path (EBF_WEB_BASE=/ebirforms/ for GitHub Pages): read it from the shell's asset links and serve under it.
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
    // OPFS needs a persistent WebKit context (an ephemeral one throws UnknownError)
    profile_dir = mkdtempSync(join(tmpdir(), "ebf-web-rt-"));
    context = await webkit.launchPersistentContext(profile_dir);
    oracle = await startOracle();
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await oracle?.stop();
    server?.close();
    rmSync(profile_dir, { recursive: true, force: true });
  });

  it.each(CASE)("%s: saved on the web, opened unchanged by BIR's page", async (code) => {
    const { state, kind = {}, want } = JSON.parse(readFileSync(`test/fixture/web-roundtrip/${code}.json`, "utf8")) as {
      state: Record<string, string>; kind?: Record<string, string>; want?: string;
    };
    // 1. type the return into the web app, the way a person would
    const page = await context.newPage();
    const page_error: string[] = [];
    page.on("pageerror", (e) => page_error.push(e.message));
    await page.goto(`${base}/form/${code}`);
    await page.locator("[data-id]").first().waitFor();
    const entry = Object.entries(state);
    for (const [id, v] of entry) if (kind[id] === "radio" && v === "true") await page.locator(`[data-id="${id}"]`).check();
    for (const [id, v] of entry) {
      if (kind[id] === "radio") continue;
      const input = page.locator(`[data-id="${id}"]`);
      if (!(await input.isEditable())) continue;
      await input.fill(v);
      await input.blur();
    }
    await page.getByRole("button", { name: /^save/i }).click();
    const saved = (await page.locator(".ok-text").innerText()).match(/Saved as (\S+\.xml)/)?.[1];
    expect(saved, "the web app reports the savefile name").toBeTruthy();
    // what the web app shows, per field — the reference BIR's page must reproduce
    const shown: Record<string, string> = await page.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll<HTMLInputElement>("input[data-id]")].filter((e) => e.type !== "radio" && e.type !== "checkbox").map((e) => [e.dataset.id!, e.value])),
    );

    // 2. the exact bytes the web app stored in OPFS
    const byte: number[] = await page.evaluate(async (name) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("savefile");
      return [...new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer())];
    }, saved!);
    const raw = Buffer.from(byte);
    expect(page_error).toEqual([]);
    await page.close();
    // byte-identical to the desktop app's save of the same return, where a desktop reference exists
    if (want) expect(decodeCp1252(raw)).toBe(want);
    expect(parseSavefile(decodeCp1252(raw)).record.length).toBeGreaterThan(0);

    // 3. put the file where eBIRForms keeps it, with the taxpayer profile BIR's page loads first
    mkdirSync(join(oracle.data_dir, "savefile"), { recursive: true });
    writeFileSync(join(oracle.data_dir, "savefile", saved!), raw);
    const tin = /^(\d{3})(\d{3})(\d{3})(\d{5})-/.exec(saved!)!;
    mkdirSync(join(oracle.data_dir, "profile"), { recursive: true });
    const profile = { fn: "", tin1: tin[1]!, tin2: tin[2]!, tin3: tin[3]!, tin4: tin[4]!, rdo: "", lob: "", regAddr: "", zip: "", telNo: "", email: "", formType: "" };
    writeFileSync(join(oracle.data_dir, "profile", `${saved!.split("-")[0]}.xml`), writeSavefile(profileToSavefile(profile)));

    // 4. BIR's page opens it: no script error, and every field the web app showed reads the same there
    const bir = await oracle.browser.newPage();
    const bir_error: string[] = [];
    bir.on("pageerror", (e) => bir_error.push(e.message));
    bir.on("dialog", (d) => void d.accept());
    await bir.goto(`${oracle.base}/legacy/forms/BIR-Form${code}.hta?xmlFileName=savefile/${saved}`);
    await bir.waitForTimeout(2500);
    const bir_value: Record<string, string> = await bir.evaluate((id) => Object.fromEntries(id.map((i) => [i, (document.getElementById(i) as HTMLInputElement | null)?.value ?? "<missing>"])), Object.keys(shown));
    await bir.close();
    // every value the web app showed must read the same in BIR's page. BIR's page also fills fields of its own on
    // load (page-2 header mirrors, page counters, year-end from the period) and upper-cases text as it displays it;
    // neither is a value the web file lost, so a web blank is not compared and text compares case-blind.
    const compared = Object.keys(shown).filter((id) => bir_value[id] !== "<missing>" && shown[id]!.trim() !== "");
    const diff = compared.filter((id) => !same(shown[id]!.toUpperCase(), bir_value[id]!.toUpperCase())).map((id) => `${id}: web "${shown[id]}" BIR "${bir_value[id]}"`);
    expect(bir_error).toEqual([]);
    expect(diff).toEqual([]);
    expect(compared.length, "fields compared").toBeGreaterThanOrEqual(entry.filter(([id, v]) => kind[id] !== "radio" && v !== "").length);
  }, 120_000);
});
