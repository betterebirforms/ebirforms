// The web version shows BIR's captured page layouts (asset/bir/layout/, see test/capture-layout.test.ts). They
// are committed and served on GitHub Pages, so: nothing in them may run, every image they name must be bundled,
// and every field the native engine drives must be on the page under BIR's own id (where BIR's page has it).
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { NATIVE_FORM } from "../src/form/registry.ts";

const DIR = "asset/bir/layout";
const layout = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".html")) : [];

describe("captured BIR layouts", () => {
  it("there is a main screen and at least one form", () => {
    expect(layout).toContain("main.html");
    expect(layout.length).toBeGreaterThan(1);
  });

  for (const file of layout) {
    const html = readFileSync(`${DIR}/${file}`, "utf8");
    const code = file.slice(0, -".html".length);

    it(`${file}: nothing that runs`, () => {
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<(iframe|object|embed|link|meta|base)\b/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/(href|src|action)\s*=\s*["']?\s*(javascript|vbscript):/i);
    });

    it(`${file}: every image is bundled, none is fetched from elsewhere`, () => {
      for (const m of html.matchAll(/\{\{base\}\}(img\/[^"')\s]+)/g)) expect(existsSync(`${DIR}/${m[1]}`), m[1]).toBe(true);
      expect(html).not.toMatch(/url\(\s*["']?https?:/i);
      expect(html).not.toMatch(/src\s*=\s*["']?https?:/i);
    });

    if (code !== "main")
      it(`${file}: every field the engine drives is on the page`, () => {
        const def = NATIVE_FORM[code];
        expect(def, `no native form ${code}`).toBeDefined();
        const id = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (m) => m[1]));
        const missing = def!.schema.field.filter((f) => !f.secret && !id.has(f.id)).map((f) => f.id);
        // a few save keys have no box on BIR's own page either: the element is inside an HTML comment in BIR's
        // source (1603's old tax-rate modal), or BIR's code writes the key itself. With BIR's tree at hand, check
        // each one is like that, so a field the capture lost can't hide among them.
        const source = `vendor/original/forms/BIR-Form${code}.hta`;
        if (existsSync(source)) {
          const live = readFileSync(source, "latin1").replace(/<!--[\s\S]*?-->/g, "");
          expect(missing.filter((i) => live.includes(`id="${i}"`))).toEqual([]);
        } else expect(missing.length).toBeLessThan(def!.schema.field.length / 10);
      });
  }
});
