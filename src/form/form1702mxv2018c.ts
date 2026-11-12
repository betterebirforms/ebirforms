// BIR Form 1702-MX (Annual Income Tax Return — Corporation, Partnership and Other Non-Individual with MIXED Income
// Subject to Multiple Income Tax Rates or with Income Subject to Special/Preferential Rate), the 2018 layout, P3.
// One model for the three 2018 editions: 1702MXv2018C (current), 1702MXv2018Cxx (a shipped test fork) and
// 1702MXv2018 (superseded) have the SAME 588 save keys in the same DOM order; their compute differences are the
// `Edition` hooks below. Field prefix `frm1702MX:`; columns A = Exempt, B = Special rate, C = Regular rate, D = total.
//
// Why a simulation. The legacy form is ~190 mutually-calling compute* functions wired to onchange / onblur / onclick,
// and its reload (loadData → checkEnableManual → recomputeSchedule1) re-runs a large part of them in a fixed order.
// Several saved figures depend on WHICH writer runs last (13D is 7D − 11D, or 13C under OSD, or 13A+13B+13C; 11D is
// zeroed under OSD by one function and re-summed by another; 10B is reset to 0 by computePg3Sc1I8 and restored from
// Sch 8 by computePg2Sc2It11), so a closed-form model cannot be 1:1. Instead `Sim` holds BIR's field strings and
// ports every reachable function under its BIR name, with BIR's arithmetic: whole pesos via formatCurrencyWOC
// (round to the centavo, keep the pesos), "(1,234)" negatives, products rounded with Math.round, getValAmount numeric
// compares, setToZeroIfEmpty's Math.round of a typed amount, checkNumValue zeroing a negative. `run1702MX` then plays
// what a filer does — every page-1..4 text input changed and left, in DOM order, twice — and what BIR does when the
// return is reopened (save → load → checkEnableManual) and page 1 is tabbed through. Only the unchanged-by-BIR inputs
// are read from the native state, so the result never depends on the schema's field order.
//
// BIR bugs replicated because they change saved values (each also named at its port):
//   • 15B (special-rate tax) multiplies item 1B (gross sales), not 3B, when 3B ≥ 7B (computePg2Sc2It15);
//   • 13D / 11D are order-dependent (see above); the reload's last writer wins;
//   • a NOLCO row whose B+C+D exceeds A zeroes the column being edited, column by column in DOM order
//     (computeP4Sc7AI4E…); row 5 of Sch 7 has no check on its column A;
//   • Sch 9 (MCIT) zeroes D, E, F and G when D+E+F exceed C (computePg7Sc9I1CG…); C is max(B − A, 0);
//   • the special-rate drop-down (drpPg3Sc1I11CB) is rebuilt from item 4 and the ATC rate on every reload and its
//     5% / 30% auto-pick compares `0.05 * 100 === 5`, which IEEE doubles never satisfy, so the lowest rate stays;
//   • checkDateOfIncorporation reads `$_Id("frm1702MX:chkPg1I5ATC")` — no such id; IE's getElementById matched the
//     radio by NAME (public/legacy-shim.js does the same); the ATC IC055 tick is BIR's, re-derived from item 10;
//   • every text field is saved upper-cased (saveXML's `.toUpperCase()`); names / address are escaped.
//
// Not modelled: Part IV instruction B (two or more activities → the Part V mandatory attachments, one per exempt /
// special activity, whose Schedules A–I roll up into columns A and B). The native form fills the columns directly
// (instruction A); BIR's attachment pages keep their blank defaults.

