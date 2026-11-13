// What the downloads promise (README "Online Submit", the release page, the app's own Submit message): nothing is
// sent to BIR. That rests on one thing: every packaged build drops the `bir-submit` Cargo feature, which is on by
// default for local development. This keeps the promise true if the packaging step changes.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const text = (f: string) => readFileSync(f, "utf8");

describe("release builds send nothing to BIR", () => {
  it("bir-submit is the only thing that turns submission on", () => {
    expect(text("src-tauri/Cargo.toml")).toMatch(/^bir-submit = \[/m);
  });

  it("tool/package.mjs builds every package with --no-default-features", () => {
    const build = text("tool/package.mjs")
      .split("\n")
      .filter((l) => /\["tauri", "build"/.test(l));
    expect(build.length).toBe(1);
    expect(build[0]).toContain('"--no-default-features"');
    expect(build[0]).not.toMatch(/"--features"|bir-submit/);
  });

  it("no CI workflow packages a build some other way", () => {
    const dir = ".github/workflows";
    for (const f of readdirSync(dir)) expect(text(`${dir}/${f}`), f).not.toMatch(/tauri build|--features/);
  });

  it("the app's Submit message says the return is not filed", () => {
    expect(text("public/legacy-shim.js")).toContain("Nothing was sent to BIR. Your return is NOT filed yet.");
  });
});
