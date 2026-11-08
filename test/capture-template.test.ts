// Capture each BIR form's SAVE TEMPLATE: open the blank form in WebKit and record exactly what its saveXML would
// write — every frmMain text / select-one / radio / checkbox element (all 84 forms save exactly those), in DOM order, with its default value. A native save is the
// template overlaid with the native values (schema.ts formRecords), so keys BIR adds at runtime (padded schedule
// rows, ATC picker lists, j_id* elements, empty eBIRForms-Online fields) and defaults like "-" come out 1:1.
//   EBF_CAPTURE=1 npx vitest run test/capture-template.test.ts      (or EBF_CAPTURE=1601FQ,0605)
// Writes src/form/template/<CODE>.json. Re-run after importing a newer BIR package.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { ORIGINAL, startOracle } from "./oracle.ts";

const want = process.env.EBF_CAPTURE;
// a checkout without BIR's package (CI, the review bundle) has no forms to capture
const code = existsSync(`${ORIGINAL}/forms`)
  ? readdirSync(`${ORIGINAL}/forms`)
      .filter((f) => /^BIR-Form.+\.hta$/.test(f))
      .map((f) => f.slice("BIR-Form".length, -".hta".length))
      .filter((c) => want === "1" || want?.split(",").includes(c))
  : [];

describe.runIf(want)("capture BIR save templates", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
    mkdirSync("src/form/template", { recursive: true });
  }, 120_000);
  afterAll(() => oracle?.stop());

  for (const c of code) {
    it(`template ${c}`, async () => {
      const page = await oracle.browser.newPage();
      page.on("dialog", (d) => void d.accept());
      await page.goto(`${oracle.base}/legacy/forms/BIR-Form${c}.hta`);
      await page.waitForTimeout(2500);
      // [id, default] — radios add their group `name`, which ids don't reliably encode (optAmend:Y / optAmend:N)
      const record: Array<[string, string] | [string, string, string]> = await page.evaluate(() => {
        const form = document.getElementById("frmMain") as HTMLFormElement | null;
        const out: Array<[string, string] | [string, string, string]> = [];
        for (const el of form ? (Array.from(form.elements) as HTMLInputElement[]) : []) {
          if (!el.id || !["text", "select-one", "radio", "checkbox"].includes(el.type)) continue; // exactly what saveXML writes
          if (el.type === "radio") out.push([el.id, String(el.checked), el.name]);
          else out.push([el.id, el.type === "checkbox" ? String(el.checked) : el.value]);
        }
        return out;
      });
      await page.close();
      expect(record.length).toBeGreaterThan(0);
      writeFileSync(`src/form/template/${c}.json`, JSON.stringify(record) + "\n");
    }, 60_000);
  }
});

// Which text BIR upper-cases under the 1:1 model (a user tabbing through every visible field). Two mechanisms:
// `capital` (string-util.js declares it twice; the no-argument one wins) sweeps EVERY text input on the form, and
// `capitalize(this)` / `capital(this)` on one field's blur. Some forms only reach the sweep from a field in a hidden
// pop-up (2552v2018's txtLOB), so a grep can't say. Measure it: a lower-case sentinel in every empty text input,
// blur the visible live ones like test/parity.ts, then: a sentinel in a hidden/disabled input upper-cased means the
// whole-form sweep ran ("all"); otherwise record exactly the ids BIR upper-cased.
//   EBF_CAPTURE_UPPER=1 npx vitest run test/capture-template.test.ts   → src/form/upper-case.json
const wantUpper = process.env.EBF_CAPTURE_UPPER;
describe.runIf(wantUpper)("capture which text BIR upper-cases", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  const upper: Record<string, "all" | string[]> = {};
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
    const sorted = Object.fromEntries(Object.keys(upper).sort().map((k) => [k, upper[k]]));
    writeFileSync("src/form/upper-case.json", JSON.stringify(sorted, null, 1) + "\n");
  });
  // vitest still runs a skipped describe body to collect it, so this read must not throw without the tree
  const all = existsSync(`${ORIGINAL}/forms`)
    ? readdirSync(`${ORIGINAL}/forms`)
        .filter((f) => /^BIR-Form.+\.hta$/.test(f))
        .map((f) => f.slice("BIR-Form".length, -".hta".length))
    : [];
  for (const c of all) {
    it(`upper-case probe ${c}`, async () => {
      const page = await oracle.browser.newPage();
      page.on("dialog", (d) => void d.accept());
      await page.goto(`${oracle.base}/legacy/forms/BIR-Form${c}.hta`);
      await page.waitForTimeout(2500);
      const result: "all" | string[] = await page.evaluate(() => {
        const form = document.getElementById("frmMain") as HTMLFormElement | null;
        const text = ((form ? Array.from(form.elements) : []) as HTMLInputElement[]).filter((e) => e.type === "text" && e.id && !/txtEmail$/.test(e.id));
        const isLive = (e: HTMLInputElement) => !e.disabled && e.offsetParent !== null;
        const probe = text.filter((e) => e.value === "");
        for (const e of probe) e.value = "zqx";
        const live = text.filter(isLive);
        for (let pass = 0; pass < 2; pass++) for (const e of live) e.dispatchEvent(new FocusEvent("blur"));
        if (probe.some((e) => !isLive(e) && e.value === "ZQX")) return "all";
        return probe.filter((e) => e.value === "ZQX").map((e) => e.id);
      });
      await page.close();
      if (result === "all" || result.length) upper[c] = result;
      expect(result).toBeDefined();
    }, 60_000);
  }
});
