// BIR's ATC pickers on the web version. On BIR's pages the list inside these pop-ups is built by BIR's script
// (getPopulateATC → tbllistAtcCode), so the captured page holds an empty table; the web version lists the same
// codes from the form's own pick list (atc.ts, read from BIR's atcCodes.xml) and fills the boxes BIR's script fills:
//   • "rows": BIR's "Add ATC" (showPartIIATC → getATCCode): one Part II row per ticked code, in list order; a row
//     already there keeps its tax base. Rate is BIR's cell text, " " + rate.
//   • "row": a Schedule II payee row's own picker (showSchedIIATC(i) → getSchedIIATC): one code into row i, with its
//     nature of payment and rate.
import type { FormState, GroupState } from "./schema.ts";
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
PICKER["2550M"] = { btnSched1: sched1("2550m", pickList2550M), btnSched1ATC: sched1("2550m", pickList2550M) };
PICKER["2550Q"] = { btnSched1: sched1("2550q", pickList2550Q), btnSched1ATC: sched1("2550q", pickList2550Q) };

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
  "1602": { modalSectionB: "secB", modalSectionC: "secC" },
  "2552": { modalTransactionNoTax: "noTax", modalTaxTransaction: "taxTrans" },
  "1701MS": {
    modalSched410A: "sched410A", modalSched410aSpouse: "sched410aSpouse", modalsched410A1: "sched410A1", modalsched410A2: "sched410A2",
    modalSched413A: "sched413A", modalSched413B: "sched413B", modalSched420A: "sched420A", modalSched420B: "sched420B", modalSched5No9: "sched5No9",
  },
  "2550DS": { modalNo22D: "specify22D" },
  "2550DS-old": { modalNo22D: "specify22D" },
};

/** A pop-up BIR opens only when the form allows it (its message, "" = nothing happens). 1602 checkiftaxwheld. */
const section1602 = (list: string[], which: string) => (state: FormState) =>
  state["frm1602:OptTaxWithheld1"] === "true" && list.includes(state["frm1602:lstSpecialTax"] ?? "")
    ? null
    : `Section ${which} is only enabled if Item 4 is set to Yes and Item 13 is set to Yes - ${which === "B" ? "International Tax Treaty" : "Special Rate"} or\nBoth.`;
export const POPUP_NEED: Record<string, Record<string, (state: FormState) => string | null>> = {
  "1602": { btnSectionB: section1602(["2", "3"], "B"), btnSectionC: section1602(["1", "3"], "C") },
  // showSched1: Schedule 1 (and its calculators) opens only when manner of payment 1 is ticked, silently otherwise
  "2200T": { "frm2200T:btnSchedule1": (s) => (s["frm2200T:chkPymntManner_1"] === "true" ? null : "") },
};

/** BIR's "row is filled" checks: text not blank ($.trim(v) == ""), amount not zero (v * 1 == 0, so blank is zero too). */
type RowCheck = (s: FormState) => boolean;
const notBlank = (id: string): RowCheck => (s) => (s[id] ?? "").trim() !== "";
const notEmpty = (id: string): RowCheck => (s) => (s[id] ?? "") !== ""; // BIR's check without $.trim
const amount = (id: string): RowCheck => (s) => { const v = (s[id] ?? "").trim(); return v !== "" && Number(v) !== 0; };
const full = (s: FormState, rows: number, check: (i: number) => RowCheck[]) => Array.from({ length: rows }, (_, i) => check(i + 1)).every((c) => c.every((f) => f(s)));
const SCHED4_ON = (s: FormState) => amount("frm1702q:Sched4:txtOthrTxCrdtAmnt1")(s);
const ADD_MORE_1707 = {
  btnPg2Pt4Sch2More: { group: "sched2more", title: "Schedule 2 Add More", on: (g: GroupState, s: FormState) => (g.sched2more ?? []).length > 0 || full(s, 4, (i) => [notBlank(`frm1707:txtPg2P4Sch2NameOfCorpStock${i}`), amount(`frm1707:txtPg2P4Sch2NoOfShares${i}`), notEmpty(`frm1707:txtPg2P4Sch2StockCertNo${i}`), amount(`frm1707:txtPg2P4Sch2TaxBaseSellPrice${i}`)]) },
  btnPg2Pt4Sch3More: { group: "sched3more", title: "Schedule 3 Add More", on: (g: GroupState, s: FormState) => (g.sched3more ?? []).length > 0 || full(s, 4, (i) => [notBlank(`frm1707:txtPg2P4Sch3Particulars${i}`), amount(`frm1707:txtPg2P4Sch3Amount${i}`)]) },
};

/** A button that opens a group's editor (BIR's own pop-up for it is a separate page section), and when BIR turns
 *  it on. 1707A's "(more...)": on once the schedule's pop-up holds 2 rows or more (BIR's addToTable). */
