// Capture each BIR form's LAYOUT for the web version: open the blank form in WebKit after BIR's own scripts have
// laid it out (pickers filled, pages built), then keep only what it looks like. Every live value becomes markup,
// BIR's stylesheet is inlined, images are written once under asset/bir/layout/img/, and every script, event
// handler and javascript: link is removed. The web version shows this inside a shadow root and drives its fields
// with the native engine by the same ids (src/form/LayoutView.tsx). BIR's code never runs on the web.
//   EBF_CAPTURE_LAYOUT=0605,1701Qv2018 npx vitest run test/capture-layout.test.ts   (=1 for every form + main screen)
// Writes asset/bir/layout/<CODE>.html (and main.html for BIRForms.hta). Re-run after importing a newer BIR package.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { ORIGINAL, startOracle } from "./oracle.ts";

const want = process.env.EBF_CAPTURE_LAYOUT;
const DIR = "asset/bir/layout";
const page = existsSync(`${ORIGINAL}/forms`)
  ? [
      ...readdirSync(`${ORIGINAL}/forms`)
        .filter((f) => /^BIR-Form.+\.hta$/.test(f))
        .map((f) => ({ code: f.slice("BIR-Form".length, -".hta".length), url: `/legacy/forms/${f}` })),
      { code: "main", url: "/legacy/BIRForms.hta" },
    ].filter((p) => want === "1" || want?.split(",").includes(p.code))
  : [];

