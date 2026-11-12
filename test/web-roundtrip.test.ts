// The web version's savefile, opened by BIR's own eBIRForms page — the Windows round trip, run here. BIRForms.exe is
// only a shell around BIR's HTA pages; it is those pages' loader (loadXML) that reads a savefile, and the legacy host
// serves exactly those pages to WebKit. So: type a return into the built web app (dist-web, real OPFS), take the
// bytes it stored, put them where eBIRForms keeps savefiles, open BIR's page for that form, and compare every field.
// A form with a captured layout is typed into BIR's own page layout (src/form/LayoutView.tsx), as a web user does;
// any other into the plain native form.
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
import { NATIVE_FORM } from "@/form/registry.ts";
import { decodeCp1252 } from "@/lib/cp1252.ts";
import { parseSavefile, profileToSavefile, writeSavefile } from "@/lib/savefile.ts";

const WEB = "dist-web";
const CASE = ["0605", "1701Qv2018"].filter((c) => hasForm(c) && existsSync(`test/fixture/web-roundtrip/${c}.json`));
const ready = existsSync(`${WEB}/index.html`) && CASE.length > 0;

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
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
    const layout = existsSync(`asset/bir/layout/${code}.html`);
    let profile_hash = "";
    if (layout) {
      // on BIR's layout the taxpayer's details come from the profile, as on BIR's main screen (Fill-up), and some
      // of them (1701Q's line of business and telephone) have no box of their own: store the profile first
      const def = NATIVE_FORM[code]!;
      const profile = { fn: "", tin1: "", tin2: "", tin3: "", tin4: "", rdo: "", lob: "", regAddr: "", zip: "", telNo: "", email: "", formType: code };
      for (const [id, key] of Object.entries(def.prefill)) if (state[id]) profile[key] = state[id]!;
      const name = `${profile.tin1}${profile.tin2}${profile.tin3}${profile.tin4}.xml`;
      await page.goto(`${base}/`);
      await page.evaluate(
        async ([n, b]) => {
          const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("profile", { create: true });
          const w = await (await dir.getFileHandle(n, { create: true })).createWritable();
          await w.write(new Uint8Array(b));
          await w.close();
        },
        [name, [...writeSavefile(profileToSavefile(profile))]] as const,
      );
      profile_hash = `#profile=${encodeURIComponent(name)}`;
    }
    await page.goto(`${base}/form/${code}${profile_hash}`);
    const entry = Object.entries(state);
    let saved: string | undefined;
    if (layout) {
      // BIR's page layout: fields by BIR's own id (locators reach into the shadow root), one page at a time
      const field = (id: string) => page.locator(`.bir-layout [id="${id}"]`);
      await field(entry[0]![0]).waitFor({ state: "attached" });
      const pageOf = (id: string) =>
        page.evaluate((i) => {
          const box = document.querySelector(".bir-layout")!.shadowRoot!.getElementById(i)?.closest("[id^=Page][id$=Content]");
          return box ? Number(box.id.slice("Page".length, -"Content".length)) : 0;
        }, id);
      const show = async (id: string) => {
        const n = await pageOf(id);
        if (n === 0 || (await field(id).isVisible())) return;
        const box = page.locator(".bir-layout input[id$=':txtCurrentPage']").first();
        await box.fill(String(n));
        await box.dispatchEvent("change");
      };
      for (const [id, v] of entry)
        if (kind[id] === "radio" && v === "true") {
          await show(id);
          await field(id).check();
        }
      for (const [id, v] of entry) {
        if (kind[id] === "radio") continue;
        await show(id);
        const input = field(id);
        // a field BIR keeps hidden (1701Q's line of business, filled from the profile) can't be typed into
        // (BIR marks its lists readonly, which a browser ignores on a <select>: a list only needs to be enabled)
        const is_list = (await input.evaluate((e) => e.tagName)) === "SELECT";
        if (!(await input.isVisible()) || !(await (is_list ? input.isEnabled() : input.isEditable()))) continue;
        if (is_list) await input.selectOption(v);
        else {
          await input.fill(v);
          await input.blur();
        }
      }
      const told = page.waitForEvent("dialog").then(async (d) => (await d.accept(), d.message()));
      await page.locator(".bir-layout input[type=button][value=Save] >> visible=true").last().click();
      const message = await told;
      // back to page 1, where BIR's page opens, so the page-number box compares like for like
      const box = page.locator(".bir-layout input[id$=':txtCurrentPage']").first();
      if (await box.count()) {
        await box.fill("1");
        await box.dispatchEvent("change");
      }
      saved = message.match(/savefile\/(\S+\.xml)/)?.[1];
      expect(saved, `Save said: ${message}`).toBeTruthy();
    } else {
      await page.locator("[data-id]").first().waitFor();
      for (const [id, v] of entry) if (kind[id] === "radio" && v === "true") await page.locator(`[data-id="${id}"]`).check();
      for (const [id, v] of entry) {
        if (kind[id] === "radio") continue;
        const input = page.locator(`[data-id="${id}"]`);
        if (!(await input.isEditable())) continue;
        await input.fill(v);
        await input.blur();
      }
      await page.getByRole("button", { name: /^save/i }).click();
      saved = (await page.locator(".ok-text").innerText()).match(/Saved as (\S+\.xml)/)?.[1];
    }
    expect(saved, "the web app reports the savefile name").toBeTruthy();
    // what the web app shows, per field the engine drives: the reference BIR's page must reproduce
    const text_id = NATIVE_FORM[code]!.schema.field.filter((f) => !f.secret && f.kind !== "radio" && f.kind !== "checkbox").map((f) => f.id);
    const shown: Record<string, string> = await page.evaluate(
      ([id, is_layout]) => {
        const root: ParentNode = is_layout ? document.querySelector(".bir-layout")!.shadowRoot! : document;
        const find = (i: string) => (is_layout ? (root as ShadowRoot).getElementById(i) : root.querySelector(`[data-id="${CSS.escape(i)}"]`)) as HTMLInputElement | null;
        return Object.fromEntries(id.flatMap((i) => (find(i) ? [[i, find(i)!.value]] : [])));
      },
      [text_id, layout] as const,
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
