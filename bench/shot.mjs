// Screenshot any app URL in WebKit:  node bench/shot.mjs <path> <out.png> [width] [height]
import { webkit } from "playwright";
const [path = "/", out = "shot.png", w = "1280", h = "860"] = process.argv.slice(2);
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
const err = [];
p.on("pageerror", (e) => err.push(e.message));
await p.goto(`${process.env.EBIRFORMS_URL ?? "http://127.0.0.1:10900"}${path}`);
await p.waitForTimeout(1500);
await p.screenshot({ path: out });
if (err.length) console.log("pageerror:", err);
await b.close();
