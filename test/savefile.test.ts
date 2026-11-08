import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  getValue,
  legacyEscape,
  legacyUnescape,
  parseSavefile,
  profileFromSavefile,
  profileToSavefile,
  readSavefile,
  serializeSavefile,
  splitRecord,
  withoutSecret,
  writeSavefile,
  type Profile,
} from "@/lib/savefile";
import { decodeCp1252, encodeCp1252 } from "@/lib/cp1252";

// Shape copied from what forms/BIR-Form0605.hta saveXML emits.
const SAMPLE =
  "<?xml version='1.0'?>\t\r\n            " +
  "<div>frm0605:txtTIN1=123frm0605:txtTIN1=</div>\t\r\n            " +
  "<div>frm0605:txtTaxPayerName=JUAN%20DELA%20CRUZ%20%26%20SONSfrm0605:txtTaxPayerName=</div>\t\r\n            " +
  "<div>frm0605:txtClassification:_1=truefrm0605:txtClassification:_1=</div>\t\r\n            " +
  "<div>txtFinalFlag=0txtFinalFlag=</div>\t\r\n            " +
  "\t\r\n            All Rights Reserved BIR 2012.";

describe("savefile codec", () => {
  it("parses records, trailer and draft state", () => {
    const f = parseSavefile(SAMPLE);
    expect(f.record.map((r) => r.key)).toEqual([
      "frm0605:txtTIN1",
      "frm0605:txtTaxPayerName",
      "frm0605:txtClassification:_1",
      "txtFinalFlag",
    ]);
    expect(getValue(f, "frm0605:txtTIN1")).toBe("123");
    expect(legacyUnescape(getValue(f, "frm0605:txtTaxPayerName")!)).toBe("JUAN DELA CRUZ & SONS");
    expect(f.trailer_year).toBe(2012);
    expect(f.is_final_copy).toBe(false);
  });

  it("round-trips byte-for-byte through the writer", () => {
    expect(serializeSavefile(parseSavefile(SAMPLE))).toBe(SAMPLE);
  });

  it("detects a final copy (trailing 0) and the 2014 trailer", () => {
    const f = parseSavefile(SAMPLE.replace("BIR 2012.", "BIR 2014.0"));
    expect(f.trailer_year).toBe(2014);
    expect(f.is_final_copy).toBe(true);
  });

  it("keeps & and < intact in unescaped fields (the original lost them via innerHTML)", () => {
    const f = { record: [{ key: "frm:txtAddr", value: "A & B <Bldg> = 5" }], trailer_year: 2012 as const, is_final_copy: false };
    expect(getValue(parseSavefile(serializeSavefile(f)), "frm:txtAddr")).toBe("A & B <Bldg> = 5");
  });

  it("splits keys containing ':' and values containing '='", () => {
    expect(splitRecord("a:b=x=ya:b=")).toEqual({ key: "a:b", value: "x=y" });
    expect(splitRecord("k=k=")).toEqual({ key: "k", value: "" });
    expect(splitRecord("garbage")).toBeNull();
  });

  it("refuses a value the format cannot hold", () => {
    expect(() =>
      serializeSavefile({ record: [{ key: "k", value: "x</div>y" }], trailer_year: 2012, is_final_copy: false }),
    ).toThrow(/cannot hold/);
  });

  it("never persists the eBIRForms-Online password", () => {
    const f = parseSavefile(SAMPLE.replace("<div>txtFinalFlag", "<div>ebirOnlineSecret=hunter2ebirOnlineSecret=</div><div>txtFinalFlag"));
    expect(getValue(withoutSecret(f), "ebirOnlineSecret")).toBeUndefined();
  });

  it("reads and writes cp1252 bytes", () => {
    const f = { record: [{ key: "n", value: "Ñoño — €5" }], trailer_year: 2012 as const, is_final_copy: false };
    const byte = writeSavefile(f);
    expect(byte.includes(0xd1)).toBe(true); // Ñ
    expect(byte.includes(0x80)).toBe(true); // €
    expect(getValue(readSavefile(byte), "n")).toBe("Ñoño — €5");
    expect(decodeCp1252(encodeCp1252("漢"))).toBe("?");
  });
});

describe("legacy escape()", () => {
  it("matches JavaScript's global escape/unescape", () => {
    for (const s of ["JUAN DELA CRUZ", "A&B (PHILS.) INC.", "Ñ/é@*_+-./", "漢字 😀", "100% sure"]) {
      expect(legacyEscape(s)).toBe(escape(s));
      expect(legacyUnescape(escape(s))).toBe(s);
    }
  });
});

describe("profile", () => {
  const profile: Profile = {
    fn: "DELA CRUZ, JUAN & CO.",
    tin1: "123",
    tin2: "456",
    tin3: "789",
    tin4: "00000",
    rdo: "043",
    lob: "RETAIL",
    regAddr: "1 RIZAL ST., QUEZON CITY",
    zip: "1100",
    telNo: "0281234567",
    email: "juan@example.com",
    formType: "0605",
  };

  it("writes keys in BIRForms.hta order and reads them back", () => {
    const f = profileToSavefile(profile);
    expect(f.record.map((r) => r.key)).toEqual([
      "fn", "tin1", "tin2", "tin3", "tin4", "rdo", "lob", "regAddr", "zip", "telNo", "email",
      "confirmtin1", "confirmtin2", "confirmtin3", "confirmtin4", "confirmemail", "formType",
    ]);
    expect(getValue(f, "fn")).toBe(escape(profile.fn));
    expect(profileFromSavefile(parseSavefile(serializeSavefile(f)))).toEqual(profile);
  });
});

const realSavefile = process.env.EBIRFORMS_GOLDEN_SAVEFILE;
describe.skipIf(!realSavefile || !existsSync(realSavefile))("golden savefile from a real install", () => {
  it("round-trips byte-identically", () => {
    const byte = readFileSync(realSavefile!);
    expect(Buffer.from(writeSavefile(readSavefile(byte))).equals(byte)).toBe(true);
  });
});
