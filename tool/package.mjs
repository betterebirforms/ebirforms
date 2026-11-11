// `npm run package`: the counterpart of BIR's Offline eBIRForms Package for this machine's platform — BIR's forms
// inside, the shareable feature set (no BIR server, no BIR helper, no embedded secret), named after the BIR package
// it carries:
//   macOS   dist-package/Offline_eBIRForms_Package_v<bir>_macOS_universal.dmg     (Apple Silicon + Intel)
//   Windows dist-package/Offline_eBIRForms_Package_v<bir>_Windows_x64_setup.exe   (NSIS installer)
//   Linux   dist-package/Offline_eBIRForms_Package_v<bir>_Linux_x86_64.AppImage   (+ _amd64.deb)
//   node tool/package.mjs [--no-stage]     (--no-stage: src-tauri/package-bir/ is already staged, e.g. in CI)
//
// macOS signing: unsigned (ad-hoc) unless APPLE_SIGNING_IDENTITY names a "Developer ID Application: …" certificate in
// the login keychain; Tauri then signs the app with the hardened runtime. With notarization credentials as well —
// APPLE_ID + APPLE_PASSWORD (app-specific) + APPLE_TEAM_ID, or APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH —
// Tauri notarizes the app, and this script notarizes and staples the DMG so Gatekeeper opens it without a warning.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const shell = process.platform === "win32";
const run = (cmd, arg) => execFileSync(cmd, arg, { stdio: "inherit", shell });
if (!process.argv.includes("--no-stage")) run("node", ["tool/stage-package.mjs"]);
const { bir_version } = JSON.parse(readFileSync("src-tauri/package-bir/_package.json", "utf8"));

const PLATFORM = {
  darwin: { target: "universal-apple-darwin", bundle: "app,dmg", out: [["dmg", ".dmg", "macOS_universal.dmg"]] },
  win32: { target: "x86_64-pc-windows-msvc", bundle: "nsis", out: [["nsis", ".exe", "Windows_x64_setup.exe"]] },
  linux: {
    target: "x86_64-unknown-linux-gnu",
    bundle: "appimage,deb",
    out: [["appimage", ".AppImage", "Linux_x86_64.AppImage"], ["deb", ".deb", "Linux_amd64.deb"]],
  },
}[process.platform];
if (!PLATFORM) throw new Error(`no package for ${process.platform}`);

// In-app updates: tauri.package.conf.json asks for signed updater files, which needs the update-signing key
// (TAURI_SIGNING_PRIVATE_KEY [+ _PASSWORD]; CI has them as secrets). Locally it falls back to ~/.tauri/ebirforms-updater.key;
// with no key at all the package is built without updater files (it still updates itself from later releases).
const key_file = join(homedir(), ".tauri", "ebirforms-updater.key");
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && existsSync(key_file)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(key_file, "utf8");
  if (existsSync(`${key_file}.password`)) process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(`${key_file}.password`, "utf8");
}
const signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
if (!signed) console.warn("no update-signing key: building without updater files");
const no_updater_conf = join(tmpdir(), "ebirforms-no-updater.conf.json");
if (!signed) writeFileSync(no_updater_conf, JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
const no_updater = signed ? [] : ["--config", no_updater_conf];

const build = ["tauri", "build", "--target", PLATFORM.target, "--bundles", PLATFORM.bundle, "--config", "src-tauri/tauri.package.conf.json", ...no_updater, "--", "--no-default-features"];
// macOS: bundle_dmg.sh lays the window out through Finder/AppleScript, which fails now and then on a busy machine;
// the second run reuses the compiled app, so a retry costs seconds
try { run("npx", build); } catch { console.error("tauri build failed once — retrying"); run("npx", build); }

mkdirSync("dist-package", { recursive: true });
const made = [];
for (const [dir, ext, suffix] of PLATFORM.out) {
  const bundle_dir = `src-tauri/target/${PLATFORM.target}/release/bundle/${dir}`;
  const file = readdirSync(bundle_dir).find((n) => n.endsWith(ext));
  if (!file) throw new Error(`no ${ext} in ${bundle_dir}`);
  const out = join("dist-package", `Offline_eBIRForms_Package_v${bir_version}_${suffix}`);
  copyFileSync(join(bundle_dir, file), out);
  made.push(out);
  // Windows and Linux update from the installer itself; its signature sits beside it
  if (signed && dir !== "dmg") copyFileSync(join(bundle_dir, `${file}.sig`), `${out}.sig`);
}
// macOS updates from a tarball of the .app (the DMG is only for the first install)
if (signed && process.platform === "darwin") {
  const app_dir = `src-tauri/target/${PLATFORM.target}/release/bundle/macos`;
  const tar = readdirSync(app_dir).find((n) => n.endsWith(".app.tar.gz"));
  const out = join("dist-package", `Offline_eBIRForms_Package_v${bir_version}_macOS_universal.app.tar.gz`);
  copyFileSync(join(app_dir, tar), out);
  copyFileSync(join(app_dir, `${tar}.sig`), `${out}.sig`);
  made.push(out);
}

if (process.platform === "darwin") {
  const out = made[0];
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
}
for (const out of made) console.log(`package: ${out}`);
