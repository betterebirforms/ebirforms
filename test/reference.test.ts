import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  appliesTo,
  declaredCount,
  parseAtc,
  parseCity,
  parseProvince,
  parseRdo,
  parseReference,
  parseRegion,
  parseTaxType,
  parseTreaty,
} from "@/lib/reference";

const SAMPLE = `<?xml version='1.0'?>
<div>atcCount=3atcCount=</div>
<div>atc2:WI100~PROFESSIONALS  - INDIVIDUAL~5.0~I~~~~~~1600WP|1601EQatc2:</div>
<div>atc1:WB040~FRANCHISE TAX~2.0~G~~~~~~1600atc1:</div>
<div>atc3:WC100~RADIO & TV~3.0~C~~~~~~0605atc3:</div>`;

describe("reference parser", () => {
  it("parses in index order with exact form codes", () => {
    const atc = parseAtc(SAMPLE);
    expect(atc.map((a) => a.atc_code)).toEqual(["WB040", "WI100", "WC100"]);
    expect(atc[1]).toEqual({ atc_code: "WI100", description: "PROFESSIONALS - INDIVIDUAL", rate_percent: "5.0", kind: "I", form: ["1600WP", "1601EQ"] });
    expect(declaredCount(SAMPLE, "atc")).toBe(3);
  });

  it("does not match 1600WP when asked for 1600 (the original's substring bug)", () => {
    const row = parseReference(SAMPLE, "atc");
    expect(row.filter((r) => appliesTo(r, "1600")).map((r) => r.field[0])).toEqual(["WB040"]);
  });

  it("keeps a non-form trailing name (rdo: 'Main|0605|…')", () => {
    const rdo = parseRdo("<div>rdo1:001~001~Main|0605|1700rdo1:</div>");
    expect(rdo).toEqual([{ rdo_code: "001", name: "Main", form: ["0605", "1700"] }]);
  });
});

const dir = "vendor/original/xml";
describe.skipIf(!existsSync(dir))("real reference data", () => {
  const read = (f: string) => readFileSync(`${dir}/${f}`, "latin1");
  it.each([
    ["atcCodes.xml", "atc", parseAtc],
    ["rdo.xml", "rdo", parseRdo],
    ["city.xml", "city", parseCity],
    ["province.xml", "province", parseProvince],
    ["region.xml", "region", parseRegion],
    ["taxTypeCodes.xml", "taxTypeCode", parseTaxType],
    ["treatyCodes.xml", "treaty", parseTreaty],
  ] as const)("%s parses at least every declared row", (file, prefix, parse) => {
    const text = read(file);
    const row = (parse as (t: string) => unknown[])(text);
    expect(row.length).toBeGreaterThanOrEqual(declaredCount(text, prefix)!);
  });

  // BIR data bugs the original hides: it reads `split('atc'+i+':')[1]` for i = 1..Count, so a
  // duplicated index keeps only its first row and a row past Count is never shown.
  it("surfaces ATC rows hidden by duplicated indexes 984 and 1027", () => {
    const code = parseAtc(read("atcCodes.xml")).map((a) => a.atc_code);
    expect(code.length).toBe(1089);
    expect(code).toContain("WC230");
    expect(code).toContain("WV040");
  });

  it("surfaces treaty45 Vietnam past the declared count of 44", () => {
    expect(parseTreaty(read("treatyCodes.xml")).map((t) => t.code)).toContain("VN");
  });

  it("knows the published counts", () => {
    expect(parseRdo(read("rdo.xml")).length).toBe(138);
    expect(parseCity(read("city.xml")).length).toBe(1617);
  });
});
