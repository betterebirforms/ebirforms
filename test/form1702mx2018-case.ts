// Shared 1702-MX (2018 layout) fill cases: the three 2018 editions have the same save keys, so their tests reuse them.
import { formRecords, type FormSchema, type FormState, type GroupState } from "@/form/schema.ts";
import { P } from "@/form/form1702mxv2018c.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import type { Oracle } from "./oracle.ts";

export const id = (s: string) => `${P}${s}`;
const fill = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, v]) => [id(k), v]));
/** Three column values A (exempt), B (special), C (regular). */
const abc = (stem: string, a: string, b: string, c: string) => ({ [`${stem}A`]: a, [`${stem}B`]: b, [`${stem}C`]: c });

export const identity: FormState = fill({
  txtPg1Pt1I6TINC1: "846", txtPg1Pt1I6TINC2: "532", txtPg1Pt1I6TINC3: "107", txtPg1Pt1I6TINC4: "00000",
  txtPg1Pt1I7RDO: "043", drpPg1Pt1I7RDO: "043", txtPg1Pt1I9RegisteredName: "abc (Phils.) Inc.",
  txtPg1Pt1I10RegisteredAddress: "1 Rizal St., Quezon City", txtZIP: "1100", txtPg1Pt1I11ContactNumber: "0281234567",
});

/** Itemized, ≥ 4 years since incorporation (MCIT), every column and schedule populated, tax still due. */
export const itemized: FormState = {
  ...identity,
  ...fill({
    txtPg1Pt1I8: "03/15/2015", rdoPg1Pt1I13MethodOfDeducItemized: "true", rdoPg1Pt1I13MethodOfDeducOptional: "false",
    txtPg1Pt2I17: "1,000", txtPg1Pt2I18: "250", txtPg1Pt2I19: "0",
    txtPg2Pt4I31CA: "boi", txtPg2Pt4I31CB: "peza", txtPg2Pt4I31CC: "boi", txtPg2Pt4I32CA: "eo 226", txtPg2Pt4I32CB: "RA 7916", txtPg2Pt4I32CC: "eo 226",
    txtPg2Pt4I33CA: "REG-001", txtPg2Pt4I33CB: "REG-002", txtPg2Pt4I33CC: "REG-003", txtPg2Pt4I34SpecialTaxRate: "5",
    txtPg2Pt4I35CA: "01/01/2020", txtPg2Pt4I36CA: "12/31/2027", txtPg2Pt4I35CB: "01/01/2019", txtPg2Pt4I36CB: "12/31/2030",
    ...abc("txtPg2Sc2Itm1", "5,000,000", "8,000,000", "12,000,000"), ...abc("txtPg2Sc2Itm2", "100,000", "200,000", "300,000"),
    ...abc("txtPg2Sc2Itm4", "2,000,000", "3,500,000", "6,000,000"), ...abc("txtPg2Sc2Itm6", "50,000", "75,000", "120,000.40"),
    txtPg2Sc2It14B: "5", txtPg2Sc2It14C: "25", txtPg2Sc2It16B: "20,000", txtPg2Sc2It18C: "110,000",
    ...abc("txtPg2Sc3It20", "1,000", "2,000", "3,000"), txtPg2Sc3It21C: "4,000", ...abc("txtPg2Sc3It22", "5,000", "6,000", "70,000"),
    ...abc("txtPg2Sc3It24", "500", "600", "40,000"), ...abc("txtPg2Sc3It25", "700", "800", "25,000"), ...abc("txtPg2Sc3It26", "0", "0", "1,500"),
    ...abc("txtPg2Sc3It28", "0", "9,000", "0"), ...abc("txtPg2Sc3It29", "300", "400", "500"),
    txtPg2Sc3It30: "tax credit certificate", ...abc("txtPg2Sc3It30", "0", "1,000", "2,000"),
    txtPg3Sc4Itm1A: "750,000", txtPg3Sc4Itm1B: "1,000,000", ...abc("txtPg2Sc4Itm2", "30,000", "40,000", "50,000"),
    ...abc("txtPg3Sc5Itm1", "10,000", "20,000", "30,000"), ...abc("txtPg3Sc5Itm5", "100,000", "150,000", "250,000"),
    ...abc("txtPg3Sc5Itm8", "5,000", "6,000", "7,000"), ...abc("txtPg3Sc5Itm13", "600,000", "900,000", "1,500,000"),
    ...abc("txtPg3Sc5Itm15", "20,000", "30,000", "45,000"), ...abc("txtPg3Sc5Itm17b", "15,000", "25,000", "35,000"),
    txtPg3Sc5It17d: "repairs", ...abc("txtPg3Sc5Itm17d", "1,000", "2,000", "3,000"),
    txtPg3Sc5It17e: "communication", ...abc("txtPg3Sc5Itm17e", "4,000", "5,000", "6,000"),
    txtPg6Sc6I1description: "training", txtPg6Sc6I1legal: "ra 10771", txtPg6Sc6I1CA: "10,000", txtPg3Sc6I1CB: "20,000", txtPg6Sc6I1CC: "30,000",
    txtPg6Sc6I2description: "senior citizen discount", txtPg6Sc6I2legal: "ra 9994", txtPg6Sc6I2CA: "1,000", txtPg3Sc6I2CB: "2,000", txtPg6Sc6I2CC: "3,000",
    txtPg3IShed7_4Year: "2022", txtPg3IShed7_4A: "300,000", txtPg3IShed7_4B: "0", txtPg3IShed7_4C: "100,000", txtPg3IShed7_4D: "150,000",
    txtPg3IShed7_5Year: "2023", txtPg3IShed7_5A: "80,000", txtPg3IShed7_5D: "80,000",
    txtPg3IShed8_4Year: "2023", txtPg4IShed8_4A: "60,000", txtPg4IShed8_4B: "10,000", txtPg4IShed8_4D: "20,000",
    txtPg7Sc9I1: "2022", txtPg7Sc9I1CA: "40,000", txtPg7Sc9I1CB: "70,000", txtPg7Sc9I1CD: "10,000", txtPg7Sc9I1CF: "15,000",
    txtPg7Sc9I2: "2023", txtPg7Sc9I2CA: "50,000", txtPg7Sc9I2CB: "60,000", txtPg7Sc9I2CF: "4,000",
    ...abc("txtPg4Sc10Itm1", "1,500,000", "2,000,000", "-250,000"), txtPg4Sc10Itm2: "non-deductible expenses", ...abc("txtPg4Sc10Itm2", "1,000", "2,000", "3,000"),
    txtPg4Sc10Itm5: "income subjected to final tax", ...abc("txtPg4Sc10Itm5", "4,000", "5,000", "6,000"),
    txtPg4Sc10Itm7: "dividends", ...abc("txtPg4Sc10Itm7", "100", "200", "300"),
    txtPg1P2I23NumOfAttachments: "03",
  }),
};
export const row = (stem: string, cell: string[]) => Object.fromEntries(cell.map((v, j) => [`${P}${stem}{i}Col${j + 1}`, v]));
export const groups: GroupState = {
  sc3_31: [row("txtPg2Sc3_", ["boi credit", "100", "200", "300"]), row("txtPg2Sc3_", ["other tcc", "0", "50", "1,000"])],
  sc5_17i: [row("txtPg3Sc5It17i_", ["utilities", "1,000", "2,000", "3,000"]), row("txtPg3Sc5It17i_", ["supplies", "500", "600", "700"]), row("txtPg3Sc5It17i_", ["rent (warehouse)", "0", "0", "9,000"])],
  sc6_4: [row("txtPg6Sc6_", ["apprenticeship", "ra 7686", "100", "200", "300"])],
  sc10_3: [row("txtPg4Sc10Itm3_", ["fx loss", "10", "20", "30"]), row("txtPg4Sc10Itm3_", ["penalties", "40", "50", "60"])],
  sc10_6: [row("txtPg4Sc10Itm6_", ["exempt income", "700", "800", "900"])],
  sc10_8: [row("txtPg4Sc10Itm8_", ["nolco applied", "1,000", "2,000", "3,000"]), row("txtPg4Sc10Itm8_", ["special deductions", "100", "100", "100"])],
};

