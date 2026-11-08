import { describe, expect, it } from "vitest";
import { describePeriod, pageForReturn, parseReturnFile } from "@/lib/return-file";

describe("savefile names", () => {
  it("parses TIN, 3- and 5-digit branch, form, period and amendment", () => {
    expect(parseReturnFile("84653210700000-0605-10152026123045.xml")).toMatchObject({
      tin: "846532107",
      branch_code: "00000",
      form_code: "0605",
      period: "10152026123045",
      amendment: 0,
    });
    expect(parseReturnFile("123456789000-1701Qv2018-20263V2.xml")).toMatchObject({ branch_code: "000", form_code: "1701Qv2018", period: "20263", amendment: 2 });
    expect(parseReturnFile("readme.txt")).toBeNull();
  });

  it("reopens in the form's page", () => {
    expect(pageForReturn(parseReturnFile("123456789000-2550Qv2024-1220264.xml")!)).toBe("forms/BIR-Form2550Qv2024.hta?xmlFileName=savefile/123456789000-2550Qv2024-1220264.xml");
  });

  it("describes periods", () => {
    expect(describePeriod("102026")).toBe("10/2026");
    expect(describePeriod("20263")).toBe("2026 Q3");
    expect(describePeriod("1220264")).toBe("2026 Q4 (FY end 12)");
    expect(describePeriod("10152026123045")).toBe("10/15/2026");
    expect(describePeriod("2026")).toBe("2026");
  });
});
