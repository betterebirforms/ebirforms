// BIR's ATC pickers on the web version. On BIR's pages the list inside these pop-ups is built by BIR's script
// (getPopulateATC → tbllistAtcCode), so the captured page holds an empty table; the web version lists the same
// codes from the form's own pick list (atc.ts, read from BIR's atcCodes.xml) and fills the boxes BIR's script fills:
//   • "rows": BIR's "Add ATC" (showPartIIATC → getATCCode): one Part II row per ticked code, in list order; a row
//     already there keeps its tax base. Rate is BIR's cell text, " " + rate.
//   • "row": a Schedule II payee row's own picker (showSchedIIATC(i) → getSchedIIATC): one code into row i, with its
//     nature of payment and rate.
import type { FormState, GroupState } from "./schema.ts";
import type { AtcPick } from "./atc.ts";
import modal1701Json from "./page/1701-modal.json";
import { linkOn } from "./gate1701.ts";
import { on1700, on1700v2018 } from "./gate1700.ts";
import { on1701A } from "./gate1701a.ts";
import column1701Json from "./page/1701-column.json";
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
import { GATE_EX, GATE_EX2018, GATE_RT, GATE_RT2018, gateOn, type Gate } from "./gate1702.ts";

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
/** 1701 Schedule 1 "(add more...)" (disabledAddMoreLinkSchedule1 → disableLinkIfEmpty): on once items 1 to 4 each have
 *  the employer's name and TIN (a text box that isn't 12 long: non-blank after trim) and compensation income above 0
 *  (JS `value <= 0`: blank and "0.00" fail, a value with a comma is NaN and passes). Tax withheld and the ticks are not checked. */
const SCHED1_LINK_1701 = (s: FormState): boolean =>
  [1, 2, 3, 4].every((i) => {
    const id = (x: string) => `frm1701:txtPg5Sc1I${i}${x}`;
    const income = Number(s[id("ComIncomeC2")] ?? "");
    return ["NameOfEmp", "EmpTIN1C1", "EmpTIN2C1", "EmpTIN3C1", "EmpTIN4C1"].every((x) => (s[id(x)] ?? "").trim() !== "") && !(income <= 0);
  });
const ADD_MORE_1707 = {
  btnPg2Pt4Sch2More: { group: "sched2more", title: "Schedule 2 Add More", on: (g: GroupState, s: FormState) => (g.sched2more ?? []).length > 0 || full(s, 4, (i) => [notBlank(`frm1707:txtPg2P4Sch2NameOfCorpStock${i}`), amount(`frm1707:txtPg2P4Sch2NoOfShares${i}`), notEmpty(`frm1707:txtPg2P4Sch2StockCertNo${i}`), amount(`frm1707:txtPg2P4Sch2TaxBaseSellPrice${i}`)]) },
  btnPg2Pt4Sch3More: { group: "sched3more", title: "Schedule 3 Add More", on: (g: GroupState, s: FormState) => (g.sched3more ?? []).length > 0 || full(s, 4, (i) => [notBlank(`frm1707:txtPg2P4Sch3Particulars${i}`), amount(`frm1707:txtPg2P4Sch3Amount${i}`)]) },
};
/** 1701's "(add more...)" links (addmore): the 11 on the main pages and, on each of the ten attachment copies (EX1..EX5,
 *  SP1..SP5), the 11 kinds BIR's attachment block has. The ids and groups come from BIR's page (tool/gen-1701-modal.mjs). */
function modal1701(): Record<string, { group: string; title: string; on?: (groups: GroupState, state: FormState) => boolean }> {
  const out: Record<string, { group: string; title: string; on?: (groups: GroupState, state: FormState) => boolean }> = {};
  const copy = ["EX", "SP"].flatMap((kind) => [1, 2, 3, 4, 5].map((n) => `${kind}${n}`));
  for (const m of modal1701Json as Array<{ link: string; modal: string }>) {
    const title = m.modal.replace(/TYPE$/, "").replace(/^modal/, "").replace(/Page(\d+)m?/, "Page $1 ").replace(/Schedule/, "Schedule ").replace(/I(\d+)$/, " item $1");
    for (const c of m.modal.includes("TYPE") ? copy : [""]) {
      const group = m.modal.replace(/TYPE/g, c);
      out[m.link.replace(/TYPE/g, c)] = { group, title: c ? `${title} (copy ${c})` : title, on: linkOn(m.link, group, c) };
    }
  }
  return out;
}

/** 1701's seven other "(add more...)" links: Schedule 1 on page 5 (employers) and Schedule 12 on page 11 (Part 1 of 12A as
 *  rows; Parts 2 to 4 and B1, B2 as BIR's column blocks). Each opens the group named after BIR's pop-up
 *  (page/1701-column.json, tool/gen-1701-column.mjs; form1701-sim.ts SCHED1). */
