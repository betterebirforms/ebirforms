import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TinStatus, validateTin } from "@/lib/tin";

// [tin, exit code of the real chkt.exe] — generated on Windows from BIR's own binary.
const vector = JSON.parse(readFileSync("test/fixture/tin-vector.json", "utf8")) as Array<[string, number]>;

describe("TIN check digit (chkt.exe port)", () => {
  it(`agrees with chkt.exe on all ${vector.length} vectors`, () => {
    const mismatch = vector.filter(([tin, rc]) => validateTin(tin) !== rc);
    expect(mismatch).toEqual([]);
  });

  it("covers valid, bad and malformed inputs", () => {
    const status = new Set(vector.map(([, rc]) => rc));
    expect(status).toEqual(new Set([TinStatus.Valid, TinStatus.BadCheckDigit, TinStatus.NotNineDigit]));
  });
});
