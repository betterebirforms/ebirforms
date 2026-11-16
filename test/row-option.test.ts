// The row editor's drop-downs and ticks (FieldSpec.option / row_tick): every list is BIR's own, and a tick BIR uses only
// for its Delete button stays hidden. The lists are checked against BIR's captured page and recovered script where the
// tree is present; the markup against ScheduleTable itself.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NATIVE_FORM } from "@/form/registry.ts";
import { ScheduleTable } from "@/form/FormView.tsx";
import { atcOption, atcRateText, PS_CS_OPTION, rdoOption, treatyOption } from "@/form/row-option.ts";
import { atcPickList } from "@/form/atc.ts";
import type { FieldSpec, GroupSpec, RowOption } from "@/form/schema.ts";

const group = (code: string, name: string): GroupSpec => NATIVE_FORM[code]!.schema.group!.find((g) => g.name === name)!;
const sub = (code: string, name: string, id: string): FieldSpec => group(code, name).row.find((s) => s.id === id)!;
const list = (s: FieldSpec, read: (id: string) => string = () => ""): RowOption[] => (typeof s.option === "function" ? s.option(read) : (s.option ?? []));
const value = (o: RowOption[]) => o.map((x) => x.value);

describe("every drop-down and tick of a row editor", () => {
  it("each select row sub-field of every native form carries BIR's list", () => {
    const missing: string[] = [];
    for (const [code, form] of Object.entries(NATIVE_FORM))
      for (const g of form.schema.group ?? []) for (const s of g.row) if (s.kind === "select" && list(s).length === 0) missing.push(`${code} ${g.name} ${s.id}`);
    expect(missing).toEqual([]);
  });

  it("only BIR's data ticks show; its Delete ticks (chk…Delete, sched1Chk, Cal…_Col1) stay hidden", () => {
    const shown: string[] = [];
    for (const [code, form] of Object.entries(NATIVE_FORM))
      for (const g of form.schema.group ?? []) for (const s of g.row) if ((s.kind === "checkbox" || s.kind === "radio") && s.row_tick) shown.push(`${code} ${g.name} ${s.id.replace(/^frm\d+:/, "")}`);
    expect(shown.sort()).toEqual(
      [
        "1700 modalPage2Part4 rdoPg2Pt4I{i}TaxFiler",
        "1700 modalPage2Part4 rdoPg2Pt4I{i}Spouse",
        "1700v2018 sched1more rdoPg2I4_{i}PartVIEmployeeT",
        "1700v2018 sched1more rdoPg2I4_{i}PartVIEmployeeS",
        ...["EX", "SP"].flatMap((k) => [`1701v2018 ${k === "EX" ? "exempt" : "special"} rdoPg3mExempt${k}{i}`, `1701v2018 ${k === "EX" ? "exempt" : "special"} rdoPg3mSpecialRate${k}{i}`]),
      ].sort(),
    );
  });
});