import frozen from "./template/1702MXv2018C.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1702MXv2018C", frozen as Array<[string, string, string?]>);
import { atcPickList } from "./atc.ts";
import { BirDom, NegativeValue, NumWithComma, NumWithParenthesis, WholeNumWithComma, addCommas, birDateValid, formatCurrencyWOC } from "./form1702mx-bir.ts";
import { parseMoney } from "./money.ts";
import { validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export type Edition = "2018" | "2018C" | "2018Cxx";
export const P = "frm1702MX:";
type TemplateRecord = [string, string, string?];
type Read = (id: string) => string;
const TEMPLATE = template as TemplateRecord[];

// ── the modals ("Add more…" tables) ───────────────────────────────────────────────────────────────────────────────

interface Modal {
  name: string;
  /** BIR's modal table id (for the record). */
  table: string;
  /** Row cell id = `${stem}${i}Col${c}`. */
  stem: string;
  /** Text columns (1-based), the three amount columns (A, B, C) and the row-total column. */
  text: number[];
  amount: [number, number, number];
  total: number;
  counter: string;
  /** Subtotal ids A, B, C, D. */
  subtotal: [string, string, string, string];
  /** The item's own line: text ids (one per text column), amount ids A, B, C, and D. */
  line_text: string[];
  line_amount: [string, string, string, string];
  /** A row counts when any of these columns is non-blank. */
  key: number[];
}
export const MODAL: Modal[] = [
  {
    name: "sc3_31", table: "modalTablePg2Sc3", stem: "txtPg2Sc3_", text: [1], amount: [2, 3, 4], total: 5, counter: "txtCtrmodalPg7Sc8",
    subtotal: ["txtPg2Sc3_SubTotalCA", "txtPg2Sc3_SubTotalCB", "txtPg2Sc3_SubTotalCC", "txtPg2Sc3_SubTotalCD"],
    line_text: ["txtPg2Sc3It31"], line_amount: ["txtPg2Sc3It31A", "txtPg2Sc3It31B", "txtPg2Sc3It31C", "txtPg2Sc3It31D"], key: [1],
  },
  {
    name: "sc5_17i", table: "modalTablePg3Sc5I17i", stem: "txtPg3Sc5It17i_", text: [1], amount: [2, 3, 4], total: 5, counter: "txtCtrmodalPg3Sc5I17i",
    subtotal: ["txtPg3Sc5Itm17iD_SubTotalA", "txtPg3Sc5Itm17iD_SubTotalB", "txtPg3Sc5Itm17iD_SubTotalC", "txtPg3Sc5Itm17iD_SubTotalD"],
    line_text: ["txtPg3Sc5It17i"], line_amount: ["txtPg3Sc5Itm17iA", "txtPg3Sc5Itm17iB", "txtPg3Sc5Itm17iC", "txtPg3Sc5Itm17iD"], key: [1],
  },
  {
    name: "sc6_4", table: "modalTablePg3Sc6", stem: "txtPg6Sc6_", text: [1, 2], amount: [3, 4, 5], total: 6, counter: "txtCtrmodalPg6Sc6",
    subtotal: ["txtPg6Sc6_SubTotalCA", "txtPg6Sc6_SubTotalCB", "txtPg6Sc6_SubTotalCC", "txtPg6Sc6_SubTotalCD"],
    line_text: ["txtPg3Sc6I4description", "txtPg3Sc6I4legal"], line_amount: ["txtPg3Sc6I4CA", "txtPg3Sc6I4CB", "txtPg3Sc6I4CC", "txtPg3Sc6I4CD"], key: [1, 2],
  },
  ...([3, 6, 8] as const).map(
    (k): Modal => ({
      name: `sc10_${k}`, table: `modalTablePg4Sc10I${k}`, stem: `txtPg4Sc10Itm${k}_`, text: [1], amount: [2, 3, 4], total: 5, counter: `txtCtrmodalPg7Sc10I${k}`,
      subtotal: ["A", "B", "C", "D"].map((c) => `txtPg4Sc10Itm${k}_SubTotalC${c}`) as Modal["subtotal"],
      line_text: [`txtPg4Sc10Itm${k}`], line_amount: ["A", "B", "C", "D"].map((c) => `txtPg4Sc10Itm${k}${c}`) as Modal["line_amount"], key: [1],
    }),
  ),
];
const modalOf = (name: string): Modal => MODAL.find((m) => m.name === name)!;
const colCount = (m: Modal): number => m.total;
export const MODAL_GROUP: GroupSpec[] = MODAL.map((m) => ({
  name: m.name,
  size_field: `${P}${m.counter}`,
  first_index: 1,
  row: Array.from({ length: colCount(m) - 1 }, (_, j) => j + 1).map((c) => ({
    id: `${P}${m.stem}{i}Col${c}`,
    kind: m.text.includes(c) ? ("text" as const) : ("money" as const),
  })),
}));

// ── which fields BIR computes, which are numbertext (whole-peso, saved without commas) ─────────────────────────────

const bare = (k: string): string => (k.startsWith(P) ? k.slice(P.length) : k);
/** Zero-default keys that are NOT BIR `numbertext` inputs (rates, the NOLCO rows, counters, page furniture). */
const NOT_NUMBERTEXT = /:(txtPg2Pt4I34SpecialTaxRate|txtPg2Sc2It14[BC]|drpPg3Sc1I11CB|txtPg[34]IShed|txtCtrmodal|totalEXAttach|totalSPAttach)/;
const NUMBERTEXT = new Set(TEMPLATE.filter(([k, v, r]) => !r && v === "0" && k.startsWith(P) && !NOT_NUMBERTEXT.test(k)).map(([k]) => bare(k)));
const isNumbertext = (id: string): boolean => NUMBERTEXT.has(id) || MODAL.some((m) => id.startsWith(m.stem) && !m.text.some((c) => id.endsWith(`Col${c}`)));

/** Keys BIR always derives (never an input under instruction A): disabled at blank and never enabled by BIR. */
const COMPUTED_RE = new RegExp(
  "^(" +
    [
      "txtPg1Pt2I1[4-6]\\w*", "txtPg1Pt2I2[01]\\w*", "txtPg[234]TIN[1-4]", "txtPg[234]TINMASK", "txtPg[234]RegisteredName",
      "txtPg2Sc2Itm[1-9]D", "txtPg2Sc2Itm[3579][ABC]", "txtPg2Sc2Itm[89][ABC]", "txtPg2Sc2It1[0-3][A-D]", "txtPg2Sc2It1[579][BCD]", "txtPg2Sc2It1[68]D",
      "txtPg2Sc2Itm10[A-D]", "txtPg2Sc3It(2[0-9]|3[01])D", "txtPg2Sc3It23C", "txtPg2Sc3It3[23][A-D]",
      "txtPg3Sc4Itm1D", "txtPg2Sc4Itm2D", "txtPg2Sc4Itm[3-7][A-D]",
      "txtPg3Sc5Itm\\w+D", "txtPg3Sc5Itm18[A-C]", "txtPg6Sc6I[1-3]CD", "txtPg3Sc6I4CD", "txtPg6Sc6I5C[A-D]",
      "txtPg6Sc7I[1-3]", "txtPg4Sc8It[1-3]", "txtPg3IShed7_[4-7]E", "txtPg3IShed7_7(Year|[A-D])", "txtPg3IShed78D",
      "txtPg4IShed8_[4-7]E", "txtPg4IShed8_7(Year|[A-D])", "txtPg3IShed88D",
      "txtPg7Sc9I[1-3]C[CG]", "txtPg7Sc9I4", "txtPg4Sc10Itm[1-9]D", "txtPg4Sc10Itm[49][ABC]",
      "drpPg3Sc1I11CB", "chkPg1I5ATCR1",
      ...MODAL.flatMap((m) => [m.counter, ...m.subtotal]),
    ].join("|") +
    ")$",
);
/** v2018 also derives Sch 4 items 1–2 (13A/13B and 9A–C × 14C) and the MCIT (18C = 2% of 7C). */
const COMPUTED_2018 = /^(txtPg3Sc4Itm1[AB]|txtPg2Sc4Itm2[ABC]|txtPg2Sc2It18C)$/;
const isComputed = (id: string, edition: Edition = "2018C"): boolean => COMPUTED_RE.test(id) || (edition === "2018" && COMPUTED_2018.test(id));

/** Saved verbatim by saveXML's own branches; every other (non-numbertext) text is upper-cased. */
const VERBATIM = new Set(["txtPg1Pt1I6TINC1", "txtPg1Pt1I6TINC2", "txtPg1Pt1I6TINC3", "txtPg1Pt1I6TINC4", "txtPg1Pt1I7RDO", "txtZIP", "txtPg1Pt1I11ContactNumber"]);
const ESCAPED = new Set(["txtPg1Pt1I9RegisteredName", "txtPg1Pt1I10RegisteredAddress"]);

// ── DOM order and the blank form's enabled inputs (pages 1–4) ────────────────────────────────────────────────────

const PAGE_TEXT: string[] = (() => {
  const out: string[] = [];
  let on = false;
  for (const [k, , radio] of TEMPLATE) {
    const id = bare(k);
    if (id === "rdoPg1I1Calendar") on = true;
    if (!on) continue;
    if (!radio && !/^(ddl|drp)/.test(id)) out.push(id);
    if (id === "txtPg2Sc2Itm10D") break;
  }
  return out;
})();
const PAGE1_END = PAGE_TEXT.indexOf("txtPg1Pt1I29OthersC4");
const INVISIBLE = new Set(["txtPg1TINMASK", "txtPg1Pt1I7RDO", "txtPg2TINMASK", "txtPg3TINMASK", "txtPg4TINMASK"]);
const ENABLED_AT_BLANK = new Set(
  (
    "txtPg1I2YearEnd txtPg1Pt1I9RegisteredName txtPg1Pt1I10RegisteredAddress txtPg1Pt1I8 txtPg1Pt1I11ContactNumber txtPg1Pt2I17 txtPg1Pt2I18 " +
    "txtPg1Pt2I19 txtPg1P2I23NumOfAttachments txtPg2Pt4I31CA txtPg2Pt4I31CB txtPg2Pt4I31CC txtPg2Pt4I32CA txtPg2Pt4I32CB txtPg2Pt4I32CC " +
    "txtPg2Pt4I33CA txtPg2Pt4I33CB txtPg2Pt4I33CC txtPg2Pt4I34SpecialTaxRate txtPg2Pt4I35CA txtPg2Pt4I35CB txtPg2Pt4I35CC txtPg2Pt4I36CA " +
    "txtPg2Pt4I36CB txtPg2Pt4I36CC txtPg2Sc2Itm1A txtPg2Sc2Itm1B txtPg2Sc2Itm1C txtPg2Sc2Itm2A txtPg2Sc2Itm2B txtPg2Sc2Itm2C txtPg2Sc2Itm4A " +
    "txtPg2Sc2Itm4B txtPg2Sc2Itm4C txtPg2Sc2Itm6A txtPg2Sc2Itm6B txtPg2Sc2Itm6C txtPg2Sc2It14B txtPg2Sc2It14C txtPg2Sc2It15B txtPg2Sc2It15C " +
    "txtPg2Sc2It15D txtPg2Sc2It16B txtPg2Sc3It20A txtPg2Sc3It20B txtPg2Sc3It20C txtPg2Sc3It21C txtPg2Sc3It22A txtPg2Sc3It22B txtPg2Sc3It22C " +
    "txtPg2Sc3It24A txtPg2Sc3It24B txtPg2Sc3It24C txtPg2Sc3It25A txtPg2Sc3It25B txtPg2Sc3It25C txtPg2Sc3It26A txtPg2Sc3It26B txtPg2Sc3It26C " +
    "txtPg2Sc3It28A txtPg2Sc3It28B txtPg2Sc3It28C txtPg2Sc3It29A txtPg2Sc3It29B txtPg2Sc3It29C txtPg2Sc3It30 txtPg3Sc4Itm1A txtPg3Sc4Itm1B " +
    "txtPg2Sc4Itm2A txtPg2Sc4Itm2B txtPg2Sc4Itm2C " +
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17a", "17b", "17c"].map((k) => `txtPg3Sc5Itm${k}A txtPg3Sc5Itm${k}B txtPg3Sc5Itm${k}C`).join(" ") +
    " txtPg3Sc5It17d txtPg6Sc6I1description txtPg6Sc6I1legal txtPg6Sc6I1CA txtPg3Sc6I1CB txtPg6Sc6I1CC txtPg6Sc6I2legal txtPg6Sc6I3legal " +
    "txtPg3Sc6I4legal txtPg3IShed7_4Year txtPg3IShed7_4A txtPg3IShed7_4B txtPg3IShed7_4C txtPg3IShed7_4D txtPg3IShed7_5Year txtPg3IShed7_5A " +
    "txtPg3IShed7_5B txtPg3IShed7_5C txtPg3IShed7_5D txtPg3IShed7_6Year txtPg3IShed7_6A txtPg3IShed7_6B txtPg3IShed7_6C txtPg3IShed7_6D " +
    "txtPg3IShed8_4Year txtPg4IShed8_4A txtPg4IShed8_4B txtPg4IShed8_4C txtPg4IShed8_4D txtPg3IShed8_5Year txtPg4IShed8_5A txtPg4IShed8_5B " +
    "txtPg4IShed8_5C txtPg4IShed8_5D txtPg3IShed8_6Year txtPg4IShed8_6A txtPg4IShed8_6B txtPg3IShed8_6C txtPg4IShed8_6D txtPg4Sc10Itm1A " +
    "txtPg4Sc10Itm1B txtPg4Sc10Itm1C txtPg4Sc10Itm2 txtPg4Sc10Itm5 txtPg4Sc10Itm7"
  ).split(" "),
);
/** v2018's blank form keeps 15B–D, Sch 4 items 1–2 and the Sch 6 row 2–4 legal bases disabled. */
const DISABLED_2018 = new Set("txtPg2Sc2It15B txtPg2Sc2It15C txtPg2Sc2It15D txtPg3Sc4Itm1A txtPg3Sc4Itm1B txtPg2Sc4Itm2A txtPg2Sc4Itm2B txtPg2Sc4Itm2C txtPg6Sc6I2legal txtPg6Sc6I3legal txtPg3Sc6I4legal".split(" "));
const enabledAtBlank = (id: string, edition: Edition): boolean => ENABLED_AT_BLANK.has(id) && !(edition === "2018" && DISABLED_2018.has(id));
// HANDLER is defined at the end of the file (it references Sim's methods by name).

// ── the simulation ────────────────────────────────────────────────────────────────────────────────────────────────

/** The ATC rates BIR's loadATC keeps for 1702MX (xml/atcCodes.xml, in file order, duplicates kept). */
const ATC = atcPickList("1702MX", "");
const IPA_LIST = ["PEZA", "ECOZONE", "BCDA", "SBMA", "CDC", "PPMC", "JHSEZ", "MSEZ", "CEZA", "ZCSEZA", "APECO", "AFAB", "TEZ", "EPZA", "MEPZA"];
const LEGAL_BASIS = ["RA7227", "7227", "RA9400", "9400", "RA7916", "7916", "RA8748", "8748", "RA7922", "7922", "RA7903", "7903", "RA9490", "9490", "RA10083", "10083", "RA9728", "9728", "RA9593", "9593"];
const LEGAL_RA10693 = ["RA10693", "10693", "R.A.10693", "RA.10693", "R.A10693", "RA 10693", "R.A. 10693", "RA. 10693", "R.A 10693"];

type Handler = (s: Sim, e: string) => void;

export class Sim extends BirDom {
  /** Modal tables: rows of cell strings, index 0 = Col1. */
  tbl: Record<string, string[][]> = {};
  /** The rebuilt special-rate drop-down's option values. */
  drpOption: string[] = ["0"];
  tempVarForSc1I12 = false;
  readonly totalEX = 0;
  readonly totalSP = 0;
  constructor(readonly edition: Edition, now: Date) {
    super(now);
  }
  /** data-type="negative": Sch 10 item 1 may hold a loss. */
  protected override negative(e: string): boolean {
    return /^txtPg4Sc10Itm1[ABC]$/.test(e);
  }

  // ── page 1 ──
  checkItemsFromParent(): void {
    if (this.g("txtPg1Pt1I9RegisteredName") === "") this.dis.txtPg1Pt1I9RegisteredName = false;
    if (this.g("txtPg1Pt1I10RegisteredAddress") === "") this.dis.txtPg1Pt1I10RegisteredAddress = false;
    if (this.g("txtPg1Pt1I11ContactNumber") === "") this.dis.txtPg1Pt1I11ContactNumber = false;
  }
  computePg1Pt2I18(): void {
    this.getDifference("txtPg1Pt2I14TotalIncome", "txtPg1Pt2I15LessTotalTax", "txtPg1Pt2I16NetTaxPayable");
    this.computePg1Pt2I20();
  }
  computePg1Pt2It14(): void {
    this.getSum("txtPg2Sc2It19D", "txtPg1Pt2I14TotalIncome");
    this.computePg1Pt2I18();
  }
  computePg1Pt2It15(): void {
    this.getSum("txtPg2Sc3It32D", "txtPg1Pt2I15LessTotalTax");
    this.computePg1Pt2I18();
  }
  computePg1Pt2I20(): void {
    this.getSum("txtPg1Pt2I17,txtPg1Pt2I18,txtPg1Pt2I19", "txtPg1Pt2I20TotalPenalties");
    this.computePg1Pt2I21();
  }
  computePg1Pt2I21(): void {
    const net = NumWithComma(NumWithParenthesis(this.g("txtPg1Pt2I16NetTaxPayable")));
    const pen = NumWithComma(NumWithParenthesis(this.g("txtPg1Pt2I20TotalPenalties")));
    if (net >= 0) this.getSum("txtPg1Pt2I16NetTaxPayable,txtPg1Pt2I20TotalPenalties", "txtPg1Pt2I21TotalAmount");
    else if (net < 0) {
      if (pen > 0) this.set("txtPg1Pt2I21TotalAmount", this.g("txtPg1Pt2I20TotalPenalties"));
      else if (pen <= 0) this.set("txtPg1Pt2I21TotalAmount", this.g("txtPg1Pt2I16NetTaxPayable"));
    }
    const ids = ["rdoPg1Pt2I21Refund", "rdoPg1Pt2I21IssueTCC", "rdoPg1Pt2I21CarriedOver"];
    if (NumWithComma(NumWithParenthesis(this.g("txtPg1Pt2I16NetTaxPayable"))) < 0) for (const id of ids) this.dis[id] = false;
    else for (const id of ids) (this.dis[id] = true), (this.chk[id] = false);
  }
  enableMCITFields(): void {
    const isSubjectToMCIT = !!this.chk.chkPg1I5ATCR1;
    const sc9 = [1, 2, 3].flatMap((k) => [`txtPg7Sc9I${k}`, ...["CA", "CB", "CD", "CE", "CF"].map((c) => `txtPg7Sc9I${k}${c}`)]);
    for (const id of ["txtPg2Sc2It18C", "txtPg2Sc2It18D", ...sc9]) this.dis[id] = !isSubjectToMCIT;
    if (!isSubjectToMCIT) {
      for (const k of [1, 2, 3]) {
        this.set(`txtPg7Sc9I${k}`, "");
        for (const c of ["CA", "CB", "CC", "CD", "CE", "CF"]) this.set(`txtPg7Sc9I${k}${c}`, "0");
      }
      this.set("txtPg2Sc2It18C", "0");
    }
    this.computePg2Sc2ColumnD();
    this.computePg7Sc9I1CG();
    this.computePg7Sc9I2CG();
    this.computePg7Sc9I3CG();
    this.computePg7Sc9I4();
  }
  enableATCList(): void {
    this.dis.drpPg1I5ATCR2 = !this.chk.chkPg1I5ATCR2;
    this.changeSpecialTaxRate();
  }
  /** validateYearEnd (blur of item 2's year): clears the year or the month when they break BIR's rules (reads the
   *  clock, as BIR does), then pads a 1-digit year. */
  validateYearEnd(): void {
    const value = this.g("txtPg1I2YearEnd");
    const inputYear = 2000 + Number(value);
    const inputMonth = Number(this.g("ddlPg1I2Date")) - 1;
    const nowYear = this.now.getFullYear();
    const nowMonth = this.now.getMonth();
    const fiscal = !!this.chk.rdoPg1I1Fiscal;
    if (value !== "") {
      if (fiscal && (inputYear > nowYear || (inputMonth > nowMonth && inputYear === nowYear))) this.set("txtPg1I2YearEnd", "");
      else if (fiscal && inputMonth === 11) this.set("ddlPg1I2Date", "");
      else if (inputYear < 2013 || (inputYear <= 2013 && inputMonth < 8)) {
        if (inputYear < 2013 || this.dis.ddlPg1I2Date) this.set("txtPg1I2YearEnd", "");
      } else if (this.chk.rdoPg1I1Calendar) {
        if (this.chk.rdoPg1I4ShortPeriodNo && inputYear >= nowYear) this.set("txtPg1I2YearEnd", "");
        else if (this.chk.rdoPg1I4ShortPeriodYes) {
          if (inputYear > nowYear) this.set("txtPg1I2YearEnd", "");
          else if (inputYear === nowYear && inputMonth > nowMonth) this.set("ddlPg1I2Date", "");
          else if (inputYear === nowYear && inputMonth === 11) this.set("ddlPg1I2Date", "");
        }
      }
    }
    const y = this.g("txtPg1I2YearEnd");
    if (y !== "" && Number(y) > -1 && Number(y) < 10) this.set("txtPg1I2YearEnd", `0${Number(y)}`);
  }
  /** checkDateOfIncorporation: re-derives the ATC IC055 (MCIT) tick from item 10 vs item 2. BIR bug: its first line
   *  reads `chkPg1I5ATC`, an id no element has; IE's getElementById returned the IC055 radio by its NAME. */
  checkDateOfIncorporation(): boolean {
    const e = "txtPg1Pt1I8";
    let isValid = true;
    this.dis.drpPg1I5ATCR2 = false;
    this.dis.chkPg1I5ATCR2 = false;
    if (this.validateDate(e) && this.g(e).trim() !== "") {
      const part = this.g(e).split("/");
      const incorpDate = new Date(Number(part[2]), Number(part[0]) - 1, Number(part[1]));
      const incorpMonth = Number(part[0]);
      const incorpYear = Number(part[2]);
      const filingMonth = Number(this.g("ddlPg1I2Date"));
      const filingYear = 2000 + Number(this.g("txtPg1I2YearEnd"));
      const filingDate = new Date(filingYear, filingMonth - 1, 1);
      const elapsedTime = (filingDate.getTime() - incorpDate.getTime()) / 31536000000;
      const filingDateIsEmpty = (this.g("ddlPg1I2Date").trim() || this.g("txtPg1I2YearEnd").trim()) === "";
      if (!filingDateIsEmpty && (incorpYear > filingYear || (incorpMonth > filingMonth && incorpYear === filingYear))) {
        this.set(e, "");
        isValid = false;
      } else if (filingYear - incorpYear === 4 && !this.chk.chkPg1I5ATCR1) {
        this.chk.chkPg1I5ATCR1 = true;
        this.chk.chkPg1I5ATCR2 = false;
      } else if (filingYear - incorpYear < 4 && this.chk.chkPg1I5ATCR1) {
        this.chk.chkPg1I5ATCR1 = false;
        this.chk.chkPg1I5ATCR2 = true;
        this.dis.chkPg1I5ATCR1 = true;
        isValid = false;
      } else if (elapsedTime >= 4 && !this.chk.chkPg1I5ATCR1) {
        this.chk.chkPg1I5ATCR1 = true;
        this.chk.chkPg1I5ATCR2 = false;
      }
    } else if (this.g(e).trim() === "") {
      this.chk.chkPg1I5ATCR1 = false;
      isValid = false;
    }
    this.enableMCITFields();
    return isValid;
  }
  /** validateNOLCOYear (blur of a NOLCO year): clears a duplicate or out-of-range year (filing year − 3 … − 1). */
  validateNOLCOYear(e: string): void {
    const nolcoYear = Number(this.g(e).trim());
    const filingYear = 2000 + Number(this.g("txtPg1I2YearEnd"));
    if (Number(this.g(e).trim()) > 0 && this.checkDateOfIncorporation() && filingYear !== 2000) {
      const incorpYear = Number(this.g("txtPg1Pt1I8").split("/")[2]);
      const sameName = /IShed7/.test(e) ? ["txtPg3IShed7_4Year", "txtPg3IShed7_5Year", "txtPg3IShed7_6Year"] : ["txtPg3IShed8_4Year", "txtPg3IShed8_5Year", "txtPg3IShed8_6Year"];
      const dup = sameName.filter((id) => this.g(id) === this.g(e)).length;
      if (dup > 1) this.set(e, "");
      else if (nolcoYear >= filingYear || nolcoYear < filingYear - 3) this.set(e, "");
      else if (nolcoYear < incorpYear) this.set(e, "");
      else if (nolcoYear >= filingYear) this.set(e, "");
    } else if (filingYear === 2000) this.set(e, "");
    else if (this.checkDateOfIncorporation() === false && String(nolcoYear) !== "") this.set(e, "");
  }
  validateMCITYear(e: string): void {
    const mcitYear = Number(this.g(e).trim());
    const returnPeriodYear = 2000 + Number(this.g("txtPg1I2YearEnd"));
    if (this.g(e).trim() !== "" && this.checkDateOfIncorporation() && returnPeriodYear !== 2000) {
      const incorpYear = Number(this.g("txtPg1Pt1I8").split("/")[2]);
      const dup = ["txtPg7Sc9I1", "txtPg7Sc9I2", "txtPg7Sc9I3"].filter((id) => this.g(id) === this.g(e)).length;
      if (dup > 1) this.set(e, "");
      else if (mcitYear >= returnPeriodYear || mcitYear < returnPeriodYear - 3) this.set(e, "");
      else if (mcitYear < incorpYear) this.set(e, "");
    } else if (returnPeriodYear === 2000) this.set(e, "");
    else if (this.checkDateOfIncorporation() === false) this.set(e, "");
  }
  checkFilingYear(): void {
    const amended = !!this.chk.rdoPg1I3AmendedYes;
    const short = !!this.chk.rdoPg1I4ShortPeriodYes;
    const year = String(this.now.getFullYear() - 2000 - 1);
    if (this.chk.rdoPg1I1Calendar) {
      if (!short) (this.v.ddlPg1I2Date = "12"), (this.dis.ddlPg1I2Date = true), this.set("txtPg1I2YearEnd", year);
      else (this.dis.ddlPg1I2Date = false), (this.v.ddlPg1I2Date = ""), this.set("txtPg1I2YearEnd", year);
    } else if (this.chk.rdoPg1I1Fiscal) (this.v.ddlPg1I2Date = ""), (this.dis.ddlPg1I2Date = false), this.set("txtPg1I2YearEnd", "");
    if (amended) this.enableField("txtPg2Sc3It27A,txtPg2Sc3It27B,txtPg2Sc3It27C");
    else this.disableField("txtPg2Sc3It27A,txtPg2Sc3It27B,txtPg2Sc3It27C");
  }

  // ── Part IV Schedule 1: the special-rate drop-down ──
  getSpecialTaxRates(): Array<number | string> {
    const rate: Array<number | string> = [];
    const item4 = Number(this.g("txtPg2Pt4I34SpecialTaxRate"));
    if (!rate.includes(item4)) rate.push(item4);
    if (this.chk.chkPg1I5ATCR2) for (const a of ATC) if (a.atc_code === this.g("drpPg1I5ATCR2") && !rate.includes(a.rate)) rate.push(a.rate);
    return rate.sort((a, b) => Number(a) - Number(b));
  }
  changeSpecialTaxRate(): void {
    this.drpOption = this.getSpecialTaxRates().map((r) => String((Number(r) * 1) / 100));
    this.set("drpPg3Sc1I11CB", this.drpOption[0] ?? "");
    this.populatePg3Sc1I11();
  }
  populatePg3Sc1I11(): void {
    this.tempVarForSc1I12 = false;
    const ipa = this.g("txtPg2Pt4I31CB").toUpperCase();
    const legal = this.g("txtPg2Pt4I32CB").toUpperCase().replace(/[. ]/g, "");
    let optionToSelect = 0;
    const isIC030or031 = !!this.chk.chkPg1I5ATCR2 && ["IC030", "IC031"].includes(this.g("drpPg1I5ATCR2"));
    const isPEZA5 = (IPA_LIST.includes(ipa) || LEGAL_BASIS.includes(legal)) && Number(this.g("txtPg2Pt4I34SpecialTaxRate")) * 1 === 5;
    const isRA10693 = LEGAL_RA10693.includes(legal);
    const b = NumWithComma(NumWithParenthesis(this.g("txtPg2Sc2Itm1B")));
    const c = NumWithComma(NumWithParenthesis(this.g("txtPg2Sc2Itm1C")));
    const someValue = Math.round((c / (b + c)) * 100);
    if (isIC030or031 && isPEZA5) {
      const item5B = NumWithComma(NumWithParenthesis(this.g("txtPg2Sc2Itm7B"))) * 0.05;
      const item10B = NumWithComma(NumWithParenthesis(this.g("txtPg2Sc2It13B"))) * 0.3;
      optionToSelect = someValue > 50 ? (item5B > item10B ? 5 : 30) : 5;
      this.tempVarForSc1I12 = optionToSelect === 5;
    } else if (isIC030or031) {
      if (someValue > 50) optionToSelect = 30;
    } else if (isPEZA5) {
      optionToSelect = 5;
      this.tempVarForSc1I12 = true;
    } else if (isRA10693) {
      // BIR looks for an option whose value === 2 (a number vs the option's string): never found
    }
    if (optionToSelect > 0) {
      // BIR bug: `option.value * 100 === 5` — 0.05 * 100 is 5.000000000000001, so the pick rarely happens
      const hit = this.drpOption.find((o) => Number(o) * 100 === optionToSelect);
      if (hit !== undefined) this.set("drpPg3Sc1I11CB", hit);
    }
  }
  /** recomputeSchedule1 (end of the reload): with no attachments the "EX"/"SP" sums are 0, so these only re-copy
   *  Sch 6 into item 9, reset 10B to that empty sum and let computePg2Sc2It11 restore it from Sch 8. */
  recomputeSchedule1(): void {
    this.changeSpecialTaxRate();
    this.computePg3Sc1I1();
    this.computePg3Sc1I4();
    this.computePg3Sc1I7();
    this.computePg3Sc1I6();
    this.computePg3Sc1I8();
  }
  computePg3Sc1I1(): void {
    this.populatePg3Sc1I11();
  }
  computePg3Sc1I4(): void {
    // EX/SP sums only (none), then computePg3Sc1I5 → I10 → computePg3Sc2I1, which only reads the MCIT tick
  }
  computePg3Sc1I6(): void {
    this.getSum("txtPg2Sc2Itm8A,txtPg2Sc2Itm8B,txtPg2Sc2Itm8C", "txtPg2Sc2Itm8D");
    this.computePg2Sc2It11();
  }
  computePg3Sc1I7(): void {
    this.set("hidden", "0");
    this.getSum("txtPg6Sc6I5CA,hidden", "txtPg2Sc2Itm9A");
    this.getSum("txtPg6Sc6I5CB,hidden", "txtPg2Sc2Itm9B");
    this.getSum("txtPg6Sc6I5CC", "txtPg2Sc2Itm9C");
    this.getSum("txtPg2Sc2Itm9A,txtPg2Sc2Itm9B,txtPg2Sc2Itm9C", "txtPg2Sc2Itm9D");
    this.computePg2Sc2It11();
  }
  computePg3Sc1I8(): void {
    this.set("hidden", "0");
    this.getSum("hidden", "txtPg2Sc2It10B"); // BIR: 10B = the (empty) SP attachments' NOLCO sum
    this.getSum("txtPg2Sc2It10B,txtPg2Sc2It10C", "txtPg2Sc2It10D");
    this.computePg2Sc2It11();
  }

  // ── Part IV Schedule 2 ──
  computePg2Sc2ColumnD(): void {
    if (this.edition === "2018") {
      // v2018's order: items 3 / 5 / 7 first, and it re-runs the special-rate tax (15B) and 15C
      this.computePg2Sc2Itm3();
      this.computePg2Sc2Itm5();
      this.computePg2Sc2Itm7();
      this.computePg2Sc2It10();
      this.computePg2Sc2It11();
      this.computePg2Sc2It12();
      this.computePg1Pt2It14();
      this.computePg2Sc2It15C();
      this.computePg2Sc2It15();
    } else {
      this.computePg2Sc2It10();
      this.computePg2Sc2It11();
      this.computePg2Sc2It12();
      this.computePg2Sc2Itm3();
      this.computePg1Pt2It14();
      this.computePg2Sc2Itm5();
      this.computePg2Sc2Itm7();
    }
    this.computePg2Sc2It17B();
    this.computePg2Sc2It18C();
    this.computePg2Sc2It19C();
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9]) this.getSum(`txtPg2Sc2Itm${k}A,txtPg2Sc2Itm${k}B,txtPg2Sc2Itm${k}C`, `txtPg2Sc2Itm${k}D`);
    this.getSum("txtPg2Sc2It10B,txtPg2Sc2It10C", "txtPg2Sc2It10D");
    this.getSum("txtPg2Sc2It11A,txtPg2Sc2It11B,txtPg2Sc2It11C", "txtPg2Sc2It11D");
    this.getSum("txtPg2Sc2It12C", "txtPg2Sc2It12D");
    this.getSum("txtPg2Sc2It13A,txtPg2Sc2It13B,txtPg2Sc2It13C", "txtPg2Sc2It13D");
    this.getSum("txtPg2Sc2It15B,txtPg2Sc2It15C", "txtPg2Sc2It15D");
    this.getSum("txtPg2Sc2It16B", "txtPg2Sc2It16D");
    this.getSum("txtPg2Sc2It17B,txtPg2Sc2It17C", "txtPg2Sc2It17D");
    this.getSum("txtPg2Sc2It18C", "txtPg2Sc2It18D");
    this.getSum("txtPg2Sc2It19B,txtPg2Sc2It19C", "txtPg2Sc2It19D");
    this.computePg2Sc3It33();
    this.computePg3Sc4Itm1();
    this.computePg3Sc4Itm2();
  }
  computePg2Sc2Itm3(): void {
    for (const c of ["A", "B", "C", "D"]) this.getDifference(`txtPg2Sc2Itm1${c}`, `txtPg2Sc2Itm2${c}`, `txtPg2Sc2Itm3${c}`);
    for (const k of [1, 2, 3]) this.getSum(`txtPg2Sc2Itm${k}A,txtPg2Sc2Itm${k}B,txtPg2Sc2Itm${k}C`, `txtPg2Sc2Itm${k}D`);
    this.computePg2Sc2Itm5();
  }
  computePg2Sc2Itm5(): void {
    for (const c of ["A", "B", "C", "D"]) this.getDifference(`txtPg2Sc2Itm3${c}`, `txtPg2Sc2Itm4${c}`, `txtPg2Sc2Itm5${c}`);
    for (const k of [4, 5]) this.getSum(`txtPg2Sc2Itm${k}A,txtPg2Sc2Itm${k}B,txtPg2Sc2Itm${k}C`, `txtPg2Sc2Itm${k}D`);
    this.computePg2Sc2Itm7();
  }
  computePg2Sc2Itm7(): void {
    for (const c of ["A", "B", "C", "D"]) this.getSum(`txtPg2Sc2Itm5${c},txtPg2Sc2Itm6${c}`, `txtPg2Sc2Itm7${c}`);
    for (const k of [6, 7]) this.getSum(`txtPg2Sc2Itm${k}A,txtPg2Sc2Itm${k}B,txtPg2Sc2Itm${k}C`, `txtPg2Sc2Itm${k}D`);
    this.computeNolco("B");
    this.computeNolco("C");
  }
  computePg2Sc2Itm8(): void {
    for (const c of ["A", "B", "C", "D"]) this.set(`txtPg2Sc2Itm8${c}`, this.g(`txtPg3Sc5Itm18${c}`));
    this.computeNolco("B");
    this.computeNolco("C");
    this.computePg6Sc7I3();
    this.computePg4Sc8It3();
  }
  computePg2Sc2Itm9(): void {
    for (const c of ["A", "B", "C", "D"]) this.set(`txtPg2Sc2Itm9${c}`, this.g(`txtPg6Sc6I5C${c}`));
    this.computePg2Sc2It8to10();
    this.computePg2Sc2It12();
    this.computePg2Sc2It15C();
    this.computePg2Sc2It17B();
    this.computePg2Sc2It18C();
    this.computePg2Sc2It19C();
    this.computePg3Sc4Itm2();
  }
  computePg2Sc2It10(): void {
    this.set("txtPg2Sc2It10B", this.g("txtPg3IShed88D"));
    this.set("txtPg2Sc2It10C", this.g("txtPg3IShed78D"));
    this.computePg2Sc2It10D();
    this.computePg2Sc2It8to10();
  }
  computePg2Sc2It10D(): void {
    this.getSum("txtPg2Sc2It10B,txtPg2Sc2It10C", "txtPg2Sc2It10D");
  }
  computePg2Sc2It11(): void {
    if (this.chk.rdoPg1Pt1I13MethodOfDeducItemized) {
      this.getSum("txtPg2Sc2Itm8C,txtPg2Sc2Itm9C,txtPg2Sc2It10C", "txtPg2Sc2It11C");
      this.set("txtPg2Sc2It12C", 0);
      this.set("txtPg2Sc2It12D", 0);
      this.getDifference("txtPg2Sc2Itm7C", "txtPg2Sc2It11C", "txtPg2Sc2It13C");
      this.set("txtPg2Sc2It10C", this.g("txtPg3IShed78D"));
    }
    this.set("txtPg2Sc2It10B", this.g("txtPg3IShed88D"));
    if (this.edition === "2018") this.set("txtPg2Sc2It10C", this.g("txtPg3IShed78D")); // v2018: under OSD too
    this.set("txtPg4Sc8It2", this.g("txtPg3Sc5Itm18B"));
    for (const c of ["A", "B", "C", "D"]) this.set(`txtPg2Sc2Itm8${c}`, this.g(`txtPg3Sc5Itm18${c}`));
    for (const c of ["A", "B", "C", "D"]) this.set(`txtPg2Sc2Itm9${c}`, this.g(`txtPg6Sc6I5C${c}`));
    this.getSum("txtPg2Sc2Itm9A,txtPg2Sc2Itm9B,txtPg2Sc2Itm9C", "txtPg2Sc2Itm9D");
    this.computePg2Sch2Items();
    this.computePg2Sc2It10D();
    this.computePg2Sc2It8to10();
    this.computePg2Sc2It12();
    this.computePg2Sc2It15C();
    this.computePg2Sc2It17B();
    this.computePg2Sc2It18C();
    this.computePg2Sc2It19C();
    this.computePg3Sc4Itm1();
    this.computePg3Sc4Itm2();
    this.computePg4Sc8It3();
  }
  computePg2Sch2Items(): void {
    this.getSum("txtPg2Sc2Itm8A,txtPg2Sc2Itm9A", "txtPg2Sc2It11A");
    this.getSum("txtPg2Sc2Itm8B,txtPg2Sc2Itm9B,txtPg2Sc2It10B", "txtPg2Sc2It11B");
    this.getSum("txtPg2Sc2It11A,txtPg2Sc2It11B,txtPg2Sc2It11C", "txtPg2Sc2It11D");
    this.getDifference("txtPg2Sc2Itm7A", "txtPg2Sc2It11A", "txtPg2Sc2It13A");
    this.getDifference("txtPg2Sc2Itm7B", "txtPg2Sc2It11B", "txtPg2Sc2It13B");
    this.getDifference("txtPg2Sc2Itm7D", "txtPg2Sc2It11D", "txtPg2Sc2It13D");
  }
  computePg2Sc2It8to10(): void {
    this.getSum("txtPg2Sc2Itm8A,txtPg2Sc2Itm9A", "txtPg2Sc2It11A");
    this.getSum("txtPg2Sc2Itm8B,txtPg2Sc2Itm9B,txtPg2Sc2It10B", "txtPg2Sc2It11B");
    this.getSum("txtPg2Sc2Itm8C,txtPg2Sc2Itm9C,txtPg2Sc2It10C", "txtPg2Sc2It11C");
    this.getSum("txtPg2Sc2It11A,txtPg2Sc2It11B,txtPg2Sc2It11C", "txtPg2Sc2It11D");
  }
  computePg2Sc2It12(): void {
    if (this.chk.rdoPg1Pt1I13MethodOfDeducOptional) {
      this.product2("txtPg2Sc2Itm7C", "0.4", "txtPg2Sc2It12C");
      this.getSum("txtPg2Sc2It12C", "txtPg2Sc2It12D");
      this.set("txtPg2Sc2It11C", 0);
      this.set("txtPg2Sc2It11D", 0);
      this.getDifference("txtPg2Sc2Itm7C", "txtPg2Sc2It12C", "txtPg2Sc2It13C");
      this.getSum("txtPg2Sc2It13C", "txtPg2Sc2It13D");
      if (this.edition === "2018") this.set("txtPg2Sc2Itm9C", 0), this.set("txtPg2Sc2Itm9D", 0);
    }
  }
  /** computePg2Sc2It15 (14B's blur): 15B = (3B ≥ 7B ? 1B : 7B) × 14B. BIR bug: item 1 (gross), not 3 (net). */
  computePg2Sc2It15(): void {
    const amount1 = Number(NumWithComma(this.g("txtPg2Sc2Itm3B")).toFixed(0)) * 1;
    const amount2 = Number(NumWithComma(this.g("txtPg2Sc2Itm7B")).toFixed(0)) * 1;
    const taxRate = Number(this.g("txtPg2Sc2It14B")); // v2018: `taxRate == 10.0` etc. (a loose string compare)
    if (this.edition === "2018" && taxRate === 10) this.product1("txtPg2Sc2It13B", "txtPg2Sc2It14B", "txtPg2Sc2It15B");
    else if (this.edition === "2018" && taxRate === 5) this.product1("txtPg2Sc2Itm7B", "txtPg2Sc2It14B", "txtPg2Sc2It15B");
    else if ((this.edition === "2018" && taxRate === 2) || amount1 >= amount2) this.product1("txtPg2Sc2Itm1B", "txtPg2Sc2It14B", "txtPg2Sc2It15B");
    else this.product1("txtPg2Sc2Itm7B", "txtPg2Sc2It14B", "txtPg2Sc2It15B");
    this.set("txtPg2Sc4Itm4B", this.g("txtPg2Sc2It15B"));
    this.computePg2Sc2Itm3();
    this.computePg2Sc2Itm5();
    this.computePg2Sc2Itm7();
  }
  computePg2Sc2It14C(): void {
    this.product1("txtPg2Sc2It13C", "txtPg2Sc2It14C", "txtPg2Sc2It15C");
  }
  computePg2Sc2It15B(): void {
    this.allFormat("txtPg2Sc2It15B", "txtPg2Sc4Itm4B");
    this.allFormat("txtPg2Sc4Itm4B", "txtPg2Sc4Itm4D");
  }
  computePg2Sc2It15C(): void {
    if (this.edition === "2018") this.product1("txtPg2Sc2It13C", "txtPg2Sc2It14C", "txtPg2Sc2It15C"); // v2018 recomputes 15C here
    this.set("txtPg2Sc2It17C", this.g("txtPg2Sc2It15C"));
    this.computePg2Sc2It19C();
  }
  computePg2Sc2It17B(): void {
    this.getDifference("txtPg2Sc2It15B", "txtPg2Sc2It16B", "txtPg2Sc2It17B");
    this.set("txtPg2Sc2It19B", this.g("txtPg2Sc2It17B"));
  }
  computePg2Sc2It18C(): void {
    if (this.edition === "2018") this.product2("txtPg2Sc2Itm7C", ".02", "txtPg2Sc2It18C"); // v2018: MCIT = 2% of 7C
    this.computePg2Sc2It19C();
  }
  computePg2Sc2It19C(): void {
    const amt1 = NumWithComma(this.g("txtPg2Sc2It15C"));
    const amt2 = NumWithComma(this.g("txtPg2Sc2It18C"));
    if (amt1 > amt2) this.allFormat("txtPg2Sc2It15C", "txtPg2Sc2It19C");
    else if (amt1 <= amt2) this.allFormat("txtPg2Sc2It18C", "txtPg2Sc2It19C");
  }

  // ── Part IV Schedule 3 (tax credits) ──
  computePg2Sc3ColumnD(): void {
    for (const k of [20, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32]) this.getSum(`txtPg2Sc3It${k}A,txtPg2Sc3It${k}B,txtPg2Sc3It${k}C`, `txtPg2Sc3It${k}D`);
    this.getSum("txtPg2Sc3It21C", "txtPg2Sc3It21D");
    this.getSum("txtPg2Sc3It23C", "txtPg2Sc3It23D");
    this.computePg1Pt2It15();
    this.computePg3Sc4It29();
    this.computePg2Sc3It33();
  }
  computePg2Sc3It33(): void {
    for (const c of ["B", "C", "D"]) this.getDifference(`txtPg2Sc2It19${c}`, `txtPg2Sc3It32${c}`, `txtPg2Sc3It33${c}`);
    this.getSum("txtPg2Sc3It23C", "txtPg2Sc3It23D");
    if (this.edition === "2018") this.getSum("txtPg2Sc3It33A,txtPg2Sc3It33B,txtPg2Sc3It33C", "txtPg2Sc3It33D");
    this.computePg1Pt2It15();
    this.computePg3Sc4It29();
  }
  computePg2Schd3It32A(): void {
    this.getSum([20, 22, 24, 25, 26, 27, 28, 29, 30, 31].map((k) => `txtPg2Sc3It${k}A`).join(","), "txtPg2Sc3It32A");
    this.computePg2Sc3It33();
  }
  computePg2Schd3It32B(): void {
    this.getSum([20, 22, 24, 25, 26, 27, 28, 29, 30, 31].map((k) => `txtPg2Sc3It${k}B`).join(","), "txtPg2Sc3It32B");
    this.computePg2Sc3It33();
  }
  computePg2Schd3It32C(): void {
    this.getSum([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((k) => `txtPg2Sc3It${k}C`).join(","), "txtPg2Sc3It32C");
    this.computePg2Sc3It33();
  }
  computePg2Schd3It32D(): void {
    this.getSum([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map((k) => `txtPg2Sc3It${k}D`).join(","), "txtPg2Sc3It32D");
    this.computePg2Sc3It33();
  }
  computePg2Sc3It23C(): void {
    this.getSum("txtPg7Sc9I1CF,txtPg7Sc9I2CF,txtPg7Sc9I3CF", "txtPg7Sc9I4,txtPg2Sc3It23C");
    this.computePg2Sc3ColumnD();
    this.computePg2Schd3It32C();
    this.computePg2Schd3It32D();
  }

  // ── Part IV Schedule 4 (tax relief) ──
  computePg3Sc4It29(): void {
    for (const c of ["A", "B", "C", "D"]) this.getSum(`txtPg2Sc3It29${c}`, `txtPg2Sc4Itm6${c}`);
    this.computePg3Sc4Itm7();
  }
  /** v2018 derives Sch 4 items 1–2 itself: `(NumWithComma(x) * (14C / 100)).toFixed(0)`, left un-grouped. */
  private relief(out: string, from: string): void {
    const total = (NumWithComma(this.g(from)) * (Number(this.g("txtPg2Sc2It14C")) / 100)).toFixed(0);
    this.set(out, Number.isNaN(Number(total)) ? 0 : total);
  }
  computePg3Sc4Itm1(): void {
    if (this.edition === "2018") this.relief("txtPg3Sc4Itm1A", "txtPg2Sc2It13A"), this.relief("txtPg3Sc4Itm1B", "txtPg2Sc2It13B");
    this.getSum("txtPg3Sc4Itm1A,txtPg3Sc4Itm1B", "txtPg3Sc4Itm1D");
    if (this.edition === "2018") this.computePg3Sc4Itm3();
    else this.computePg3Sc4Itm2();
    this.computePg3Sc4Itm5();
    this.computePg3Sc4Itm7();
  }
  computePg3Sc4Itm2(): void {
    if (this.edition === "2018") for (const c of ["A", "B", "C"]) this.relief(`txtPg2Sc4Itm2${c}`, `txtPg2Sc2Itm9${c}`);
    this.getSum("txtPg2Sc4Itm2A,txtPg2Sc4Itm2B,txtPg2Sc4Itm2C", "txtPg2Sc4Itm2D");
    this.computePg3Sc4Itm3();
    this.computePg3Sc4Itm5();
    this.computePg3Sc4Itm7();
  }
  computePg3Sc4Itm3(): void {
    this.getSum("txtPg3Sc4Itm1A,txtPg2Sc4Itm2A", "txtPg2Sc4Itm3A");
    this.getSum("txtPg3Sc4Itm1B,txtPg2Sc4Itm2B", "txtPg2Sc4Itm3B");
    this.getSum("txtPg2Sc4Itm2C", "txtPg2Sc4Itm3C");
    this.getSum("txtPg2Sc4Itm3A,txtPg2Sc4Itm3B,txtPg2Sc4Itm3C", "txtPg2Sc4Itm3D");
    this.computePg3Sc4Itm5();
    this.computePg3Sc4Itm7();
  }
  computePg3Sc4Itm5(): void {
    this.getSum("txtPg2Sc4Itm3A", "txtPg2Sc4Itm5A");
    this.getDifference("txtPg2Sc4Itm3B", "txtPg2Sc4Itm4B", "txtPg2Sc4Itm5B");
    this.getSum("txtPg2Sc4Itm3C", "txtPg2Sc4Itm5C");
    this.getSum("txtPg2Sc4Itm5A,txtPg2Sc4Itm5B,txtPg2Sc4Itm5C", "txtPg2Sc4Itm5D");
    this.computePg3Sc4Itm7();
  }
  computePg3Sc4Itm7(): void {
    for (const c of ["A", "B", "C"]) this.getSum(`txtPg2Sc4Itm5${c},txtPg2Sc4Itm6${c}`, `txtPg2Sc4Itm7${c}`);
    this.getSum("txtPg2Sc4Itm7A,txtPg2Sc4Itm7B,txtPg2Sc4Itm7C", "txtPg2Sc4Itm7D");
  }

  // ── Part IV Schedule 5 (ordinary deductions) and 6 (special deductions) ──
  private sc5Row = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17a", "17b", "17c", "17d", "17e", "17f", "17g", "17h", "17i"];
  computePg3Schd5ColD(): void {
    for (const k of [...this.sc5Row, "18"]) this.getSum(`txtPg3Sc5Itm${k}A,txtPg3Sc5Itm${k}B,txtPg3Sc5Itm${k}C`, `txtPg3Sc5Itm${k}D`);
    this.computePg2Sc2It11();
    this.computePg3Schd5It18D();
  }
  private sc5Total(c: string): void {
    this.getSum(this.sc5Row.map((k) => `txtPg3Sc5Itm${k}${c}`).join(","), `txtPg3Sc5Itm18${c}`);
    this.computePg2Sc2Itm8();
    this.computePg2Sc2It8to10();
  }
  computePg3Schd5It18A(): void {
    this.sc5Total("A");
  }
  computePg3Schd5It18B(): void {
    this.sc5Total("B");
  }
  computePg3Schd5It18C(): void {
    this.sc5Total("C");
  }
  computePg3Schd5It18D(): void {
    this.sc5Total("D");
  }
  computePg6Sc6I5(): void {
    const row = ["txtPg6Sc6I1C", "txtPg6Sc6I2C", "txtPg6Sc6I3C", "txtPg3Sc6I4C"];
    // column B's ids are irregular (txtPg3Sc6I1CB, txtPg3Sc6I2CB, txtPg4Sc6I3CB)
    const cb = ["txtPg3Sc6I1CB", "txtPg3Sc6I2CB", "txtPg4Sc6I3CB", "txtPg3Sc6I4CB"];
    this.getSum(row.map((r) => `${r}A`).join(","), "txtPg6Sc6I5CA");
    this.getSum(cb.join(","), "txtPg6Sc6I5CB");
    this.getSum(row.map((r) => `${r}C`).join(","), "txtPg6Sc6I5CC");
    this.getSum(row.map((r) => `${r}D`).join(","), "txtPg6Sc6I5CD");
    row.forEach((r, j) => this.getSum(`${r}A,${cb[j]},${r}C`, `${r}D`));
    this.computePg2Sc2Itm9();
    this.computePg3Sc1I7();
    this.computePg2Sc2It8to10();
  }
  methodOfDeductionsItemized(): void {
    if (this.chk.rdoPg1Pt1I13MethodOfDeducItemized) {
      this.enableField([...this.sc5Row.map((k) => `txtPg3Sc5Itm${k}C`), "txtPg2Sc4Itm2C", "txtPg6Sc6I1CC", "txtPg6Sc6I2CC", "txtPg6Sc6I3CC", "txtPg3Sc6I4CC"].join(","));
      this.set("txtPg2Sc2It12C", 0);
    }
  }
  /** methodOfDeductionsOptional: under OSD, Sch 5 / Sch 6 column C, 8C, 9C, 11C and the whole Sch 7 are zeroed. It runs
   *  on every Sch 6 description blur and on reload (via checkNullRow_OnBlur4); its trailing recomputes run always. */
  methodOfDeductionsOptional(): void {
    if (this.chk.rdoPg1Pt1I13MethodOfDeducOptional) {
      for (const k of this.sc5Row) this.disableField(`txtPg3Sc5Itm${k}C,txtPg3Sc5Itm${k}D`), this.set(`txtPg3Sc5Itm${k}C`, 0);
      for (const r of ["txtPg6Sc6I1", "txtPg6Sc6I2", "txtPg6Sc6I3", "txtPg3Sc6I4"]) this.disableField(`${r}CC,${r}CD`), this.set(`${r}CC`, 0);
      for (const id of ["txtPg3Sc5Itm18C", "txtPg6Sc6I5CC", "txtPg2Sc2It11C", "txtPg2Sc2Itm9C", "txtPg2Sc2Itm8C"]) this.set(id, 0);
      this.disableField("txtPg2Sc4Itm2C");
      for (const k of [4, 5, 6, 7]) {
        this.set(`txtPg3IShed7_${k}Year`, "");
        for (const c of ["A", "B", "C", "D", "E"]) this.set(`txtPg3IShed7_${k}${c}`, 0);
      }
      this.set("txtPg3IShed78D", 0);
    }
    this.computePg3Schd5ColD();
    this.computePg6Sc6I5();
    this.computePg3IShed7_8D();
  }

  // ── Schedules 7 / 8 (NOLCO) ──
  /** computeNolco. BIR bug: case 'B' has no `break`, so it always falls through into case 'C'. */
  computeNolco(type: "B" | "C"): void {
    if (type === "B" && this.getValAmount("txtPg2Sc2Itm7B") < this.getValAmount("txtPg2Sc2Itm8B")) {
      this.set("txtPg4Sc8It1", this.g("txtPg2Sc2Itm7B"));
      this.set("txtPg4Sc8It2", this.g("txtPg3Sc5Itm18B"));
      this.getDifference("txtPg4Sc8It1", "txtPg4Sc8It2", "txtPg4Sc8It3");
      this.computetxtPg4IShed8_7A();
    } else if (type === "B" && this.edition === "2018" && this.getValAmount("txtPg2Sc2Itm7B") >= 0) this.page4Sch8item3IsNegative();
    const item18 = this.getValAmount("txtPg3Sc5Itm18C");
    const item7 = this.getValAmount("txtPg2Sc2Itm7C");
    if (item18 > item7) {
      this.set("txtPg6Sc7I1", this.g("txtPg2Sc2Itm7C"));
      this.set("txtPg6Sc7I2", this.g("txtPg3Sc5Itm18C"));
      this.getDifference("txtPg6Sc7I1", "txtPg6Sc7I2", "txtPg6Sc7I3");
      this.computetxtPg3IShed7_7A();
    } else if (item18 <= item7) this.page4Sch7item3IsNegative();
  }
  computePg6Sc7I3(): void {
    this.computeNolco("C");
    const item18 = this.getValAmount("txtPg3Sc5Itm18C");
    const item3 = this.getValAmount("txtPg6Sc7I3");
    if (item18 > item3) this.computetxtPg3IShed7_7A();
    if (item18 <= item3 || item3 === 0) this.page4Sch7item3IsNegative();
  }
  page4Sch7item3IsNegative(): void {
    for (const id of ["txtPg6Sc7I1", "txtPg6Sc7I2", "txtPg6Sc7I3", "txtPg3IShed7_7A", "txtPg3IShed7_7D", "txtPg3IShed7_7E"]) this.set(id, 0);
    this.set("txtPg3IShed7_7Year", " ");
  }
  computetxtPg3IShed7_7A(): void {
    const total = Math.abs(WholeNumWithComma(NumWithParenthesis(this.g("txtPg6Sc7I3"))));
    this.set("txtPg3IShed7_7Year", 2000 + Number(this.g("txtPg1I2YearEnd")) * 1);
    this.set("txtPg3IShed7_7A", NegativeValue(formatCurrencyWOC(total)));
    this.set("txtPg3IShed7_7E", NegativeValue(formatCurrencyWOC(total)));
    this.disableField("txtPg3IShed7_7Year,txtPg3IShed7_7A,txtPg3IShed7_7B,txtPg3IShed7_7C,txtPg3IShed7_7D,txtPg3IShed7_7E");
    this.nolcoRowE("txtPg3IShed7_7", "txtPg3IShed7_7E");
  }
  computePg4Sc8It3(): void {
    this.computeNolco("B");
    if (this.getValAmount("txtPg2Sc2Itm7B") < this.getValAmount("txtPg2Sc2Itm8B")) this.computetxtPg4IShed8_7A();
    else if (this.getValAmount("txtPg2Sc2Itm7B") >= this.getValAmount("txtPg2Sc2Itm8B")) this.page4Sch8item3IsNegative();
  }
  page4Sch8item3IsNegative(): void {
    for (const id of ["txtPg4Sc8It1", "txtPg4Sc8It2", "txtPg4Sc8It3", "txtPg4IShed8_7A", "txtPg4IShed8_7D", "txtPg4IShed8_7E"]) this.set(id, 0);
    this.set("txtPg4IShed8_7Year", " ");
  }
  computetxtPg4IShed8_7A(): void {
    if (!(this.getValAmount("txtPg2Sc2Itm7B") < this.getValAmount("txtPg2Sc2Itm8B"))) return;
    const total = Math.abs(WholeNumWithComma(NumWithParenthesis(this.g("txtPg4Sc8It3"))));
    this.set("txtPg4IShed8_7Year", 2000 + Number(this.g("txtPg1I2YearEnd")) * 1);
    this.set("txtPg4IShed8_7A", NegativeValue(formatCurrencyWOC(total)));
    this.set("txtPg4IShed8_7E", NegativeValue(formatCurrencyWOC(total)));
    this.disableField("txtPg4IShed8_7Year,txtPg4IShed8_7A,txtPg4IShed8_7B,txtPg4IShed8_7C,txtPg4IShed8_7D,txtPg4IShed8_7E");
    this.nolcoRowE("txtPg4IShed8_7", "txtPg4IShed8_7E");
  }
  /** computeP4Sc7AI4E…/P4Sc8AI4E…: E = A − (B+C+D), or — when B+C+D > A (parseInt'd) — the edited field is zeroed. */
  private nolcoRowE(row: string, fieldID: string | number): void {
    // Sch 8 row 6 column C is txtPg3IShed8_6C (BIR's id)
    const id = (c: string) => (row === "txtPg4IShed8_6" && c === "C" ? "txtPg3IShed8_6C" : `${row}${c}`);
    const w = (c: string) => WholeNumWithComma(NumWithParenthesis(this.g(id(c))));
    if (w("B") + w("C") + w("D") > w("A")) {
      if (typeof fieldID === "string") this.set(fieldID, "0");
    } else this.getDifference(id("A"), `${id("B")},${id("C")},${id("D")}`, id("E"));
  }
  computeP4Sc7AI4E(f: string | number): void { this.nolcoRowE("txtPg3IShed7_4", f); } // prettier-ignore
  computeP4Sc7AI5E(f: string | number): void { this.nolcoRowE("txtPg3IShed7_5", f); } // prettier-ignore
  computeP4Sc7AI6E(f: string | number): void { this.nolcoRowE("txtPg3IShed7_6", f); } // prettier-ignore
  computeP4Sc7AI7E(f: string | number): void { this.nolcoRowE("txtPg3IShed7_7", f); } // prettier-ignore
  computeP4Sc8AI4E(f: string | number): void { this.nolcoRowE("txtPg4IShed8_4", f); } // prettier-ignore
  computeP4Sc8AI5E(f: string | number): void { this.nolcoRowE("txtPg4IShed8_5", f); } // prettier-ignore
  computeP4Sc8AI6E(f: string | number): void { this.nolcoRowE("txtPg4IShed8_6", f); } // prettier-ignore
  computeP4Sc8AI7E(f: string | number): void { this.nolcoRowE("txtPg4IShed8_7", f); } // prettier-ignore
  computePg3IShed7_8D(): void {
    this.getSum("txtPg3IShed7_4D,txtPg3IShed7_5D,txtPg3IShed7_6D,txtPg3IShed7_7D", "txtPg3IShed78D");
    this.computePg2Sc2It10();
    this.computePg2Sc2It11();
    this.computePg2Sc2It12();
    if (this.edition === "2018") this.computePg2Sc2It15C();
    this.computePg2Sc2It17B();
    this.computePg2Sc2It18C();
    this.computePg2Sc2It19C();
  }
  computePg4IShed88D(): void {
    this.getSum("txtPg4IShed8_4D,txtPg4IShed8_5D,txtPg4IShed8_6D,txtPg4IShed8_7D", "txtPg3IShed88D");
    this.computePg2Sc2It10();
    this.computePg2Sc2It11();
    this.computePg2Sc2It12();
    if (this.edition === "2018") this.computePg2Sc2It15C();
    this.computePg2Sc2It17B();
    this.computePg2Sc2It18C();
    this.computePg2Sc2It19C();
    for (const k of [4, 5, 6, 7]) this.nolcoRowE(`txtPg4IShed8_${k}`, 0); // computetxtPg4Shed81ColE
  }

  // ── Schedule 9 (MCIT) ──
  private sc9C(k: number): void {
    this.getDifference(`txtPg7Sc9I${k}CB`, `txtPg7Sc9I${k}CA`, `txtPg7Sc9I${k}CC`);
    if (NumWithComma(NumWithParenthesis(this.g(`txtPg7Sc9I${k}CC`))) < 0) this.set(`txtPg7Sc9I${k}CC`, 0);
  }
  private sc9G(k: number): void {
    this.getDifference(`txtPg7Sc9I${k}CC`, `txtPg7Sc9I${k}CD,txtPg7Sc9I${k}CE,txtPg7Sc9I${k}CF`, `txtPg7Sc9I${k}CG`);
    if (WholeNumWithComma(NumWithParenthesis(this.g(`txtPg7Sc9I${k}CG`))) < 0) for (const c of ["CD", "CE", "CF", "CG"]) this.set(`txtPg7Sc9I${k}${c}`, "0");
  }
  computePg7Sc9I1CC(): void { this.sc9C(1); } // prettier-ignore
  computePg7Sc9I2CC(): void { this.sc9C(2); } // prettier-ignore
  computePg7Sc9I3CC(): void { this.sc9C(3); } // prettier-ignore
  computePg7Sc9I1CG(): void { this.sc9G(1); } // prettier-ignore
  computePg7Sc9I2CG(): void { this.sc9G(2); } // prettier-ignore
  computePg7Sc9I3CG(): void { this.sc9G(3); } // prettier-ignore
  computePg7Sc9I4(): void {
    this.getSum("txtPg7Sc9I1CF,txtPg7Sc9I2CF,txtPg7Sc9I3CF", "txtPg7Sc9I4");
  }

  // ── Schedule 10 (reconciliation) ──
  computePg4Sc10ColumnD(): void {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9]) this.getSum(`txtPg4Sc10Itm${k}A,txtPg4Sc10Itm${k}B,txtPg4Sc10Itm${k}C`, `txtPg4Sc10Itm${k}D`);
    this.getSum("txtPg2Sc2Itm10A,txtPg2Sc2Itm10B,txtPg2Sc2Itm10C", "txtPg2Sc2Itm10D");
  }
  private sc10Sum(c: string, from: number[], to: number): void {
    this.getSum(from.map((k) => `txtPg4Sc10Itm${k}${c}`).join(","), `txtPg4Sc10Itm${to}${c}`);
  }
  computePg4Sc10Itm4A(): void { this.sc10Sum("A", [1, 2, 3], 4); } // prettier-ignore
  computePg4Sc10Itm4B(): void { this.sc10Sum("B", [1, 2, 3], 4); } // prettier-ignore
  computePg4Sc10Itm4C(): void { this.sc10Sum("C", [1, 2, 3], 4); } // prettier-ignore
  computePg4Sc10Itm9A(): void { this.sc10Sum("A", [5, 6, 7, 8], 9); } // prettier-ignore
  computePg4Sc10Itm9B(): void { this.sc10Sum("B", [5, 6, 7, 8], 9); } // prettier-ignore
  computePg4Sc10Itm9C(): void { this.sc10Sum("C", [5, 6, 7, 8], 9); } // prettier-ignore
  computePg4Sc10Itm9D(): void { this.sc10Sum("D", [5, 6, 7, 8], 9); } // prettier-ignore
  computePg4Sc10Itm10(): void {
    for (const c of ["A", "B", "C", "D"]) this.getDifference(`txtPg4Sc10Itm4${c}`, `txtPg4Sc10Itm9${c}`, `txtPg2Sc2Itm10${c}`);
  }
  computePg4Sc10I4(): void {
    for (const c of ["A", "B", "C", "D"]) this.sc10Sum(c, [1, 2, 3], 4);
  }
  computePg4Sc10I9(): void {
    for (const c of ["A", "B", "C", "D"]) this.sc10Sum(c, [5, 6, 7, 8], 9);
  }

  // ── Part IV Schedule 1 dates ──
  private dateOf(s: string): Date {
    return new Date(s);
  }
  compareFutureDate(e: string, from: string, to: string): void {
    const f = `txtPg2Pt4I${from}`;
    const t = `txtPg2Pt4I${to}`;
    if (this.validateFutureDate(f) && this.validateFutureDate(t) && "" !== (this.g(f) && this.g(t))) {
      if (this.dateOf(this.g(t)) < this.dateOf(this.g(f))) this.set(e, "");
    }
  }
  compareEffectivityDate(e: string, to: string): void {
    const t = `txtPg2Pt4I${to}`;
    const filingDate = new Date(2000 + Number(this.g("txtPg1I2YearEnd")), Number(this.g("ddlPg1I2Date")), 1);
    if (this.validateFutureDate(t) && this.g(t) !== "" && filingDate < this.dateOf(this.g(t))) this.set(e, "");
  }
  compareExpirationDate(e: string, to: string): void {
    const t = `txtPg2Pt4I${to}`;
    const filingDate = new Date(2000 + Number(this.g("txtPg1I2YearEnd")), Number(this.g("ddlPg1I2Date")), 0);
    if (this.validateFutureDate(t) && this.g(t) !== "" && filingDate > this.dateOf(this.g(t))) this.set(e, "");
  }

  // ── row-enabling chains (enable only; each also re-runs methodOfDeductionsOptional) ──
  checkNullRow_OnBlur(textbox: string, button: string): void {
    if (this.g(textbox).trim() !== "") this.enableField(button);
    else this.disableField(button);
  }
  checkNullRow_OnBlur2(t1: string, t2: string, button: string): void {
    if (this.g(t1).trim() !== "" && this.g(t2).trim() !== "") this.enableField(button);
    else this.disableField(button);
    this.methodOfDeductionsOptional();
  }
  checkNullRow_OnBlur4(t1: string, t2: string, param: string): void {
    const [a, b] = param.split(",") as [string, string];
    if (this.g(t1).trim() !== "" && this.g(t2).trim() !== "" && this.g(a).trim() !== "OTHERS" && this.g(b).trim() !== "OTHERS") this.enableField(param);
    this.methodOfDeductionsOptional();
  }
  checkNullRow_OnBlur45(t1: string, param: string): void {
    const [a, b] = param.split(",") as [string, string];
    if (this.g(t1).trim() !== "" && this.g(a).trim() !== "OTHERS" && this.g(b).trim() !== "OTHERS") this.enableField(param);
    this.methodOfDeductionsOptional();
  }

  // ── the modals (Save = the modal's OK; summation = a row's blur) ──
  summation(m: Modal): void {
    const rows = this.tbl[m.name] ?? [];
    const total = [0, 0, 0];
    for (const row of rows) {
      const cell = m.amount.map((c) => NumWithComma(NumWithParenthesis(row[c - 1] ?? "")));
      cell.forEach((x, j) => (total[j]! += x));
      row[m.total - 1] = NegativeValue(formatCurrencyWOC(cell[0]! + cell[1]! + cell[2]!));
    }
    const all = total[0]! + total[1]! + total[2]!;
    [...total, all].forEach((x, j) => this.set(m.subtotal[j]!, NegativeValue(formatCurrencyWOC(x))));
  }
  saveModal(m: Modal): void {
    const rows = this.tbl[m.name] ?? [];
    const kept = rows.filter((row) => m.key.some((c) => (row[c - 1] ?? "").trim() !== ""));
    const count = kept.length;
    const lineIds = [...m.line_text, ...m.line_amount.slice(0, 3)];
    if (count === 0) {
      this.enableField(lineIds.join(","));
      for (const id of m.line_text) this.set(id, "");
      for (const id of m.line_amount.slice(0, 3)) this.set(id, "0");
    } else if (count === 1) {
      this.enableField(lineIds.join(","));
      const first = rows[0]!; // BIR copies table row 0, not the first counted row
      m.line_text.forEach((id, j) => this.set(id, first[m.text[j]! - 1] ?? ""));
      m.line_amount.slice(0, 3).forEach((id, j) => this.set(id, first[m.amount[j]! - 1] ?? ""));
    } else {
      this.tbl[m.name] = kept.map((row) => row.slice()); // Load_: rebuilt from the counted rows
      this.summation(m);
      for (const id of m.line_text) this.set(id, "OTHERS");
      m.line_amount.forEach((id, j) => this.set(id, this.g(m.subtotal[j]!)));
      this.disableField(lineIds.join(","));
    }
    this.set(m.counter, count);
    this.getSum(m.line_amount.slice(0, 3).join(","), m.line_amount[3]);
    if (m.name === "sc6_4") this.computePg6Sc6I5();
    if (m.name === "sc10_3" && this.edition !== "2018") this.computePg4Sc10I4(); // v2018's OK skips it
    if (m.name === "sc10_6" || m.name === "sc10_8") this.computePg4Sc10I9();
  }

  // ── events ──
  change(e: string): void {
    ((this.edition === "2018" ? CHANGE_2018.get(e) : undefined) ?? HANDLER.get(e)?.[0])?.(this, e);
  }
  blur(e: string): void {
    HANDLER.get(e)?.[1]?.(this, e);
  }
}