describe.runIf(want)("capture BIR form layouts", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
    mkdirSync(`${DIR}/img`, { recursive: true });
  }, 120_000);
  afterAll(() => oracle?.stop());

  for (const p of page) {
    it(`layout ${p.code}`, async () => {
      const tab = await oracle.browser.newPage({ viewport: { width: 1280, height: 900 } });
      tab.on("dialog", (d) => void d.dismiss());
      await tab.goto(`${oracle.base}${p.url}`);
      await tab.waitForTimeout(2500);
      const { html, image } = await tab.evaluate(async () => {
        // 1. live state into markup, so the static copy opens the way BIR's page did
        for (const el of Array.from(document.querySelectorAll("input, select, textarea")) as HTMLInputElement[]) {
          if (el.type === "radio" || el.type === "checkbox") el.toggleAttribute("checked", el.checked);
          else if (el.tagName === "SELECT") {
            for (const o of Array.from((el as unknown as HTMLSelectElement).options)) o.toggleAttribute("selected", o.selected);
          } else if (el.tagName === "TEXTAREA") el.textContent = el.value;
          else el.setAttribute("value", el.value);
          el.toggleAttribute("disabled", el.disabled);
          el.toggleAttribute("readonly", el.readOnly);
        }
        // 2. every stylesheet as the page has it now: linked, inline, and the rules BIR's scripts inserted (those
        // never show in a <style>'s text). In a shadow root there is no <body> or <html>: their rules go to the
        // .bir-body wrapper and the host.
        const scope = (sel: string) =>
          sel.replace(/(^|[\s,>+~(])html\s+body\b/gi, "$1.bir-body").replace(/(^|[\s,>+~(])body\b/gi, "$1.bir-body").replace(/(^|[\s,>+~(])html\b/gi, "$1:host");
        // a url() in a stylesheet is relative to that sheet (css/…), not to the page: make it absolute
        const absolute = (body: string, base: string) =>
          body.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g, (m, a?: string, b?: string, c?: string) => {
            const u = a ?? b ?? c ?? "";
            return u.startsWith("data:") ? m : `url("${new URL(u, base).href}")`;
          });
        const text = (rule: CSSRule, base: string): string => {
          if (rule instanceof CSSStyleRule) return `${scope(rule.selectorText)} { ${absolute(rule.style.cssText, base)} }`;
          // style.css only @imports reset / rebuild / main.css: inline what they hold
          if (rule instanceof CSSImportRule) return rule.styleSheet ? Array.from(rule.styleSheet.cssRules).map((r) => text(r, rule.styleSheet!.href ?? base)).join("\n") : "";
          if (rule instanceof CSSMediaRule) return rule.media.mediaText.includes("print") ? "" : `@media ${rule.media.mediaText} { ${Array.from(rule.cssRules).map((r) => text(r, base)).join("\n")} }`;
          return absolute(rule.cssText, base);
        };
        let css = "";
        for (const sheet of Array.from(document.styleSheets)) {
          if (sheet.media && sheet.media.mediaText.includes("print")) continue;
          try {
            css += Array.from(sheet.cssRules).map((r) => text(r, sheet.href ?? location.href)).join("\n") + "\n";
          } catch {
            /* a cross-origin sheet: BIR has none */
          }
        }
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        // 3. nothing that runs: scripts, plug-ins, handlers, javascript: links
        for (const el of Array.from(clone.querySelectorAll("script, noscript, object, embed, iframe, link, meta, base, title, style"))) el.remove();
        // comments too: BIR's hold commented-out script tags and notes
        const walk = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
        const comment: Node[] = [];
        while (walk.nextNode()) comment.push(walk.currentNode);
        for (const c of comment) c.parentNode?.removeChild(c);
        for (const el of Array.from(clone.querySelectorAll("*"))) {
          for (const a of Array.from(el.attributes)) {
            if (/^on/i.test(a.name)) el.removeAttribute(a.name);
            else if (/^\s*(javascript|vbscript):/i.test(a.value)) {
              el.setAttribute("data-js", a.name); // the link is still shown; the web version decides what it does
              el.setAttribute(a.name, "#");
            }
          }
        }
        // 4. images: every <img src>, background attribute and css url(), fetched once and named by content
        const image: Record<string, string> = {};
        const urls = new Set<string>();
        for (const el of Array.from(clone.querySelectorAll("[src], [background]"))) {
          const v = el.getAttribute("src") ?? el.getAttribute("background");
          if (v && !v.startsWith("data:") && v !== "#") urls.add(new URL(v, location.href).href);
        }
        const cssUrl = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;
        for (const m of (css + clone.innerHTML).matchAll(cssUrl)) {
          const u = m[1] ?? m[2] ?? m[3] ?? "";
          if (u && !u.startsWith("data:")) urls.add(new URL(u, location.href).href);
        }
        for (const u of urls) {
          try {
            const r = await fetch(u);
            if (!r.ok) continue;
            const b = new Uint8Array(await r.arrayBuffer());
            let s = "";
            for (const x of b) s += String.fromCharCode(x);
            image[u] = btoa(s);
          } catch {
            /* a missing image stays missing, as it was in BIR's page */
          }
        }
        const body = clone.querySelector("body");
        const bodyAttr = body ? Array.from(body.attributes).map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" ") : "";
        const html = `<style>${css}</style>\n<div class="bir-body" ${bodyAttr}>${body ? body.innerHTML : ""}</div>`;
        return { html, image };
      });
      await tab.close();
      // name each image by its bytes; rewrite every reference (absolute or as BIR wrote it) to img/<hash>.<ext>
      let out = html;
      for (const [abs, b64] of Object.entries(image)) {
        const byte = Buffer.from(b64, "base64");
        const ext = (abs.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        const name = `img/${createHash("sha256").update(byte).digest("hex").slice(0, 16)}.${ext}`;
        writeFileSync(`${DIR}/${name}`, byte);
        const path = new URL(abs).pathname; // e.g. /legacy/images/seal.gif
        const tail = path.split("/legacy/")[1] ?? path; // images/seal.gif
        for (const ref of [abs, path, `../${tail}`, tail]) out = out.split(ref).join(`{{base}}${name}`);
      }
      expect(out.length).toBeGreaterThan(1000);
      expect(out).not.toMatch(/<script/i);
      writeFileSync(`${DIR}/${p.code}.html`, out);
    }, 120_000);
  }
});
