// The update prompt's notes stay short: the Mac alert grows with its text, and v0.2.1's full list pushed
// Install and Restart below the screen (reported 2026-11-17).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shortNote, CHANGELOG_URL, MAX_BULLET, MAX_CHAR } from "../tool/short-note.mjs";

const section = (version: string) => {
  const text = readFileSync("CHANGELOG.md", "utf8");
  const rest = text.slice(text.indexOf(`## v${version}`)).split("\n").slice(1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, end).join("\n");
};

describe("update prompt notes", () => {
  it("v0.2.1's 30 bullets become 4 and a pointer to the rest", () => {
    const note: string = shortNote(section("0.2.1"));
    const line = note.split("\n");
    expect(line.filter((l) => l.startsWith("- ")).length).toBe(MAX_BULLET);
    expect(line.at(-1)).toMatch(new RegExp(`^And \\d+ more changes: ${CHANGELOG_URL}$`));
    expect(line.every((l) => l.length <= MAX_CHAR + CHANGELOG_URL.length)).toBe(true);
  });

  it("every released version's note fits in about 900 characters", () => {
    const version = [...readFileSync("CHANGELOG.md", "utf8").matchAll(/^## v(\S+)/gm)].map((m) => m[1]!);
    expect(version.length).toBeGreaterThan(5);
    for (const v of version) expect(shortNote(section(v)).length, v).toBeLessThan(MAX_BULLET * MAX_CHAR + 200);
  });

  it("a short note keeps every bullet and still links the full list", () => {
    expect(shortNote("- One fix.\n- Two fix.")).toBe(`- One fix.\n- Two fix.\n\nDetails: ${CHANGELOG_URL}`);
  });
});