// ── the protocols ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The modal rows as native state carries them (group rows, cells keyed `<stem>{i}Col<n>`). */
function tableOf(m: Modal, groups: GroupState): string[][] {
  return (groups[m.name] ?? []).map((row) => Array.from({ length: colCount(m) }, (_, j) => row[`${P}${m.stem}{i}Col${j + 1}`] ?? (m.text.includes(j + 1) ? "" : "0")));
}

/** saveXML then loadData + sleeptime: numbertext loses its commas and its zero, then comes back as BIR re-formats it
 *  ("(1,234)" negatives, centavo values left as typed); every other text is upper-cased; the page is re-initialised
 *  (blank form's enabled fields, checkFilingYear on the blank radios). */
function reopen(s: Sim): void {
  const saved = (id: string, value: string): string => {
    if (!isNumbertext(id)) return VERBATIM.has(id) ? value : value.toUpperCase();
    let x = value;
    if (x.includes("(") && x.includes(")")) x = NumWithParenthesis(x).replace(/,/g, "");
    else if (x.includes(",")) x = x.replace(/,/g, "");
    return Number(x) * 1 !== 0 ? x : "0";
  };
  const loaded = (id: string, value: string): string =>
    isNumbertext(id) && value !== "0" && !value.includes(".") ? NegativeValue(formatCurrencyWOC(value)) : value;
  for (const id of Object.keys(s.v)) s.v[id] = loaded(id, saved(id, s.v[id]!));
  for (const m of MODAL)
    for (const row of s.tbl[m.name] ?? []) row.forEach((cell, j) => (row[j] = m.text.includes(j + 1) ? cell.toUpperCase() : loaded(`${m.stem}1Col${j + 1}`, saved(`${m.stem}1Col${j + 1}`, cell))));
  s.dis = {};
  for (const id of PAGE_TEXT) s.dis[id] = !enabledAtBlank(id, s.edition);
  s.dis.ddlPg1I2Date = true;
  // init()'s checkFilingYear ran on the BLANK page (calendar, not amended): only its 27A–C disabling survives the load
  s.disableField("txtPg2Sc3It27A,txtPg2Sc3It27B,txtPg2Sc3It27C");
  // checkEnableManual
  s.checkItemsFromParent();
  s.enableMCITFields();
  s.enableATCList();
  for (const name of ["sc6_4", "sc3_31", "sc10_3", "sc10_6", "sc10_8"]) if (Number(s.g(modalOf(name).counter)) > 0) s.saveModal(modalOf(name));
  if (s.g("txtPg3Sc6I4description") !== "OTHERS")
    s.checkNullRow_OnBlur4("txtPg6Sc6I3description", "txtPg6Sc6I3legal", "txtPg3Sc6I4description,txtPg3Sc6I4legal,txtPg3Sc6I4CA,txtPg3Sc6I4CB,txtPg3Sc6I4CC");
  s.recomputeSchedule1();
}

