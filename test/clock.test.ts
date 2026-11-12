// BIR's blank forms take some defaults from today's date (src/form/clock.ts, measured by EBF_CAPTURE_CLOCK). A
// rebuilt form's save must carry today's value for them, not the day the template was captured.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NATIVE_FORM } from "../src/form/registry.ts";
import { formRecords } from "../src/form/schema.ts";
import CLOCK_KEY from "../src/form/template-clock.json";
import { CLOCK_RULE } from "../src/form/clock.ts";

const blank = (code: string) => new Map(formRecords(NATIVE_FORM[code]!.schema, {}).map((r) => [r.key, r.value]));
const at = (y: number, m: number, d: number) => vi.setSystemTime(new Date(y, m - 1, d, 10));

describe("date-driven blank-form defaults", () => {
  afterEach(() => vi.useRealTimers());

  it("every measured key names a known rule and a native form", () => {
    for (const [code, key] of Object.entries(CLOCK_KEY as Record<string, Record<string, string>>)) {
      expect(NATIVE_FORM[code], code).toBeDefined();
      for (const rule of Object.values(key)) expect(CLOCK_RULE[rule], `${code} ${rule}`).toBeDefined();
    }
  });

  it("1601-C opens on this month and year", () => {
    vi.useFakeTimers();
    at(2027, 2, 10);
    const r = blank("1601Cv2018");
    expect([r.get("frm1601c:txtMonth"), r.get("frm1601c:txtYear")]).toEqual(["02", "2027"]);
  });

  it("0605 follows the date, and the user's own choice wins", () => {
    vi.useFakeTimers();
    at(2028, 7, 1);
    expect(blank("0605").get("frm0605:itemYearEndMonth")).toBe("07");
    const own = new Map(formRecords(NATIVE_FORM["0605"]!.schema, { "frm0605:itemYearEndMonth": "12" }).map((r) => [r.key, r.value]));
    expect(own.get("frm0605:itemYearEndMonth")).toBe("12");
  });

  it("0619-E keeps BIR's January result: no month, due month 0NaN", () => {
    vi.useFakeTimers();
    at(2027, 1, 20);
    const r = blank("0619E");
    expect([r.get("frm0619E:txtMonth"), r.get("frm0619E:txtDueMonth")]).toEqual(["", "0NaN"]);
    at(2027, 5, 20);
    const may = blank("0619E");
    expect([may.get("frm0619E:txtMonth"), may.get("frm0619E:txtDueMonth")]).toEqual(["04", "05"]);
  });

  it("2553's quarter keeps BIR's slip: March ticks quarter 4", () => {
    vi.useFakeTimers();
    at(2027, 3, 5);
    const r = blank("2553");
    expect(["_1", "_2", "_3", "_4"].map((q) => r.get(`frm2553:optQtr:${q}`))).toEqual(["false", "false", "false", "true"]);
  });

  it("1700's year is last year in two digits", () => {
    vi.useFakeTimers();
    at(2030, 4, 1);
    expect(blank("1700").get("frm1700:txtYear")).toBe("29");
  });
});