/** OSD, an overpayment (the regular column's credits exceed its tax), refunded; amended. */
export const osd: FormState = {
  ...itemized,
  ...fill({
    rdoPg1Pt1I13MethodOfDeducItemized: "false", rdoPg1Pt1I13MethodOfDeducOptional: "true",
    rdoPg1I3AmendedYes: "true", rdoPg1I3AmendedNo: "false", ...abc("txtPg2Sc3It27", "0", "0", "5,000"),
    ...abc("txtPg2Sc3It22", "5,000", "6,000", "2,000,000"), rdoPg1Pt2I21Refund: "true",
  }),
};

/** Losses in the special and regular columns (Sch 7.1 / 8.1 row 7 take this year's NOL), under 4 years old (no MCIT),
 *  another ATC (IC030, two rates on the list) and a fiscal June year-end. */
export const loss: FormState = {
  ...identity,
  ...fill({
    rdoPg1I1Fiscal: "true", rdoPg1I1Calendar: "false", ddlPg1I2Date: "06",
    txtPg1Pt1I8: "02/01/2023", chkPg1I5ATCR2: "true", drpPg1I5ATCR2: "IC030",
    rdoPg1Pt1I13MethodOfDeducItemized: "true", rdoPg1Pt1I13MethodOfDeducOptional: "false",
    txtPg2Pt4I31CB: "peza", txtPg2Pt4I34SpecialTaxRate: "5.0",
    ...abc("txtPg2Sc2Itm1", "1,000,000", "900,000", "800,000"), ...abc("txtPg2Sc2Itm4", "400,000", "800,000", "700,000"),
    txtPg2Sc2It14B: "5", txtPg2Sc2It14C: "20",
    ...abc("txtPg3Sc5Itm13", "100,000", "300,000", "400,000"),
    ...abc("txtPg2Sc3It24", "1,000", "2,000", "3,000"),
    ...abc("txtPg4Sc10Itm1", "-50,000", "-200,000", "-300,000"),
    txtPg1Pt2I17: "500",
  }),
};

