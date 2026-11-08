// `npm run package`: the macOS counterpart of BIR's Offline eBIRForms Package — one universal (Apple silicon + Intel)
// DMG with BIR's forms inside, the shareable feature set (no BIR server, no BIR helper, no embedded secret), named
// after the BIR package it carries: dist-package/Offline_eBIRForms_Package_v<bir>_macOS_universal.dmg
//
// Signing: unsigned (ad-hoc) unless APPLE_SIGNING_IDENTITY names a "Developer ID Application: …" certificate in the
// login keychain; Tauri then signs the app with the hardened runtime. With notarization credentials as well —
// APPLE_ID + APPLE_PASSWORD (app-specific) + APPLE_TEAM_ID, or APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH —
// Tauri notarizes the app, and this script notarizes and staples the DMG so Gatekeeper opens it without a warning.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const run = (cmd, arg) => execFileSync(cmd, arg, { stdio: "inherit" });
run("node", ["tool/stage-package.mjs"]);
const { bir_version } = JSON.parse(readFileSync("src-tauri/package-bir/_package.json", "utf8"));
const build = ["tauri", "build", "--target", "universal-apple-darwin", "--config", "src-tauri/tauri.package.conf.json", "--", "--no-default-features"];
// bundle_dmg.sh lays the window out through Finder/AppleScript, which fails now and then on a busy machine; the
// second run reuses the compiled app, so a retry costs seconds
try { run("npx", build); } catch { console.error("tauri build failed once (usually the DMG step) — retrying"); run("npx", build); }
const dmg_dir = "src-tauri/target/universal-apple-darwin/release/bundle/dmg";
const dmg = readdirSync(dmg_dir).find((n) => n.endsWith(".dmg"));
mkdirSync("dist-package", { recursive: true });
const out = join("dist-package", `Offline_eBIRForms_Package_v${bir_version}_macOS_universal.dmg`);
copyFileSync(join(dmg_dir, dmg), out);
const env = process.env;
const notary = env.APPLE_ID && env.APPLE_PASSWORD && env.APPLE_TEAM_ID
  ? ["--apple-id", env.APPLE_ID, "--password", env.APPLE_PASSWORD, "--team-id", env.APPLE_TEAM_ID]
  : env.APPLE_API_KEY && env.APPLE_API_ISSUER && env.APPLE_API_KEY_PATH
    ? ["--key", env.APPLE_API_KEY_PATH, "--key-id", env.APPLE_API_KEY, "--issuer", env.APPLE_API_ISSUER]
    : null;
if (env.APPLE_SIGNING_IDENTITY) {
  run("codesign", ["--force", "--timestamp", "--sign", env.APPLE_SIGNING_IDENTITY, out]);
  if (notary) {
    run("xcrun", ["notarytool", "submit", out, "--wait", ...notary]);
    run("xcrun", ["stapler", "staple", out]);
  } else console.warn("signed, not notarized: set APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID (or the APPLE_API_* trio)");
} else console.warn("unsigned (ad-hoc): set APPLE_SIGNING_IDENTITY to a Developer ID Application certificate to sign");
console.log(`package: ${out}`);
