#!/usr/bin/env node
// ebf-doctor — turnkey macOS verification for the eBIRForms port (pattern borrowed from rootstacks' bs-doctor).
// Run this ON THE MACBOOK. It checks the toolchain, optionally runs the gate and builds the Apple-Silicon .dmg,
// locates the bundle, and prints the manual print-verification steps. Read-only by default.
//
//   node bin/ebf-doctor.mjs            # checks only (safe, fast)
//   node bin/ebf-doctor.mjs --gate     # also run `npm run gate` (typecheck + vitest)
//   node bin/ebf-doctor.mjs --build    # also build the aarch64 .dmg (slow; needs Rust + Xcode CLT)
//
// Exit code is non-zero if any hard check fails, so it can gate CI or a release script.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { arch, platform, release } from "node:os";

const arg = new Set(process.argv.slice(2));
const want = (f) => arg.has(f);
let hardFail = 0;

const ICON = { ok: "✓", warn: "!", bad: "✗", info: "·" };
const line = (level, label, detail = "") => {
  if (level === "bad") hardFail++;
  console.log(`  ${ICON[level]} ${label}${detail ? ` — ${detail}` : ""}`);
};
const run = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const tryRun = (cmd) => {
  try {
    return run(cmd);
  } catch {
    return null;
  }
};

console.log("\neBIRForms — macOS port doctor\n");

// --- platform -------------------------------------------------------------
console.log("Platform");
const isMac = platform() === "darwin";
if (isMac) line("ok", "macOS", `Darwin ${release()}`);
else line("warn", "not macOS", `${platform()} — runtime/build checks are macOS-only; repo checks still run`);
if (isMac && arch() === "arm64") line("ok", "Apple Silicon", "arm64");
else if (isMac) line("warn", "not arm64", `${arch()} — build the matching target, or use a universal bundle`);

// --- toolchain ------------------------------------------------------------
console.log("\nToolchain");
const node = process.versions.node;
if (Number(node.split(".")[0]) >= 20) line("ok", "Node", `v${node}`);
else line("bad", "Node too old", `v${node} (need ≥ 20)`);

const cargo = tryRun("cargo --version");
if (cargo) line("ok", "Rust", cargo);
else line(isMac && want("--build") ? "bad" : "warn", "Rust not found", "install via https://rustup.rs for the Tauri build");

if (isMac) {
  const xcode = tryRun("xcode-select -p");
  if (xcode) line("ok", "Xcode CLT", xcode);
  else line(want("--build") ? "bad" : "warn", "Xcode CLT missing", "run: xcode-select --install");
}

const tauri = tryRun("npx --no-install tauri --version") ?? tryRun("npx tauri --version");
if (tauri) line("ok", "Tauri CLI", tauri);
else line("warn", "Tauri CLI not resolved", "it is a dev-dependency; `npm install` first");

// --- repo gate ------------------------------------------------------------
console.log("\nRepo");
if (existsSync("vendor/original/forms")) {
  const n = readdirSync("vendor/original/forms").filter((f) => f.endsWith(".hta")).length;
  line("ok", "decompiled form tree", `${n} forms in vendor/original`);
} else line("bad", "vendor/original missing", "the decompiled tree is required");

if (want("--gate")) {
  console.log("  · running `npm run gate` (typecheck + tests)…");
  try {
    execSync("npm run gate", { stdio: "inherit" });
    line("ok", "gate passed", "typecheck + vitest green");
  } catch {
    line("bad", "gate failed", "see output above");
  }
} else line("info", "gate skipped", "pass --gate to run typecheck + tests");

// --- bundle ---------------------------------------------------------------
console.log("\nmacOS bundle");
const findDmg = () => {
  const roots = ["src-tauri/target/release/bundle/dmg", "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg", "src-tauri/target/universal-apple-darwin/release/bundle/dmg"];
  for (const r of roots) {
    if (existsSync(r)) {
      const dmg = readdirSync(r).filter((f) => f.endsWith(".dmg")).map((f) => join(r, f));
      if (dmg.length) return dmg.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    }
  }
  return null;
};

if (want("--build")) {
  if (!isMac) line("bad", "cannot build", "--build requires macOS");
  else {
    console.log("  · building aarch64 .dmg (this is slow)…");
    try {
      execSync("npx tauri build --target aarch64-apple-darwin", { stdio: "inherit" });
    } catch {
      line("bad", "build failed", "see output above");
    }
  }
}

const dmg = findDmg();
if (dmg) line("ok", "bundle found", dmg);
else line(isMac ? "warn" : "info", "no .dmg yet", "build it: npx tauri build --target aarch64-apple-darwin");

// --- manual steps ---------------------------------------------------------
console.log("\nManual verification (the part a script can't do)");
for (const step of [
  dmg ? `open "${dmg}" — then drag eBIRForms to /Applications and launch it` : "build the .dmg (above), then open it and install to /Applications",
  "First launch: right-click → Open (unsigned build) to clear Gatekeeper, or `xattr -dr com.apple.quarantine /Applications/eBIRForms.app`",
  "Open any form (e.g. 0605) — confirm it renders and the computed totals update as you type",
  "File → Print (or ⌘P) → Save as PDF — confirm the layout matches the legacy form (no clipped fields, totals present)",
  "Open a form you saved on Windows — confirm values round-trip identically",
  "Report back: launch OK? print layout OK? any console errors (Console.app → filter 'eBIRForms')?",
]) console.log(`  ${ICON.info} ${step}`);

console.log(`\n${hardFail === 0 ? "✓ no blocking issues" : `✗ ${hardFail} blocking issue(s)`}\n`);
process.exit(hardFail === 0 ? 0 : 1);