/** A filer tabbing through pages 1–4: every enabled text input changed and left, in DOM order. */
function fill(s: Sim): void {
  for (const id of PAGE_TEXT) {
    if (s.dis[id] || INVISIBLE.has(id)) continue;
    s.change(id);
    s.blur(id);
  }
}

/** parityCheck's page-1 pass: every enabled page-1 text input left (blurred), in DOM order. */
function tabPage1(s: Sim): void {
  for (const id of PAGE_TEXT.slice(0, PAGE1_END + 1)) if (!s.dis[id] && !INVISIBLE.has(id)) s.blur(id);
}

export interface Model {
  /** BIR's final field strings by bare id (DOM form: "(1,234)" negatives). */
  value: Record<string, string>;
  checked: Record<string, boolean>;
  table: Record<string, string[][]>;
}

/** Run BIR on the native inputs: the filer types them into the blank form, OKs the modals and tabs through twice
 *  more; then the return is saved, reopened and page 1 tabbed through — what BIR shows after the reopen. */
export function run1702MX(read: Read, groups: GroupState, edition: Edition, now = new Date()): Model {
  const s = new Sim(edition, now);
  // the blank form: every field at BIR's default, the radios and drop-downs as the filer set them
  const input: Record<string, string> = {};
  for (const [k, value, radio] of TEMPLATE) {
    if (!k.startsWith(P)) continue;
    const id = bare(k);
    const typed = isComputed(id, edition) ? "" : read(k);
    s.v[id] = value;
    if (radio) s.chk[id] = typed === "" ? value === "true" : typed === "true";
    else if (/^(ddl|drp)/.test(id)) s.v[id] = typed || value;
    else if (typed !== "") input[id] = typed;
  }
  s.v.hidden = "0";
  for (const id of PAGE_TEXT) s.dis[id] = !enabledAtBlank(id, s.edition);
  s.dis.ddlPg1I2Date = !s.chk.rdoPg1I1Fiscal && !s.chk.rdoPg1I4ShortPeriodYes;
  // clicking "Amended: Yes" (checkFilingYear) is what enables 27A–C
  if (s.chk.rdoPg1I3AmendedYes) s.enableField("txtPg2Sc3It27A,txtPg2Sc3It27B,txtPg2Sc3It27C");
  // the filer types every input in DOM order (each change + blur fires while later fields are still blank); a field
  // BIR keeps disabled cannot be typed, but a loaded value stays, so it is set as loadData would
  for (const id of PAGE_TEXT) {
    if (id in input) s.v[id] = input[id]!;
    if (s.dis[id] || INVISIBLE.has(id)) continue;
    s.change(id);
    s.blur(id);
  }
  for (const [id, v] of Object.entries(input)) if (!PAGE_TEXT.includes(id)) s.v[id] = v;
  // loadBGData repeats page 1's TIN and registered name on every page header
  for (const pg of [2, 3, 4]) {
    for (const k of [1, 2, 3, 4]) s.v[`txtPg${pg}TIN${k}`] = s.g(`txtPg1Pt1I6TINC${k}`);
    s.v[`txtPg${pg}RegisteredName`] = s.g("txtPg1Pt1I9RegisteredName").toUpperCase();
  }
  s.v.txtPg1Pt1I12Email = ""; // loadData ends with the profile's e-mail (none in the savefile)
  // the modals' rows are typed (each row's blur sums it) and OK'd, then the filer tabs through twice more, so no
  // figure is left stale by a later modal (15C, for one, is only recomputed when 14C is left)
  for (const m of MODAL) s.tbl[m.name] = tableOf(m, groups);
  const okModals = () => {
    for (const m of MODAL) if ((s.tbl[m.name] ?? []).length) s.summation(m), s.saveModal(m);
  };
  okModals();
  fill(s);
  okModals();
  fill(s);
  // the overpayment choice is made last: computePg1Pt2I21 clears (and disables) it whenever item 16 is not negative
  const over = ["rdoPg1Pt2I21Refund", "rdoPg1Pt2I21IssueTCC", "rdoPg1Pt2I21CarriedOver"];
  if (!s.dis[over[0]!]) for (const x of over) s.chk[x] = read(`${P}${x}`) === "true";
  // saved, reopened (BIR's reload re-runs a large part of the computes, in its own order), page 1 tabbed through
  reopen(s);
  tabPage1(s);
  tabPage1(s);
  return { value: s.v, checked: s.chk, table: s.tbl };
}

