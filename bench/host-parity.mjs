// Every page and script must be served byte-identically by the Node dev host and the packaged Rust host
// (token aside): both run the same mods (mod/). Run `npm run dev` and the Rust host, then:
//   node bench/host-parity.mjs
// Rust host without a window: cargo run --manifest-path src-tauri/Cargo.toml --example host -- dist vendor/original <data dir> 10907
import { readdirSync } from "node:fs";

const node = process.env.EBIRFORMS_URL ?? "http://127.0.0.1:10900";
const rust = process.env.EBIRFORMS_HOST_URL ?? "http://127.0.0.1:10907";
const root = "vendor/original";
const norm = (t) => t.replace(/data-token="[0-9a-f]+"/, 'data-token="X"');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const file = walk(root)
  .map((p) => p.slice(root.length + 1))
  .filter((p) => /\.(hta|js)$/i.test(p) && !p.startsWith("_"));
const diff = [];
for (const f of file) {
  const url = f.split("/").map(encodeURIComponent).join("/");
  const [a, b] = await Promise.all([node, rust].map((u) => fetch(`${u}/legacy/${url}`).then((r) => r.text())));
  if (norm(a) !== norm(b)) diff.push(f);
}
console.log(`identical ${file.length - diff.length} / ${file.length}`, diff.length ? diff : "");
process.exit(diff.length ? 1 : 0);
