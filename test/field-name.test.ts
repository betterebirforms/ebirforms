// A required box left empty is named in words, not by BIR's element id ("frm0605:txtReturnPeriodMonth is required"
// was what the web version showed).
import { describe, expect, it } from "vitest";
import { fieldName, validate } from "@/form/schema.ts";
import { NATIVE_FORM } from "@/form/registry.ts";

describe("validation names the box in words", () => {
  it.each([
    ["frm0605:txtReturnPeriodMonth", "Return Period Month"],
    ["frm0605:txtTIN1", "TIN 1"],
    ["frm0605:txtRDOCode", "RDO Code"],
    ["frm0605:txtTaxPayerName", "Tax Payer Name"],
    ["frm0605:itemModeOfPayment:_1", "Mode Of Payment"],
  ])("%s → %s", (id, name) => expect(fieldName(id)).toBe(name));

  it("no required-field message on any form carries an element id", () => {
    const bad: string[] = [];
    for (const [code, def] of Object.entries(NATIVE_FORM))
      for (const p of validate(def.schema, {})) if (/frm\w*:|\btxt[A-Z]/.test(p.message)) bad.push(`${code}: ${p.message}`);
    expect(bad).toEqual([]);
  });
});
