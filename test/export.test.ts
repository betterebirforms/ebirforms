// The export adapters, over every native form, without BIR's pages (the gate). test/export-name.test.ts checks the
// names against BIR's own createXMLFileName; test/parity.test.ts checks the records against BIR's own save.
import { describe, expect, it } from "vitest";
import { NATIVE_FORM } from "@/form/registry.ts";
import { EXPORT_ADAPTER, ExportUnavailable, hhmmss, SAVEFILE_ADAPTER, savefileName, TSP_ADAPTER } from "@/form/export.ts";
import { reopenSavefile, type FormState } from "@/form/schema.ts";
import { decodeCp1252 } from "@/lib/cp1252.ts";
import { readSavefile } from "@/lib/savefile.ts";
import { randomFill } from "./parity.ts";

const TIN = { tin1: "846", tin2: "532", tin3: "107", tin4: "00000" } as const;
const NOW = new Date(2026, 10, 8, 9, 7, 5);
const fill = (code: string): FormState => {
  const def = NATIVE_FORM[code]!;
  const base: FormState = {};
  for (const [id, key] of Object.entries(def.prefill)) if (key in TIN) base[id] = TIN[key as keyof typeof TIN];
  return randomFill(def.schema, base);
};

describe("savefile adapter", () => {
  it.each(Object.keys(NATIVE_FORM))("%s: named <TIN>-<form>-<period>.xml, and reopening it exports the same bytes", { timeout: 60_000 }, (code) => {
    const def = NATIVE_FORM[code]!;
    const state = fill(code);
    const out = SAVEFILE_ADAPTER.build({ form_code: code, state, now: NOW });
    expect(out.name).toMatch(new RegExp(`^84653210700000-${(def.name_code ?? code).replace(/[()]/g, "\\$&")}-[0-9A-Za-z]*\\.xml$`));
    expect(decodeCp1252(out.byte)).toBe(out.text);
    // what App does on reopen: parse the bytes, rebuild state + rows, save again
    const again = reopenSavefile(def.schema, readSavefile(out.byte), code);
    const second = SAVEFILE_ADAPTER.build({ form_code: code, state: again.state, groups: again.groups, now: NOW });
    expect(second.text).toBe(out.text);
    expect(second.name).toBe(out.name);
  });

  it("the profile's TIN wins over the TIN typed on the form", () => {
    const name = savefileName({ form_code: "0605", state: fill("0605"), profile: { tin1: "111", tin2: "222", tin3: "333", tin4: "00001" }, now: NOW });
    expect(name.startsWith("11122233300001-0605-")).toBe(true);
  });

  it("0605 ends its name with the time of saving, as BIR's getHHMMSS does, so two payments a day don't collide", () => {
    expect(hhmmss(NOW)).toBe("090705");
    const state = { ...fill("0605"), "frm0605:txtReturnPeriodMonth": "12", "frm0605:txtReturnPeriodDay": "31", "frm0605:txtReturnPeriodYear": "2025" };
    expect(savefileName({ form_code: "0605", state, now: NOW })).toBe("84653210700000-0605-12312025090705.xml");
    expect(savefileName({ form_code: "0605", state, now: new Date(2026, 10, 8, 9, 7, 6) })).not.toBe(savefileName({ form_code: "0605", state, now: NOW }));
  });

  it("a final copy carries BIR's trailing 0", () => {
    expect(SAVEFILE_ADAPTER.build({ form_code: "0605", state: fill("0605"), is_final_copy: true, now: NOW }).text.endsWith("All Rights Reserved BIR 2012.0")).toBe(true);
  });
});

describe("TSP adapter", () => {
  it("refuses every form until BIR's data layout and certification code are registered", () => {
    expect(Object.keys(EXPORT_ADAPTER)).toEqual(["savefile", "tsp"]);
    for (const code of Object.keys(NATIVE_FORM)) expect(TSP_ADAPTER.isAvailable(code)).toBe(false);
    expect(() => TSP_ADAPTER.build({ form_code: "0605", state: fill("0605") })).toThrow(ExportUnavailable);
    expect(() => TSP_ADAPTER.build({ form_code: "0605", state: fill("0605") })).toThrow(/eTSPCert/);
  });
});
