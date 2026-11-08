// Windows-1252 ⇄ string. FSO CreateTextFile (no unicode flag) writes the ANSI code page — cp1252 on PH installs.

const HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ"; // 0x80–0x9F
const ENCODE = new Map<number, number>([...HIGH].map((ch, i) => [ch.codePointAt(0)!, 0x80 + i]));

export function decodeCp1252(byte: Uint8Array): string {
  let out = "";
  for (const b of byte) out += b >= 0x80 && b <= 0x9f ? HIGH[b - 0x80] : String.fromCharCode(b);
  return out;
}

/** Characters outside cp1252 become "?", exactly as the original's ANSI write would. */
export function encodeCp1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    out[n++] = ENCODE.get(c) ?? (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x3f);
  }
  return out.subarray(0, n);
}
