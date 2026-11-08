// Shareable build check (ROADMAP P4): `cargo build --no-default-features` must contain nothing that reaches BIR's
// servers or reads BIR's helpers. Exit 0 = clean. Prints counts only, never the matched text.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// built from parts so the check never matches its own source
export const FORBIDDEN = new RegExp(["tin" + "Dispatcher", "birgov" + "ph", "ebf" + "SFTP", "Encrypt" + "\\.exe", "PH4S" + "SPHR"].join("|"));

const manifest = "src-tauri/Cargo.toml";
execFileSync("cargo", ["build", "--no-default-features", "--manifest-path", manifest], { stdio: "inherit" });
const bin = readFileSync("src-tauri/target/debug/ebirforms");
// the same printable-run scan `strings` does, so the result doesn't depend on binutils
const hit = (bin.toString("latin1").match(/[\x20-\x7e]{4,}/g) ?? []).filter((s) => FORBIDDEN.test(s)).length;
console.log(`shareable build: ${hit} forbidden string run(s)`);
process.exit(hit === 0 ? 0 : 1);
