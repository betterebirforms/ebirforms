// What an amount box holds after the user types into it and moves on (FormSchema.typed): BIR's formatCurrency by
// default; the 1702-MX family runs addCommas1702MX (whole pesos), so a typed "1000" is saved "1,000" as BIR saves it.
import { describe, expect, it } from "vitest";
import { NATIVE_FORM } from "../src/form/registry.ts";
import { formRecords, typedMoney } from "../src/form/schema.ts";

describe("typed amounts", () => {
  it("default: BIR's formatCurrency", () => {
    expect(typedMoney(NATIVE_FORM["0605"]!.schema, "1000")).toBe("1,000.00");
  });

  for (const code of ["1702MX", "1702MXv2018", "1702MXv2018C", "1702MXv2018Cxx"])
    it(`${code}: addCommas1702MX, whole pesos`, () => {
      expect(typedMoney(NATIVE_FORM[code]!.schema, "1000")).toBe("1,000");
      expect(typedMoney(NATIVE_FORM[code]!.schema, "1234567")).toBe("1,234,567");
    });

  it("a 1702-MX schedule row typed through the editor saves as BIR saves it", () => {
    const s = NATIVE_FORM["1702MXv2018"]!.schema;
    const row = { "frm1702MX:txtPg2Sc3_{i}Col2": typedMoney(s, "1000") };
    const saved = new Map(formRecords(s, {}, { sc3_31: [row] }).map((r) => [r.key, r.value]));
    expect(saved.get("frm1702MX:txtPg2Sc3_1Col2")).toBe("1,000");
    expect(saved.get("frm1702MX:txtPg2Sc3_SubTotalCA")).toBe("1,000");
  });
});
