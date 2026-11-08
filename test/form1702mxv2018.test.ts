import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1702MXv2018, validate1702MXv2018 } from "@/form/form1702mxv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { OSD_ORDER, allow, fullRecompute, groups, id, invalid, itemized, loss, osd } from "./form1702mx2018-case.ts";

const rec = (s: FormState, g: GroupState = groups) => {
  const m = new Map(formRecords(FORM_1702MXv2018, s, g).map((r) => [r.key, r.value]));
  return (k: string) => m.get(id(k));
};

describe("1702MXv2018 compute (the superseded 2018 edition's own branches)", () => {
  const v = rec(itemized);

  it("15B is picked by rate: 5% taxes item 7B (taxable income), not 1B as v2018C does", () => {
    expect(v("txtPg2Sc2It15B")).toBe("218,750"); // 4,375,000 × 5%
    const ten = rec({ ...itemized, [id("txtPg2Sc2It14B")]: "10" });
    expect(ten("txtPg2Sc2It15B")).toBe("319,220"); // 13B 3,192,200 × 10%
    const two = rec({ ...itemized, [id("txtPg2Sc2It14B")]: "2" });
    expect(two("txtPg2Sc2It15B")).toBe("160,000"); // 1B 8,000,000 × 2%
  });

  it("BIR computes the MCIT itself (18C = 2% of 7C) and recomputes 15C = 13C × 14C; 33D re-summed from 33A–C", () => {
    expect([v("txtPg2Sc2It18C"), v("txtPg2Sc2It15C"), v("txtPg2Sc2It19C"), v("txtPg2Sc2It19D")]).toEqual(["116,400", "917,000", "917,000", "1,115,750"]);
    expect([v("txtPg2Sc3It33B"), v("txtPg2Sc3It33C"), v("txtPg2Sc3It33D")]).toEqual(["178,700", "750,700", "929,400"]);
    expect(v("txtPg1Pt2I14TotalIncome")).toBe("1,115,750");
  });

  it("Sch 4 items 1–2 are derived (13A/13B and 9A–C × 14C, toFixed(0), left un-grouped); 4D never filled", () => {
    expect([v("txtPg3Sc4Itm1A"), v("txtPg3Sc4Itm1B"), v("txtPg3Sc4Itm1D")]).toEqual(["545600", "798050", "1,343,650"]);
    expect([v("txtPg2Sc4Itm2A"), v("txtPg2Sc4Itm2B"), v("txtPg2Sc4Itm2C")]).toEqual(["2775", "5550", "8325"]);
    expect([v("txtPg2Sc4Itm4B"), v("txtPg2Sc4Itm4D"), v("txtPg2Sc4Itm7D")]).toEqual(["218,750", "0", "1,142,750"]);
  });

  it("OSD zeroes 9C / 9D as well; losses as in v2018C (Sch 7.1 / 8.1 row 7)", () => {
    const o = rec(osd);
    expect([o("txtPg2Sc2Itm9C"), o("txtPg2Sc4Itm2C"), o("txtPg2Sc2It12C")]).toEqual(["0", "0", "2,328,000"]);
    const l = rec(loss, {});
    expect([l("txtPg3IShed7_7A"), l("txtPg4IShed8_7A"), l("txtPg2Sc2It15B"), l("txtPg2Sc2It18C")]).toEqual(["300,000", "200,000", "5,000", "2,000"]);
    expect(validate1702MXv2018(itemized, groups)).toEqual([]);
  });
});

/** BIR's own code bug the full recompute trips over: v2018's 14C onchange calls a function v2018 never defines. */
const BIR_PAGE_ERROR = ["Can't find variable: computePg2Sc2It14C"];
/** v2018's computePg2Sc2It12 also zeroes 9D under OSD; the reload's computePg2Sc2ColumnD re-sums it last. */
const OSD_ORDER_2018 = { ...OSD_ORDER, [id("txtPg2Sc2Itm9D")]: "computePg2Sc2It12 zeroes 9D under OSD; the reload's computePg2Sc2ColumnD re-sums A + B + C last" };

describe.skipIf(!hasForm("1702MXv2018"))("native 1702MXv2018 is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-1702MXv2018-1225.xml";

  it("parityCheck: itemized + MCIT with every modal; OSD amended; losses; refused NOLCO / MCIT rows", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018, itemized, file, groups))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018, osd, "84653210700000-1702MXv2018-1225V1.xml", groups))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018, loss, "84653210700000-1702MXv2018-0625.xml", {}))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018, invalid, file, groups))).toEqual([]);
  }, 200_000);

  it("pages 2–4 revealed, every input changed and left, BIR's own modal OKs: BIR lands on the native save", async () => {
    for (const [s, g, f] of [[itemized, groups, file], [loss, {}, "84653210700000-1702MXv2018-0625.xml"], [invalid, groups, file]] as const) {
      const r = await fullRecompute(oracle, FORM_1702MXv2018, s, g, f);
      expect([r.diff, r.missing, r.error.filter((e) => !BIR_PAGE_ERROR.includes(e))]).toEqual([[], [], []]);
    }
    const o = await fullRecompute(oracle, FORM_1702MXv2018, osd, groups, "84653210700000-1702MXv2018-1225V1.xml");
    expect([allow(o, OSD_ORDER_2018), o.missing, o.error.filter((e) => !BIR_PAGE_ERROR.includes(e))]).toEqual([[], [], []]);
  }, 200_000);
});
