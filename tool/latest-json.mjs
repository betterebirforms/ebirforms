// `node tool/latest-json.mjs <dir>`: writes <dir>/latest.json, the file the app's updater reads
// (https://github.com/betterebirforms/ebirforms/releases/latest/download/latest.json), from the signed update files
// tool/package.mjs put in <dir> on each platform. Run by the release job; exits 1 if a platform is missing, so a
// release never tells some users there is an update they cannot install.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node tool/latest-json.mjs <dir with the release files>");
const { version } = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const repo = process.env.GITHUB_REPOSITORY || "betterebirforms/ebirforms";
const file = readdirSync(dir);

// updater target (`{os}-{arch}[-{installer}]`) → the update file's name ends with
const TARGET = {
  "darwin-aarch64": "_macOS_universal.app.tar.gz",
  "darwin-x86_64": "_macOS_universal.app.tar.gz",
  "windows-x86_64": "_Windows_x64_setup.exe",
  "windows-x86_64-nsis": "_Windows_x64_setup.exe",
  "linux-x86_64": "_Linux_x86_64.AppImage",
  "linux-x86_64-appimage": "_Linux_x86_64.AppImage",
  "linux-x86_64-deb": "_Linux_amd64.deb",
};

// the release notes: this version's section of CHANGELOG.md, as plain lines
function notes() {
  const text = readFileSync("CHANGELOG.md", "utf8");
  const start = text.indexOf(`## v${version}`);
  if (start < 0) return `See what's new: https://github.com/${repo}/releases/tag/v${version}`;
  const rest = text.slice(start).split("\n").slice(1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, end < 0 ? undefined : end).join("\n").trim().replace(/\*\*/g, "");
}

const platforms = {};
const missing = [];
for (const [target, suffix] of Object.entries(TARGET)) {
  const name = file.find((n) => n.endsWith(suffix));
  if (!name || !file.includes(`${name}.sig`)) {
    missing.push(`${target} (${suffix})`);
    continue;
  }
  platforms[target] = {
    signature: readFileSync(join(dir, `${name}.sig`), "utf8").trim(),
    url: `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`,
  };
}
if (missing.length) {
  console.error(`latest.json: no signed update file for ${missing.join(", ")}`);
  process.exit(1);
}
const latest = { version, notes: notes(), pub_date: new Date().toISOString(), platforms };
writeFileSync(join(dir, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
console.log(`latest.json: v${version}, ${Object.keys(platforms).length} targets`);