// ── schema ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The keys the model reads (BIR's inputs); the cache is keyed on their values. */
const INPUT_KEY = TEMPLATE.map(([k]) => k).filter((k) => k.startsWith(P) && !isComputed(bare(k)));
const cache = new Map<string, Model>();
function model(read: Read, groups: GroupState, edition: Edition): Model {
  const key = JSON.stringify([edition, INPUT_KEY.map((k) => (isComputed(bare(k), edition) ? "" : read(k))), groups]);
  let m = cache.get(key);
  if (!m) {
    m = run1702MX(read, groups, edition);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    cache.set(key, m);
  }
  return m;
}

/** The saved form of one of BIR's field strings: numbertext negatives "(1,234)" → "-1,234" (saveXML's
 *  NumWithParenthesis; "(0)" is not saved at all → "0"); other text upper-cased unless saved verbatim. */
export function savedValue(id: string, value: string): string {
  if (isNumbertext(id)) {
    if (/^\([\d,]+\)$/.test(value)) return value === "(0)" ? "0" : `-${value.slice(1, -1)}`;
    return value;
  }
  return VERBATIM.has(id) ? value : value.toUpperCase();
}

const UNMODELLED = /^(txtPg1Pt1I12Email|txtCurrentPage|txtMaxPage|txtPg1Pt1I(2[6-9])\w*|txtPg1Pt2(Title|TIN)ofSignatory2?|txtPg1Pt2AuthorizedRepresentative|txtPg1Pt2Treasurer|.*AttM.*|attachment\w*|totalEXAttach|totalSPAttach|txtPg9Sc13I_SubTotal|txtPg5Sc[45]I\d_SubTotal\w*|txtPg6Sc5I39_SubTotal\w*)$/;

