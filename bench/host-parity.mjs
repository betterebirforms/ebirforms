// Every form page must be served byte-identically by the Node dev host and the packaged Rust host
// (token aside). Run `npm run dev` and the release app, then:  node bench/host-parity.mjs
import { readdirSync } from "node:fs";

const node = process.env.EBIRFORMS_URL ?? "http://127.0.0.1:10900";
const rust = process.env.EBIRFORMS_HOST_URL ?? "http://127.0.0.1:10907";
const norm = (t) => t.replace(/data-token="[0-9a-f]+"/, 'data-token="X"');
const form = readdirSync("vendor/original/forms").filter((f) => f.endsWith(".hta"));
const diff = [];
for (const f of form) {
  const [a, b] = await Promise.all([node, rust].map((u) => fetch(`${u}/legacy/forms/${encodeURIComponent(f)}`).then((r) => r.text())));
  if (norm(a) !== norm(b)) diff.push(f);
}
console.log(`identical ${form.length - diff.length} / ${form.length}`, diff.length ? diff : "");
process.exit(diff.length ? 1 : 0);
