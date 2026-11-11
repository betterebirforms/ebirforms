// npm run mod:check (tool/mod-check.ts) catches broken mods, and the Mods screen's switch (setModSwitch) writes
// mod.json without touching the mod. The Rust twin of the switch is tested in src-tauri/src/bir_mod.rs.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { modList, setModSwitch } from "../host/mod.ts";

const dir = mkdtempSync(join(tmpdir(), "ebf-modcheck-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const put = (name: string, body: unknown) => {
  mkdirSync(join(dir, name.split("/")[0]!), { recursive: true });
  writeFileSync(join(dir, `${name}.json`), typeof body === "string" ? body : JSON.stringify(body));
};
// a one-page stand-in for BIR's tree, so the dry run runs too
const tree = join(dir, "..", `${dir.split("/").pop()}-tree`);
mkdirSync(join(tree, "forms"), { recursive: true });
writeFileSync(join(tree, "forms", "BIR-Form0605.hta"), "<html><body>a</body></html>");
afterAll(() => rmSync(tree, { recursive: true, force: true }));
const check = () => spawnSync(process.execPath, ["tool/mod-check.ts", dir, "--bir", tree], { encoding: "utf8" });

describe("mod:check", () => {
  it("passes a good mod", () => {
    put("improve/good", { title: "Good", about: "Fine.", file: "form", rule: [{ text: "a", to: "b" }] });
    const r = check();
    expect(r.stdout).toContain("0 error(s)");
    expect(r.stdout).toMatch(/improve\/good: 1 file\(s\); rule 1: 1\/1/);
    expect(r.status).toBe(0);
  });

  it("fails what the Rust engine would refuse, a missing script, and a missing title", () => {
    put("improve/lookahead", { title: "L", about: "x", file: "form", rule: [{ find: "a(?=b)", to: "c" }] });
    put("improve/no-script", { title: "S", about: "x", file: "form", rule: [{ inject: "missing.js" }] });
    put("improve/no-title", { about: "x", file: "form", rule: [{ text: "a", to: "b" }] });
    put("improve/two-action", { title: "T", about: "x", file: "form", rule: [{ text: "a", find: "b", to: "c" }] });
    const r = check();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/lookahead/);
    expect(r.stdout).toMatch(/inject script not found/);
    expect(r.stdout).toMatch(/missing `title`/);
    expect(r.stdout).toMatch(/exactly one of/);
  });
});

describe("Mods screen switch", () => {
  it("writes mod.json and leaves the mod alone", () => {
    const user = mkdtempSync(join(tmpdir(), "ebf-modswitch-"));
    expect(setModSwitch(user, "fix/print-button-hide", false)).toBe(true);
    expect(modList(user).find((m) => m.id === "fix/print-button-hide")?.on).toBe(false);
    expect(JSON.parse(readFileSync(join(user, "mod.json"), "utf8"))).toEqual({ on: [], off: ["fix/print-button-hide"] });
    expect(setModSwitch(user, "fix/print-button-hide", true)).toBe(true);
    expect(modList(user).find((m) => m.id === "fix/print-button-hide")?.on).toBe(true);
    expect(setModSwitch(user, "fix/no-such-mod", true)).toBe(false);
    rmSync(user, { recursive: true, force: true });
  });
});
