// Source bundle for BIR's engineers (ROADMAP P4, proposal §4.1): the shareable tree only.
// No vendor/, no BIR helpers, no submission modules, no internal BIR/business notes; Cargo builds without
// `bir-submit` by default. Fails if any forbidden string survives. Prints counts, never matched text.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const EXCLUDE = [
  /^vendor\//,
  /^src-tauri\/src\/(dispatch|submit|crypto)\.rs$/,
  /^test\/fixture\/(encrypt|uploaded)/,
  /^docs\/bir\//,
  /^docs\/bir-accreditation\.md$/,
  /^docs\/brainstorm\//,
  /^docs\/analysis\/(native|web)-layer\.md$/, // reverse-engineering notes: go to BIR in the private disclosure
  /^TASK\.md$/,
  /_installer\//,
  /\.(exe|dll|pdb)$/i,
  /(^|\/)proxy\.ini$/i,
];
// built from parts so this script doesn't flag itself; scanned in code only (docs may name BIR's endpoint)
const FORBIDDEN = new RegExp(["tin" + "Dispatcher", "birgov" + "ph", "PH4S" + "SPHR", "UAT_HOST" + "_BLOB"].join("|"));
const CODE = /\.(rs|ts|tsx|js|mjs|cjs|json|html|css|toml)$/;

const git = (...a) => execFileSync("git", a, { encoding: "utf8" });
const sha = git("rev-parse", "--short", "HEAD").trim() + (git("status", "--porcelain").trim() ? "-dirty" : "");
const file = git("ls-files", "-co", "--exclude-standard").split("\n").filter(Boolean);
const kept = file.filter((f) => !EXCLUDE.some((r) => r.test(f)));

const stage = join("dist", `ebirforms-review-${sha}`);
rmSync(stage, { recursive: true, force: true });
let flagged = 0;
for (const f of kept) {
  let body;
  try { body = readFileSync(f); } catch { continue; } // deleted in the work tree
  if (CODE.test(f) && FORBIDDEN.test(body.toString("latin1"))) { flagged++; console.error(`forbidden string in ${f}`); }
  mkdirSync(join(stage, dirname(f)), { recursive: true });
  cpSync(f, join(stage, f));
}
const cargo = join(stage, "src-tauri/Cargo.toml");
writeFileSync(cargo, readFileSync(cargo, "utf8").replace(/^default = \["bir-submit"\]$/m, "default = []"));

if (flagged) { console.error(`${flagged} file(s) carry forbidden strings — bundle not written`); process.exit(1); }
const out = `${stage}.tar.gz`;
execFileSync("tar", ["czf", out, "-C", "dist", `ebirforms-review-${sha}`]);
rmSync(stage, { recursive: true, force: true });
console.log(`${out}: ${kept.length} files kept, ${file.length - kept.length} excluded`);