describe("the lists", () => {
  it("1602: '-' then the 1602 treaties; '-', 'NA', then the private ATCs, picking one fills the rate as BIR does", () => {
    for (const sec of ["B", "C"]) {
      const treaty = list(sub("1602", `sec${sec}`, `drpTreatyCodeSec${sec}`));
      expect(value(treaty).slice(0, 3)).toEqual(["-", "NA", "AU"]);
      expect(value(treaty)).not.toContain("BN"); // a 1601FQ-only treaty
      const atc = list(sub("1602", `sec${sec}`, `drpATCCodeSec${sec}`));
      expect(value(atc).slice(0, 2)).toEqual(["-", "NA"]);
      const first = atcPickList("1602", "P")[0]!;
      expect(atc[2]).toMatchObject({ value: first.atc_code, fill: { [`txtRateSec${sec}`]: atcRateText(first.rate) } });
      expect(atc[0]!.fill).toEqual({ [`txtRateSec${sec}`]: "0.00" });
      expect(new Set(value(atc)).size).toBe(atc.length); // a repeated code is listed once
    }
  });

  it("1601F: the treaty list takes 1601FQ-only records (BIR's indexOf), the ATC list follows the agent's category", () => {
    const treaty = value(list(sub("1601F", "schedI", "drpTreatyCode")));
    expect(treaty.slice(0, 3)).toEqual(["-", "NA", "AU"]);
    expect(treaty).toContain("BN");
    const atc = sub("1601F", "schedI", "drpATCCode");
    const priv = list(atc, (id) => (id === "frm1601F:CatAgent_G" ? "false" : ""));
    const gov = list(atc, (id) => (id === "frm1601F:CatAgent_G" ? "true" : ""));
    expect(value(priv)).toContain(atcPickList("1601F", "P")[0]!.atc_code);
    expect(value(gov)).toContain(atcPickList("1601F", "G")[0]!.atc_code);
    expect(value(priv)).not.toEqual(value(gov));
  });

  it("2000v2018: '-', 'DS010 - GENERAL', then the DST ATCs", () => {
    const atc = list(sub("2000v2018", "sched1", "drpATCCode"));
    expect(atc.slice(0, 2)).toEqual([{ value: "-", label: "-" }, { value: "DS010", label: "DS010 - GENERAL" }]);
    expect(atc.length).toBeGreaterThan(20);
  });

  it("PS / CS in 1700, 1701, 1702EX and 1702RT, as BIR's markup lists them", () => {
    expect(PS_CS_OPTION).toEqual([{ value: "PS" }, { value: "CS" }]);
    expect(list(sub("1700", "Page3Part5ModalA3", "frm1700:drpPg3Pt5I12A1{i}"))).toEqual(PS_CS_OPTION);
    expect(list(sub("1700", "Page3Part5ModalA3", "frm1700:drpPg3Pt5I12B2{i}"))).toEqual(PS_CS_OPTION);
    expect(list(sub("1702EX", "sc9_3", "frm1702EX:ddPg7S9I10C_{i}"))).toEqual(PS_CS_OPTION);
    expect(list(sub("1702RT", "sc12_iii", "frm1702RT:drpPg8Sc12I10CA-1-{i}"))).toEqual(PS_CS_OPTION);
    expect(list(sub("1702RT", "sc12_iii", "frm1702RT:drpPg8Sc12I10CB-1-{i}"))).toEqual(PS_CS_OPTION);
    const g1701 = NATIVE_FORM["1701"]!.schema.group!.find((g) => g.row.some((s) => /ddlPg11Sc12AI12KindPSCS_\{i\}C1/.test(s.id)))!;
    expect(value(list(g1701.row.find((s) => s.kind === "select")!))).toEqual(["PS", "CS"]);
  });

  // BIR's page, as captured: the real <select>s of its own schedules
  const page1801 = "asset/bir/layout/1801v2018.html";
  it.skipIf(!existsSync(page1801))("1801v2018: the class and RDO lists equal the options of BIR's own selects", () => {
    const html = readFileSync(page1801, "utf8");
    const options = (id: string) => {
      const body = new RegExp(`<select[^>]*id="${id.replace(/[.*+?^${}()|[\]\\']/g, "\\$&")}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? "";
      return [...body.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({ value: m[1]!, label: m[2]!.trim() }));
    };
    const shape = (o: RowOption[]) => o.map((x) => ({ value: x.value, label: (x.label ?? x.value).trim() }));
    const P = "frm1801v2018:";
    expect(shape(list(sub("1801v2018", "sched1", `${P}sched1Class_{i}'`)))).toEqual(options(`${P}sched1Class_1'`));
    expect(shape(list(sub("1801v2018", "sched1A", `${P}sched1AClass_{i}'`)))).toEqual(options(`${P}sched1AClass_1'`));
    // the page's RDO select (txtRDOCode_1) is built from the same rdoList as Schedule 4's
    expect(shape(list(sub("1801v2018", "sched4", `${P}sched4Rdo_{i}`)))).toEqual(options(`${P}txtRDOCode_1`));
    expect(value(rdoOption("1801")).length).toBeGreaterThan(100);
    expect(list(sub("1801v2018", "sched2", `${P}sched2Class_{i}`))).toEqual([{ value: "", label: "" }, { value: "Listed" }, { value: "Not Listed" }]);
  });

  const treatyXml = "vendor/original/xml/treatyCodes.xml";
  it.skipIf(!existsSync(treatyXml))("the treaty list is BIR's xml filtered as its script filters it", () => {
    const xml = readFileSync(treatyXml, "utf8");
    const code = (form: string) => [...xml.matchAll(/<div>treaty\d+:([^~]*)~([^~]*)~([^<]*?)treaty\d+:<\/div>/g)].filter((m) => m[3]!.includes(form)).map((m) => m[1]!);
    expect(value(treatyOption("1602", false)).slice(1)).toEqual(code("1602"));
    expect(value(treatyOption("1601F", true)).slice(2)).toEqual(code("1601F"));
  });
});

describe("ScheduleTable draws them", () => {
  const render = (code: string, name: string, row: Record<string, string>, form: Record<string, string> = {}) =>
    renderToStaticMarkup(
      createElement(ScheduleTable, { group: group(code, name), rows: [row], form, label: {}, onSet: () => {}, onAdd: () => {}, onRemove: () => {} }),
    );

  it("a select with BIR's list, the row's value chosen", () => {
    const html = render("1700", "Page3Part5ModalA3", { "frm1700:drpPg3Pt5I12A1{i}": "CS" });
    expect(html).toContain('<select><option value="PS">PS</option><option value="CS" selected="">CS</option></select>');
    expect(html).not.toContain("Delete");
  });

  it("a Taxpayer / Spouse tick: Spouse greyed off a joint filing, the other tick greyed once one is ticked", () => {
    const T = "frm1700:rdoPg2I4_{i}PartVIEmployeeT", S = "frm1700:rdoPg2I4_{i}PartVIEmployeeS";
    expect(render("1700v2018", "sched1more", {})).toMatch(/<td><input type="checkbox"\/><\/td><td><input type="checkbox" disabled=""\/><\/td>/);
    const joint = render("1700v2018", "sched1more", { [T]: "true" }, { "frm1700:rdoPg1I17FilingStatusJ": "true" });
    expect(joint).toMatch(/<td><input type="checkbox" checked=""\/><\/td><td><input type="checkbox" disabled=""\/><\/td>/);
    expect(render("1700v2018", "sched1more", { [S]: "true" }, { "frm1700:rdoPg1I17FilingStatusJ": "true" })).toMatch(/<td><input type="checkbox" disabled=""\/><\/td><td><input type="checkbox" checked=""\/><\/td>/);
  });

  it("1701v2018's regime radios show BIR's choice, read-only; row-selection ticks never show", () => {
    const html = render("1701v2018", "exempt", {});
    expect(html.match(/type="radio"/g)?.length).toBe(2);
    expect(html).toContain('type="radio" disabled=""');
    expect(render("2200A", "calcXA035Bottle", {})).not.toContain('type="checkbox"');
    expect(render("2000v2018", "sched1", {})).not.toContain('type="checkbox"');
  });
});

// atcOption in isolation: the first two entries are BIR's literals whatever the form
describe("atcOption", () => {
  it("lists '-' and 'NA' before the pick list", () => {
    expect(atcOption("1601F", "P", "txtRate").slice(0, 2).map((o) => o.value)).toEqual(["-", "NA"]);
  });
});
