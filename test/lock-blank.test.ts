// BIR's pages grey out boxes on a blank form. The web version must lock the same boxes.
// This reads BIR's captured blank page (asset/bir/layout/<code>.html: each box carries the disabled state BIR's page
// had once it loaded, checked box for box against the live page) and sorts every greyed text box, list and text
// area by what fills or opens it in BIR's app, then asserts the web locks it too, unless BIR opens it on its own
// (a gate the form's rules state, a default BIR leaves editable). The browser side is test/web-lock.test.ts.
//   EBF_LOCK_REPORT=<file> npx vitest run test/lock-blank.test.ts   appends the breakdown per form to <file>
import { describe, expect, it } from "vitest";
import { appendFileSync, existsSync } from "node:fs";
import { NATIVE_FORM } from "../src/form/registry.ts";
import { neverOpened } from "../src/form/lock.ts";
import { blankLock, boxClass, neverCandidate } from "./lock-blank.ts";

const report = process.env.EBF_LOCK_REPORT;
const say = (line: string) => report && appendFileSync(report, `${line}\n`);

describe("BIR's greyed boxes, sorted, and locked on the web", () => {
  const form = Object.keys(NATIVE_FORM).filter((c) => existsSync(`asset/bir/layout/${c}.html`)).sort();
  const total: Record<string, number> = {};
  const open: Record<string, number> = {};
  let box_count = 0;

  it("every form with a native engine has BIR's page captured", () => {
    expect(form.length).toBe(Object.keys(NATIVE_FORM).length);
  });

  for (const code of form) {
    it(`${code}: every box BIR greys out is locked on the web, bar the ones BIR opens itself`, () => {
      const unlocked: string[] = [];
      for (const id of blankLock(code)) {
        const { by, locked } = boxClass(code, id);
        total[by] = (total[by] ?? 0) + 1;
        box_count++;
        // a gate that is open at a blank form, or an editable default: BIR leaves these typable
        if (!locked) {
          open[by] = (open[by] ?? 0) + 1;
          expect(["gate", "editable", "opened elsewhere"], `${code} ${id} (${by})`).toContain(by);
          unlocked.push(id);
        }
      }
      say(`${code} unlocked=${unlocked.join(",")}`);
      if (process.env.EBF_LOCK_FIXED) say(`${code} elsewhere=${blankLock(code).filter((id) => boxClass(code, id).by === "opened elsewhere").join(",")}`);
    });
  }

  it("lock-fixed.json lists only greyed boxes that nothing else fills, opens or computes", () => {
    for (const code of form) for (const id of neverOpened(code)) expect(blankLock(code), `${code} ${id}`).toContain(id), expect(neverCandidate(code, id), `${code} ${id}`).toBe(true);
  });

  it("totals", () => {
    say(`TOTAL ${box_count} in ${form.length} forms: ${JSON.stringify(total)} open on a blank form: ${JSON.stringify(open)}`);
    expect(box_count).toBeGreaterThan(0);
  });
});
