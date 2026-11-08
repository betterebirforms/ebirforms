// Reusable "the native form is byte-compatible with the legacy form" harness: save a file with the P3 schema,
// open it in the legacy form (the oracle) in WebKit, and assert the legacy form shows the same field values
// and computed totals. Shared by the per-form tests.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { webkit, type Browser, type Page } from "playwright";
import { createLegacyHost } from "../host/legacy-server.ts";
import { formRecords, type FormSchema, type FormState, type GroupState } from "@/form/schema.ts";
import { profileToSavefile, writeSavefile } from "@/lib/savefile.ts";

export const ORIGINAL = "vendor/original";
export const hasForm = (code: string) => existsSync(`${ORIGINAL}/forms/BIR-Form${code}.hta`);

export interface Oracle {
  base: string;
  browser: Browser;
  data_dir: string;
  /** Write a savefile with the schema and open it in the legacy form; returns the page and value reader. */
  openSaved: (schema: FormSchema, state: FormState, file_name: string, groups?: GroupState) => Promise<{ page: Page; value: (id: string) => Promise<string>; error: string[] }>;
}

export async function startOracle(): Promise<Oracle & { stop: () => Promise<void> }> {
  const data_dir = mkdtempSync(join(tmpdir(), "ebf-oracle-"));
  const handle = createLegacyHost({ original_dir: ORIGINAL, data_dir, shim_url: "/legacy-shim.js", token: "t" });
  const shim = readFileSync("public/legacy-shim.js");
  const server: Server = createServer((req, res) => {
    if (req.url === "/legacy-shim.js") res.writeHead(200, { "content-type": "text/javascript" }).end(shim);
    else void handle(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = await webkit.launch();

  const openSaved: Oracle["openSaved"] = async (schema, state, file_name, groups = {}) => {
    const file = { record: formRecords(schema, state, groups), trailer_year: 2012 as const, is_final_copy: false };
    mkdirSync(join(data_dir, "savefile"), { recursive: true });
    writeFileSync(join(data_dir, "savefile", file_name), writeSavefile(file));
    // BIR's app never opens a savefile without the taxpayer's profile next to it (the native app can't either: a
    // form opens only under an active, saved profile). Most forms call loadBGXML("profile/<TIN>.xml") before
    // loadXML, and some (2550DS) abort the whole reload when it is missing — their catch writes to a #msg element
    // the page doesn't have. Write a bare profile (TIN only, no formType, so loadBGData fills nothing) when absent.
    const tin = /^(\d{3})(\d{3})(\d{3})(\d{5})-/.exec(file_name);
    const profile_path = join(data_dir, "profile", `${file_name.split("-")[0]}.xml`);
    if (tin && !existsSync(profile_path)) {
      const [, tin1, tin2, tin3, tin4] = tin as unknown as [string, string, string, string, string];
      mkdirSync(join(data_dir, "profile"), { recursive: true });
      const bare = { fn: "", tin1, tin2, tin3, tin4, rdo: "", lob: "", regAddr: "", zip: "", telNo: "", email: "", formType: "" };
      writeFileSync(profile_path, writeSavefile(profileToSavefile(bare)));
    }
    const page = await browser.newPage();
    const error: string[] = [];
    page.on("pageerror", (e) => error.push(e.message));
    page.on("dialog", (d) => void d.accept().catch(() => {})); // a blur alert can race the page close
    await page.goto(`${base}/legacy/forms/BIR-Form${schema.form_code}.hta?xmlFileName=savefile/${file_name}`);
    await page.waitForTimeout(2500);
    return { page, value: (id: string) => page.locator(`[id="${id}"]`).first().inputValue(), error };
  };

  return {
    base,
    browser,
    data_dir,
    openSaved,
    stop: async () => {
      await browser.close();
      server.close();
      rmSync(data_dir, { recursive: true, force: true });
    },
  };
}
