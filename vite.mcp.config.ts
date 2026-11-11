// `npm run build:mcp`: the agent server (mcp/main.ts) as one Node file, dist-mcp/ebirforms-mcp.mjs.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  publicDir: false,
  build: {
    ssr: "mcp/main.ts",
    outDir: "dist-mcp",
    target: "node20",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "ebirforms-mcp.mjs", banner: "#!/usr/bin/env node" } },
  },
  ssr: { noExternal: true },
});
