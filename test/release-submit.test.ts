// What the downloads promise (README "Online Submit", the release page, the app's own messages): Submit sends
// nothing to BIR until the user turns on Go > Send Returns to BIR (beta), and the package never carries BIR's
// helpers or the keys inside them (the app fetches those from BIR's own zip). This keeps both true.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const text = (f: string) => readFileSync(f, "utf8");

describe("online submission in the downloads", () => {
  it("is built in: tool/package.mjs keeps the default features (bir-submit)", () => {
    const build = text("tool/package.mjs")
      .split("\n")
      .filter((l) => /\["tauri", "build"/.test(l));
    expect(build.length).toBe(1);
    expect(build[0]).not.toContain("--no-default-features");
    expect(text("src-tauri/Cargo.toml")).toMatch(/^default = \["bir-submit"\]/m);
  });

  it("no CI workflow builds a package some other way", () => {
    const dir = ".github/workflows";
    for (const f of readdirSync(dir)) expect(text(`${dir}/${f}`), f).not.toMatch(/tauri build|--features/);
  });

  it("is off until the user turns it on: the page may submit only when the host says so", () => {
    const host = text("src-tauri/src/host.rs");
    expect(host).toContain('data-submit="{}"');
    expect(host).toMatch(/if self\.submit_on\(\) \{ 1 \} else \{ 0 \}/);
    expect(host).toMatch(/cfg!\(feature = "bir-submit"\) && crate::submit_setting::enabled\(&self\.data\)/);
    expect(text("src-tauri/src/submit_setting.rs")).toMatch(/\["enabled"\]\.as_bool\(\)\.unwrap_or\(false\)/);
    expect(text("public/legacy-shim.js")).toContain('getAttribute("data-submit") === "1"');
  });

  it("the package never carries BIR's helpers: staging refuses _installer/ and every .exe", () => {
    const stage = text("tool/stage-package.mjs");
    expect(stage).toContain('part[0] === "_installer"');
    expect(stage).toMatch(/\\\.\(exe\|dll\|pdb/);
  });

  it("the keys come from BIR's own zip on bir.gov.ph, at the user's request", () => {
    expect(text("src-tauri/src/bir_key.rs")).toMatch(/BIR_ZIP_URL: &str = "https:\/\/bir-cdn\.bir\.gov\.ph\//);
  });

  it("the app's messages say what was and wasn't filed", () => {
    const shim = text("public/legacy-shim.js");
    expect(shim).toContain("Nothing was sent to BIR. Your return is NOT filed yet.");
    expect(shim).toContain("your return is filed only when BIR's confirmation email arrives");
  });
});