export function fieldList(record: TemplateRecord[]): FieldJson[] {
  return record
    .filter(([key]) => key.startsWith(P) && !UNMODELLED.test(bare(key)) && !MODAL.some((m) => m.counter === bare(key)))
    .map(([key, value, radio]): FieldJson => {
      if (radio) return { id: key, kind: "radio" };
      if (/:(ddl|drp)/.test(key)) return { id: key, kind: "select" };
      if (isNumbertext(bare(key)) || /IShed/.test(key)) return { id: key, kind: "money" };
      void value;
      return { id: key, kind: "text", ...(ESCAPED.has(bare(key)) ? { escaped: true } : {}) };
    });
}

export function make1702MX2018(code: string, edition: Edition, record: TemplateRecord[]): FormSchema {
  const json = fieldList(record);
  const field: FieldSpec[] = json.map((f) => {
    const id = bare(f.id);
    if (!isComputed(id, edition)) return { ...f };
    // `compute` only marks the field read-only (FormView); `derive` writes BIR's string (modal rows are applied at save)
    return { ...f, compute: () => 0, derive: (r: Read) => { const m = model(r, {}, edition); return f.kind === "radio" ? String(!!m.checked[id]) : savedValue(id, m.value[id] ?? ""); } }; // prettier-ignore
  });
  for (const id of ["txtPg1Pt1I6TINC1", "txtPg1Pt1I6TINC2", "txtPg1Pt1I6TINC3", "txtPg1Pt1I6TINC4", "txtPg1Pt1I9RegisteredName", "txtPg1Pt1I10RegisteredAddress"]) {
    const f = field.find((x) => x.id === `${P}${id}`);
    if (f) f.required = true;
  }
  return {
    form_code: code,
    title: "Annual Income Tax — Corporations (Mixed Income)",
    field,
    group: MODAL_GROUP,
    extra_record: (state, groups) => derivedRecord(state, groups, edition, json),
  };
}

/** Every saved value BIR derives, overlaid on the template: the computed figures (with the modal rows, which the
 *  schema's derive cannot see), BIR's rewrites of the inputs (rounded amounts, cleared dates, upper-cased text, the
 *  ATC ticks), the modal lines / counters / subtotals and the rebuilt rows. */
function derivedRecord(state: FormState, groups: GroupState, edition: Edition, json: FieldJson[]): SaveRecord[] {
  const r: Read = (id) => state[id] ?? "";
  const m = model(r, groups, edition);
  const out: SaveRecord[] = [];
  for (const f of json) {
    const id = bare(f.id);
    if (f.kind === "radio") out.push({ key: f.id, value: String(!!m.checked[id]) });
    else {
      const v = savedValue(id, m.value[id] ?? "");
      out.push({ key: f.id, value: ESCAPED.has(id) ? legacyEscape(v) : v });
    }
  }
  for (const mo of MODAL) {
    out.push({ key: `${P}${mo.counter}`, value: m.value[mo.counter] ?? "0" });
    (m.table[mo.name] ?? []).forEach((row, i) => row.forEach((cell, j) => out.push({ key: `${P}${mo.stem}${i + 1}Col${j + 1}`, value: mo.text.includes(j + 1) ? cell.toUpperCase() : savedValue("x", cell) })));
  }
  return out;
}

