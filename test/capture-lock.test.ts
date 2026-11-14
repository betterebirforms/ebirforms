// Capture which boxes BIR's pages lock, and which choice opens each one, for the web version. BIR's pages grey out
// many boxes on a blank form and open them only after a choice (0605: tick Installment and "No. of Installment"
// opens). The web version runs none of BIR's code, so it learns those rules here: open the blank form in WebKit,
// note every greyed box, then for each enabled radio or checkbox reload the blank form, click it, and note which
// greyed boxes opened. Then the same for each option of each list (up to 12 options; a longer list, its second
// option stands for "anything picked"), and for typing into each open text box (one page, box after box: a box
// that opens is put down to the last one typed). A box with no opener found is left out (it may open some other
// way, so the web keeps it open).
//   EBF_CAPTURE_LOCK=0605,1701Qv2018 npx vitest run test/capture-lock.test.ts   (=1 for every form)
// Writes src/form/lock/<CODE>.json: { "<box id>": [opener, ...] }, the box open while any opener holds:
// "<id>" a choice ticked, "<id>=<value>" a list set to that value, "<id>=*" anything typed or picked there.
// Read by src/form/LayoutView.tsx. Re-run after importing a newer BIR package.
import { afterAll, beforeAll, describe, it } from "vitest";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import type { Page } from "playwright";
import { ORIGINAL, startOracle } from "./oracle.ts";

const want = process.env.EBF_CAPTURE_LOCK;
const DIR = "src/form/lock";
const TAB = 4;
const code = existsSync(`${ORIGINAL}/forms`)
  ? readdirSync(`${ORIGINAL}/forms`)
      .filter((f) => /^BIR-Form.+\.hta$/.test(f))
      .map((f) => f.slice("BIR-Form".length, -".hta".length))
      .filter((c) => want === "1" || want?.split(",").includes(c))
  : [];

/** Boxes (text, list, text area) BIR has greyed out, and choices it leaves clickable, by id. */
const scan = (tab: Page) =>
  tab.evaluate(() => {
    const visible = (el: HTMLElement) => el.getClientRects().length > 0;
    const locked: string[] = [];
    const choice: string[] = [];
    const list: { id: string; value: string[] }[] = [];
    const text: string[] = [];
    for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as HTMLInputElement[]) {
      if (!el.id) continue;
      const kind = el.tagName === "INPUT" ? el.type : el.tagName.toLowerCase();
      if (kind === "radio" || kind === "checkbox") {
        if (!el.disabled && visible(el)) choice.push(el.id);
      } else if (!el.disabled && !el.readOnly && visible(el)) {
        if (kind === "select") {
          const s = el as unknown as HTMLSelectElement;
          const other = Array.from(s.options).map((o) => o.value).filter((v) => v !== s.value);
          if (other.length) list.push({ id: el.id, value: other.length > 12 ? [`*${other[0]}`] : other });
        } else if (kind === "text" || kind === "" || kind === "textarea") text.push(el.id);
      } else if (["text", "select", "textarea", ""].includes(kind) && el.disabled) locked.push(el.id);
    }
    return { locked, choice, list, text };
  });

describe.runIf(want)("capture BIR's locked boxes and what opens them", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
    mkdirSync(DIR, { recursive: true });
  }, 120_000);
  afterAll(() => oracle?.stop());

  for (const c of code) {
    it(`lock ${c}`, async () => {
      const url = `${oracle.base}/legacy/forms/BIR-Form${c}.hta`;
      const tab: Page[] = [];
      for (let i = 0; i < TAB; i++) {
        const t = await oracle.browser.newPage({ viewport: { width: 1280, height: 900 } });
        t.on("dialog", (d) => void d.dismiss().catch(() => {}));
        tab.push(t);
      }
      await tab[0]!.goto(url);
      await tab[0]!.waitForTimeout(2500);
      const blank = await scan(tab[0]!);
      const locked = new Set(blank.locked);
      const open: Record<string, string[]> = {};
      // a tick, or a list set to one value: each from a fresh blank page
      const queue: { rule: string; act: [string, string | null] }[] = [
        ...blank.choice.map((id) => ({ rule: id, act: [id, null] as [string, string | null] })),
        ...blank.list.flatMap((l) =>
          l.value.map((v) => (v.startsWith("*") ? { rule: `${l.id}=*`, act: [l.id, v.slice(1)] as [string, string | null] } : { rule: `${l.id}=${v}`, act: [l.id, v] as [string, string | null] })),
        ),
      ];
      await Promise.all(
        tab.map(async (t) => {
          for (let q = queue.shift(); q !== undefined; q = queue.shift()) {
            try {
              await t.goto(url);
              await t.waitForTimeout(1500);
              await t.evaluate(([x, v]) => {
                const el = document.getElementById(x) as HTMLInputElement | null;
                if (!el) return;
                if (v === null) el.click();
                else {
                  el.value = v;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }, q.act);
              await t.waitForTimeout(300);
              const now = new Set((await scan(t)).locked);
              for (const box of locked) if (!now.has(box)) (open[box] ??= []).push(q.rule);
            } catch {
              /* a choice that navigates away or breaks the page opens nothing we can use */
            }
          }
        }),
      );
      // typing: one blank page, each open text box in turn
      try {
        const t = tab[0]!;
        await t.goto(url);
        await t.waitForTimeout(1500);
        let still = new Set((await scan(t)).locked);
        for (const id of blank.text) {
          await t.evaluate((x) => {
            const el = document.getElementById(x) as HTMLInputElement | null;
            if (!el || el.disabled) return;
            el.focus();
            el.value = "1";
            for (const type of ["input", "keyup", "change"]) el.dispatchEvent(new Event(type, { bubbles: true }));
            el.blur();
          }, id).catch(() => {});
          const now = new Set((await scan(t).catch(() => ({ locked: [...still] }))).locked);
          for (const box of still) if (!now.has(box) && locked.has(box)) (open[box] ??= []).push(`${id}=*`);
          still = now;
        }
      } catch {
        /* the page navigated away while typing: keep what was learned */
      }
      for (const t of tab) await t.close();
      const sorted = Object.fromEntries(Object.keys(open).sort().map((k) => [k, open[k]!.sort()]));
      writeFileSync(`${DIR}/${c}.json`, `${JSON.stringify(sorted, null, 1)}\n`);
    }, 1_800_000);
  }
});
