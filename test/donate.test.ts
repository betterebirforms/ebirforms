import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DONATE_URL } from "../src/lib/donate.ts";

// One donate page, written in four places: keep them equal.
describe("donate link", () => {
  const handle = new URL(DONATE_URL).pathname.slice(1);
  it("is a Ko-fi page", () => {
    expect(DONATE_URL).toMatch(/^https:\/\/ko-fi\.com\/[A-Za-z0-9_]+$/);
  });
  it("matches GitHub's FUNDING.yml", () => {
    expect(readFileSync(".github/FUNDING.yml", "utf8")).toMatch(new RegExp(`^ko_fi: ${handle}$`, "m"));
  });
  it("matches the desktop menu", () => {
    expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(`const DONATE_URL: &str = "${DONATE_URL}";`);
  });
  it("is in the README", () => {
    expect(readFileSync("README.md", "utf8")).toContain(`(${DONATE_URL})`);
  });
});
