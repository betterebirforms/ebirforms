// Print check (ROADMAP P4, r/taxPH yunaheart): render BIR forms to PDF on A4, Legal (8.5x14) and PH long bond
// (8.5x13) and report, per page, whether ink touches the right edge (= cut off). Chromium's PDF engine stands in
// for the macOS print sheet, which can't be driven headlessly — a proxy, not the real dialog.
// Red-green proven 2026-11-08: green → EBF_PRINT_INJECT=1 red (fit_scale 0.30) → green.
//   EBF_PRINT=1 npx vitest run test/print-check.test.ts   (or EBF_PRINT=1701Qv2018,0605)  → bench/result/print-check.json
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createLegacyHost } from "../host/legacy-server.ts";

const want = process.env.EBF_PRINT;
const code = want && want !== "1" ? want.split(",") : ["1701Qv2018", "2551Qv2018"];
const paper = [
  { name: "A4", width: "210mm", height: "297mm", inch: 210 / 25.4 },
  { name: "Legal", width: "8.5in", height: "14in", inch: 8.5 },
  { name: "Long bond", width: "8.5in", height: "13in", inch: 8.5 },
];

/** Rightmost inked column of a PGM (P5) image, and its width. */
function rightInk(pgm: Buffer): { width: number; right: number } {
  const head = pgm.toString("latin1", 0, 64).split(/\s+/);
  const width = Number(head[1]), height = Number(head[2]);
  const off = pgm.length - width * height;
  let right = -1;
  for (let y = 0; y < height; y++)
    for (let x = width - 1; x > right; x--) if ((pgm[off + y * width + x] ?? 255) < 200) { right = x; break; }
  return { width, right };
}

describe.runIf(want && existsSync("vendor/original/forms"))("print: no page cut off on A4 / Legal / long bond", () => {
  it("renders and measures", async () => {
    const data_dir = mkdtempSync(join(tmpdir(), "ebf-print-"));
    const handle = createLegacyHost({ original_dir: "vendor/original", data_dir, shim_url: "/legacy-shim.js", token: "t" });
    const shim = readFileSync("public/legacy-shim.js");
    const server = createServer((req, res) => {
      if (req.url === "/legacy-shim.js") res.writeHead(200, { "content-type": "text/javascript" }).end(shim);
      else void handle(req, res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const browser = await chromium.launch();

    const result: Record<string, unknown>[] = [];
    for (const c of code) {
      const page = await browser.newPage();
      page.on("dialog", (d) => void d.accept());
      await page.goto(`${base}/legacy/forms/BIR-Form${c}.hta`);
      await page.waitForTimeout(2500);
      await page.emulateMedia({ media: "print" });
      // red-proof hook: EBF_PRINT_INJECT=1 adds a 2400 px bar, which must turn this test red
      if (process.env.EBF_PRINT_INJECT) await page.addStyleTag({ content: "body::after{content:'';display:block;width:2400px;height:20px;background:#000}" });
      for (const p of paper) {
        // the PDF can't show a cut-off edge (Chromium shrinks to fit), so measure the layout instead: at the
        // printable width (paper − 0.8 in margins, 96 css px/in) nothing may be wider than the page
        const printable = Math.floor((p.inch - 0.8) * 96);
        await page.setViewportSize({ width: printable, height: 1200 });
        const overflow_px = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
        const dir = mkdtempSync(join(tmpdir(), "ebf-pdf-"));
        const pdf = join(dir, "out.pdf");
        await page.pdf({ path: pdf, width: p.width, height: p.height, printBackground: true, margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" } });
        const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
        const page_count = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
        const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
        execFileSync("pdftoppm", ["-r", "40", "-gray", pdf, join(dir, "p")]);
        const page_ink = readdirSync(dir).filter((f) => f.endsWith(".pgm")).sort().map((f) => rightInk(readFileSync(join(dir, f))));
        // 0.4in margin at 40 dpi = 16 px; ink within 2 px of the paper edge means the page is cut off
        const clipped = page_ink.filter((k) => k.right >= k.width - 3).length;
        result.push({ form: c, paper: p.name, page_size_pt: size ? `${size[1]}x${size[2]}` : "?", page_count, clipped_page: clipped, overflow_px, fit_scale: Number((printable / (printable + Math.max(0, overflow_px))).toFixed(2)) });
      }
      await page.close();
    }
    await browser.close();
    server.close();
    mkdirSync("bench/result", { recursive: true });
    writeFileSync("bench/result/print-check.json", JSON.stringify({ date: new Date().toISOString().slice(0, 10), engine: "chromium page.pdf (proxy for the macOS print sheet)", result }, null, 1) + "\n");
    console.table(result);
    // Measured 2026-11-08: BIR's forms are 127–171 px wider than the printable width on all three papers, so
    // they print only because the browser shrinks to fit (fit_scale 0.80–0.85). Fail when the shrink would go
    // below 0.75 (assumed legibility floor) or the PDF shows ink at the edge. The 2400 px bar scores ~0.30.
    expect(result.filter((r) => (r.clipped_page as number) > 0 || (r.fit_scale as number) < 0.75)).toEqual([]);
  }, 300_000);
});
