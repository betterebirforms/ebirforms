// The web version's Encrypt.exe and ebfSFTP ports (src/submit/) against the desktop's rules and BIR's real helpers.
import { describe, expect, it } from "vitest";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { decrypt, decryptFile, ebfCipher, encrypt, encryptFile, passphraseFromEncryptExe } from "../src/submit/cipher.ts";
import { CLOSED, connectionFromAnswer, dispatch, ftpFolderOf, parseDispatch, passphraseFromSftpExe, sftpDecrypt } from "../src/submit/dispatch.ts";

const PASS = "test-passphrase-123";
// ebfSFTP's Encrypt, done with Node's own crypto so the browser code is checked against an independent implementation
function sftpEncrypt(text: string, passphrase = PASS): string {
  const salt = randomBytes(32), iv = randomBytes(16);
  const key = pbkdf2Sync(passphrase, salt, 100_000, 32, "sha1");
  const c = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([salt, iv, c.update(text), c.final()]).toString("base64");
}

describe("Encrypt.exe cipher", () => {
  it("round-trips every tail length and keeps the length", async () => {
    const c = await ebfCipher(new TextEncoder().encode("test passphrase"));
    for (const n of [0, 1, 15, 16, 17, 31, 32, 33, 100]) {
      const p = Uint8Array.from({ length: n }, (_, i) => i);
      const e = await encrypt(c, p);
      expect(e.length).toBe(n);
      expect(await decrypt(c, e)).toEqual(p);
    }
  });

  const installer = "vendor/original/_installer/Encrypt.exe";
  it.skipIf(!existsSync(installer))("matches BIR's real Encrypt.exe byte for byte", async () => {
    const pass = passphraseFromEncryptExe(new Uint8Array(readFileSync(installer)));
    expect(pass).not.toBeNull();
    const c = await ebfCipher(pass!);
    let checked = 0;
    for (const name of readdirSync("test/fixture/encrypt").filter((n) => n.endsWith(".enc"))) {
      const theirs = new Uint8Array(readFileSync(`test/fixture/encrypt/${name}`));
      const plain = new Uint8Array(readFileSync(`test/fixture/encrypt/${name.replace(/\.enc$/, ".plain")}`));
      expect(await decryptFile(c, theirs), name).toEqual(plain);
      expect(await encrypt(c, await decrypt(c, theirs)), name).toEqual(theirs); // the cipher is byte-exact
      expect(await decryptFile(c, await encryptFile(c, plain)), name).toEqual(plain); // our deflate still opens
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});

describe("BIR's dispatcher", () => {
  it("decrypts ebfSFTP's format and refuses a wrong passphrase", async () => {
    const blob = sftpEncrypt("sftp.example.com");
    expect(await sftpDecrypt(blob, PASS)).toBe("sftp.example.com");
    await expect(sftpDecrypt(blob, "wrong-passphrase")).rejects.toThrow();
    await expect(sftpDecrypt("not base64!", PASS)).rejects.toThrow("expected form");
  });

  it("reads the answer as data, never as code", () => {
    const a = parseDispatch(`{mode:"1", server:"AAAA", 'SSLPort': 990, port: 22, username:'u', password:"p"}`)!;
    expect(a).toMatchObject({ mode: "1", server: "AAAA", port: "22", username: "u", password: "p" });
    expect(parseDispatch("{mode:'0'}")!.mode).toBe("0");
    expect(parseDispatch("not a dispatcher answer")).toBeNull();
    expect(parseDispatch(`{mode:"1", server: alert(1)}`)!.server).toBeUndefined();
  });

  it("turns an answer into a connection, or says filing is closed", async () => {
    const answer = { mode: "2", port: "2222", server: sftpEncrypt("127.0.0.1"), username: sftpEncrypt("filer"), password: sftpEncrypt("secret") };
    expect(await connectionFromAnswer(answer, PASS)).toEqual({ mode: "2", host: "127.0.0.1", port: 2222, user: "filer", password: "secret" });
    await expect(connectionFromAnswer({ mode: "0" }, PASS)).rejects.toThrow(CLOSED);
    await expect(connectionFromAnswer({ ...answer, port: "x" }, PASS)).rejects.toThrow("expected form");
  });

  it("tries the backup host when the first is closed or down", async () => {
    const seen: number[] = [];
    const body = `{mode:"1",port:22,server:"${sftpEncrypt("h")}",username:"${sftpEncrypt("u")}",password:"${sftpEncrypt("p")}"}`;
    const c = await dispatch(PASS, async (h) => (seen.push(h), h === 0 ? "{mode:'0'}" : body));
    expect(seen).toEqual([0, 1]);
    expect(c.host).toBe("h");
    await expect(dispatch(PASS, async () => null)).rejects.toThrow(CLOSED);
  });

  it("uses BIR's older folder names for older codes", () => {
    expect(ftpFolderOf("1701Q")).toBe("1701Qv2008");
    expect(ftpFolderOf("0605")).toBe("0605");
  });

  const sftp = "vendor/original/_installer/ebfSFTP.exe";
  it.skipIf(!existsSync(sftp))("finds the passphrase in BIR's real ebfSFTP.exe by its UAT host oracle", async () => {
    const pass = await passphraseFromSftpExe(new Uint8Array(readFileSync(sftp)));
    expect(typeof pass).toBe("string"); // the value itself is BIR's: never printed
  }, 60_000);
});