function column1701(): Record<string, { group: string; title: string; on?: (groups: GroupState, state: FormState) => boolean }> {
  const title: Record<string, string> = {
    modalPage11Schedule12APt1: "Schedule 12A Part 1 item 6: other compensation, final tax withheld",
    modalPage11Schedule12APt2: "Schedule 12A Part 2: sale of real property (items 7 to 11), two sales a block",
    modalPage11Schedule12APt3: "Schedule 12A Part 3: sale of shares of stock (items 12 to 17), two sales a block",
    modalPage11Schedule12APt4: "Schedule 12A Part 4: other income (items 18 to 20), two a block",
    modalPage11Schedule12BPt1: "Schedule 12B Part 1: sale of property (items 4 to 7), two sales a block",
    modalPage11Schedule12BPt2: "Schedule 12B Part 2: other exempt income (items 8 and 9), two a block",
  };
  return {
    "frm1701:lnkPg5Sc1More": { group: "modalPage5Schedule1", title: "Page 5 Schedule 1 item 4: employers (two or more)", on: (g: GroupState, s: FormState) => (g.modalPage5Schedule1 ?? []).length > 0 || SCHED1_LINK_1701(s) },
    ...Object.fromEntries((column1701Json as Array<{ link: string; modal: string }>).map((c) => [c.link, { group: c.modal, title: title[c.modal] ?? c.modal }])),
  };
}

/** A button that opens a group's editor (BIR's own pop-up for it is a separate page section), and when BIR turns
 *  it on. 1707A's "(more...)": on once the schedule's pop-up holds 2 rows or more (BIR's addToTable). */
/** BIR's "(Add more...)" buttons that open an item's own pop-up table (1702-RT / 1702-EX families): button id → the group,
 *  the pop-up's title and when BIR turns the button on (src/form/gate1702.ts; no gate = never greyed out in BIR). */
