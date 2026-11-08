// The docs check: keeps the docs true to the code, so they can't drift between /sync-docs runs. Runs in the gate
// and in CI. What each doc is for: CONTRIBUTING.md "Which doc to update".
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { modList } from "../host/mod.ts";

const git = (...arg: string[]) => execFileSync("git", arg, { encoding: "utf8" });
/** Docs in the repo (tracked or new), not gitignored ones. */
const doc = git("ls-files", "-co", "--exclude-standard", "*.md", ".github/*.yml", ".github/**/*.yml")
  .split("\n")
  .filter((f) => f && existsSync(f));
const markdown = doc.filter((f) => f.endsWith(".md"));
const text = (f: string) => readFileSync(f, "utf8");
const isIgnored = (p: string) => {
  try {
    git("check-ignore", "-q", p);
    return true;
  } catch {
    return false;
  }
};

describe("docs", () => {
  it("every relative link points to a file that is in the repo", () => {
    const bad: string[] = [];
    for (const f of markdown) {
      for (const m of text(f).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        const target = m[1]!;
        if (/^(https?|mailto):/.test(target)) continue;
        const p = normalize(join(dirname(f), target));
        if (!existsSync(p)) bad.push(`${f} → ${target} (missing)`);
        else if (isIgnored(p)) bad.push(`${f} → ${target} (gitignored, so dead on GitHub)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no em dashes in docs, templates or mod descriptions (CONTRIBUTING \"Writing\")", () => {
    const bad = doc.filter((f) => text(f).includes("—"));
    for (const m of modList()) if ((m.title + m.about).includes("—")) bad.push(`mod ${m.id}`);
    expect(bad).toEqual([]);
  });

  it("every `npm run <script>` the docs mention exists", () => {
    const script = Object.keys(JSON.parse(text("package.json")).scripts);
    const bad: string[] = [];
    for (const f of markdown) for (const m of text(f).matchAll(/npm run ([a-z][\w-]*(?::[\w-]+)*)/g)) if (!script.includes(m[1]!)) bad.push(`${f}: npm run ${m[1]}`);
    expect(bad).toEqual([]);
  });

  it("every setting the code reads is documented in docs/development.md", () => {
    const code = git("ls-files", "src", "host", "test", "tool", "bench", "src-tauri/src", "vite.config.ts")
      .split("\n")
      .filter((f) => /\.(ts|tsx|mjs|js|rs)$/.test(f) && existsSync(f));
    const read = new Set<string>();
    for (const f of code) {
      for (const m of text(f).matchAll(/(?:process\.env\.|process\.env\[["']|env::var(?:_os)?\(")((?:EBF|EBIRFORMS|VITE)_[A-Z0-9_]+)/g)) read.add(m[1]!);
    }
    expect(read.size).toBeGreaterThan(10);
    const dev = text("docs/development.md");
    expect([...read].filter((v) => !dev.includes("`" + v + "`")).sort()).toEqual([]);
  });

  it("the changelog has an Unreleased section on top, and the mod folders are all explained", () => {
    expect(text("CHANGELOG.md")).toMatch(/^# Changelog\n[\s\S]*?\n## Unreleased\n/);
    const readme = text("mod/README.md");
    for (const kind of new Set(modList().map((m) => m.kind))) expect(readme, kind).toContain("`" + kind + "/`");
  });
});
