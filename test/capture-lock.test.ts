// Capture which boxes BIR's pages lock, and which choice opens each one, for the web version. BIR's pages grey out
// many boxes on a blank form and open them only after a choice (0605: tick Installment and "No. of Installment"
// opens). The web version runs none of BIR's code, so it learns those rules here: open the blank form in WebKit,
// note every greyed box, then for each enabled radio or checkbox reload the blank form, click it, and note which
// greyed boxes opened. Then the same for each option of each list (up to 12 options; a longer list, its second
// option stands for "anything picked"), and for typing into each open text box (one page, box after box: a box
// that opens is put down to the last one typed; repeated over the boxes that opened, until none does). A box with no opener found is left out (it may open some other
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
    // on screen, or on another page of BIR's pager (Page2Content ...): a user reaches it by turning the page
    const visible = (el: HTMLElement) => {
      if (el.getClientRects().length > 0) return true;
      if (getComputedStyle(el).display === "none") return false;
      for (let x = el.parentElement; x; x = x.parentElement) if (getComputedStyle(x).display === "none" && !/^Page\d+m?(Content)?$/.test(x.id)) return false;
      return true;
    };
    const locked: string[] = [];
    const choice: string[] = [];
    const list: { id: string; value: string[] }[] = [];
    const text: string[] = [];
    for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as HTMLInputElement[]) {
      if (!el.id) continue;
      const kind = el.tagName === "INPUT" ? el.type : el.tagName.toLowerCase();
      if (kind === "radio" || kind === "checkbox") {
        // a greyed choice too: BIR opens it some other way (its own rule covers that), and what it opens is learned here
        if (visible(el)) choice.push(el.id);
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
        t.on("dialog", (d) => void d.accept().catch(() => {})); // a user who says yes: some boxes open only after BIR's confirm (2550-Q short period)
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
                el.disabled = false;
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
      // typing: one blank page, each open text box in turn, then again over the boxes that typing opened (BIR's rows
      // open one after the other: row 2 once row 1 is in), until nothing new opens. The typed value is one BIR's own
      // checks accept: a year in a 4-digit box, a date in a date box, else "1".
      try {
        const t = tab[0]!;
        await t.goto(url);
        await t.waitForTimeout(1500);
        let still = new Set((await scan(t)).locked);
        const typed = new Set<string>();
        let round = blank.text;
        for (let pass = 0; pass < 8 && round.length; pass++) {
          for (const id of round) {
            typed.add(id);
            await t.evaluate((x) => {
              const el = document.getElementById(x) as HTMLInputElement | null;
              if (!el || el.disabled) return;
              const value = /date|dob|birth/i.test(x) ? "01/01/2020" : el.maxLength === 4 ? "2020" : "1";
              el.focus();
              el.value = value;
              for (const type of ["input", "keyup", "change"]) el.dispatchEvent(new Event(type, { bubbles: true }));
              // a box on another page of the pager cannot take focus, so blur() would not run BIR's onblur: send it
              if (document.activeElement === el) el.blur();
              else el.dispatchEvent(new FocusEvent("blur"));
            }, id).catch(() => {});
            const now = new Set((await scan(t).catch(() => ({ locked: [...still] }))).locked);
            for (const box of still) if (!now.has(box) && locked.has(box)) (open[box] ??= []).push(`${id}=*`);
            still = now;
          }
          round = (await scan(t).catch(() => ({ text: [] as string[] }))).text.filter((id) => !typed.has(id));
        }
      } catch {
        /* the page navigated away while typing: keep what was learned */
      }
      // everything at once: one page where every choice is ticked (greyed ones too), every list set and every box
      // typed, round after round, so a box that needs several things first can open. A box that opens is put down to
      // the action just taken; a greyed box that never opens, even so, is never opened while filling in ([]).
      try {
        const t = tab[0]!;
        await t.goto(url);
        await t.waitForTimeout(1500);
        let still = new Set((await scan(t)).locked);
        const done = new Set<string>();
        for (let pass = 0; pass < 4; pass++) {
          const now0 = await scan(t);
          const act: Array<[string, string, string | null]> = [
            ...now0.choice.map((id) => [id, id, null] as [string, string, string | null]),
            // every option of a list (up to 40): some boxes open on one value only (1702-Q Schedule 4 on its ATC)
            ...(
              await t.evaluate((ids) =>
                ids.map((id) => [id, Array.from((document.getElementById(id) as HTMLSelectElement).options, (o) => o.value).filter((v) => v !== "").slice(0, 40)] as [string, string[]]),
                now0.list.map((l) => l.id),
              )
            ).flatMap(([id, value]) => value.map((v) => [`${id}=${v}`, id, v] as [string, string, string | null])),
            ...now0.text.map((id) => [`${id}=*`, id, ""] as [string, string, string | null]),
          ].filter(([rule]) => !done.has(rule));
          if (!act.length) break;
          for (const [rule, id, v] of act) {
            done.add(rule);
            await t.evaluate(([x, v]) => {
              const el = document.getElementById(x) as HTMLInputElement | null;
              if (!el) return;
              el.disabled = false;
              if (v === null) {
                if (!el.checked) el.click();
              } else if (v !== "") {
                el.value = v;
                el.dispatchEvent(new Event("change", { bubbles: true }));
              } else {
                el.value = /date|dob|birth/i.test(x) ? "01/01/2020" : el.maxLength === 4 ? "2020" : "1";
                for (const type of ["input", "keyup", "change"]) el.dispatchEvent(new Event(type, { bubbles: true }));
                el.dispatchEvent(new FocusEvent("blur"));
              }
            }, [id, v] as [string, string | null]).catch(() => {});
            let now = new Set((await scan(t).catch(() => ({ locked: [...still] }))).locked);
            const opened = [...still].filter((box) => !now.has(box) && locked.has(box) && !open[box]);
            if (v !== null && v !== "" && opened.length) {
              // a list opened them: try its every value, and keep each one the box is open on ("=*" when all are)
              const all = await t.evaluate((x) => Array.from((document.getElementById(x) as HTMLSelectElement).options, (o) => o.value).filter((o) => o !== "").slice(0, 40), id);
              const on: Record<string, string[]> = {};
              for (const o of all) {
                await t.evaluate(([x, o]) => {
                  const el = document.getElementById(x) as HTMLSelectElement;
                  el.value = o;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                }, [id, o] as [string, string]).catch(() => {});
                const at = new Set((await scan(t).catch(() => ({ locked: [...now] }))).locked);
                for (const box of opened) if (!at.has(box)) (on[box] ??= []).push(o);
              }
              await t.evaluate(([x, o]) => {
                const el = document.getElementById(x) as HTMLSelectElement;
                el.value = o;
                el.dispatchEvent(new Event("change", { bubbles: true }));
              }, [id, v] as [string, string]).catch(() => {});
              now = new Set((await scan(t).catch(() => ({ locked: [...now] }))).locked);
              for (const box of opened) open[box] = (on[box] ?? [v]).length === all.length ? [`${id}=*`] : (on[box] ?? [v]).map((o) => `${id}=${o}`);
            } else for (const box of opened) (open[box] ??= []).push(rule);
            still = now;
          }
        }
        for (const box of locked) if (!open[box] && still.has(box)) open[box] = [];
      } catch {
        /* the page navigated away: keep what was learned */
      }
      for (const t of tab) await t.close();
      const sorted = Object.fromEntries(Object.keys(open).sort().map((k) => [k, open[k]!.sort()]));
      writeFileSync(`${DIR}/${c}.json`, `${JSON.stringify(sorted, null, 1)}\n`);
    }, 1_800_000);
  }
});
