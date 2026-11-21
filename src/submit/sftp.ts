// The upload, in the browser (the desktop's src-tauri/src/submit.rs, same rules): SSH runs here, over a WebSocket
// the relay pipes to BIR's upload server, so the relay only ever carries encrypted SSH bytes. The login comes from
// BIR's dispatcher, the host key is pinned on first use and refused if it changes, and a weak line is tried again
// only while nothing of the return has been written, so BIR never gets the same return twice from one click.
import { Buffer } from "buffer";
import { ChannelRequestMessage, SshAuthenticationType, SshDisconnectReason, SshClientSession, SshSessionConfiguration, WebSocketStream, type SshChannel } from "@microsoft/dev-tunnels-ssh";

export interface SubmitTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Remote folder under the SFTP root, e.g. "1701Qv2008". */
  folder: string;
}

export type SubmitErrorKind = "host_key_changed" | "auth" | "transport" | "interrupted";

export class SubmitError extends Error {
  constructor(
    readonly kind: SubmitErrorKind,
    detail: string,
    readonly seen = "",
  ) {
    super(
      kind === "auth"
        ? "the server rejected the username or password."
        : kind === "host_key_changed"
          ? `BIR's upload server presented a different SSH key (${detail}). Refusing to upload: this could be an interception.`
          : kind === "transport"
            ? `could not reach BIR's upload server (${detail}). Your return was not sent. Check your internet connection and click Submit again. If you are outside the Philippines: BIR's upload server does not answer most connections from abroad (BIR's own app fails the same way), so connect through a Philippine VPN and click Submit again.`
            : `the connection dropped while sending (${detail}). BIR may or may not have received your return. Wait for BIR's confirmation email before sending it again.`,
    );
  }
}

export interface Patience {
  connectMs: number;
  writeMs: number;
  attempt: number;
  backoffMs: number;
}
export const PATIENCE: Patience = { connectMs: 45_000, writeMs: 120_000, attempt: 3, backoffMs: 3_000 };

/** The SSH host key as OpenSSH and the desktop write it: "SHA256:" + unpadded base64 of SHA-256(key blob). */
export async function fingerprintOf(blob: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", blob as Uint8Array<ArrayBuffer>));
  return "SHA256:" + btoa(String.fromCharCode(...d)).replace(/=+$/, "");
}

class SubsystemRequest extends ChannelRequestMessage {
  constructor(readonly subsystem: string) {
    super();
    this.requestType = "subsystem";
    this.wantReply = true;
  }
  protected override onWrite(writer: Parameters<ChannelRequestMessage["onWrite"]>[0]): void {
    super.onWrite(writer);
    writer.writeString(this.subsystem, "utf8");
  }
}

// ---- SFTP version 3 (draft-ietf-secsh-filexfer-02): just what an upload needs

const FXP = { INIT: 1, VERSION: 2, OPEN: 3, CLOSE: 4, WRITE: 6, MKDIR: 14, STATUS: 101, HANDLE: 102 } as const;
const PFLAG = { WRITE: 0x02, CREAT: 0x08, TRUNC: 0x10 };
const CHUNK = 32 * 1024;

class Packet {
  part: Uint8Array[] = [];
  byte(n: number) {
    this.part.push(Uint8Array.of(n));
    return this;
  }
  u32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n);
    this.part.push(b);
    return this;
  }
  u64(n: number) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(n));
    this.part.push(b);
    return this;
  }
  string(s: string | Uint8Array) {
    const b = typeof s === "string" ? new TextEncoder().encode(s) : s;
    return this.u32(b.length), this.part.push(b), this;
  }
  frame(): Buffer {
    const length = this.part.reduce((n, p) => n + p.length, 0);
    const out = Buffer.alloc(4 + length);
    out.writeUInt32BE(length, 0);
    let at = 4;
    for (const p of this.part) out.set(p, at), (at += p.length);
    return out;
  }
}

interface Reply {
  type: number;
  body: DataView;
  byte: Uint8Array;
}