export const BUTTON_GROUP: Record<string, Record<string, { group: string; title?: string; on?: (groups: GroupState, state: FormState) => boolean }>> = {
  // 2552 Part III: BIR's script adds its rows (AddTransactionNoTax), so none are on the page to find the table by
  "2552": {
    "frm2552:buttAdd": { group: "partIII", title: "Part III Summary of Transactions not subject to Tax" },
    "frm2552:buttDel": { group: "partIII", title: "Part III Summary of Transactions not subject to Tax" },
  },
  // 2200T Schedule 1's "Calculator" links (BIR's script builds them, openModal(this, "modalCalculatorXT<n>")): the five
  // calculators' rows are BIR-built too, so each link opens its calculator's rows; the total is the product row's taxable
  "2200T": Object.fromEntries(
    (["XT35", "XT36", "XT40", "XT140", "XT150"] as const).map((n) => [`frm2200T:lnk${n}`, { group: `calc${n}`, title: `Calculator for ${{ XT35: "XT035", XT36: "XT036", XT40: "XT040", XT140: "XT140", XT150: "XT150" }[n]}` }]),
  ),
  "1707A": {
    btnSched1More: { group: "sched1more", on: (g) => (g.sched1more ?? []).length >= 2 },
    btnSched2More: { group: "sched2more", on: (g) => (g.sched2more ?? []).length >= 2 },
  },
  // 2552 (2018) Part V Schedules 1 to 3 "(Add More...)": BIR's Check_Pg2Pt5AddMore turns it on once rows 1 to 5 are full
  "2552v2018": Object.fromEntries([1, 2, 3].map((n) => [`btnPg2Pt5Sch${n}More`, { group: `sched${n}more`, title: `Schedule ${n} Add More`, on: (g: GroupState, s: FormState) => (g[`sched${n}more`] ?? []).length > 0 || full(s, 5, (i) => [...["Date", "Seller", "Buyer", "Corp"].map((c) => notBlank(`frm2552:txtPg2Pt5Sch${n}${c}${i}`)), ...["NumShares", "TaxBase", "TaxRate"].map((c) => amount(`frm2552:txtPg2Pt5Sch${n}${c}${i}`))]) }])),
  // 1707 (2018, 2021) Part IV Schedules 2 and 3 "(Add More...)": BIR's Check_Pg2Pt4S2 / S3 turn it on once rows 1 to 4
  // are all filled in
  ...Object.fromEntries(["1707v2018", "1707v2021"].map((code) => [code, ADD_MORE_1707])),
  // 2550Q (2024) Schedule 1 (input tax on capital goods): three links share the id btnNewSched1 (showNewSched1), all open it
  "2550Qv2024": { btnNewSched1: { group: "sched1", title: "Schedule 1 Input Tax on Capital Goods", on: () => true } },
  // 1601C (2018) and 2200A (2020) Add / Delete rows, 1702Q (CREATE) Schedule 4's "Add" pop-up
  "1601Cv2018": { "frm1601c:btnAdd": { group: "sched1", title: "Schedule 1 Adjustments", on: () => true }, "frm1601c:btnDelete": { group: "sched1", title: "Schedule 1 Adjustments", on: () => true } },
  "2200Av2020": { "frm2200Av2020:btnAdd": { group: "sched1more", title: "Schedule 1 Other Rows", on: () => true }, "frm2200Av2020:btnDelete": { group: "sched1more", title: "Schedule 1 Other Rows", on: () => true } },
  // 1702Q (CREATE) Schedule 4 "Add": enableSched4 turns Add and Delete on once row b holds an amount
  "1702Qv2018C": { "frm1702q:Sched4:btnAdd": { group: "sched4more", title: "Other Tax Credits / Payments", on: (_g: GroupState, s: FormState) => SCHED4_ON(s) } },
  "1707Av2021": {
    btnSched1More: { group: "sched1more", on: (g) => (g.sched1more ?? []).length >= 2 },
    btnSched2More: { group: "sched2more", on: (g) => (g.sched2more ?? []).length >= 2 },
  },
};

/** A button that changes boxes and rows from what is ticked on the page (BIR's tick boxes have no name, so they are
 *  not saved): `tick` maps each tick box to the box whose greyed state it follows, `run` gets the ticked ones. */
export const BUTTON_ACTION: Record<string, Record<string, { on?: (groups: GroupState, state: FormState) => boolean; tick: Record<string, string>; run: (ticked: string[], state: FormState, groups: GroupState) => { state: FormState; groups: GroupState } }>> = {
  // 1702Q (CREATE) Schedule 4 "Delete" (deleteOtherTaxCredits): each ticked row's description goes blank and its amount
  // to 0.00, the tick clears, and any ticked row also empties the "Add" pop-up's rows (clearSched4ModalData)
  "1702Qv2018C": {
    "frm1702q:Sched4:btnDelete": {
      on: (_g, s) => SCHED4_ON(s),
      tick: { "frm1702q:Sched4:chkOthrTxCrdts0": "frm1702q:Sched4:txtOthrTxCrdts0", "frm1702q:Sched4:chkOthrTxCrdts1": "frm1702q:Sched4:txtOthrTxCrdts1" },
      run: (ticked, state, groups) => {
        const next = { ...state };
        for (const t of ticked) {
          const i = t.slice(-1);
          next[`frm1702q:Sched4:txtOthrTxCrdts${i}`] = "";
          next[`frm1702q:Sched4:txtOthrTxCrdtAmnt${i}`] = "0.00";
        }
        return { state: next, groups: ticked.length ? { ...groups, sched4more: [] } : groups };
      },
    },
  },
};

/** BIR's "Read CSV File" (1707A): which schedule each button reads into. */
export const CSV_BUTTON: Record<string, Record<string, 1 | 2>> = {
  "1707A": { btnOpenSched1CSV: 1, btnOpenSched2CSV: 2 },
  "1707Av2021": { btnOpenSched1CSV: 1, btnOpenSched2CSV: 2 },
};

/** Boxes BIR made links to the next page (1602Q ShowSchedule1to3: not when item 4 says no tax was withheld). */
export const NEXT_PAGE: Record<string, Record<string, (state: FormState) => boolean>> = {
  "1602Qv2018": Object.fromEntries(["1", "2", "3"].map((n) => [`frm1602Q:txtSched${n}`, (s: FormState) => s["frm1602Q:OptTaxWithheld2"] !== "true"])),
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

/** BIR's openDialog2(element) (1700): the element's contents copied into #dialog2 over #overlay2, with a Close. */
export const DIALOG: Record<string, Record<string, string>> = { "1700": { btntablepop: "table3pop" } };
