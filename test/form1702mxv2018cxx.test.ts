import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formRecords } from "@/form/schema.ts";
import { FORM_1702MXv2018C } from "@/form/form1702mxv2018c.ts";
import { FORM_1702MXv2018Cxx, validate1702MXv2018Cxx } from "@/form/form1702mxv2018cxx.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { OSD_ORDER, allow, fullRecompute, groups, invalid, itemized, loss, osd } from "./form1702mx2018-case.ts";

describe("1702MXv2018Cxx compute (BIR's test fork of v2018C)", () => {
  it("saves exactly what v2018C saves: same keys, same compute", () => {
    for (const [s, g] of [[itemized, groups], [osd, groups], [loss, {}], [invalid, groups]] as const)
      expect(formRecords(FORM_1702MXv2018Cxx, s, g)).toEqual(formRecords(FORM_1702MXv2018C, s, g));
    expect(validate1702MXv2018Cxx(itemized, groups)).toEqual([]);
  });
});

describe.skipIf(!hasForm("1702MXv2018Cxx"))("native 1702MXv2018Cxx is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  // BIR's Cxx form names its own saves "-1702MXv2018C-"
  const file = "84653210700000-1702MXv2018C-1225.xml";

  it("parityCheck: itemized + MCIT with every modal; OSD amended; losses; refused NOLCO / MCIT rows", async () => {
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018Cxx, itemized, file, groups))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018Cxx, osd, "84653210700000-1702MXv2018C-1225V1.xml", groups))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018Cxx, loss, "84653210700000-1702MXv2018C-0625.xml", {}))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702MXv2018Cxx, invalid, file, groups))).toEqual([]);
  }, 200_000);

  it("pages 2–4 revealed, every input changed and left, BIR's own modal OKs: BIR lands on the native save", async () => {
    expect(await fullRecompute(oracle, FORM_1702MXv2018Cxx, itemized, groups, file)).toEqual({ diff: [], missing: [], error: [] });
    const o = await fullRecompute(oracle, FORM_1702MXv2018Cxx, osd, groups, "84653210700000-1702MXv2018C-1225V1.xml");
    expect([allow(o, OSD_ORDER), o.missing, o.error]).toEqual([[], [], []]);
  }, 200_000);
});
