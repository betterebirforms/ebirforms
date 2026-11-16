import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUTTON_GROUP, POPUP_GROUP } from "@/form/picker.ts";
import { FORM_1701MS } from "@/form/form1701ms.ts";
import { FORM_2550DS } from "@/form/form2550ds.ts";
import { FORM_2550DS_OLD } from "@/form/form2550ds-old.ts";
import { FORM_2200T_PRE2020 } from "@/form/form2200t-pre2020.ts";
import { computeForm, formRecords, type GroupState } from "@/form/schema.ts";

const schema = { "1701MS": FORM_1701MS, "2550DS": FORM_2550DS, "2550DS-old": FORM_2550DS_OLD, "2200T": FORM_2200T_PRE2020 };
const layout = (code: string) => readFileSync(`asset/bir/layout/${code}.html`, "utf8");

describe("pop-ups mapped to a group editor name a real group and a real element", () => {
  for (const code of ["1701MS", "2550DS", "2550DS-old"] as const)
    it(`${code}: POPUP_GROUP`, () => {
      for (const [div, name] of Object.entries(POPUP_GROUP[code] ?? {})) {
        expect(layout(code), div).toContain(`id="${div}"`);
        expect((schema[code].group ?? []).map((g) => g.name), div).toContain(name);
      }
    });
  it("2200T: each Calculator link opens its calculator's rows", () => {
    expect(Object.keys(BUTTON_GROUP["2200T"] ?? {})).toHaveLength(5);
    for (const [link, { group }] of Object.entries(BUTTON_GROUP["2200T"] ?? {})) {
      expect(layout("2200T"), link).toContain(`id="${link}"`);
      expect((schema["2200T"].group ?? []).map((g) => g.name), link).toContain(group);
    }
  });
});

describe("2550DS-old item 22D pop-up (same group as 2550DS)", () => {
  const P = "frm2550ds:";
  const g: GroupState = { specify22D: [{ [`${P}totalTaxPayableNo22DDescription`]: "A", [`${P}totalTaxPayableNo22DAmount`]: "10.00" }, { [`${P}totalTaxPayableNo22DDescription`]: "B", [`${P}totalTaxPayableNo22DAmount`]: "5.50" }] };
  it("2+ rows read VARIOUS and sum", () => {
    const o = computeForm(FORM_2550DS_OLD, {}, g);
    expect(o[`${P}otherPaymentCreditSpecify`]).toBe("VARIOUS");
    expect(o[`${P}otherPaymentCreditAmount`]).toBe("15.50");
    const rec = new Map(formRecords(FORM_2550DS_OLD, {}, g).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}totalTaxPayableNo22DAmount1`)).toBe("5.50");
  });
});
