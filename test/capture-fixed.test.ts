// Which greyed boxes does BIR's own code never open? On a blank form BIR greys out boxes that no choice opens (the
// capture in test/capture-lock.test.ts finds the ones a choice opens). Some of the rest are opened by a longer path
// the capture cannot walk (1702-Q Schedule 4 opens once an ATC is picked and a row is added; an attachment copy
// opens when it is added). This reads BIR's own source for the form: a greyed box whose id (or, for a numbered box
// in a loop, its name without the number) is never set to enabled anywhere is one BIR fills itself or leaves fixed.
// Only those are locked for good on the web; the others stay as they were.
//   EBF_CAPTURE_FIXED=1 npx vitest run test/capture-fixed.test.ts   (or a list of form codes)
// Writes src/form/lock-fixed.json: { "<form code>": ["<box id>", ...] }. Needs BIR's tree in vendor/original/.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ORIGINAL } from "./oracle.ts";
import { NATIVE_FORM } from "../src/form/registry.ts";
import { blankLock, neverCandidate } from "./lock-blank.ts";

const want = process.env.EBF_CAPTURE_FIXED;
const OUT = "src/form/lock-fixed.json";

/** A line that sets a box to enabled: disabled assigned to anything but true / "true" / "disabled", or removed. */
const enables = (line: string) =>
  [...line.matchAll(/disabled["']?\s*=(?!=)\s*([^;\n]*)/g)].some((m) => !/^\s*(true\b|["']true["']|["']disabled["']|1\b)/.test(m[1]!)) ||
  /removeAttr(ibute)?\(\s*["']disabled["']|(prop|attr)\(\s*["']disabled["']\s*,\s*(?!true|["']true|["']disabled)/.test(line);

/** Box ids BIR's source for this form never enables (its tag line, and lines that only disable, do not count). */
export function neverOpen(code: string, box: string[]): string[] {
  const src = readFileSync(`${ORIGINAL}/forms/BIR-Form${code}.hta`, "utf8").split("\n");
  const enabling = src.filter((l) => enables(l) && !/<(input|select|textarea)\b/i.test(l));
  return box.filter((id) => {
    // a numbered box set in a loop ('...txtOthrTxCrdts' + i) is named by its stem
    const stem = id.replace(/\d+$/, "");
    const key = stem.length >= 6 ? stem : id;
    return !enabling.some((l) => l.includes(id) || l.includes(key));
  });
}

describe.runIf(want && existsSync(`${ORIGINAL}/forms`))("capture the boxes BIR never opens", () => {
  it("writes src/form/lock-fixed.json", () => {
    const keep: Record<string, string[]> = existsSync(OUT) && want !== "1" ? JSON.parse(readFileSync(OUT, "utf8")) : {};
    for (const code of Object.keys(NATIVE_FORM).sort()) {
      if (want !== "1" && !want!.split(",").includes(code)) continue;
      if (!existsSync(`asset/bir/layout/${code}.html`) || !existsSync(`${ORIGINAL}/forms/BIR-Form${code}.hta`)) continue;
      // only the boxes whose lock hangs on this: a field the engine drives that nothing else fills, opens or computes
      keep[code] = neverOpen(code, blankLock(code).filter((id) => neverCandidate(code, id))).sort();
    }
    const sorted = Object.fromEntries(Object.keys(keep).sort().map((k) => [k, keep[k]]));
    writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
    expect(Object.keys(sorted).length).toBeGreaterThan(0);
  });
});