export const FORM_1702MXv2018C = make1702MX2018("1702MXv2018C", "2018C", TEMPLATE);

export function validate1702MX(schema: FormSchema, state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(schema, state);
  const tin = `${state[`${P}txtPg1Pt1I6TINC1`] ?? ""}${state[`${P}txtPg1Pt1I6TINC2`] ?? ""}${state[`${P}txtPg1Pt1I6TINC3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I6TINC1`, message: "The TIN's check digit doesn't match." });
  const date = state[`${P}txtPg1Pt1I8`] ?? "";
  if (date && !birDateValid(date)) problem.push({ id: `${P}txtPg1Pt1I8`, message: "Date of incorporation must be a past date in MM/DD/YYYY form." });
  if (state[`${P}rdoPg1Pt1I13MethodOfDeducItemized`] !== "true" && state[`${P}rdoPg1Pt1I13MethodOfDeducOptional`] !== "true")
    problem.push({ id: `${P}rdoPg1Pt1I13MethodOfDeducItemized`, message: "Please select a Method of Deduction in page 1 Item 13." });
  const m = model((id) => state[id] ?? "", groups, schema.form_code === "1702MXv2018" ? "2018" : schema.form_code === "1702MXv2018Cxx" ? "2018Cxx" : "2018C");
  if (parseMoney(m.value.txtPg1Pt2I16NetTaxPayable ?? "0") < 0 && !["Refund", "IssueTCC", "CarriedOver"].some((x) => m.checked[`rdoPg1Pt2I21${x}`]))
    problem.push({ id: `${P}rdoPg1Pt2I21Refund`, message: "Choose how the overpayment (item 21) is to be handled." });
  for (const mo of MODAL)
    (groups[mo.name] ?? []).forEach((row, i) => {
      if (!mo.key.some((c) => (row[`${P}${mo.stem}{i}Col${c}`] ?? "").trim())) problem.push({ id: `${P}${mo.stem}${i + 1}Col1`, message: `Row ${i + 1}: the description should not be blank (BIR drops the row).` });
    });
  return problem;
}

export const validate1702MXv2018C = (state: FormState, groups: GroupState = {}): Problem[] => validate1702MX(FORM_1702MXv2018C, state, groups);

// ── BIR's onchange / onblur wiring (pages 1–4), [change, blur] per input ──────────────────────────────────────────

const H: Array<[string, Handler | null, Handler | null]> = [
  ["txtPg1I2YearEnd", null, (s) => s.validateYearEnd()],
  ["txtPg1Pt1I9RegisteredName txtPg1Pt1I9RegisteredName2 txtPg1Pt1I9RegisteredName3 txtPg1Pt1I10RegisteredAddress txtPg1Pt1I10RegisteredAddress2 txtPg1Pt1I10RegisteredAddress3 txtPg1Pt2AuthorizedRepresentative txtPg1Pt2Treasurer txtPg1Pt1I26CashC1 txtPg1Pt1I27CheckC1 txtPg1Pt1I29Others txtPg1Pt1I29OthersC1 txtPg2Pt4I31CA txtPg2Pt4I31CC txtPg2Pt4I32CA txtPg2Pt4I32CC txtPg2Pt4I33CA txtPg2Pt4I33CB txtPg2Pt4I33CC", null, (s, e) => s.capitalize(e)],
  ["txtPg1Pt1I8", null, (s) => void s.checkDateOfIncorporation()],
  ["txtPg1Pt1I12Email", null, (s) => s.validateEmail()],
  ["txtPg1Pt2I14TotalIncome txtPg1Pt2I15LessTotalTax", (s, e) => { s.setToZeroIfEmpty(e); s.computePg1Pt2I18(); }, (s, e) => { s.checkNumValue(e); s.computePg1Pt2I18(); s.addCommas1702MX(e); }],
  ["txtPg1Pt2I16NetTaxPayable", null, (s, e) => s.checkNumValue(e)],
  ["txtPg1Pt2I17 txtPg1Pt2I18 txtPg1Pt2I19", (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s.checkNumValue(e); s.computePg1Pt2I20(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg1Pt1I26CashC3 txtPg1Pt1I27CheckC3 txtPg1Pt1I28TaxDebitC3 txtPg1Pt1I29OthersC3", null, (s, e) => void s.validateDate(e)],
  ["txtPg1Pt1I26CashC4 txtPg1Pt1I27CheckC4 txtPg1Pt1I28TaxDebitC4 txtPg1Pt1I29OthersC4", (s, e) => s.setToZeroIfEmpty(e), (s, e) => s.addCommas1702MX(e)],
  ["txtPg2Pt4I31CB txtPg2Pt4I32CB", (s) => s.changeSpecialTaxRate(), (s, e) => s.capitalize(e)],
  ["txtPg2Pt4I34SpecialTaxRate", (s) => s.changeSpecialTaxRate(), (s, e) => s.setPercentage(e, 1)],
  ["txtPg2Pt4I35CA", null, (s, e) => { s.compareFutureDate(e, "35CA", "36CA"); s.compareEffectivityDate(e, "35CA"); }],
  ["txtPg2Pt4I35CB", null, (s, e) => { s.compareFutureDate(e, "35CB", "36CB"); s.compareEffectivityDate(e, "35CB"); }],
  ["txtPg2Pt4I35CC", null, (s, e) => { s.compareFutureDate(e, "35CC", "36CC"); s.compareEffectivityDate(e, "35CC"); }],
  ["txtPg2Pt4I36CA", null, (s, e) => { s.compareFutureDate(e, "35CA", "36CA"); s.compareExpirationDate(e, "36CA"); }],
  ["txtPg2Pt4I36CB", null, (s, e) => { s.compareFutureDate(e, "35CB", "36CB"); s.compareExpirationDate(e, "36CB"); }],
  ["txtPg2Pt4I36CC", null, (s, e) => { s.compareFutureDate(e, "35CC", "36CC"); s.compareExpirationDate(e, "36CC"); }],
  ["txtPg2Sc2Itm1A txtPg2Sc2Itm2A txtPg2Sc2Itm4A", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2Itm3(); s.computePg2Sc2Itm5(); s.computePg2Sc2Itm7(); s.computePg2Sc2It11(); s.computePg2Sc2It12(); s.computePg1Pt2It14(); s.set(e, addCommas(s.g(e))); }, null],
  ["txtPg2Sc2Itm1B txtPg2Sc2Itm4B txtPg2Sc2Itm6B", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2Itm3(); s.computePg2Sc2Itm5(); s.computePg2Sc2Itm7(); s.computePg2Sc2It11(); s.computePg2Sc2It12(); s.computePg1Pt2It14(); s.computePg2Sc2It15(); s.computePg2Sc2It17B(); s.set(e, addCommas(s.g(e))); }, null],
  ["txtPg2Sc2Itm1C txtPg2Sc2Itm4C txtPg2Sc2Itm6C", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2Itm3(); s.computePg2Sc2Itm5(); s.computePg2Sc2Itm7(); s.computePg2Sc2It11(); s.computePg2Sc2It12(); s.computePg1Pt2It14(); s.computePg2Sc2It15C(); s.computePg2Sc2It18C(); s.computePg2Sc2It19C(); s.set(e, addCommas(s.g(e))); }, null],
  ["txtPg2Sc2Itm2B", (s, e) => { s.setToZeroIfEmpty(e); s.computePg1Pt2It14(); s.computePg2Sc2Itm3(); s.computePg2Sc2Itm5(); s.computePg2Sc2Itm7(); s.computePg2Sc2It11(); s.computePg2Sc2It12(); s.computePg2Sc2It15(); s.computePg2Sc2It17B(); s.set(e, addCommas(s.g(e))); }, null],
  ["txtPg2Sc2Itm2C", (s, e) => { s.setToZeroIfEmpty(e); s.computePg1Pt2It14(); s.computePg2Sc2Itm3(); s.computePg2Sc2Itm5(); s.computePg2Sc2Itm7(); s.computePg2Sc2It11(); s.computePg2Sc2It12(); s.computePg2Sc2It15C(); s.computePg2Sc2It18C(); s.computePg2Sc2It19C(); s.set(e, addCommas(s.g(e))); }, null],
  ["txtPg2Sc2Itm3A txtPg2Sc2Itm3B txtPg2Sc2Itm3C txtPg2Sc2Itm5A txtPg2Sc2Itm5B txtPg2Sc2Itm5C txtPg2Sc2Itm7B txtPg2Sc2Itm7C txtPg2Sc2Itm8D txtPg2Sc2It10D txtPg2Sc2It13A txtPg2Sc2It13B txtPg2Sc2It16D txtPg4Sc10Itm1D", (s, e) => s.setToZeroIfEmpty(e), null],
  ["txtPg2Sc2Itm6A", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }, null],
  ["txtPg2Sc2Itm6D txtPg2Sc2Itm7A txtPg2Sc2Itm8A txtPg2Sc2Itm8B txtPg2Sc2Itm8C txtPg2Sc2Itm9A txtPg2Sc2Itm9B txtPg2Sc2Itm9C txtPg2Sc2It10B txtPg2Sc2It10C txtPg2Sc2It11A txtPg2Sc2It11B txtPg2Sc2It11C txtPg2Sc2It13C txtPg2Sc2It13D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); }, null],
  ["txtPg2Sc2It12C", (s, e) => { s.checkNumValue(e); s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }, (s, e) => { s.checkNumValue(e); s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg2Sc2It14B", (s) => { s.computePg2Sc2It15(); s.computePg2Sc2It17B(); s.computePg2Sc2ColumnD(); s.computePg2Sc3It33(); s.computePg2Sc2ColumnD(); }, (s, e) => { s.checkNumValue(e); s.setPercentage(e, 2); s.computePg2Sc2It15(); s.computePg2Sc2It17B(); s.computePg2Sc2ColumnD(); s.computePg2Sc3It33(); s.computePg2Sc2ColumnD(); }],
  ["txtPg2Sc2It14C", (s) => { s.computePg2Sc2It14C(); s.computePg2Sc2It19C(); s.computePg2Sc2ColumnD(); s.computePg2Sc3It33(); }, (s, e) => { s.checkNumValue(e); s.setPercentage(e, 2); }],
  ["txtPg2Sc2It15B", (s, e) => { s.checkNumValue(e); s.setToZeroIfEmpty(e); s.computePg2Sc2It15B(); s.computePg2Sc2ColumnD(); }, (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg2Sc2It15C", (s, e) => { s.checkNumValue(e); s.setToZeroIfEmpty(e); s.computePg2Sc2It15C(); s.computePg2Sc2ColumnD(); }, (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg2Sc2It15D txtPg2Sc2It18D", null, (s, e) => s.set(e, addCommas(s.g(e)))],
  ["txtPg2Sc2It16B", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.computePg2Sc2It17B(); s.computePg2Sc3It33(); }, (s, e) => { s.checkNumValue(e); s.computePg2Sc2It17B(); s.computePg2Sc3It33(); s.computePg2Sc2ColumnD(); }],
  ["txtPg2Sc2It17B txtPg2Sc2It17C txtPg2Sc2It18C", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); }, (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg2Sc2It19B txtPg2Sc2It19C", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); s.set(e, addCommas(s.g(e))); }, (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2ColumnD(); }],
  ["txtPg2Sc2It19D", (s, e) => { s.setToZeroIfEmpty(e); s.set(e, addCommas(s.g(e))); }, null],
  ...(["A", "B", "C", "D"] as const).map((c): [string, Handler, Handler] => [
    [20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31].filter((k) => c === "C" || c === "D" || (k !== 21 && k !== 23)).map((k) => `txtPg2Sc3It${k}${c}`).join(" "),
    (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc3ColumnD(); s[`computePg2Schd3It32${c}`](); },
    (s, e) => { s.checkNumValue(e); s.computePg2Sc3ColumnD(); s[`computePg2Schd3It32${c}`](); s.addCommas1702MX(e); },
  ]),
  ...(["A", "B", "C", "D"] as const).map((c): [string, null, Handler] => [`txtPg2Sc3It29${c}`, null, (s, e) => { s.checkNumValue(e); s.computePg2Sc3ColumnD(); s[`computePg2Schd3It32${c}`](); s.addCommas1702MX(e); s.computePg3Sc4Itm7(); }]),
  ["txtPg2Sc3It30", (s) => s.checkNullRow_OnBlur45("txtPg2Sc3It30", "txtPg2Sc3It30A,txtPg2Sc3It30B,txtPg2Sc3It30C,txtPg2Sc3It30D,txtPg2Sc3It31"), (s, e) => s.capitalize(e)],
  ["txtPg2Sc3It31", (s) => { s.checkNullRow_OnBlur45("txtPg2Sc3It31", "txtPg2Sc3It31A,txtPg2Sc3It31B,txtPg2Sc3It31C,txtPg2Sc3It31D"); s.checkNullRow_OnBlur("txtPg2Sc3It31", "btnModalPg2Sc3"); }, (s, e) => s.capitalize(e)],
  ["txtPg2Sc3It32A txtPg2Sc3It32B txtPg2Sc3It32C txtPg2Sc3It32D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc3ColumnD(); }, (s, e) => { s.checkNumValue(e); s.computePg2Sc3ColumnD(); s.addCommas1702MX(e); }],
  ["txtPg2Sc3It33A txtPg2Sc3It33B txtPg2Sc3It33C txtPg2Sc3It33D", (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s.checkNumValue(e); s.computePg2Sc3ColumnD(); s.addCommas1702MX(e); }],
  ["txtPg3Sc4Itm1A txtPg3Sc4Itm1B txtPg2Sc4Itm2A txtPg2Sc4Itm2B txtPg2Sc4Itm2C", (s, e) => { s.setToZeroIfEmpty(e); s.computePg3Sc4Itm1(); s.computePg3Sc4Itm2(); s.computePg3Sc4Itm3(); }, (s, e) => { s.checkNumValue(e); s.computePg3Sc4Itm1(); s.computePg3Sc4Itm2(); s.computePg3Sc4Itm3(); }],
  ...(["A", "B", "C", "D"] as const).map((c): [string, Handler, Handler] => [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17a", "17b", "17c", "17d", "17e", "17f", "17g", "17h", "17i"]
      .filter((k) => !(c === "A" && k === "17i") && !(c === "C" && k === "17c")).map((k) => `txtPg3Sc5Itm${k}${c}`).join(" "),
    (s, e) => { s.setToZeroIfEmpty(e); s.computePg3Schd5ColD(); s[`computePg3Schd5It18${c}`](); },
    (s, e) => { s.checkNumValue(e); s.computePg3Schd5ColD(); s[`computePg3Schd5It18${c}`](); s.set(e, addCommas(s.g(e))); },
  ]),
  // BIR bug: 17c's column C (an amount) is what enables row 17d
  ["txtPg3Sc5Itm17cC", (s, e) => { s.checkNullRow_OnBlur45("txtPg3Sc5Itm17cC", "txtPg3Sc5Itm17dA,txtPg3Sc5Itm17dB,txtPg3Sc5Itm17dC,txtPg3Sc5Itm17dD,txtPg3Sc5It17d"); s.setToZeroIfEmpty(e); s.computePg3Schd5ColD(); s.computePg3Schd5It18C(); }, (s, e) => { s.checkNumValue(e); s.computePg3Schd5ColD(); s.computePg3Schd5It18C(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg3Sc5It17d", (s) => s.checkNullRow_OnBlur45("txtPg3Sc5It17d", "txtPg3Sc5Itm17dA,txtPg3Sc5Itm17dB,txtPg3Sc5Itm17dC,txtPg3Sc5Itm17dD,txtPg3Sc5It17e"), (s, e) => s.capitalize(e)],
  ...(["e", "f", "g", "h"] as const).map((k, j): [string, Handler, Handler] => [`txtPg3Sc5It17${k}`, (s) => s.checkNullRow_OnBlur45(`txtPg3Sc5It17${k}`, `txtPg3Sc5It17${"fghi"[j]},txtPg3Sc5Itm17${k}A,txtPg3Sc5Itm17${k}B,txtPg3Sc5Itm17${k}C,txtPg3Sc5Itm17${k}D`), (s, e) => s.capitalize(e)]),
  ["txtPg3Sc5It17i", (s) => s.checkNullRow_OnBlur45("txtPg3Sc5It17i", "txtPg3Sc5Itm17iA,txtPg3Sc5Itm17iB,txtPg3Sc5Itm17iC,txtPg3Sc5Itm17iD"), (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur("txtPg3Sc5It17i", "btnModalPg3Sc5I17i"); }],
  // 17iA's blur skips computePg3Schd5ColD
  ["txtPg3Sc5Itm17iA", (s, e) => { s.setToZeroIfEmpty(e); s.computePg3Schd5ColD(); s.computePg3Schd5It18A(); }, (s, e) => { s.checkNumValue(e); s.computePg3Schd5It18A(); s.set(e, addCommas(s.g(e))); }],
  ["txtPg3Sc5Itm18A txtPg3Sc5Itm18B txtPg3Sc5Itm18C txtPg3Sc5Itm18D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2Itm8(); }, null],
  ...([
    ["txtPg6Sc6I1", "txtPg6Sc6I1CA,txtPg3Sc6I1CB,txtPg6Sc6I1CC", "txtPg6Sc6I2description,txtPg6Sc6I2legal,txtPg6Sc6I2CA,txtPg3Sc6I2CB,txtPg6Sc6I2CC"],
    ["txtPg6Sc6I2", "txtPg6Sc6I2CA,txtPg3Sc6I2CB,txtPg6Sc6I2CC", "txtPg6Sc6I3description,txtPg6Sc6I3legal,txtPg6Sc6I3CA,txtPg4Sc6I3CB,txtPg6Sc6I3CC"],
    ["txtPg6Sc6I3", "txtPg6Sc6I3CA,txtPg4Sc6I3CB,txtPg6Sc6I3CC", "txtPg3Sc6I4description,txtPg3Sc6I4legal,txtPg3Sc6I4CA,txtPg3Sc6I4CB,txtPg3Sc6I4CC"],
  ] as const).flatMap(([r, amount, next]): Array<[string, Handler | null, Handler | null]> => [
    [`${r}description ${r}legal`, null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur4(`${r}description`, `${r}legal`, next); }],
    [amount.replace(/,/g, " "), (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s.getSum(amount, `${r}CD`); s.computePg6Sc6I5(); s.addCommas1702MX(e); }],
  ]),
  ["txtPg3Sc6I4description txtPg3Sc6I4legal", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur2("txtPg3Sc6I4description", "txtPg3Sc6I4legal", "btnModalPg3Sc6"); }],
  ["txtPg3Sc6I4CA txtPg3Sc6I4CB txtPg3Sc6I4CC", (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s.getSum("txtPg3Sc6I4CA,txtPg3Sc6I4CB,txtPg3Sc6I4CC", "txtPg3Sc6I4CD"); s.computePg6Sc6I5(); s.addCommas1702MX(e); }],
  ["txtPg6Sc6I5CA txtPg6Sc6I5CB txtPg6Sc6I5CC txtPg6Sc6I5CD", (s, e) => { s.setToZeroIfEmpty(e); s.computePg2Sc2Itm9(); }, null],
  ["txtPg6Sc7I1", (s, e) => s.setToZeroIfEmpty(e), (s) => s.computePg6Sc7I3()],
  ["txtPg6Sc7I2", (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s.computePg6Sc7I3(); s.addCommas1702MX(e); }],
  ["txtPg3IShed7_4Year txtPg3IShed7_5Year txtPg3IShed7_6Year txtPg3IShed8_4Year txtPg3IShed8_5Year txtPg3IShed8_6Year", null, (s, e) => s.validateNOLCOYear(e)],
  ["txtPg3IShed7_4A txtPg3IShed7_4B txtPg3IShed7_4C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc7AI4E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_4D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg3IShed7_8D(); s.computeP4Sc7AI4E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_4E txtPg3IShed7_5E txtPg3IShed7_6E txtPg3IShed7_7E txtPg4IShed8_4E txtPg4IShed8_5E txtPg4IShed8_6E txtPg4IShed8_7E", null, (s, e) => s.round(e, 2)],
  // BIR: row 5's column A has no B+C+D check
  ["txtPg3IShed7_5A txtPg3IShed78D txtPg3IShed88D", (s, e) => s.setToZeroIfEmpty(e), (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_5B txtPg3IShed7_5C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc7AI5E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_5D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg3IShed7_8D(); s.computeP4Sc7AI5E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_6A txtPg3IShed7_6B txtPg3IShed7_6C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc7AI6E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_6D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg3IShed7_8D(); s.computeP4Sc7AI6E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_7A", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc7AI7E(0); }, (s, e) => s.round(e, 2)],
  ["txtPg3IShed7_7B txtPg3IShed7_7C txtPg3IShed7_7D", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc7AI7E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4Sc8It1 txtPg4Sc8It2", (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s.computePg4Sc8It3(); s.addCommas1702MX(e); }],
  ["txtPg4IShed8_4A txtPg4IShed8_4B txtPg4IShed8_4C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc8AI4E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_4D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg4IShed88D(); s.computeP4Sc8AI4E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_5A txtPg4IShed8_5B txtPg4IShed8_5C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc8AI5E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_5D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg4IShed88D(); s.computeP4Sc8AI5E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_6A txtPg4IShed8_6B txtPg3IShed8_6C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc8AI6E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_6D", (s, e) => { s.setToZeroIfEmpty(e); s.computePg4IShed88D(); s.computeP4Sc8AI6E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_7A txtPg4IShed8_7B txtPg4IShed8_7C", (s, e) => { s.setToZeroIfEmpty(e); s.computeP4Sc8AI7E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg4IShed8_7D", (s, e) => { s.computePg4IShed88D(); s.computeP4Sc8AI7E(e); }, (s, e) => s.round(e, 2)],
  ["txtPg7Sc9I1 txtPg7Sc9I2 txtPg7Sc9I3", null, (s, e) => s.validateMCITYear(e)],
  ...([1, 2, 3] as const).flatMap((k): Array<[string, Handler, Handler]> => [
    [`txtPg7Sc9I${k}CA txtPg7Sc9I${k}CB`, (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s[`computePg7Sc9I${k}CC`](); s[`computePg7Sc9I${k}CG`](); s.addCommas1702MX(e); }],
    [`txtPg7Sc9I${k}CD txtPg7Sc9I${k}CE`, (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s[`computePg7Sc9I${k}CG`](); s.addCommas1702MX(e); }],
    [`txtPg7Sc9I${k}CF`, (s, e) => s.setToZeroIfEmpty(e), (s, e) => { s[`computePg7Sc9I${k}CG`](); s.computePg7Sc9I4(); s.computePg2Sc3It23C(); s.addCommas1702MX(e); }],
  ]),
  ["txtPg4Sc10Itm1A", (s, e) => { s.setToZeroIfEmpty(e); s.computePg4Sc10ColumnD(); s.computePg4Sc10Itm4A(); s.computePg4Sc10Itm10(); }, (s, e) => { s.set(e, addCommas(NegativeValue(s.g(e)))); s.computePg4Sc10ColumnD(); s.computePg4Sc10Itm4A(); s.addCommas1702MX(e); s.computePg4Sc10Itm10(); }],
  ...(["B", "C"] as const).map((c): [string, Handler, Handler] => [`txtPg4Sc10Itm1${c}`, (s, e) => { s.setToZeroIfEmpty(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm4${c}`](); s.computePg4Sc10Itm10(); }, (s, e) => { s.set(e, addCommas(NegativeValue(s.g(e)))); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm4${c}`](); s.addCommas1702MX(e); }]),
  ["txtPg4Sc10Itm2", (s) => s.checkNullRow_OnBlur45("txtPg4Sc10Itm2", "txtPg4Sc10Itm2A,txtPg4Sc10Itm2B,txtPg4Sc10Itm2C,txtPg4Sc10Itm2D,txtPg4Sc10Itm3"), (s, e) => s.capitalize(e)],
  ...([2, 3] as const).flatMap((k) => (["A", "B", "C"] as const).map((c): [string, Handler, Handler] => [`txtPg4Sc10Itm${k}${c}`, (s, e) => { s.setToZeroIfEmpty(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm4${c}`](); s.computePg4Sc10Itm10(); }, (s, e) => { s.checkNumValue(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm4${c}`](); s.addCommas1702MX(e); s.computePg4Sc10Itm10(); }])),
  ["txtPg4Sc10Itm3", (s) => { s.checkNullRow_OnBlur45("txtPg4Sc10Itm3", "txtPg4Sc10Itm3A,txtPg4Sc10Itm3B,txtPg4Sc10Itm3C,txtPg4Sc10Itm3D"); s.checkNullRow_OnBlur("txtPg4Sc10Itm3", "btnModalPg4Sc10I3"); }, (s, e) => s.capitalize(e)],
  ["txtPg4Sc10Itm4A txtPg4Sc10Itm4B txtPg4Sc10Itm4C", (s, e) => { s.setToZeroIfEmpty(e); s.computePg4Sc10Itm10(); }, (s, e) => { s.checkNumValue(e); s.addCommas1702MX(e); }],
  ["txtPg4Sc10Itm5", (s) => s.checkNullRow_OnBlur45("txtPg4Sc10Itm5", "txtPg4Sc10Itm5A,txtPg4Sc10Itm5B,txtPg4Sc10Itm5C,txtPg4Sc10Itm5D,txtPg4Sc10Itm6"), (s, e) => s.capitalize(e)],
  ["txtPg4Sc10Itm6", (s) => { s.checkNullRow_OnBlur45("txtPg4Sc10Itm6", "txtPg4Sc10Itm6A,txtPg4Sc10Itm6B,txtPg4Sc10Itm6C,txtPg4Sc10Itm6D"); s.checkNullRow_OnBlur("txtPg4Sc10Itm6", "btnModalPg4Sc10I6"); }, (s, e) => s.capitalize(e)],
  ["txtPg4Sc10Itm7", (s) => s.checkNullRow_OnBlur45("txtPg4Sc10Itm7", "txtPg4Sc10Itm7A,txtPg4Sc10Itm7B,txtPg4Sc10Itm7C,txtPg4Sc10Itm7D,txtPg4Sc10Itm8"), (s, e) => s.capitalize(e)],
  ["txtPg4Sc10Itm8", (s) => { s.checkNullRow_OnBlur45("txtPg4Sc10Itm8", "txtPg4Sc10Itm8A,txtPg4Sc10Itm8B,txtPg4Sc10Itm8C,txtPg4Sc10Itm8D"); s.checkNullRow_OnBlur("txtPg4Sc10Itm8", "btnModalPg4Sc10I8"); }, (s, e) => s.capitalize(e)],
  ...([5, 6, 7, 8] as const).flatMap((k) =>
    (["A", "B", "C", "D"] as const)
      .filter((c) => !(c === "D" && k === 7) || true)
      .map((c): [string, Handler, Handler] => [
        `txtPg4Sc10Itm${k}${c}`,
        (s, e) => { s.setToZeroIfEmpty(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm9${c}`](); s.computePg4Sc10Itm10(); },
        // BIR: the D cells of items 5 and 6 skip computePg4Sc10Itm10 on blur
        (s, e) => { s.checkNumValue(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm9${c}`](); s.addCommas1702MX(e); if (!(c === "D" && (k === 5 || k === 6))) s.computePg4Sc10Itm10(); },
      ]),
  ),
  ...(["A", "B", "C", "D"] as const).map((c): [string, Handler, null] => [`txtPg4Sc10Itm9${c}`, (s, e) => { s.setToZeroIfEmpty(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm9${c}`](); s.computePg4Sc10Itm10(); }, null]),
];
const HANDLER = new Map<string, [Handler | null, Handler | null]>();
for (const [ids, c, b] of H) for (const id of ids.split(" ")) HANDLER.set(id, [c, b]);

/** v2018's onchange where it differs. 14C's calls computePg2Sc2It14C, which v2018 does not define: the handler throws
 *  a ReferenceError at its first statement and nothing after it runs (15C is recomputed by computePg2Sc2It15C). */
const CHANGE_2018 = new Map<string, Handler>([
  ["txtPg2Sc2It14C", () => {}],
  ...(["A", "B", "C"] as const).flatMap((c) => [
    [`txtPg4Sc10Itm4${c}`, (s: Sim, e: string) => { s.setToZeroIfEmpty(e); s[`computePg4Sc10Itm4${c}`](); s[`computePg4Sc10Itm9${c}`](); s.computePg4Sc10Itm10(); }] as [string, Handler],
    ...[5, 6].map((k) => [`txtPg4Sc10Itm${k}${c}`, (s: Sim, e: string) => { s.setToZeroIfEmpty(e); s.computePg4Sc10ColumnD(); s[`computePg4Sc10Itm4${c}`](); s[`computePg4Sc10Itm9${c}`](); s.computePg4Sc10Itm10(); }] as [string, Handler]),
  ]),
]);
