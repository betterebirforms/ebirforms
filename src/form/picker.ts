// BIR's ATC pickers on the web version. On BIR's pages the list inside these pop-ups is built by BIR's script
// (getPopulateATC → tbllistAtcCode), so the captured page holds an empty table; the web version lists the same
// codes from the form's own pick list (atc.ts, read from BIR's atcCodes.xml) and fills the boxes BIR's script fills:
//   • "rows": BIR's "Add ATC" (showPartIIATC → getATCCode): one Part II row per ticked code, in list order; a row
//     already there keeps its tax base. Rate is BIR's cell text, " " + rate.
//   • "row": a Schedule II payee row's own picker (showSchedIIATC(i) → getSchedIIATC): one code into row i, with its
//     nature of payment and rate.
import type { FormState } from "./schema.ts";
import type { AtcPick } from "./atc.ts";
import { pickList1600 } from "./form1600.ts";
import { pickList1600WP } from "./form1600wp.ts";
import { pickList1601E } from "./form1601e.ts";
import { pickList1601F } from "./form1601f.ts";
import { pickList1601EQ } from "./form1601eq.ts";
import { pickList1601FQ } from "./form1601fq.ts";
import { F1600VT } from "./form1600vtv2018.ts";
import { F1600PT } from "./form1600ptv2018.ts";
import { pickList2550M } from "./form2550m.ts";
import { pickList2550Q } from "./form2550q.ts";
import { atcInfo, atcPickList } from "./atc.ts";

export type Picker =
  | { kind: "field"; field: string; list: (state: FormState) => AtcPick[]; need?: (state: FormState) => string | null; fill?: (a: AtcPick) => FormState }
  | { kind: "rows"; group: string; atc: string; rate?: string; list: (state: FormState) => AtcPick[]; more?: { group: string; after: number }; need?: (state: FormState) => string | null }
  | { kind: "row"; group: string; atc: string; rate: string; nature: string; list: (state: FormState) => AtcPick[] };

const rows = (form: string, group: string, list: (state: FormState) => AtcPick[], atc = "txtAtcCd", rate = "txtTaxRate", more?: { group: string; after: number }): Extract<Picker, { kind: "rows" }> => ({
  kind: "rows",
  group,
  atc: `frm${form}:${atc}`,
  rate: `frm${form}:${rate}`,
  list,
  ...(more ? { more } : {}),
});
const payee = (form: string, list: (state: FormState) => AtcPick[], atc: string): Picker => ({
  kind: "row",
  group: "dtSched",
  atc,
  rate: `frm${form}:dtSched:txtRatePercent`,
  nature: `frm${form}:dtSched:naturePayment`,
  list,
});

/** 0605 item 6 (showATCDiv / ATCList): BIR's 0605 codes; tax type PT shows only the PT codes, any other only
 *  the rest. It needs a tax type first. */
const atc0605: Picker = {
  kind: "field",
  field: "txtATCCode",
  list: (state) => atcPickList("0605", "").filter((a) => (state.txtTaxTypeCode === "PT") === a.atc_code.startsWith("PT")),
  need: (state) => ((state.txtTaxTypeCode ?? "") === "" ? "Please select a valid Tax Type  on Item 8." : null),
};

/** 1600-VT/PT checkATCButton: the ATC link works only once item 3 is Yes and item 10 has a category; until then
 *  BIR's link does nothing ("" = refuse without a message). */
const on1600T = (P: string) => (state: FormState) =>
  state[`${P}rdoPg1I3TaxWithheldYes`] === "true" && (state[`${P}rdoPg1I10CategoryofWthholdAgentPriv`] === "true" || state[`${P}rdoPg1I10CategoryofWthholdAgentGovt`] === "true") ? null : "";

/** Per form: BIR's button id (a trailing <i> = a row's own button) → what its picker fills. */
export const PICKER: Record<string, Record<string, Picker>> = {
  "0605": { btnATC: atc0605 },
  "1600": {
    btnAddATCPartII: rows("1600", "atc", pickList1600),
    "frm1600:dtSched:btnATCcode<i>": payee("1600", pickList1600, "frm1600:dtSched:drpAtcCode:{i}"),
  },
  "1600WP": {
    btnAddATCPartII: rows("1600WP", "atc", pickList1600WP, "txtAtcCode"),
    "frm1600WP:dtSched:btnATCcode<i>": payee("1600WP", pickList1600WP, "frm1600WP:dtSched:drpAtcCode"),
  },
  "1601E": { btnAddATCPartII: rows("1601E", "atc", pickList1601E) },
  "1601F": { btnAddATCPartII: rows("1601F", "atc", pickList1601F, "txtAtcCode") },
  // one picker for Part II: the first picks fill the table on the page, the rest go to "Other Selected ATC"
  // (BIR's getATCCode: 6 rows on 1601-EQ/FQ, 5 on 1600-VT/PT)
  "1601EQ": { btnAddATCPartII: rows("1601EQ", "atc", pickList1601EQ, "txtAtcCd", "txtTaxRate", { group: "other", after: 6 }) },
  "1601FQ": { btnAddATCPartII: rows("1601FQ", "atc", pickList1601FQ, "txtAtcCode", "txtTaxRate", { group: "other", after: 6 }) },
  "1600VTv2018": { btnAddATCPartII: { ...rows("1600VT", "atc", F1600VT.pickList, "txtAtcCd", "txtPg1P2TaxRate", { group: "other", after: 5 }), need: on1600T("frm1600VT:") } },
  "1600PTv2018": { btnAddATCPartII: { ...rows("1600PT", "atc", F1600PT.pickList, "txtAtcCd", "txtPg1P2TaxRate", { group: "other", after: 5 }), need: on1600T("frm1600PT:") } },
};