/** Invalid NOLCO rows (B+C+D > A) and an MCIT row whose D+E+F exceed C: BIR zeroes them, column by column. */
export const invalid: FormState = {
  ...itemized,
  ...fill({
    txtPg3IShed7_4A: "10,000", txtPg3IShed7_4B: "20,000", txtPg3IShed7_4C: "0", txtPg3IShed7_4D: "0",
    txtPg3IShed7_5A: "100,000", txtPg3IShed7_5B: "60,000", txtPg3IShed7_5C: "30,000", txtPg3IShed7_5D: "20,000",
    txtPg7Sc9I1CD: "20,000", txtPg7Sc9I1CE: "10,000", txtPg7Sc9I1CF: "5,000",
    txtPg2Sc2Itm1B: "1,000.60", txtPg1Pt2I18: "-100",
  }),
};

/** Open the native save in BIR's form, reveal pages 2–4, then do what the filer does: every enabled text input changed
 *  and left (twice), every modal's rows summed and OK'd by BIR's own functions before each pass. Returns
 *  the keys whose final value differs from the native save. parityCheck blurs only page 1, so this is what runs
 *  BIR's Part IV / schedule / modal computes. */
export async function fullRecompute(oracle: Oracle, schema: FormSchema, s: FormState, g: GroupState, file: string) {
  const native = formRecords(schema, s, g);
  const escaped = new Set(schema.field.filter((f) => f.escaped).map((f) => f.id));
  const { page, error } = await oracle.openSaved(schema, s, file, g);
  const legacy: Array<[string, string]> = await page.evaluate(() => {
    const w = window as unknown as Record<string, () => void>;
    for (const p of ["Page2Content", "Page3Content", "Page4Content"]) (document.getElementById(p) as HTMLElement).style.display = "block";
    const ok = () => {
      for (const m of ["Pg2Sc3", "Pg3Sc5I17i", "Pg3Sc6", "Pg4Sc10I3", "Pg4Sc10I6", "Pg4Sc10I8"])
        if ((document.getElementById(`modalTable${m}`) as HTMLTableElement).rows.length) w[`summationmodalTable${m}`]!(), w[`Save_modalTable${m}`]!();
    };
    const all = Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    for (let pass = 0; pass < 2; pass++) {
      ok();
      for (const el of all) {
        if (el.disabled || el.type !== "text" || el.offsetParent === null) continue;
        el.dispatchEvent(new Event("change"));
        el.dispatchEvent(new FocusEvent("blur"));
      }
    }
    return all.filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type)).map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  });
  await page.close();
  const bir = new Map(legacy);
  const saved = (x: string) => (/^\([\d,]+\)$/.test(x) ? `-${x.slice(1, -1)}` : x);
  const diff = native
    .map((r) => ({ key: r.key, native: escaped.has(r.key) ? legacyUnescape(r.value) : r.value, legacy: bir.get(r.key) }))
    .filter((d) => d.legacy !== undefined && saved(d.legacy) !== d.native && !(d.native === "0" && d.legacy === "(0)"))
    .map((d) => `${d.key}: native ${JSON.stringify(d.native)} vs BIR ${JSON.stringify(d.legacy)}`);
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

/** Keys whose final value BIR itself leaves order-dependent under OSD: the native save holds what BIR's RELOAD leaves
 *  (parityCheck's bar), a fresh tab-through leaves the other writer's value. */
export const OSD_ORDER: Record<string, string> = {
  [id("txtPg2Sc2It11D")]: "computePg2Sc2It12 zeroes 11D under OSD; the reload's computePg2Sc2ColumnD re-sums it last",
  [id("txtPg2Sc2It13D")]: "computePg2Sc2It12 sets 13D = 13C under OSD; the reload's computePg2Sc2ColumnD re-sums A + B + C last",
  [id("txtPg6Sc6I5CD")]: "computePg6Sc6I5 totals the row D's before re-summing them: after the reload's OSD zeroing the modal row's stale 300 is in",
};
export const allow = (r: { diff: string[] }, key: Record<string, string>) => r.diff.filter((d) => !Object.keys(key).some((k) => d.startsWith(`${k}:`)));