export class SftpClient {
  private pending = new Map<number, (r: Reply) => void>();
  private version: ((r: Reply) => void) | null = null;
  private inbox = new Uint8Array(0);
  private next = 1;
  private failure: Error | null = null;

  constructor(private channel: SshChannel) {
    channel.onDataReceived((data) => {
      this.take(new Uint8Array(data));
      channel.adjustWindow(data.length);
    });
    channel.onClosed(() => this.fail(new Error("the SFTP channel closed")));
  }

  private fail(e: Error) {
    this.failure ??= e;
    for (const done of this.pending.values()) done({ type: -1, body: new DataView(new ArrayBuffer(0)), byte: new Uint8Array(0) });
    this.pending.clear();
  }

  private take(data: Uint8Array) {
    const joined = new Uint8Array(this.inbox.length + data.length);
    joined.set(this.inbox);
    joined.set(data, this.inbox.length);
    this.inbox = joined;
    while (this.inbox.length >= 5) {
      const length = new DataView(this.inbox.buffer, this.inbox.byteOffset).getUint32(0);
      if (this.inbox.length < 4 + length) return;
      const byte = this.inbox.slice(4, 4 + length);
      this.inbox = this.inbox.slice(4 + length);
      const body = new DataView(byte.buffer, 1);
      const reply = { type: byte[0]!, body, byte: byte.subarray(1) };
      if (reply.type === FXP.VERSION) this.version?.(reply);
      else {
        const id = body.getUint32(0);
        this.pending.get(id)?.(reply);
        this.pending.delete(id);
      }
    }
  }

  async init(): Promise<void> {
    const got = new Promise<Reply>((done) => (this.version = done));
    await this.channel.send(new Packet().byte(FXP.INIT).u32(3).frame());
    await got;
  }

  private async call(type: number, fill: (p: Packet) => Packet): Promise<Reply> {
    if (this.failure) throw this.failure;
    const id = this.next++;
    const got = new Promise<Reply>((done) => this.pending.set(id, done));
    await this.channel.send(fill(new Packet().byte(type).u32(id)).frame());
    const r = await got;
    if (r.type === -1) throw this.failure ?? new Error("the SFTP channel closed");
    return r;
  }

  private static status(r: Reply, what: string): void {
    if (r.type !== FXP.STATUS) throw new Error(`${what}: unexpected reply ${r.type}`);
    const code = r.body.getUint32(4);
    if (code !== 0) {
      const length = r.body.getUint32(8);
      throw new Error(`${what}: ${new TextDecoder().decode(r.byte.subarray(12, 12 + length)) || `status ${code}`}`);
    }
  }

  async mkdir(path: string): Promise<void> {
    SftpClient.status(await this.call(FXP.MKDIR, (p) => p.string(path).u32(0)), "mkdir");
  }

  async open(path: string): Promise<Uint8Array> {
    const r = await this.call(FXP.OPEN, (p) => p.string(path).u32(PFLAG.WRITE | PFLAG.CREAT | PFLAG.TRUNC).u32(0));
    if (r.type !== FXP.HANDLE) SftpClient.status(r, "open");
    const length = r.body.getUint32(4);
    return r.byte.slice(8, 8 + length);
  }

  async write(handle: Uint8Array, offset: number, data: Uint8Array): Promise<void> {
    SftpClient.status(await this.call(FXP.WRITE, (p) => p.string(handle).u64(offset).string(data)), "write");
  }

  async close(handle: Uint8Array): Promise<void> {
    SftpClient.status(await this.call(FXP.CLOSE, (p) => p.string(handle)), "close");
  }
}

