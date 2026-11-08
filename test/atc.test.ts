import { describe, expect, it } from "vitest";
import { atcInfo, atcRate, atcForForm } from "@/form/atc.ts";

describe("ATC reference table", () => {
  it("resolves withholding rates by code", () => {
    expect(atcRate("WV010")).toBe(5); // VAT withholding on purchase of goods
    expect(atcRate("WB030")).toBe(3); // tax on carriers / keepers of garages
    expect(atcRate("WI160")).toBe(2); // top-20,000 corporations, services
    expect(atcRate("WI010")).toBe(10); // professionals, gross ≤ 720k
  });

  it("marks DST codes as formula-based (no numeric rate)", () => {
    expect(atcRate("DS101")).toBeNull();
    expect(atcInfo("DS101")?.formula).toBe("P2.00/P200");
    expect(atcInfo("DS106")?.formula).toBe("P1.50/P200");
  });

  it("returns undefined for an unknown code and carries the form list", () => {
    expect(atcInfo("ZZ999")).toBeUndefined();
    expect(atcInfo("WI160")?.form).toContain("1601EQ");
  });

  it("lists the ATC codes belonging to a form", () => {
    const eq = atcForForm("1601EQ");
    expect(eq.length).toBeGreaterThan(5);
    expect(eq).toContain("WI160");
    expect(eq.every((c) => atcInfo(c)?.form.includes("1601EQ"))).toBe(true);
  });
});
