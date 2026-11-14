// When sending to BIR fails, BIR's page always says "not submitted ... slow internet connection". The host knows
// better: nothing was sent (try again), or the line dropped mid-send and BIR may have it (wait for the email).
// The shim shows the host's reason instead. Run in Chromium against the real shim, the host answered by a stub.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright";

const SHIM = readFileSync("public/legacy-shim.js", "utf8");
const BIR_FAIL = "Your Tax Return was not submitted online due to any of the \n following reasons that may interrupt the submission process: \n - Slow internet connection \n - Overly restrictive firewall";
// CI installs no Playwright browser: skip there, as the other browser tests do
const HAS_CHROMIUM = await chromium.launch().then((b) => (void b.close(), true), () => false);
const DROPPED = "the connection dropped while sending (upload: broken pipe). BIR may or may not have received your return. Wait for BIR's confirmation email before sending it again.";

describe.skipIf(!HAS_CHROMIUM)("the shim's failed-send message", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  const run = async (send: object) => {
    const page = await browser.newPage();
    const said: string[] = [];
    page.on("dialog", (d) => (said.push(d.message()), void d.accept()));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/shim.js") return route.fulfill({ contentType: "text/javascript", body: SHIM });
      if (url.pathname === "/__vfs") {
        const req = route.request().postDataJSON() as { op: string };
        const body = req.op === "dispatch" ? { ok: true, mode: "1" } : req.op === "send" ? send : { ok: true };
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      }
      return route.fulfill({ contentType: "text/html", body: `<script src="/shim.js" data-token="t" data-submit="1"></script>` });
    });
    await page.goto("http://127.0.0.1:9/");
    const code = await page.evaluate((fail) => {
      const w = window as unknown as { conService: { initConConfig(t: string, f: string): void }; RenameAndSendFile(...a: string[]): number };
      w.conService.initConConfig("123456789000", "0605");
      const c = w.RenameAndSendFile("savefile/123456789000-0605-012026.xml", "a@b.ph", "0605");
      if (c !== 0) window.alert(fail); // what BIR's string-util.js does on a non-zero code
      return c;
    }, BIR_FAIL);
    await page.close();
    return { code, said };
  };

  it("a drop mid-send says BIR may have it, not 'not submitted'", async () => {
    const { code, said } = await run({ ok: true, exit_code: 1, note: DROPPED });
    expect(code).toBe(1);
    expect(said).toEqual(["Sending to BIR: The connection dropped while sending (upload: broken pipe). BIR may or may not have received your return. Wait for BIR's confirmation email before sending it again."]);
  }, 60_000);

  it("with no reason from the host, BIR's own message stays", async () => {
    const { said } = await run({ ok: true, exit_code: 1 });
    expect(said).toEqual([BIR_FAIL]);
  }, 60_000);
});
