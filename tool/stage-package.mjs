// Stage BIR's form tree for the macOS package (`npm run package`): vendor/original → src-tauri/package-bir/, minus
// everything the package must never carry (AGENTS.md): BIR's native helpers (_installer/, *.exe, *.dll, *.pdb,
// proxy.ini, and the VBScript that calls them) and anything holding a user's data (savefile/, profile/, IAF_*). The packaged app serves this tree until
// the user imports a package of their own. Exit 1 if a forbidden file or string slips into the staging.
//   node tool/stage-package.mjs [src=vendor/original] [out=src-tauri/package-bir]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const src = resolve(process.argv[2] ?? "vendor/original");
const out = resolve(process.argv[3] ?? "src-tauri/package-bir");

const USER_FOLDER = /^(savefile|profile|IAF_[A-Za-z_]+)$/;
export const isExcluded = (rel) => {
  const part = rel.split(/[\\/]/);
  return (
    part[0] === "_installer" ||
    part[0] === "_manifest.json" ||
    (USER_FOLDER.test(part[0]) && part.length > 1) ||
    /\.(exe|dll|pdb|ocx|msi)$/i.test(rel) ||
    /(^|[\\/])proxy\.ini$/i.test(rel) ||
    // VBScript never runs outside IE; it only drives the native helpers, which legacy-shim.js replaces
    /\.vbs$/i.test(rel)
  );
};
// the same parts bench/shareable-check.mjs bans, plus the helpers' names; built from parts so this file never matches
const SECRET = new RegExp(["PH4S" + "SPHR", "ebf" + "SFTP\\.exe", "Encrypt" + "\\.exe"].join("|"));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

if (!existsSync(join(src, "forms/BIR-Form0605.hta"))) {
  console.error(`no BIR tree at ${src} — run: npm run extract -- <Offline_eBIRForms_Package_*.zip>`);
  process.exit(1);
}
const source = existsSync(join(src, "_manifest.json")) ? JSON.parse(readFileSync(join(src, "_manifest.json"), "utf8")).source : null;
// the package's own name carries the version BIR announces (v7.9.6.2.1); the release notes lag behind it (7.9.6.1)
const version = source?.match(/_v(\d+(?:\.\d+)+)\.(?:zip|exe)$/i)?.[1] ??
  readdirSync(src).map((n) => n.match(/^Release Notes ([\d.]+)\.txt$/)?.[1]).filter(Boolean).sort().pop();

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let file_count = 0, byte_count = 0, skip_count = 0;
for (const p of walk(src)) {
  const rel = relative(src, p).split(sep).join("/");
  if (isExcluded(rel)) { skip_count++; continue; }
  const to = join(out, rel);
  mkdirSync(join(to, ".."), { recursive: true });
  cpSync(p, to);
  file_count++;
  byte_count += statSync(p).size;
}
for (const d of ["savefile", "profile", "IAF_RDO_Copy"]) mkdirSync(join(out, d), { recursive: true });
writeFileSync(join(out, "_package.json"), JSON.stringify({ bir_version: version ?? null, source }, null, 2) + "\n");

// the gate: nothing excluded, no secret-bearing string, in what was staged
let bad = 0;
for (const p of walk(out)) {
  const rel = relative(out, p).split(sep).join("/");
  if (rel !== "_package.json" && isExcluded(rel)) bad++;
  else if (SECRET.test(readFileSync(p).toString("latin1"))) { bad++; console.error(`forbidden string in ${rel}`); }
}
console.log(`staged ${file_count} file (${(byte_count / 1e6).toFixed(1)} MB), skipped ${skip_count}; BIR ${version} from ${source}; ${bad} forbidden`);
process.exit(bad === 0 ? 0 : 1);