function within<T>(ms: number, what: string, work: Promise<T>, kind: SubmitErrorKind): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<T>((_, fail) => (timer = setTimeout(() => fail(new SubmitError(kind, `${what} timed out`)), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}

/** A WebSocket to the relay's /tcp pipe for host:port. `relay` is the relay's https base URL. */
export function openPipe(relay: string, host: string, port: number): Promise<WebSocket> {
  const url = new URL(relay.replace(/^http/, "ws").replace(/\/$/, "") + "/tcp");
  url.searchParams.set("host", host);
  url.searchParams.set("port", String(port));
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  return new Promise((done, fail) => {
    ws.onopen = () => done(ws);
    ws.onerror = () => fail(new Error("the relay refused or could not reach BIR's upload server"));
  });
}

export interface Submitted {
  fingerprint: string;
  remotePath: string;
}

async function uploadOnce(target: SubmitTarget, name: string, data: Uint8Array, pinned: string | null, pipe: () => Promise<WebSocket>, patience: Patience): Promise<Submitted> {
  let seen = "";
  const session = new SshClientSession(new SshSessionConfiguration());
  session.onAuthenticating((e) => {
    if (e.authenticationType !== SshAuthenticationType.serverPublicKey || !e.publicKey) return;
    e.authenticationPromise = (async () => {
      // a fingerprint names the key, not the signature: an RSA key is "ssh-rsa" whichever rsa-sha2 signs
      const name = e.publicKey!.keyAlgorithmName;
      seen = await fingerprintOf(new Uint8Array((await e.publicKey!.getPublicKeyBytes(/^rsa-sha2-/.test(name) ? "ssh-rsa" : name))!));
      return !pinned || pinned === seen ? {} : null; // trust on first use; the caller records `seen`
    })();
  });
  const transport = (e: unknown) => (e instanceof SubmitError ? e : new SubmitError("transport", e instanceof Error ? e.message : String(e)));
  try {
    const sftp = await within(
      patience.connectMs,
      "connecting",
      (async () => {
        await session.connect(new WebSocketStream(await pipe()));
        const ok = await session.authenticate({ username: target.user, password: target.password });
        if (!ok) {
          if (pinned && seen && seen !== pinned) throw new SubmitError("host_key_changed", `pinned ${pinned}, got ${seen}`, seen);
          throw new SubmitError("auth", "");
        }
        const channel = await session.openChannel();
        if (!(await channel.request(new SubsystemRequest("sftp")))) throw new Error("the server has no SFTP");
        const client = new SftpClient(channel);
        await client.init();
        return client;
      })().catch((e) => {
        throw transport(e);
      }),
      "transport",
    );
    const dir = `/${target.folder.replace(/^\/+|\/+$/g, "")}`;
    const remotePath = `${dir}/${name}`;
    await sftp.mkdir(dir).catch(() => {}); // BIR pre-creates these; "already exists" is fine
    // failing to open the file means nothing was written yet: still safe to try again
    const handle = await sftp.open(remotePath).catch((e) => {
      throw transport(e);
    });
    await within(
      patience.writeMs,
      "sending",
      (async () => {
        for (let at = 0; at < data.length; at += CHUNK) await sftp.write(handle, at, data.subarray(at, at + CHUNK));
        await sftp.close(handle);
      })().catch((e) => {
        throw e instanceof SubmitError ? e : new SubmitError("interrupted", e instanceof Error ? e.message : String(e));
      }),
      "interrupted",
    );
    return { fingerprint: seen, remotePath };
  } finally {
    await session.close(SshDisconnectReason.byApplication).catch(() => {});
    session.dispose();
  }
}

/** Upload one already-encrypted return; on a weak line, try again only while nothing has been written. */
export async function upload(
  target: SubmitTarget,
  name: string,
  data: Uint8Array,
  pinned: string | null,
  pipe: () => Promise<WebSocket>,
  patience: Patience = PATIENCE,
): Promise<Submitted> {
  for (let n = 1; ; n++) {
    try {
      return await uploadOnce(target, name, data, pinned, pipe, patience);
    } catch (e) {
      if (!(e instanceof SubmitError) || e.kind !== "transport") throw e;
      if (n >= patience.attempt) throw n > 1 ? new SubmitError("transport", `${e.message.match(/\((.*)\)/)?.[1] ?? e.message}; tried ${n} times`) : e;
      await new Promise((r) => setTimeout(r, patience.backoffMs * n));
    }
  }
}
