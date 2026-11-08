// Codec for BIR's savefile/profile format (docs/analysis/web-layer.md §2.2–2.3).
//
//   <?xml version='1.0'?>SEP <div>KEY=VALUEKEY=</div>SEP … SEP All Rights Reserved BIR 2012.[0]
//
// Not well-formed XML: each record repeats its key as a terminator. Files are written in the ANSI
// code page (cp1252). We parse the raw bytes — never through innerHTML like the original — so `&`
// and `<` survive a round trip.

import { decodeCp1252, encodeCp1252 } from "./cp1252.ts";

export const XML_HEAD = "<?xml version='1.0'?>";
/** innerHTML of the forms' `<xmp id='xmlFormat'>`, written between records (CRLF on Windows). */
export const RECORD_SEP = "\t\r\n            ";

export type TrailerYear = 2012 | 2014;

export interface SaveRecord {
  key: string;
  value: string;
}

export interface Savefile {
  record: SaveRecord[];
  trailer_year: TrailerYear;
  /** A trailing "0" after the trailer marks a final copy (read-only, may be submitted). */
  is_final_copy: boolean;
}

const TRAILER = /All Rights Reserved BIR (\d{4})\.(0?)\s*$/;

/** Split one `<div>` body "KEY=VALUEKEY=" into key and value: the shortest key whose repetition ends the body. */
export function splitRecord(body: string): SaveRecord | null {
  for (let i = body.indexOf("="); i > 0; i = body.indexOf("=", i + 1)) {
    const key = body.slice(0, i);
    const terminator = key + "=";
    if (body.length >= i + 1 + terminator.length && body.endsWith(terminator)) {
      return { key, value: body.slice(i + 1, body.length - terminator.length) };
    }
  }
  return null;
}

export function parseSavefile(text: string): Savefile {
  const trailer = TRAILER.exec(text);
  const record: SaveRecord[] = [];
  const div = /<div>([\s\S]*?)<\/div>/g;
  for (let m = div.exec(text); m; m = div.exec(text)) {
    const r = splitRecord(m[1]!);
    if (r) record.push(r);
  }
  return {
    record,
    trailer_year: trailer?.[1] === "2014" ? 2014 : 2012,
    is_final_copy: trailer?.[2] === "0",
  };
}

export function serializeSavefile(file: Savefile): string {
  let out = XML_HEAD + RECORD_SEP;
  for (const { key, value } of file.record) {
    if (value.includes("</div>")) throw new Error(`value of ${key} contains </div>; the format cannot hold it`);
    out += `<div>${key}=${value}${key}=</div>${RECORD_SEP}`;
  }
  return out + RECORD_SEP + `All Rights Reserved BIR ${file.trailer_year}.` + (file.is_final_copy ? "0" : "");
}

export const readSavefile = (byte: Uint8Array) => parseSavefile(decodeCp1252(byte));
export const writeSavefile = (file: Savefile) => encodeCp1252(serializeSavefile(file));

/** Lookup with the original's semantics: first record with the key wins. */
export function getValue(file: Savefile, key: string): string | undefined {
  return file.record.find((r) => r.key === key)?.value;
}

// ── legacy JS escape()/unescape() — some fields are stored escaped, per form (WL §2.2) ──

const ESCAPE_SAFE = /[A-Za-z0-9@*_+\-./]/;

export function legacyEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ESCAPE_SAFE.test(ch)) out += ch;
    else if (c < 256) out += "%" + c.toString(16).toUpperCase().padStart(2, "0");
    else {
      // escape() works on UTF-16 code units
      for (let i = 0; i < ch.length; i++) out += "%u" + ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return out;
}

export function legacyUnescape(s: string): string {
  return s.replace(/%u([0-9A-Fa-f]{4})|%([0-9A-Fa-f]{2})/g, (_, u: string | undefined, b: string | undefined) =>
    String.fromCharCode(parseInt((u ?? b)!, 16)),
  );
}

// ── never persisted: the original wrote the user's eBIRForms-Online password into the savefile (WL security 2) ──

const SECRET_KEY = /ebirOnline/i;
export const isSecretKey = (key: string) => SECRET_KEY.test(key);
export function withoutSecret(file: Savefile): Savefile {
  return { ...file, record: file.record.filter((r) => !isSecretKey(r.key)) };
}

// ── profile/<TIN><BRANCH>.xml (WL §2.3) ──

export interface Profile {
  fn: string;
  tin1: string;
  tin2: string;
  tin3: string;
  tin4: string;
  rdo: string;
  lob: string;
  regAddr: string;
  zip: string;
  telNo: string;
  email: string;
  formType: string;
}

const PROFILE_KEY = ["fn", "tin1", "tin2", "tin3", "tin4", "rdo", "lob", "regAddr", "zip", "telNo", "email", "formType"] as const;
const PROFILE_ESCAPED = new Set(["fn", "lob", "regAddr"]);

export function profileFromSavefile(file: Savefile): Profile {
  const profile = {} as Profile;
  for (const key of PROFILE_KEY) {
    const raw = getValue(file, key) ?? "";
    profile[key] = PROFILE_ESCAPED.has(key) ? legacyUnescape(raw) : raw;
  }
  return profile;
}

/** Same key order as BIRForms.hta's writer (:744-761); the original reader takes the first `key=` match. */
export function profileToSavefile(profile: Profile): Savefile {
  const field = (key: (typeof PROFILE_KEY)[number]): SaveRecord => ({
    key,
    value: PROFILE_ESCAPED.has(key) ? legacyEscape(profile[key]) : profile[key],
  });
  const record: SaveRecord[] = [
    ...PROFILE_KEY.filter((k) => k !== "formType").map(field),
    ...([1, 2, 3, 4] as const).map((n) => ({ key: `confirmtin${n}`, value: profile[`tin${n}`] })),
    { key: "confirmemail", value: profile.email },
    field("formType"),
  ];
  return { record, trailer_year: 2012, is_final_copy: false };
}

export const profileFileName = (p: Pick<Profile, "tin1" | "tin2" | "tin3" | "tin4">) => `${p.tin1}${p.tin2}${p.tin3}${p.tin4}.xml`;
