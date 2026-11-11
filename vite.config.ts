import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLegacyHost } from "./host/legacy-server.ts";

// port block 10900–10999 (~/Code/PORTS.md); Tauri devUrl points here
const port = Number(process.env.VITE_DEV_SERVER_PORT ?? 10900);

/** Dev-only: serve BIR's recovered forms at /legacy/ with the compatibility shim and /__vfs. */
function legacyHost(): Plugin {
  const token = randomBytes(16).toString("hex");
  return {
    name: "ebirforms-legacy-host",
    apply: "serve", // dev only; the packaged app is served by src-tauri/src/host.rs
    configureServer(server) {
      const handle = createLegacyHost({
        original_dir: process.env.EBIRFORMS_ORIGINAL_DIR ?? "vendor/original",
        data_dir: process.env.EBIRFORMS_DATA_DIR ?? ".data",
        mod_dir: process.env.EBIRFORMS_MOD_DIR ?? ".mod",
        shim_url: "/legacy-shim.js",
        token,
      });
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
    // the shell talks to /__vfs too; hand it the per-run token
    transformIndexHtml: (html) => html.replace("<head>", `<head><meta name="ebf-token" content="${token}" />`),
  };
}

/** Web build only: the Home Screen install metadata (Safari keeps a Home Screen app's storage past 7 days). */
/** The web build's base path: "/" by default, "/ebirforms/" for GitHub Pages (`EBF_WEB_BASE`, set by the Pages workflow). */
const base = process.env.EBF_WEB_BASE ?? "/";

const webManifest = (): Plugin => ({
  name: "ebirforms-web-manifest",
  // the service worker (public-web/sw.js) precaches every built file listed here, so the app works offline
  generateBundle(_, bundle) {
    this.emitFile({ type: "asset", fileName: "sw-asset.json", source: JSON.stringify(Object.keys(bundle)) }); // relative to the base
  },
  // a static host has no rewrites: /form must exist as a file, and 404.html carries every other route
  // (GitHub Pages serves it for /form/<CODE>); both are the same index.html
  writeBundle(option) {
    const dir = option.dir ?? "dist-web";
    const index = readFileSync(join(dir, "index.html"));
    writeFileSync(join(dir, "404.html"), index);
    // GitHub Pages has no rewrites: give /form and every /form/<code> a real page (200), not the 404.html fallback.
    // The codes are the registry's literal keys plus src/form/entry/<CODE>.ts (bench/web-pages.mjs checks all 84).
    const registry = readFileSync("src/form/registry.ts", "utf8");
    const code = [...registry.matchAll(/^  "([^"]+)": \{/gm)].map((m) => m[1]!);
    code.push(...readdirSync("src/form/entry").filter((n) => n.endsWith(".ts")).map((n) => n.slice(0, -3)));
    for (const c of ["", ...code]) {
      mkdirSync(join(dir, "form", c), { recursive: true });
      writeFileSync(join(dir, "form", c, "index.html"), index);
    }
  },
  transformIndexHtml: (html) =>
    html.replace(
      "</head>",
      `<link rel="manifest" href="${base}manifest.webmanifest" /><link rel="apple-touch-icon" href="${base}apple-touch-icon.png" /><meta name="apple-mobile-web-app-capable" content="yes" /></head>`,
    ),
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "web" ? [webManifest()] : [legacyHost()])],
  base: mode === "web" ? base : "/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: { port, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "safari16",
    outDir: mode === "web" ? "dist-web" : "dist",
    // desktop: the first-run shell (index) and the faux-XP caption strip the window draws above BIR's screen.
    // web: the native forms only, with no BIR page and no shim (ROADMAP P4 "Local-first web version").
    rollupOptions: { input: mode === "web" ? { index: "index.html" } : { index: "index.html", caption: "caption.html" } },
  },
  publicDir: mode === "web" ? "public-web" : "public",
  // The oracle tests each launch a WebKit browser; running all ~20 oracle files fully in parallel exhausts
  // memory (OOM) and makes launches contend. Cap concurrency (maxWorkers) so only a few browsers run at once,
  // retry once to self-heal any transient launch timeout (a genuine bug fails both attempts), and give the
  // per-file browser launch in beforeAll a generous hookTimeout.
  // fsModuleCache off: it caches registry.ts with its import.meta.glob already expanded, so a new
  // src/form/entry/<CODE>.ts stays invisible to tests until the cache is cleared (worktrees share it too).
  test: { include: ["test/**/*.test.ts"], retry: 1, hookTimeout: 120_000, maxWorkers: 3, fsModuleCache: false },
}));
