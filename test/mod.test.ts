import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMod, modList, modSummary } from "../host/mod.ts";

describe("mods (mod/README.md)", () => {
  it("every built-in mod is in a kind folder, compiles, and explains itself in plain words", () => {
    const list = modList();
    expect(list.length).toBeGreaterThanOrEqual(20);
    for (const m of list) {
      expect(["fix", "compat", "security", "speed", "remove", "improve"], m.id).toContain(m.kind);
      expect(m.title.length, m.id).toBeGreaterThan(0);
      expect(m.about.length, m.id).toBeGreaterThan(20);
      expect(m.title + m.about, `${m.id}: no em dashes`).not.toContain("—");
      expect(m.rule.length, m.id).toBeGreaterThan(0);
      for (const r of m.rule) if (r.find) expect(() => new RegExp(r.find!), m.id).not.toThrow();
    }
  });

  it("a user mod is added, can inject a script, and is switched on and off without a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebf-mod-"));
    try {
      mkdirSync(join(dir, "improve"));
      writeFileSync(
        join(dir, "improve/hello.json"),
        JSON.stringify({ title: "t", about: "a", file: "form", form: ["0605"], rule: [{ inject: "hello.js" }, { find: "(x)(y)", to: "$2$1$$" }] }),
      );
      writeFileSync(join(dir, "improve/hello.js"), "window.hello = 1;");
      const page = "<body>xy</body>";
      // same expected output as the Rust test in src-tauri/src/bir_mod.rs
      expect(applyMod(modList(dir), "forms/BIR-Form0605.hta", page)).toBe("<body>yx$<script>\nwindow.hello = 1;\n</script></body>");
      expect(applyMod(modList(dir), "forms/BIR-Form1601E.hta", page)).toBe(page);

      writeFileSync(join(dir, "mod.json"), JSON.stringify({ off: ["improve/hello", "fix/print-button-hide"] }));
      const list = modList(dir);
      expect(applyMod(list, "forms/BIR-Form0605.hta", "<body>xy $(this.id)</body>")).toBe("<body>xy $(this.id)</body>");
      expect(modSummary(list).filter((m) => !m.on).map((m) => m.id)).toEqual(["fix/print-button-hide", "improve/hello"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a broken user mod is skipped, not fatal", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebf-mod-"));
    try {
      mkdirSync(join(dir, "fix"));
      writeFileSync(join(dir, "fix/broken.json"), "{ not json");
      expect(modList(dir).some((m) => m.id === "fix/broken")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
