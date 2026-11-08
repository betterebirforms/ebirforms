// BIR's real main screen (BIRForms.hta) is the app's shell, served 1:1 through the same host + shim the
// forms use. It used to 302 to a React redesign; this guards that it now renders the authentic page.
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createLegacyHost } from "../host/legacy-server";

const ORIGINAL = "vendor/original";
const has_original = existsSync(`${ORIGINAL}/BIRForms.hta`);

describe.skipIf(!has_original)("the main screen serves 1:1", () => {
  async function serve(): Promise<{ server: Server; base: string }> {
    const data_dir = mkdtempSync(join(tmpdir(), "ebf-main-"));
    const handle = createLegacyHost({ original_dir: ORIGINAL, data_dir, shim_url: "/legacy-shim.js", token: "t" });
    const shim = readFileSync("public/legacy-shim.js");
    const server = createServer((req, res) => {
      if (req.url === "/legacy-shim.js") res.writeHead(200, { "content-type": "text/javascript" }).end(shim);
      else void handle(req, res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    server.on("close", () => rmSync(data_dir, { recursive: true, force: true }));
    return { server, base };
  }

  it("renders BIRForms.hta with the shim instead of redirecting away", async () => {
    const { server, base } = await serve();
    try {
      const res = await fetch(`${base}/legacy/BIRForms.hta`, { redirect: "manual" });
      expect(res.status).toBe(200); // not 302
      const html = await res.text();
      // the shim is injected, exactly as for a form
      expect(html).toContain("/legacy-shim.js");
      // BIR's own main-screen markup is intact
      expect(html).toContain("Offline eBIRForms Package");
      expect(html).toMatch(/List of BIR Forms/i);
      expect(html).toContain('id="formType"'); // the 80-form picker
      // saved returns sort by real date (WL bug 14), served patched
      expect(html).toContain(`returnsList[i] = dtCreated.substr(6, 4) + '/' + dtCreated.substr(0, 5) + dtCreated.substr(10) + "<tr>`);
    } finally {
      server.close();
    }
  });
});