/** 2550-M/Q Schedule 1 (showModalAtc → getATCCode): BIR opens the schedule, its ATC link opens the list, OK draws one
 *  row per ticked code (no rate column) and keeps an amount already typed for that code. The web version opens the
 *  list first, then the schedule with those rows. */
const sched1 = (form: string, list: () => AtcPick[]): Picker => ({ kind: "rows", group: "atc", atc: `frm${form}:txtAtcCde`, list });
PICKER["2550M"] = { btnSched1: sched1("2550m", pickList2550M) };
PICKER["2550Q"] = { btnSched1: sched1("2550q", pickList2550Q) };

/** 2551 / 2553 items 14 to 18 (showModalATC(n) → getATCCode): one code per item; A = its description, B = the code,
 *  D = its rate (2553's OT012 has none: 0.00, typed by hand). */
const item = (form: string, list: string, box: (n: number, col: string) => string) =>
  Object.fromEntries(
    [14, 15, 16, 17, 18].map((n): [string, Picker] => [
      `frm${form}:btn${n}B`,
      {
        kind: "field",
        field: box(n, "B"),
        list: () => atcPickList(list, ""),
        fill: (a) => ({ [box(n, "A")]: atcInfo(a.atc_code)?.desc ?? "", [box(n, "B")]: a.atc_code, [box(n, "D")]: a.atc_code === "OT012" ? "0.00" : a.rate }),
      },
    ]),
  );
PICKER["2551"] = item("2551", "2551_", (n, c) => `frm2551:txtTax${n}${c}`);
PICKER["2553"] = item("2553", "2553", (n, c) => `frm2553:txt${n}${c}`);

/** A pop-up whose rows BIR's script draws (none on the captured page): open the web version's editor on this group.
 *  "Other Selected ATC" shows the Part II picks past the table on the page. */
export const POPUP_GROUP: Record<string, Record<string, string>> = {
  "1601EQ": { modalOtherAtc: "other" },
  "1601FQ": { modalOtherAtc: "other" },
  "1600VTv2018": { modalOtherAtc: "other" },
  "1600PTv2018": { modalOtherAtc: "other" },
  "2000": { modalSched1: "sched1" },
};

/** The picker for a button on a form, and the row it is for (0-based) when it is a row's own button. */
export function pickerOf(form_code: string, id: string): { picker: Picker; row: number } | null {
  const all = PICKER[form_code] ?? {};
  if (all[id]) return { picker: all[id], row: -1 };
  for (const [key, picker] of Object.entries(all)) {
    if (!key.endsWith("<i>")) continue;
    const n = id.startsWith(key.slice(0, -3)) ? Number(id.slice(key.length - 3)) : NaN;
    if (Number.isInteger(n) && n > 0) return { picker, row: n - 1 };
  }
  return null;
}

/** BIR's rate cell: a space, then the rate ("5.0" → " 5.0"). */
export const rateText = (rate: string) => ` ${rate}`;

/** A one-code list BIR's page already holds (its rows are on the captured page): when the pop-up closes with OK,
 *  copy the ticked row into the form the way BIR's getATCCode does. Per form: pop-up id → the copy. */
export const LIST_COPY: Record<string, Record<string, (root: ShadowRoot) => FormState | null>> = {};
const text = (root: ShadowRoot, id: string) => root.getElementById(id)?.innerHTML ?? "";
const ticked = (root: ShadowRoot, stem: string) => {
  for (let i = 1; root.getElementById(`${stem}${i}`); i++) if ((root.getElementById(`${stem}${i}`) as HTMLInputElement).checked) return i;
  return 0;
};
// 1702Q: the ticked row's code cell (as BIR copies it, innerHTML) and its rate as 25B, two decimals
const atc1702q = (root: ShadowRoot): FormState | null => {
  const i = ticked(root, "Codename");
  return i ? { "frm1702q:txtAtc": text(root, `AtcCode${i}`), "frm1702q:txt25B": (Number(text(root, `atcRate${i}`)) || 0).toFixed(2) } : null;
};
LIST_COPY["1702Q"] = { modalAtc: atc1702q };
// 0605 item 8 (getTaxTypeCode): the ticked tax type, and the ATC is cleared (its list depends on the tax type)
LIST_COPY["0605"] = {
  modalTaxTypeCode: (root) => {
    const i = ticked(root, "TaxTypeCode");
    return i ? { txtTaxTypeCode: (root.getElementById(`TaxTypeCode${i}`) as HTMLInputElement).value, txtATCCode: "" } : null;
  },
};
LIST_COPY["1702Qv2008C"] = { modalAtc: atc1702q };
// 2000OT: the radio's code, and its rate cell as item 15 (BIR's fix: DS125 is 0.50, which JavaScript writes "0.5")
LIST_COPY["2000OT"] = {
  modalAtc: (root) => {
    const i = ticked(root, "AtcCode");
    if (!i) return null;
    const code = (root.getElementById(`AtcCode${i}`) as HTMLInputElement).value;
    return { "frm2000OT:txtATC": code, "frm2000OT:txtTax15": code === "DS125" ? "0.5" : text(root, `AtcRate${i}`) };
  },
};