const more = (gate: Record<string, Gate>, edition: "RT" | "EX", ...entry: Array<[button: string, group: string, title: string]>): Record<string, { group: string; title: string; on: (groups: GroupState, state: FormState) => boolean }> =>
  Object.fromEntries(entry.map(([id, group, title]) => [id, { group, title, on: gate[id] ? gateOn(gate[id]!, group, edition) : () => true }]));
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
  // "(add more...)" tables (addmore): the link, BIR's pop-up of rows
  "1700": {
    "frm1700:lnkPg2Pt4AddLink": { group: "modalPage2Part4", title: "Page 2 Part IV Item 3: employers", on: on1700("frm1700:lnkPg2Pt4AddLink", "modalPage2Part4") },
    "frm1700:lnkPg2Pt4I12ADDMore": { group: "Page2Part4I12ModalI12", title: "Page 2 Part IV Item 12: others", on: on1700("frm1700:lnkPg2Pt4I12ADDMore", "Page2Part4I12ModalI12") },
    "frm1700:lnkPg3Pt5I6ADDMore": { group: "Page3Part5I6ModalA1", title: "Page 3 Part V A Item 6", on: on1700("frm1700:lnkPg3Pt5I6ADDMore", "Page3Part5I6ModalA1") },
    "frm1700:lnkPg3Pt5I11ADDMore": { group: "Page3Part5ModalA2", title: "Page 3 Part V A Item 11", on: on1700("frm1700:lnkPg3Pt5I11ADDMore", "Page3Part5ModalA2") },
    "frm1700:lnkPg3Pt5I17ADDMore": { group: "Page3Part5ModalA3", title: "Page 3 Part V A Item 17", on: on1700("frm1700:lnkPg3Pt5I17ADDMore", "Page3Part5ModalA3") },
    "frm1700:lnkPg3Pt5I20ADDMore": { group: "Page3Part5ModalA4", title: "Page 3 Part V A Item 20", on: on1700("frm1700:lnkPg3Pt5I20ADDMore", "Page3Part5ModalA4") },
    "frm1700:lnkPg3Pt5I7ADDMore": { group: "Page3Part5ModalB1", title: "Page 3 Part V B Item 7", on: on1700("frm1700:lnkPg3Pt5I7ADDMore", "Page3Part5ModalB1") },
    "frm1700:lnkPg3Pt5I10ADDMore": { group: "Page3Part5ModalB2", title: "Page 3 Part V B Item 10", on: on1700("frm1700:lnkPg3Pt5I10ADDMore", "Page3Part5ModalB2") },
  },
  "1700v2018": { addMoreSched1Link: { group: "sched1more", title: "Part VI Schedule 1: continuation of employers", on: on1700v2018 } },
  "1701": { ...modal1701(), ...column1701() },
  "1701A": {
    "frm1701A:lnkPartIVAMore": { group: "partIVA", title: "Part IV.A Other Taxable Income (item 42)", on: on1701A("partIVA", 41, 42) },
    "frm1701A:lnkPartIVBMore": { group: "partIVB", title: "Part IV.B Other Non-Taxable Income (item 51)", on: on1701A("partIVB", 50, 51) },
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

// 1702-RT and 1702-EX: the "(Add more...)" tables of their schedules. The 2018 editions of each family share one set
// of buttons (the superseded and the current edition carry the same ids).
const RT2018 = more(GATE_RT2018, "RT",
  ["btnPg2Pt4I54More", "credit54", "Part IV item 54: other tax credits"],
  ["btnPg3Sc1I17iMore", "sc1_17i", "Schedule 1 item 17i: other ordinary allowable deductions"],
  ["btnPg3Sc2I4More", "sc2_4", "Schedule 2 item 4: other special allowable deductions"],
  ["btnPg4Sc5I3More", "sc5_3", "Schedule 5 item 3: reconciliation"],
  ["btnPg4Sc5I6More", "sc5_6", "Schedule 5 item 6: reconciliation"],
  ["btnPg4Sc5I8More", "sc5_8", "Schedule 5 item 8: reconciliation"],
);
const EX2018 = more(GATE_EX2018, "EX",
  ["btnPg3Pt6S1I17More", "sc1_17", "Schedule 1 item 17: other ordinary allowable deductions"],
  ["btnPg3Pt6S2I4More", "sc2_4", "Schedule 2 item 4: other special allowable deductions"],
  ["btnPg3Pt6S3I3More", "sc3_3", "Schedule 3 item 3: reconciliation"],
  ["btnPg3Pt6S3I6More", "sc3_6", "Schedule 3 item 6: reconciliation"],
  ["btnPg3Pt6S3I8More", "sc3_8", "Schedule 3 item 8: reconciliation"],
);
Object.assign(BUTTON_GROUP, {
  "1702RT": more(GATE_RT, "RT",
    ["btnPg4Sc3I3More", "sc3_3", "Schedule 3 item 3: other taxable income"],
    ["btnPg4Sc4I4More", "sc4_4", "Schedule 4 item 4"],
    ["btnPg5Sc4I39More", "sc4_39", "Schedule 4 item 39: other ordinary allowable deductions"],
    ["btnPg5Sc5I4More", "sc5_4", "Schedule 5 item 4: other special allowable deductions"],
    ["btnPg6Sc7I11More", "sc7_11", "Schedule 7 item 11: other tax credits"],
    ["btnPg6Sc9I3More", "sc9_3", "Schedule 9 item 3: reconciliation"],
    ["btnPg6Sc9I6More", "sc9_6", "Schedule 9 item 6: reconciliation"],
    ["btnPg6Sc9I8More", "sc9_8", "Schedule 9 item 8: reconciliation"],
    ["btnPg5Sc6AI7More", "sc6a_7", "Schedule 6A item 7: net operating loss carry-over"],
    ["btnPg8Sc12I4More", "sc12_4", "Schedule 12 item 4: income subject to final tax"],
    ["frm1702RT:btnModalPg8Sc12II", "sc12_ii", "Schedule 12 Part II: sale of real property"],
    ["frm1702RT:btnModalPg8Sc12III", "sc12_iii", "Schedule 12 Part III: sale of shares of stock"],
    ["frm1702RT:btnModalPg8Sc12IV", "sc12_iv", "Schedule 12 Part IV: other income subject to final tax"],
    ["frm1702RT:btnModalPg8Sc13I", "sc13_i", "Schedule 13 Part I: personal property received"],
    ["frm1702RT:btnModalPg8Sc13II", "sc13_ii", "Schedule 13 Part II: other income"],
  ),
  "1702RTv2018": RT2018,
  "1702RTv2018C": RT2018,
  "1702EX": more(GATE_EX, "EX",
    ["btnPg4S3I3More", "sc3_3", "Schedule 3 item 3"],
    ["btnPg4S4I4More", "sc4_4", "Schedule 4 item 4"],
    ["btnPg5S4I39More", "sc4_39", "Schedule 4 item 39"],
    ["btnPg5S5I4More", "sc5_4", "Schedule 5 item 4"],
    ["btnPg5S6I3More", "sc6_3", "Schedule 6 item 3"],
    ["btnPg5S6I6More", "sc6_6", "Schedule 6 item 6"],
    ["btnPg5S6I8More", "sc6_8", "Schedule 6 item 8"],
    ["Pg7S9Pt1More", "sc9_1", "Schedule 9 Part I: income subject to final tax"],
    ["btnPg7S9Pt2More", "sc9_2", "Schedule 9 Part II: sale of real property"],
    ["btnPg7S9Pt3More", "sc9_3", "Schedule 9 Part III: sale of shares of stock"],
    ["btnPg7S9Pt4More", "sc9_4", "Schedule 9 Part IV: other income subject to final tax"],
    ["btnPg7S9Pt5More", "sc10_1", "Schedule 10 Part I: exempt income"],
    ["btnPg7S9Pt6More", "sc10_2", "Schedule 10 Part II: other exempt income"],
  ),
  "1702EXv2018": EX2018,
  "1702EXv2018C": EX2018,
});

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
/** The boxes each pop-up list above fills when OK is pressed (what its copy returns), by form. */
export const LIST_FILLED: Record<string, string[]> = {
  "0605": ["txtTaxTypeCode", "txtATCCode"],
  "1702Q": ["frm1702q:txtAtc", "frm1702q:txt25B"],
  "1702Qv2008C": ["frm1702q:txtAtc", "frm1702q:txt25B"],
  "2000OT": ["frm2000OT:txtATC", "frm2000OT:txtTax15"],
};
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
