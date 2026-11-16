// The web version's upload end to end: browser SSH (src/submit/sftp.ts) through the relay (relay/server.mjs) to a
// real SFTP server, then the file read back and decrypted. Start one first:
//   docker run -d --name ebf-sftp -p 127.0.0.1:10922:22 atmoz/sftp:alpine "bir:secret:::1701Qv2008"
//   EBIRFORMS_SFTP=127.0.0.1:10922 npx vitest run test/submit-sftp.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { SubmitError, upload, type SubmitTarget } from "../src/submit/sftp.ts";
import { createRelay } from "../relay/server.mjs";

// run the SSH library's browser code (WebCrypto), the code the web version runs, not its Node code
vi.hoisted(() => Object.assign(globalThis, { self: globalThis }));

const addr = process.env.EBIRFORMS_SFTP ?? "";
const [sftpHost, sftpPort] = addr.split(":");
const WS = createRequire(import.meta.url)("../relay/node_modules/ws") as { WebSocket: new (url: string, option: { origin: string }) => WebSocket };
const ORIGIN = "http://127.0.0.1:10900";

describe.skipIf(!addr)("upload through the relay", () => {
  let relay: { server: import("node:http").Server; close?: () => void };
  let base = "";
  beforeAll(async () => {
    relay = createRelay({ testTcp: addr, tcpPort: [sftpPort], log: () => {} });
    await new Promise<void>((r) => relay.server.listen(0, "127.0.0.1", r));
    base = `ws://127.0.0.1:${(relay.server.address() as AddressInfo).port}`;
  });
  afterAll(() => relay.server.close());

  const pipe = (host = sftpHost!, port = Number(sftpPort)) => () =>
    new Promise<WebSocket>((done, fail) => {
      const ws = new WS.WebSocket(`${base}/tcp?host=${host}&port=${port}`, { origin: ORIGIN });
      ws.binaryType = "arraybuffer";
      ws.onopen = () => done(ws as unknown as WebSocket);
      ws.onerror = () => fail(new Error("relay refused"));
    });
  const target: SubmitTarget = { host: sftpHost!, port: Number(sftpPort), user: "bir", password: "secret", folder: "1701Qv2008" };
  const quick = { connectMs: 10_000, writeMs: 10_000, attempt: 2, backoffMs: 10 };
  const payload = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) & 0xff); // several SFTP chunks
  let pin = "";

  it("uploads, pins the host key, and the server has the exact bytes", async () => {
    const done = await upload(target, "84653210700000-1701Qv2008-2026Q1.xml", payload, null, pipe(), quick);
    expect(done.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(done.remotePath).toBe("/1701Qv2008/84653210700000-1701Qv2008-2026Q1.xml");
    const back = execFileSync("docker", ["exec", "ebf-sftp", "cat", "/home/bir/1701Qv2008/84653210700000-1701Qv2008-2026Q1.xml"]);
    expect(new Uint8Array(back)).toEqual(payload);
    pin = done.fingerprint;
  }, 60_000);

  it("the pin matches what OpenSSH reports for the server", () => {
    const line = execFileSync("sh", ["-c", `ssh-keyscan -p ${sftpPort} ${sftpHost} 2>/dev/null | ssh-keygen -lf -`]).toString();
    expect(line).toContain(pin);
  });

  it("uploads again with the right pin", async () => {
    await expect(upload(target, "second.xml", payload, pin, pipe(), quick)).resolves.toMatchObject({ fingerprint: pin });
  }, 60_000);

  it("refuses a changed host key", async () => {
    const e = await upload(target, "third.xml", payload, "SHA256:not-the-real-key", pipe(), quick).catch((x) => x);
    expect(e).toBeInstanceOf(SubmitError);
    expect((e as SubmitError).kind).toBe("host_key_changed");
    expect(execFileSync("docker", ["exec", "ebf-sftp", "ls", "/home/bir/1701Qv2008"]).toString()).not.toContain("third.xml");
  }, 60_000);

  it("reports a wrong password as such", async () => {
    const e = await upload({ ...target, password: "wrong" }, "x.xml", payload, pin, pipe(), quick).catch((x) => x);
    expect((e as SubmitError).kind).toBe("auth");
  }, 60_000);

  it("a refused pipe is 'not sent', tried again", async () => {
    const e = await upload(target, "x.xml", payload, pin, pipe("evil.example.com", 22), quick).catch((x) => x);
    expect((e as SubmitError).kind).toBe("transport");
    expect((e as Error).message).toContain("tried 2 times");
    expect((e as Error).message).toContain("was not sent");
  }, 60_000);
});
