// BIR Form 1702-MX, the original (2013) layout — superseded by 1702MXv2018C, kept so returns filed on it reopen 1:1.
// Nine pages: Part IV basis of tax relief, Part V computation per tax regime (37–44), Schedules 1 (tax due per
// regime) and 2 (tax relief), 3 (cost of sales), 4 (other taxable income), 5 (ordinary deductions), 6 (special
// deductions), 7 / 7A (NOLCO), 8 (tax credits), 9 (MCIT), 10 (reconciliation), 11 (balance sheet), 12 (stockholders),
// 13–14 (income subject to final tax / exempt). Columns A = Exempt, B = Special rate, C = Regular rate, D = total.
// Field prefix `frm1702MX:`; amounts are whole pesos (formatCurrencyWOC), negatives "(1,234)", saved "-1,234".
//
// Same method as form1702mxv2018c.ts: `OldSim` holds BIR's field strings and ports every reachable compute function
// under its BIR name (the generated-then-reviewed bodies below), and `run1702MXOld` plays the filer (each page 1–9
// text input typed, changed and left, in DOM order; the modals OK'd; two more tab-throughs) and BIR's reopen
// (save → load → validatePg1Pt2I22 → checkEnableManual → recomputeSchedule1) and page-1 tab-through.
//
// BIR arithmetic / bugs replicated where they change saved values:
//   • Sch 1 item 12B (special-rate tax) is item 10B × the special rate, but item 5B when the IC030/IC031 + PEZA-5%
//     rule picks 5% and item 1B for IC080/IC190/IC191 or an RA 10693 legal basis (computePg3Sc1I12); the rate is the
//     rebuilt drop-down's first option — its 5% / 30% auto-pick compares `0.05 * 100 === 5`, never true;
//   • Sch 1 item 15C (MCIT) = 2% of item 5C only while IC055 is ticked; 16C is the larger of 12C and 15C;
//   • Sch 2 item 1 is 30% of item 10 (A, B) — even of a negative 10 when it is 0 or more only (product clamps < 0);
//   • Sch 7A row 4 takes this year's NOL (|Sch 7 item 3|) into column A; rows 5–7 refuse B+C+D > A by zeroing B–D
//     (rows 6–7 check D > A first);
//   • Sch 9 (MCIT): C = max(B − A, 0) and G = max(C − (D+E+F), 0) — no zeroing of D–F, unlike v2018C;
//   • the IC055 tick is BIR's, re-derived from item 8 (date of incorporation) vs item 2;
//   • every text field is saved upper-cased; registered name, address and line of business are escaped.
//
// Not modelled: Part V mandatory attachments (two or more exempt / special activities, chkPg2Pt4I30MoreThanOne) and
// the six Schedule 13 / 14 "Add more" lists (their rows are div copies BIR's own reload rebuilds from the HTML, not
// from the saved values); their counters stay 0 and the main-line items 13 / 14 are entered directly.

import frozen from "./template/1702MX.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1702MX", frozen as Array<[string, string, string?]>);
import { atcPickList } from "./atc.ts";
import { BirDom, addCommas1702MXValue, NegativeValue, NumWithComma, NumWithParenthesis, WholeNumWithComma, addCommas, birDateValid, formatCurrencyWOC } from "./form1702mx-bir.ts";
import { parseMoney } from "./money.ts";
import { validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export const P = "frm1702MX:";
type TemplateRecord = [string, string, string?];
type Read = (id: string) => string;
const TEMPLATE = template as TemplateRecord[];
const bare = (k: string): string => (k.startsWith(P) ? k.slice(P.length) : k);
const bTrim = (s: string): string => String(s).trim();

// ── the eight "Add more…" tables ─────────────────────────────────────────────────────────────────────────────────

interface Modal {
  name: string;
  stem: string;
  text: number[];
  amount: [number, number, number];
  total: number;
  counter: string;
  subtotal: [string, string, string, string];
  line_text: string[];
  line_amount: [string, string, string, string];
  key: number[];
  /** BIR's Save_ ends with this recompute. */
  after: string;
}
const line = (name: string, stem: string, lineId: string, counter: string, after: string): Modal => ({
  name, stem, text: [1], amount: [2, 3, 4], total: 5, counter, after, key: [1],
  subtotal: ["A", "B", "C", "D"].map((c) => `${stem}SubTotalC${c}`) as Modal["subtotal"],
  line_text: [lineId], line_amount: ["A", "B", "C", "D"].map((c) => `${lineId}C${c}`) as Modal["line_amount"],
});
export const MODAL: Modal[] = [
  line("sc4_3", "txtPg5Sc4I3_", "txtPg5Sc4I3", "txtCtrmodalPg5Sc4I3", "computePg5Sc4I4"),
  line("sc5_4", "txtPg5Sc5I4_", "txtPg5Sc5I4", "txtCtrmodalPg5Sc5I4", "computePg6Sc5I40"),
  { ...line("sc5_39", "txtPg6Sc5I39_", "txtPg6Sc5I39", "txtCtrmodalPg6Sc5I39", "computePg6Sc5I40"), line_text: ["txtPg6Sc5I39other"] },
  {
    name: "sc6_4", stem: "txtPg6Sc6_", text: [1, 2], amount: [3, 4, 5], total: 6, counter: "txtCtrmodalPg6Sc6", after: "computePg6Sc6I5", key: [1, 2],
    subtotal: ["txtPg6Sc6_SubTotalCA", "txtPg6Sc6_SubTotalCB", "txtPg6Sc6_SubTotalCC", "txtPg6Sc6_SubTotalCD"],
    line_text: ["txtPg6Sc6I4description", "txtPg6Sc6I4legal"], line_amount: ["txtPg6Sc6I4CA", "txtPg6Sc6I4CB", "txtPg6Sc6I4CC", "txtPg6Sc6I4CD"],
  },
  line("sc8_12", "txtPg7Sc8_", "txtPg7Sc8I12", "txtCtrmodalPg7Sc8", "computePg7Sc8I13"),
  line("sc10_3", "txtPg7Sc10I3_", "txtPg7Sc10I3", "txtCtrmodalPg7Sc10I3", "computePg7Sc10I4"),
  line("sc10_6", "txtPg7Sc10I6_", "txtPg7Sc10I6", "txtCtrmodalPg7Sc10I6", "computePg7Sc10I9"),
  line("sc10_8", "txtPg7Sc10I8_", "txtPg7Sc10I8", "txtCtrmodalPg7Sc10I8", "computePg7Sc10I9"),
];
export const MODAL_GROUP: GroupSpec[] = MODAL.map((m) => ({
  name: m.name,
  size_field: `${P}${m.counter}`,
  first_index: 1,
  row: Array.from({ length: m.total - 1 }, (_, j) => j + 1).map((c) => ({ id: `${P}${m.stem}{i}Col${c}`, kind: m.text.includes(c) ? ("text" as const) : ("money" as const) })),
}));

// ── classification ───────────────────────────────────────────────────────────────────────────────────────────────

const NOT_NUMBERTEXT = /:(txtPg2Pt4I34SpecialTaxRate|drpPg3Sc1I11CB|txtATCSelectedIndex|txtCtrmodal|totalEXAttach|totalSPAttach)/;
const NUMBERTEXT = new Set(TEMPLATE.filter(([k, v, r]) => !r && (v === "0" || v === "0.00") && k.startsWith(P) && !NOT_NUMBERTEXT.test(k)).map(([k]) => bare(k)));
const isNumbertext = (id: string): boolean => NUMBERTEXT.has(id) || MODAL.some((m) => id.startsWith(m.stem) && !m.text.some((c) => id.endsWith(`Col${c}`)));

const PAGE_TEXT: string[] = (() => {
  const out: string[] = [];
  let on = false;
  for (const [k, , radio] of TEMPLATE) {
    const id = bare(k);
    if (id === "rdoPg1I1Calendar") on = true;
    if (!on) continue;
    if (!radio && !/^(ddl|drp|chk|rad)/.test(id)) out.push(id);
    if (id === "txtPg9Sc14I8") break;
  }
  return out;
})();
const PAGE1_END = PAGE_TEXT.indexOf("txtPg1Pt1I29OthersC4");
const INVISIBLE = new Set(["txtPg1TINMASK", "txtPg1Pt1I7RDO", "txtZIP", "txtATCSelectedIndex", ...[2, 3, 4, 5, 6, 7, 8, 9].map((k) => `txtPg${k}TINMASK`), "txtPg1TINMASK"]);
const ENABLED_AT_BLANK = new Set("txtPg1I2YearEnd txtPg1Pt1I8 txtPg1Pt1I9RegisteredName txtPg1Pt1I10RegisteredAddress txtPg1Pt1I11ContactNumber txtPg1Pt1I13MainLine txtPg1Pt1I14PSICCode txtPg1Pt2NumberofPagesFiled txtPg1Pt2I22 txtPg1Pt2I23Date txtPg1Pt2I24PlaceofIssue txtPg1Pt2I25AmountCTC txtPg1Pt1I26CashC1 txtPg1Pt1I26CashC2 txtPg1Pt1I26CashC3 txtPg1Pt1I26CashC4 txtPg1Pt1I27CheckC1 txtPg1Pt1I27CheckC2 txtPg1Pt1I27CheckC3 txtPg1Pt1I27CheckC4 txtPg1Pt1I28TaxDebitC2 txtPg1Pt1I28TaxDebitC3 txtPg1Pt1I28TaxDebitC4 txtPg1Pt1I29Others txtPg1Pt1I29OthersC1 txtPg1Pt1I29OthersC2 txtPg1Pt1I29OthersC3 txtPg1Pt1I29OthersC4 txtPg2Pt4I31CA txtPg2Pt4I31CB txtPg2Pt4I31CC txtPg2Pt4I32CA txtPg2Pt4I32CB txtPg2Pt4I32CC txtPg2Pt4I33CA txtPg2Pt4I33CB txtPg2Pt4I33CC txtPg2Pt4I34SpecialTaxRate txtPg2Pt4I35CA txtPg2Pt4I35CB txtPg2Pt4I35CC txtPg2Pt4I36CA txtPg2Pt4I36CB txtPg2Pt4I36CC txtPg2Pt5I40 txtPg2Pt5I41 txtPg2Pt5I42 txtPg2Pt6I45External txtPg2Pt6I46TIN1 txtPg2Pt6I46TIN2 txtPg2Pt6I46TIN3 txtPg2Pt6I46TIN4 txtPg2Pt6I47Partner txtPg2Pt6I48TIN1 txtPg2Pt6I48TIN2 txtPg2Pt6I48TIN3 txtPg2Pt6I48TIN4 txtPg2Pt6I49BIRAccreditation txtPg2Pt6I50IssueDate txtPg2Pt6I51ExpiryDate txtATCSelectedIndex txtPg3Sc1I13CB txtPg4Sc3I1CA txtPg4Sc3I1CB txtPg4Sc3I1CC txtPg4Sc3I2CA txtPg4Sc3I2CB txtPg4Sc3I2CC txtPg4Sc3I3CA txtPg4Sc3I3CB txtPg4Sc3I3CC txtPg4Sc3I5CA txtPg4Sc3I5CB txtPg4Sc3I5CC txtPg4Sc3AI1CA txtPg4Sc3AI1CB txtPg4Sc3AI1CC txtPg4Sc3AI2CA txtPg4Sc3AI2CB txtPg4Sc3AI2CC txtPg4Sc3AI4CA txtPg4Sc3AI4CB txtPg4Sc3AI4CC txtPg4Sc3BI6CA txtPg4Sc3BI6CB txtPg4Sc3BI6CC txtPg4Sc3BI7CA txtPg4Sc3BI7CB txtPg4Sc3BI7CC txtPg4Sc3BI9CA txtPg4Sc3BI9CB txtPg4Sc3BI9CC txtPg4Sc3BI11CA txtPg4Sc3BI11CB txtPg4Sc3BI11CC txtPg4Sc3BI12CA txtPg4Sc3BI12CB txtPg4Sc3BI12CC txtPg4Sc3BI14CA txtPg4Sc3BI14CB txtPg4Sc3BI14CC txtPg4Sc3BI15CA txtPg4Sc3BI15CB txtPg4Sc3BI15CC txtPg4Sc3BI17CA txtPg4Sc3BI17CB txtPg4Sc3BI17CC txtPg4Sc3BI18CA txtPg4Sc3BI18CB txtPg4Sc3BI18CC txtPg4Sc3CI20CA txtPg4Sc3CI20CB txtPg4Sc3CI20CC txtPg4Sc3CI21CA txtPg4Sc3CI21CB txtPg4Sc3CI21CC txtPg4Sc3CI22CA txtPg4Sc3CI22CB txtPg4Sc3CI22CC txtPg4Sc3CI23CA txtPg4Sc3CI23CB txtPg4Sc3CI23CC txtPg4Sc3CI24CA txtPg4Sc3CI24CB txtPg4Sc3CI24CC txtPg4Sc3CI25CA txtPg4Sc3CI25CB txtPg4Sc3CI25CC txtPg5Sc4I1 txtPg5Sc4I1CA txtPg5Sc4I1CB txtPg5Sc4I1CC txtPg5Sc5I1CA txtPg5Sc5I1CB txtPg5Sc5I1CC txtPg5Sc5I2 txtPg5Sc5I2CA txtPg5Sc5I2CB txtPg5Sc5I2CC txtPg5Sc5I5CA txtPg5Sc5I5CB txtPg5Sc5I5CC txtPg5Sc5I6CA txtPg5Sc5I6CB txtPg5Sc5I6CC txtPg5Sc5I7CA txtPg5Sc5I7CB txtPg5Sc5I7CC txtPg5Sc5I8CA txtPg5Sc5I8CB txtPg5Sc5I8CC txtPg5Sc5I9CA txtPg5Sc5I9CB txtPg5Sc5I9CC txtPg5Sc5I10CA txtPg5Sc5I10CB txtPg5Sc5I10CC txtPg5Sc5I11CA txtPg5Sc5I11CB txtPg5Sc5I11CC txtPg5Sc5I12CA txtPg5Sc5I12CB txtPg5Sc5I12CC txtPg5Sc5I13CA txtPg5Sc5I13CB txtPg5Sc5I13CC txtPg5Sc5I14CA txtPg5Sc5I14CB txtPg5Sc5I14CC txtPg5Sc5I15CA txtPg5Sc5I15CB txtPg5Sc5I15CC txtPg5Sc5I16CA txtPg5Sc5I16CB txtPg5Sc5I16CC txtPg5Sc5I17CA txtPg5Sc5I17CB txtPg5Sc5I17CC txtPg5Sc5I18CA txtPg5Sc5I18CB txtPg5Sc5I18CC txtPg5Sc5I19CA txtPg5Sc5I19CB txtPg5Sc5I19CC txtPg5Sc5I20CA txtPg5Sc5I20CB txtPg5Sc5I20CC txtPg5Sc5I21CA txtPg5Sc5I21CB txtPg5Sc5I21CC txtPg5Sc5I22CA txtPg5Sc5I22CB txtPg5Sc5I22CC txtPg5Sc5I23CA txtPg5Sc5I23CB txtPg5Sc5I23CC txtPg5Sc5I24CA txtPg5Sc5I24CB txtPg5Sc5I24CC txtPg5Sc5I25CA txtPg5Sc5I25CB txtPg5Sc5I25CC txtPg5Sc5I26CA txtPg5Sc5I26CB txtPg5Sc5I26CC txtPg5Sc5I27CA txtPg5Sc5I27CB txtPg5Sc5I27CC txtPg5Sc5I28CA txtPg5Sc5I28CB txtPg5Sc5I28CC txtPg5Sc5I29CA txtPg5Sc5I29CB txtPg5Sc5I29CC txtPg5Sc5I30CA txtPg5Sc5I30CB txtPg5Sc5I30CC txtPg5Sc5I31CA txtPg5Sc5I31CB txtPg5Sc5I31CC txtPg5Sc5I32CA txtPg5Sc5I32CB txtPg5Sc5I32CC txtPg5Sc5I33CA txtPg5Sc5I33CB txtPg5Sc5I33CC txtPg5Sc5I34CA txtPg5Sc5I34CB txtPg5Sc5I34CC txtPg5Sc5I35CA txtPg5Sc5I35CB txtPg5Sc5I35CC txtPg6Sc5I36other txtPg6Sc5I36CA txtPg6Sc5I36CB txtPg6Sc5I36CC txtPg6Sc6I1description txtPg6Sc6I1legal txtPg6Sc6I1CA txtPg6Sc6I1CB txtPg6Sc6I1CC txtPg6Sc7I1 txtPg6Sc7I2 txtPg6Sc7AI5year txtPg6Sc7AI5CA txtPg6Sc7AI5CB txtPg6Sc7AI6year txtPg6Sc7AI6CA txtPg6Sc7AI6CB txtPg6Sc7AI7year txtPg6Sc7AI7CA txtPg6Sc7AI7CB txtPg6Sc7AI5CC txtPg6Sc7AI5CD txtPg6Sc7AI6CC txtPg6Sc7AI6CD txtPg6Sc7AI7CC txtPg6Sc7AI7CD txtPg6Sc8I1CA txtPg6Sc8I1CB txtPg6Sc8I1CC txtPg6Sc8I3CA txtPg6Sc8I3CB txtPg6Sc8I3CC txtPg6Sc8I5CA txtPg6Sc8I5CB txtPg6Sc8I5CC txtPg6Sc8I6CA txtPg6Sc8I6CB txtPg6Sc8I6CC txtPg7Sc8I7CA txtPg7Sc8I7CB txtPg7Sc8I7CC txtPg7Sc8I8CA txtPg7Sc8I8CB txtPg7Sc8I8CC txtPg7Sc8I9CA txtPg7Sc8I9CB txtPg7Sc8I9CC txtPg7Sc8I10CA txtPg7Sc8I10CB txtPg7Sc8I10CC txtPg7Sc8I11 txtPg7Sc8I11CA txtPg7Sc8I11CB txtPg7Sc8I11CC txtPg7Sc10I1CA txtPg7Sc10I1CB txtPg7Sc10I1CC txtPg7Sc10I2 txtPg7Sc10I2CA txtPg7Sc10I2CB txtPg7Sc10I2CC txtPg7Sc10I5 txtPg7Sc10I5CA txtPg7Sc10I5CB txtPg7Sc10I5CC txtPg7Sc10I7 txtPg7Sc10I7CA txtPg7Sc10I7CB txtPg7Sc10I7CC txtPg8Sc11I1 txtPg8Sc11I2 txtPg8Sc11I3 txtPg8Sc11I4 txtPg8Sc11I5 txtPg8Sc11I6 txtPg8Sc11I8 txtPg8Sc11I9 txtPg8Sc11I10 txtPg8Sc11I11 txtPg8Sc11I13 txtPg8Sc11I14 txtPg8Sc11I15 txtPg8Sc12I1C1 txtPg8Sc12I1C2tin1 txtPg8Sc12I1C2tin2 txtPg8Sc12I1C2tin3 txtPg8Sc12I1C2tin4 txtPg8Sc12I1C3 txtPg8Sc12I1C4 txtPg9Sc13I1CA txtPg9Sc13I1CB txtPg9Sc13I1CC txtPg9Sc13I2CA txtPg9Sc13I2CB txtPg9Sc13I2CC txtPg9Sc13I3CA txtPg9Sc13I3CB txtPg9Sc13I3CC txtPg9Sc13I4CA txtPg9Sc13I4CB txtPg9Sc13I4CC txtPg9Sc13I5CA txtPg9Sc13I5CB txtPg9Sc13I6CA txtPg9Sc13I6CB txtPg9Sc13I7CA txtPg9Sc13I7CB txtPg9Sc13I8CA txtPg9Sc13I8CB txtPg9Sc13I9CA txtPg9Sc13I9CB txtPg9Sc13I10CA-2 txtPg9Sc13I10CB-2 txtPg9Sc13I11CA txtPg9Sc13I11CB txtPg9Sc13I12CA txtPg9Sc13I12CB txtPg9Sc13I13CA txtPg9Sc13I13CB txtPg9Sc13I14CA txtPg9Sc13I14CB txtPg9Sc13I15CA txtPg9Sc13I15CB txtPg9Sc13I16CA txtPg9Sc13I16CB txtPg9Sc13I17CA txtPg9Sc13I17CB txtPg9Sc13I18CA txtPg9Sc13I18CB txtPg9Sc14I1 txtPg9Sc14I2CA txtPg9Sc14I2CB txtPg9Sc14I3CA txtPg9Sc14I3CB txtPg9Sc14I4CA txtPg9Sc14I4CB txtPg9Sc14I5CA txtPg9Sc14I5CB txtPg9Sc14I6CA txtPg9Sc14I6CB txtPg9Sc14I7CA txtPg9Sc14I7CB".split(" "));
/** Inputs BIR keeps disabled until a description, the IC055 tick or a modal enables them (or the profile fills). */
const INPUT_LATER = /^(txtPg5Sc4I[23](CA|CB|CC)?|txtPg5Sc5I[34](CA|CB|CC)?|txtPg6Sc5I3[789](other|CA|CB|CC)|txtPg6Sc6I[234](description|legal|CA|CB|CC)|txtPg6Sc8I2C[ABC]|txtPg7Sc9I[123](C[ABDEF])?|txtPg7Sc8I12(CA|CB|CC)?|txtPg7Sc10I[368](CA|CB|CC)?|txtPg8Sc12I\d+C(1|2tin[1-4]|3|4)|txtPg1Pt1I12Email|txtPg1Pt1I6TINC[1-4]|txtPg1Pt1I7RDO|txtZIP)$/;
const UNMODELLED = /^(txtPg1Pt1I12Email|txtCurrentPage|txtMaxPage|txtPg1Pt1I(2[6-9])\w*|txtPg1Pt2(AuthorizedRepresentative|Treasurer|TitleofSignatory)|.*AttM.*|attachment\w*|totalEXAttach|totalSPAttach|txtCtrmodalPg9\w*|txtPg9Sc1[34]I\w*-\d+|txtPg9Sc13I_SubTotal|drpPg9Sc13I10C[AB]-\d+)$/;
const isComputed = (id: string): boolean => PAGE_TEXT.includes(id) && !ENABLED_AT_BLANK.has(id) && !INPUT_LATER.test(id) || /^(chkPg1I5ATCR1|drpPg3Sc1I11CB)$/.test(id) || MODAL.some((m) => m.counter === id || m.subtotal.includes(id as never));

const VERBATIM = new Set(["txtPg1Pt1I6TINC1", "txtPg1Pt1I6TINC2", "txtPg1Pt1I6TINC3", "txtPg1Pt1I6TINC4", "txtPg1Pt1I7RDO", "txtZIP", "txtPg1Pt1I11ContactNumber"]);
const ESCAPED = new Set(["txtPg1Pt1I9RegisteredName", "txtPg1Pt1I10RegisteredAddress", "txtPg1Pt1I13MainLine"]);
const ATC = atcPickList("1702MX", "");
const IPA_LIST = ["PEZA", "ECOZONE", "BCDA", "SBMA", "CDC", "PPMC", "JHSEZ", "MSEZ", "CEZA", "ZCSEZA", "APECO", "AFAB", "TEZ", "EPZA", "MEPZA"];
const LEGAL_BASIS = ["RA7227", "7227", "RA9400", "9400", "RA7916", "7916", "RA8748", "8748", "RA7922", "7922", "RA7903", "7903", "RA9490", "9490", "RA10083", "10083", "RA9728", "9728", "RA9593", "9593"];
const LEGAL_RA10693 = ["RA10693", "10693", "R.A.10693", "RA.10693", "R.A10693", "RA 10693", "R.A. 10693", "RA. 10693", "R.A 10693"];

type Handler = (s: OldSim, e: string) => void;

export class OldSim extends BirDom {
  tbl: Record<string, string[][]> = {};
  drpOption: string[] = ["0"];
  tempVarForSc1I12 = false;
  readonly totalSP = 0;
  /** No Part V attachments: BIR's `$("input[name*='EX']")` / `…'SP'` sums run over nothing. */
  noAttachment(): Array<{ name: string; value: string }> {
    return [];
  }
  /** product(param1, param2, out): param1 × param2, negative → 0, Math.round (BIR's float expression). */
  product(param1: string, param2: string, out: string): void {
    let product = this.operand(param1) * this.operand(param2);
    if (product < 0) product = 0;
    this.set(out, NegativeValue(formatCurrencyWOC(Math.round(product))));
  }

  computePg1Pt2I16(): void {
    this.getSum('txtPg2Pt5I37CD', 'txtPg1Pt2I16TotalIncome');
  }
  computePg1Pt2I17(): void {
    this.getSum('txtPg2Pt5I38CD', 'txtPg1Pt2I17LessTotalTax');
  }
  computePg1Pt2I18(): void {
    this.computePg1Pt2I16();
    this.computePg1Pt2I17();
    this.getDifference('txtPg1Pt2I16TotalIncome', 'txtPg1Pt2I17LessTotalTax', 'txtPg1Pt2I18NetTaxPayable');
    this.computePg1Pt2I20();
  }
  computePg1Pt2I20(): void {
    this.getSum('txtPg1Pt2I18NetTaxPayable,txtPg1Pt2I19TotalPenalties', 'txtPg1Pt2I20TotalAmount');
    let overPayment = NumWithComma(NumWithParenthesis(this.g("txtPg1Pt2I20TotalAmount")));
    if (overPayment < 0) {
    this.dis.rdoPg1Pt2I21Refund = false;
    this.dis.rdoPg1Pt2I21IssueTCC = false;
    this.dis.rdoPg1Pt2I21CarriedOver = false;
    }
    else {
    this.dis.rdoPg1Pt2I21Refund = true;
    this.dis.rdoPg1Pt2I21IssueTCC = true;
    this.dis.rdoPg1Pt2I21CarriedOver = true;
    this.chk.rdoPg1Pt2I21Refund = false;
    this.chk.rdoPg1Pt2I21IssueTCC = false;
    this.chk.rdoPg1Pt2I21CarriedOver = false;
    }
  }
  computePg2Pt5I37(): void {
    this.getSum('txtPg3Sc1I16CB', 'txtPg2Pt5I37CB');
    this.getSum('txtPg3Sc1I16CC', 'txtPg2Pt5I37CC');
    this.getSum('txtPg3Sc1I16CD', 'txtPg2Pt5I37CD');
    this.computePg1Pt2I18();
    this.computePg2Pt5I39();
  }
  computePg2Pt5I39(): void {
    this.getDifference('txtPg2Pt5I37CA', 'txtPg2Pt5I38CA', 'txtPg2Pt5I39CA');
    this.getDifference('txtPg2Pt5I37CB', 'txtPg2Pt5I38CB', 'txtPg2Pt5I39CB');
    this.getDifference('txtPg2Pt5I37CC', 'txtPg2Pt5I38CC', 'txtPg2Pt5I39CC');
    this.getSum('txtPg2Pt5I39CA,txtPg2Pt5I39CB,txtPg2Pt5I39CC', 'txtPg2Pt5I39CD');
    this.computePg2Pt5I44();
  }
  computePg2Pt5I43(): void {
    this.getSum('txtPg2Pt5I40,txtPg2Pt5I41,txtPg2Pt5I42', 'txtPg2Pt5I43,txtPg1Pt2I19TotalPenalties');
    this.computePg2Pt5I44();
  }
  computePg2Pt5I44(): void {
    let item39 = NumWithComma(NumWithParenthesis(this.g("txtPg2Pt5I39CD")));
    if (item39 >= 0) {
    this.getSum('txtPg2Pt5I39CD,txtPg2Pt5I43', 'txtPg2Pt5I44,txtPg1Pt2I20TotalAmount');
    }
    else {
    this.getSum('txtPg2Pt5I39CD', 'txtPg2Pt5I44,txtPg1Pt2I20TotalAmount');
    }
    this.computePg1Pt2I20();
  }
  computePg3Sc1I1(): void {
    let pg1mScBI1EX = 0;
    let pg1mScBI1SP = 0;
    let exArray = this.noAttachment();
    let spArray = this.noAttachment();
    for (let i = 0; i < exArray.length; i++) {
    if (exArray[i]!.name.match("BI1$")) {
    pg1mScBI1EX += (isNaN(NumWithComma(NumWithParenthesis(exArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(exArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI1EX)));
    this.getSum('txtPg4Sc3I6CA,hidden', 'txtPg3Sc1I1CA');
    for (let i = 0; i < spArray.length; i++) {
    if (spArray[i]!.name.match("BI1$")) {
    pg1mScBI1SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI1SP)));
    this.getSum('txtPg4Sc3I6CB,hidden', 'txtPg3Sc1I1CB');
    this.getSum('txtPg4Sc3I6CC', 'txtPg3Sc1I1CC');
    this.getSum('txtPg3Sc1I1CA,txtPg3Sc1I1CB,txtPg3Sc1I1CC', 'txtPg3Sc1I1CD');
    this.computePg3Sc1I3();
    this.populatePg3Sc1I11();
    this.set("hidden", 0);
  }
  computePg3Sc1I2(): void {
    let pg1mScBI2EX = 0;
    let pg1mScBI2SP = 0;
    let exArray = this.noAttachment();
    let spArray = this.noAttachment();
    for (let i = 0; i < exArray.length; i++) {
    if (exArray[i]!.name.match("BI2$")) {
    pg1mScBI2EX += (isNaN(NumWithComma(NumWithParenthesis(exArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(exArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI2EX)));
    this.getSum('txtPg4Sc3CI27CA,hidden', 'txtPg3Sc1I2CA');
    for (let i = 0; i < spArray.length; i++) {
    if (spArray[i]!.name.match("BI2$")) {
    pg1mScBI2SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI2SP)));
    this.getSum('txtPg4Sc3CI27CB,hidden', 'txtPg3Sc1I2CB');
    this.getSum('txtPg4Sc3CI27CC', 'txtPg3Sc1I2CC');
    this.getSum('txtPg3Sc1I2CA,txtPg3Sc1I2CB,txtPg3Sc1I2CC', 'txtPg3Sc1I2CD');
    this.computePg3Sc1I3();
    this.set("hidden", 0);
  }
  computePg3Sc1I3(): void {
    this.getDifference('txtPg3Sc1I1CA', 'txtPg3Sc1I2CA', 'txtPg3Sc1I3CA');
    this.getDifference('txtPg3Sc1I1CB', 'txtPg3Sc1I2CB', 'txtPg3Sc1I3CB');
    this.getDifference('txtPg3Sc1I1CC', 'txtPg3Sc1I2CC', 'txtPg3Sc1I3CC');
    this.getDifference('txtPg3Sc1I1CD', 'txtPg3Sc1I2CD', 'txtPg3Sc1I3CD');
    this.computePg3Sc1I5();
  }
  computePg3Sc1I4(): void {
    let pg1mScBI4EX = 0;
    let pg1mScBI4SP = 0;
    let exArray = this.noAttachment();
    let spArray = this.noAttachment();
    for (let i = 0; i < exArray.length; i++) {
    if (exArray[i]!.name.match("BI4$")) {
    pg1mScBI4EX += (isNaN(NumWithComma(NumWithParenthesis(exArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(exArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI4EX)));
    this.getSum('txtPg5Sc4I4CA,hidden', 'txtPg3Sc1I4CA');
    for (let i = 0; i < spArray.length; i++) {
    if (spArray[i]!.name.match("BI4$")) {
    pg1mScBI4SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI4SP)));
    this.getSum('txtPg5Sc4I4CB,hidden', 'txtPg3Sc1I4CB');
    this.getSum('txtPg5Sc4I4CC', 'txtPg3Sc1I4CC');
    this.getSum('txtPg3Sc1I4CA,txtPg3Sc1I4CB,txtPg3Sc1I4CC', 'txtPg3Sc1I4CD');
    this.computePg3Sc1I5();
    this.set("hidden", 0);
  }
  computePg3Sc1I5(): void {
    this.getSum('txtPg3Sc1I3CA,txtPg3Sc1I4CA', 'txtPg3Sc1I5CA');
    this.getSum('txtPg3Sc1I3CB,txtPg3Sc1I4CB', 'txtPg3Sc1I5CB');
    this.getSum('txtPg3Sc1I3CC,txtPg3Sc1I4CC', 'txtPg3Sc1I5CC');
    this.getSum('txtPg3Sc1I3CD,txtPg3Sc1I4CD', 'txtPg3Sc1I5CD');
    this.computePg3Sc1I10();
    this.computePg3Sc1I15();
  }
  computePg3Sc1I6(): void {
    let pg1mScBI6EX = 0;
    let pg1mScBI6SP = 0;
    let exArray = this.noAttachment();
    let spArray = this.noAttachment();
    for (let i = 0; i < exArray.length; i++) {
    if (exArray[i]!.name.match("BI6$")) {
    pg1mScBI6EX += (isNaN(NumWithComma(NumWithParenthesis(exArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(exArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI6EX)));
    this.getSum('txtPg6Sc5I40CA,hidden', 'txtPg3Sc1I6CA');
    for (let i = 0; i < spArray.length; i++) {
    if (spArray[i]!.name.match("BI6$")) {
    pg1mScBI6SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI6SP)));
    this.getSum('txtPg6Sc5I40CB,hidden', 'txtPg3Sc1I6CB');
    this.getSum('txtPg6Sc5I40CC', 'txtPg3Sc1I6CC');
    this.getSum('txtPg3Sc1I6CA,txtPg3Sc1I6CB,txtPg3Sc1I6CC', 'txtPg3Sc1I6CD');
    this.computePg3Sc1I9();
    this.set("hidden", 0);
  }
  computePg3Sc1I7(): void {
    let pg1mScBI7EX = 0;
    let pg1mScBI7SP = 0;
    let exArray = this.noAttachment();
    let spArray = this.noAttachment();
    for (let i = 0; i < exArray.length; i++) {
    if (exArray[i]!.name.match("BI7$")) {
    pg1mScBI7EX += (isNaN(NumWithComma(NumWithParenthesis(exArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(exArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI7EX)));
    this.getSum('txtPg6Sc6I5CA,hidden', 'txtPg3Sc1I7CA');
    for (let i = 0; i < spArray.length; i++) {
    if (spArray[i]!.name.match("BI7$")) {
    pg1mScBI7SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI7SP)));
    this.getSum('txtPg6Sc6I5CB,hidden', 'txtPg3Sc1I7CB');
    this.getSum('txtPg6Sc6I5CC', 'txtPg3Sc1I7CC');
    this.getSum('txtPg3Sc1I7CA,txtPg3Sc1I7CB,txtPg3Sc1I7CC', 'txtPg3Sc1I7CD');
    this.computePg3Sc1I9();
    this.computePg3Sc2I2();
    this.set("hidden", 0);
  }
  computePg3Sc1I8(): void {
    let pg1mScBI8EX = 0;
    let pg1mScBI8SP = 0;
    let exArray = this.noAttachment();
    let spArray = this.noAttachment();
    for (let i = 0; i < exArray.length; i++) {
    if (exArray[i]!.name.match("BI8$")) {
    pg1mScBI8EX += (isNaN(NumWithComma(NumWithParenthesis(exArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(exArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI8EX)));
    this.getSum('hidden', 'txtPg3Sc1I8CA');
    for (let i = 0; i < spArray.length; i++) {
    if (spArray[i]!.name.match("BI8$")) {
    pg1mScBI8SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI8SP)));
    this.getSum('hidden', 'txtPg3Sc1I8CB');
    this.getSum('txtPg6Sc7AI8', 'txtPg3Sc1I8CC');
    this.getSum('txtPg3Sc1I8CA,txtPg3Sc1I8CB,txtPg3Sc1I8CC', 'txtPg3Sc1I8CD');
    this.computePg3Sc1I9();
    this.set("hidden", 0);
  }
  computePg3Sc1I9(): void {
    this.getSum('txtPg3Sc1I6CA,txtPg3Sc1I7CA,txtPg3Sc1I8CA', 'txtPg3Sc1I9CA');
    this.getSum('txtPg3Sc1I6CB,txtPg3Sc1I7CB,txtPg3Sc1I8CB', 'txtPg3Sc1I9CB');
    this.getSum('txtPg3Sc1I6CC,txtPg3Sc1I7CC,txtPg3Sc1I8CC', 'txtPg3Sc1I9CC');
    this.getSum('txtPg3Sc1I6CD,txtPg3Sc1I7CD,txtPg3Sc1I8CD', 'txtPg3Sc1I9CD');
    this.computePg3Sc1I10();
  }
  computePg3Sc1I10(): void {
    this.getDifference('txtPg3Sc1I5CA', 'txtPg3Sc1I9CA', 'txtPg3Sc1I10CA');
    this.getDifference('txtPg3Sc1I5CB', 'txtPg3Sc1I9CB', 'txtPg3Sc1I10CB');
    this.getDifference('txtPg3Sc1I5CC', 'txtPg3Sc1I9CC', 'txtPg3Sc1I10CC');
    this.getDifference('txtPg3Sc1I5CD', 'txtPg3Sc1I9CD', 'txtPg3Sc1I10CD');
    this.computePg3Sc1I12();
    this.computePg3Sc2I1()
  }
  computePg3Sc1I12(): void {
    if (this.totalSP === 0) {
    let atcSelectedIndex = Number(this.g("txtATCSelectedIndex"));
    if (atcSelectedIndex > -1) {
    // $_Id(...).options[i].selected = true — the rebuilt drop-down's option at the stored index
    this.set("drpPg3Sc1I11CB", this.drpOption[atcSelectedIndex] ?? this.g("drpPg3Sc1I11CB"));
    this.set("txtATCSelectedIndex", "-1");
    }
    }
    let pg3Sc1I10Special = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I10CB"))),
    pg3Sc1I10Regular = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I10CC"))),
    drpPg1I5ATCR2Value = this.g("drpPg1I5ATCR2"),
    isIC080IC190IC191 = (drpPg1I5ATCR2Value === "IC080") || (drpPg1I5ATCR2Value === "IC190") || (drpPg1I5ATCR2Value === "IC191");
    let specialTaxRateLegalBasis = this.g("txtPg2Pt4I32CB").toUpperCase().replace(/[\. ]/g, '');
    let legalBasisRA10693 = ["RA10693", "10693", "R.A.10693", "RA.10693", "R.A10693", "RA 10693", "R.A. 10693", "RA. 10693", "R.A 10693"];
    let isRA10693 = (legalBasisRA10693.includes(specialTaxRateLegalBasis));
    if (this.totalSP === 0) {
    if (!!this.tempVarForSc1I12) {
    this.product("txtPg3Sc1I5CB", "drpPg3Sc1I11CB", "txtPg3Sc1I12CB");
    }
    else if (!!isIC080IC190IC191) {
    this.product("txtPg3Sc1I1CB", "drpPg3Sc1I11CB", "txtPg3Sc1I12CB");
    }
    else if (!!isRA10693) {
    this.product("txtPg3Sc1I1CB", "drpPg3Sc1I11CB", "txtPg3Sc1I12CB");
    }
    else {
    if (pg3Sc1I10Special > 0) {
    this.product("txtPg3Sc1I10CB", "drpPg3Sc1I11CB", "txtPg3Sc1I12CB");
    }
    else {
    this.set("txtPg3Sc1I12CB", "0");
    }
    }
    }
    else {
    let pg1mScBI12SP = 0;
    let spArray = this.noAttachment();
    for (let i = 0; i < spArray.length; i++) {
    pg1mScBI12SP += (isNaN(NumWithComma(NumWithParenthesis(spArray[i]!.value))) ? 0 : NumWithComma(NumWithParenthesis(spArray[i]!.value)));
    }
    this.set("hidden", NegativeValue(formatCurrencyWOC(pg1mScBI12SP)));
    this.getSum('hidden', 'txtPg3Sc1I12CB');
    }
    if (pg3Sc1I10Regular > 0) {
    this.product('txtPg3Sc1I10CC', 'hidden30', 'txtPg3Sc1I12CC');
    }
    else {
    this.set("txtPg3Sc1I12CC", "0");
    }
    this.getSum('txtPg3Sc1I12CB,txtPg3Sc1I12CC', 'txtPg3Sc1I12CD');
    this.computePg3Sc1I14();
    this.computePg3Sc1I16();
  }
  computePg3Sc1I13(): void {
    this.getSum('txtPg3Sc1I13CB,txtPg3Sc1I13CC', 'txtPg3Sc1I13CD');
    this.computePg3Sc1I14();
    this.computePg3Sc2I4();
  }
  computePg3Sc1I14(): void {
    this.getDifference('txtPg3Sc1I12CB', 'txtPg3Sc1I13CB', 'txtPg3Sc1I14CB');
    this.getSum('txtPg3Sc1I12CC', 'txtPg3Sc1I14CC');
    this.getSum('txtPg3Sc1I14CB,txtPg3Sc1I14CC', 'txtPg3Sc1I14CD');
    this.computePg3Sc1I16();
  }
  computePg3Sc1I15(): void {
    if (NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I5CC"))) > 0 && !!this.chk.chkPg1I5ATCR1) {
    this.set("hidden", "0.02");
    this.product('txtPg3Sc1I5CC', 'hidden', 'txtPg3Sc1I15CC');
    }
    else {
    this.set("txtPg3Sc1I15CC", 0);
    }
    this.set("hidden", 0); // Revert to 0
    this.getSum('txtPg3Sc1I15CC', 'txtPg3Sc1I15CD');
    this.computePg3Sc1I16();
  }
  computePg3Sc1I16(): void {
    this.set("txtPg3Sc1I16CB", this.g("txtPg3Sc1I14CB"));
    let item12C = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I12CC")));
    let item15C = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I15CC")));
    if (item12C > item15C) {
    this.set("txtPg3Sc1I16CC", NegativeValue(formatCurrencyWOC(item12C)));
    } else {
    this.set("txtPg3Sc1I16CC", NegativeValue(formatCurrencyWOC(item15C)));
    }
    this.getSum('txtPg3Sc1I16CB,txtPg3Sc1I16CC', 'txtPg3Sc1I16CD');
    this.computePg2Pt5I37();
    this.computePg3Sc2I4();
  }
  computePg3Sc2I1(): void {
    this.set("hidden", "0.02");
    let isSubjectToMCIT = !!this.chk.chkPg1I5ATCR1;
    let exemptSc1I10 = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I10CA")));
    let exemptSc1I5 = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I5CA")));
    if (exemptSc1I10 >= 0) {
    this.product('txtPg3Sc1I10CA', 'hidden30', 'txtPg3Sc2I1CA');
    }
    else {
    this.set("txtPg3Sc2I1CA", 0);
    }
    let specialSc1I10 = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I10CB")));
    let specialSc1I5 = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I5CB")));
    if (specialSc1I10 >= 0) {
    this.product('txtPg3Sc1I10CB', 'hidden30', 'txtPg3Sc2I1CB');
    }
    else {
    this.set("txtPg3Sc2I1CB", 0);
    }
    this.getSum('txtPg3Sc2I1CA,txtPg3Sc2I1CB,txtPg3Sc2I1CC', 'txtPg3Sc2I1CD');
    this.computePg3Sc2I3();
    this.set("hidden", 0);
  }
  computePg3Sc2I2(): void {
    this.product('txtPg6Sc6I5CA', 'hidden30', 'txtPg3Sc2I2CA');
    this.product('txtPg6Sc6I5CB', 'hidden30', 'txtPg3Sc2I2CB');
    this.product('txtPg6Sc6I5CC', 'hidden30', 'txtPg3Sc2I2CC');
    this.getSum('txtPg3Sc2I2CA,txtPg3Sc2I2CB,txtPg3Sc2I2CC', 'txtPg3Sc2I2CD');
    this.computePg3Sc2I3();
  }
  computePg3Sc2I3(): void {
    this.getSum('txtPg3Sc2I1CA,txtPg3Sc2I2CA', 'txtPg3Sc2I3CA');
    this.getSum('txtPg3Sc2I1CB,txtPg3Sc2I2CB', 'txtPg3Sc2I3CB');
    this.getSum('txtPg3Sc2I1CC,txtPg3Sc2I2CC', 'txtPg3Sc2I3CC');
    this.getSum('txtPg3Sc2I1CD,txtPg3Sc2I2CD', 'txtPg3Sc2I3CD');
    this.computePg3Sc2I5();
  }
  computePg3Sc2I4(): void {
    this.getSum('txtPg3Sc1I16CB', 'txtPg3Sc2I4CB');
    this.getSum('txtPg3Sc2I4CB,txtPg3Sc2I4CC', 'txtPg3Sc2I4CD');
    this.computePg3Sc2I5();
  }
  computePg3Sc2I5(): void {
    this.getDifference('txtPg3Sc2I3CA', 'txtPg3Sc2I4CA', 'txtPg3Sc2I5CA');
    this.getDifference('txtPg3Sc2I3CB', 'txtPg3Sc2I4CB', 'txtPg3Sc2I5CB');
    this.getDifference('txtPg3Sc2I3CC', 'txtPg3Sc2I4CC', 'txtPg3Sc2I5CC');
    this.getDifference('txtPg3Sc2I3CD', 'txtPg3Sc2I4CD', 'txtPg3Sc2I5CD');
    this.computePg3Sc2I7();
  }
  computePg3Sc2I6(): void {
    this.getSum('txtPg7Sc8I10CA', 'txtPg3Sc2I6CA');
    this.getSum('txtPg7Sc8I10CB', 'txtPg3Sc2I6CB');
    this.getSum('txtPg7Sc8I10CC', 'txtPg3Sc2I6CC');
    this.getSum('txtPg3Sc2I6CA,txtPg3Sc2I6CB,txtPg3Sc2I6CC', 'txtPg3Sc2I6CD');
    this.computePg3Sc2I7();
  }
  computePg3Sc2I7(): void {
    this.getSum('txtPg3Sc2I5CA,txtPg3Sc2I6CA', 'txtPg3Sc2I7CA');
    this.getSum('txtPg3Sc2I5CB,txtPg3Sc2I6CB', 'txtPg3Sc2I7CB');
    this.getSum('txtPg3Sc2I5CC,txtPg3Sc2I6CC', 'txtPg3Sc2I7CC');
    this.getSum('txtPg3Sc2I5CD,txtPg3Sc2I6CD', 'txtPg3Sc2I7CD');
  }
  computePg4Sc3I4(): void {
    this.getSum('txtPg4Sc3I1CA,txtPg4Sc3I2CA,txtPg4Sc3I3CA', 'txtPg4Sc3I4CA');
    this.getSum('txtPg4Sc3I1CB,txtPg4Sc3I2CB,txtPg4Sc3I3CB', 'txtPg4Sc3I4CB');
    this.getSum('txtPg4Sc3I1CC,txtPg4Sc3I2CC,txtPg4Sc3I3CC', 'txtPg4Sc3I4CC');
    this.getSum('txtPg4Sc3I1CD,txtPg4Sc3I2CD,txtPg4Sc3I3CD', 'txtPg4Sc3I4CD');
    this.computePg4Sc3I6();
  }
  computePg4Sc3I6(): void {
    this.getDifference('txtPg4Sc3I4CA', 'txtPg4Sc3I5CA', 'txtPg4Sc3I6CA');
    this.getDifference('txtPg4Sc3I4CB', 'txtPg4Sc3I5CB', 'txtPg4Sc3I6CB');
    this.getDifference('txtPg4Sc3I4CC', 'txtPg4Sc3I5CC', 'txtPg4Sc3I6CC');
    this.getDifference('txtPg4Sc3I4CD', 'txtPg4Sc3I5CD', 'txtPg4Sc3I6CD');
    this.computePg3Sc1I1();
  }
  computePg4Sc3AI3(): void {
    this.getSum('txtPg4Sc3AI1CA,txtPg4Sc3AI2CA', 'txtPg4Sc3AI3CA');
    this.getSum('txtPg4Sc3AI1CB,txtPg4Sc3AI2CB', 'txtPg4Sc3AI3CB');
    this.getSum('txtPg4Sc3AI1CC,txtPg4Sc3AI2CC', 'txtPg4Sc3AI3CC');
    this.getSum('txtPg4Sc3AI1CD,txtPg4Sc3AI2CD', 'txtPg4Sc3AI3CD');
    this.computePg4Sc3AI5();
  }
  computePg4Sc3AI5(): void {
    this.getDifference('txtPg4Sc3AI3CA', 'txtPg4Sc3AI4CA', 'txtPg4Sc3AI5CA');
    this.getDifference('txtPg4Sc3AI3CB', 'txtPg4Sc3AI4CB', 'txtPg4Sc3AI5CB');
    this.getDifference('txtPg4Sc3AI3CC', 'txtPg4Sc3AI4CC', 'txtPg4Sc3AI5CC');
    this.getDifference('txtPg4Sc3AI3CD', 'txtPg4Sc3AI4CD', 'txtPg4Sc3AI5CD');
    this.computePg4Sc3CI27();
  }
  computePg4Sc3BI8(): void {
    this.getSum('txtPg4Sc3BI6CA,txtPg4Sc3BI7CA', 'txtPg4Sc3BI8CA');
    this.getSum('txtPg4Sc3BI6CB,txtPg4Sc3BI7CB', 'txtPg4Sc3BI8CB');
    this.getSum('txtPg4Sc3BI6CC,txtPg4Sc3BI7CC', 'txtPg4Sc3BI8CC');
    this.getSum('txtPg4Sc3BI6CD,txtPg4Sc3BI7CD', 'txtPg4Sc3BI8CD');
    this.computePg4Sc3BI10();
  }
  computePg4Sc3BI10(): void {
    this.getDifference('txtPg4Sc3BI8CA', 'txtPg4Sc3BI9CA', 'txtPg4Sc3BI10CA');
    this.getDifference('txtPg4Sc3BI8CB', 'txtPg4Sc3BI9CB', 'txtPg4Sc3BI10CB');
    this.getDifference('txtPg4Sc3BI8CC', 'txtPg4Sc3BI9CC', 'txtPg4Sc3BI10CC');
    this.getDifference('txtPg4Sc3BI8CD', 'txtPg4Sc3BI9CD', 'txtPg4Sc3BI10CD');
    this.computePg4Sc3BI13();
  }
  computePg4Sc3BI13(): void {
    this.getSum('txtPg4Sc3BI10CA,txtPg4Sc3BI11CA,txtPg4Sc3BI12CA', 'txtPg4Sc3BI13CA');
    this.getSum('txtPg4Sc3BI10CB,txtPg4Sc3BI11CB,txtPg4Sc3BI12CB', 'txtPg4Sc3BI13CB');
    this.getSum('txtPg4Sc3BI10CC,txtPg4Sc3BI11CC,txtPg4Sc3BI12CC', 'txtPg4Sc3BI13CC');
    this.getSum('txtPg4Sc3BI10CD,txtPg4Sc3BI11CD,txtPg4Sc3BI12CD', 'txtPg4Sc3BI13CD');
    this.computePg4Sc3BI16();
  }
  computePg4Sc3BI16(): void {
    this.getDifference('txtPg4Sc3BI13CA,txtPg4Sc3BI14CA', 'txtPg4Sc3BI15CA', 'txtPg4Sc3BI16CA');
    this.getDifference('txtPg4Sc3BI13CB,txtPg4Sc3BI14CB', 'txtPg4Sc3BI15CB', 'txtPg4Sc3BI16CB');
    this.getDifference('txtPg4Sc3BI13CC,txtPg4Sc3BI14CC', 'txtPg4Sc3BI15CC', 'txtPg4Sc3BI16CC');
    this.getDifference('txtPg4Sc3BI13CD,txtPg4Sc3BI14CD', 'txtPg4Sc3BI15CD', 'txtPg4Sc3BI16CD');
    this.computePg4Sc3BI19();
  }
  computePg4Sc3BI19(): void {
    this.getDifference('txtPg4Sc3BI16CA,txtPg4Sc3BI17CA', 'txtPg4Sc3BI18CA', 'txtPg4Sc3BI19CA');
    this.getDifference('txtPg4Sc3BI16CB,txtPg4Sc3BI17CB', 'txtPg4Sc3BI18CB', 'txtPg4Sc3BI19CB');
    this.getDifference('txtPg4Sc3BI16CC,txtPg4Sc3BI17CC', 'txtPg4Sc3BI18CC', 'txtPg4Sc3BI19CC');
    this.getDifference('txtPg4Sc3BI16CD,txtPg4Sc3BI17CD', 'txtPg4Sc3BI18CD', 'txtPg4Sc3BI19CD');
    this.computePg4Sc3CI27();
  }
  computePg4Sc3CI26(): void {
    this.getSum('txtPg4Sc3CI20CA,txtPg4Sc3CI21CA,txtPg4Sc3CI22CA,txtPg4Sc3CI23CA,txtPg4Sc3CI24CA,txtPg4Sc3CI25CA', 'txtPg4Sc3CI26CA');
    this.getSum('txtPg4Sc3CI20CB,txtPg4Sc3CI21CB,txtPg4Sc3CI22CB,txtPg4Sc3CI23CB,txtPg4Sc3CI24CB,txtPg4Sc3CI25CB', 'txtPg4Sc3CI26CB');
    this.getSum('txtPg4Sc3CI20CC,txtPg4Sc3CI21CC,txtPg4Sc3CI22CC,txtPg4Sc3CI23CC,txtPg4Sc3CI24CC,txtPg4Sc3CI25CC', 'txtPg4Sc3CI26CC');
    this.getSum('txtPg4Sc3CI20CD,txtPg4Sc3CI21CD,txtPg4Sc3CI22CD,txtPg4Sc3CI23CD,txtPg4Sc3CI24CD,txtPg4Sc3CI25CD', 'txtPg4Sc3CI26CD');
    this.computePg4Sc3CI27();
  }
  computePg4Sc3CI27(): void {
    this.getSum('txtPg4Sc3AI5CA,txtPg4Sc3BI19CA,txtPg4Sc3CI26CA', 'txtPg4Sc3CI27CA');
    this.getSum('txtPg4Sc3AI5CB,txtPg4Sc3BI19CB,txtPg4Sc3CI26CB', 'txtPg4Sc3CI27CB');
    this.getSum('txtPg4Sc3AI5CC,txtPg4Sc3BI19CC,txtPg4Sc3CI26CC', 'txtPg4Sc3CI27CC');
    this.getSum('txtPg4Sc3AI5CD,txtPg4Sc3BI19CD,txtPg4Sc3CI26CD', 'txtPg4Sc3CI27CD');
    this.computePg3Sc1I2();
  }
  computePg5Sc4I4(): void {
    this.getSum('txtPg5Sc4I1CA,txtPg5Sc4I2CA,txtPg5Sc4I3CA', 'txtPg5Sc4I4CA');
    this.getSum('txtPg5Sc4I1CB,txtPg5Sc4I2CB,txtPg5Sc4I3CB', 'txtPg5Sc4I4CB');
    this.getSum('txtPg5Sc4I1CC,txtPg5Sc4I2CC,txtPg5Sc4I3CC', 'txtPg5Sc4I4CC');
    this.getSum('txtPg5Sc4I1CD,txtPg5Sc4I2CD,txtPg5Sc4I3CD', 'txtPg5Sc4I4CD');
    this.computePg3Sc1I4();
  }
  computePg6Sc5I40(): void {
    this.getSum('txtPg5Sc5I1CA,txtPg5Sc5I2CA,txtPg5Sc5I3CA,txtPg5Sc5I4CA,txtPg5Sc5I5CA,txtPg5Sc5I6CA,txtPg5Sc5I7CA,txtPg5Sc5I8CA,txtPg5Sc5I9CA,txtPg5Sc5I10CA,txtPg5Sc5I11CA,txtPg5Sc5I12CA,txtPg5Sc5I13CA,txtPg5Sc5I14CA,txtPg5Sc5I15CA,txtPg5Sc5I16CA,txtPg5Sc5I17CA,txtPg5Sc5I18CA,txtPg5Sc5I19CA,txtPg5Sc5I20CA,txtPg5Sc5I21CA,txtPg5Sc5I22CA,txtPg5Sc5I23CA,txtPg5Sc5I24CA,txtPg5Sc5I25CA,txtPg5Sc5I26CA,txtPg5Sc5I27CA,txtPg5Sc5I28CA,txtPg5Sc5I29CA,txtPg5Sc5I30CA,txtPg5Sc5I31CA,txtPg5Sc5I32CA,txtPg5Sc5I33CA,txtPg5Sc5I34CA,txtPg5Sc5I35CA,txtPg6Sc5I36CA,txtPg6Sc5I37CA,txtPg6Sc5I38CA,txtPg6Sc5I39CA', 'txtPg6Sc5I40CA');
    this.getSum('txtPg5Sc5I1CB,txtPg5Sc5I2CB,txtPg5Sc5I3CB,txtPg5Sc5I4CB,txtPg5Sc5I5CB,txtPg5Sc5I6CB,txtPg5Sc5I7CB,txtPg5Sc5I8CB,txtPg5Sc5I9CB,txtPg5Sc5I10CB,txtPg5Sc5I11CB,txtPg5Sc5I12CB,txtPg5Sc5I13CB,txtPg5Sc5I14CB,txtPg5Sc5I15CB,txtPg5Sc5I16CB,txtPg5Sc5I17CB,txtPg5Sc5I18CB,txtPg5Sc5I19CB,txtPg5Sc5I20CB,txtPg5Sc5I21CB,txtPg5Sc5I22CB,txtPg5Sc5I23CB,txtPg5Sc5I24CB,txtPg5Sc5I25CB,txtPg5Sc5I26CB,txtPg5Sc5I27CB,txtPg5Sc5I28CB,txtPg5Sc5I29CB,txtPg5Sc5I30CB,txtPg5Sc5I31CB,txtPg5Sc5I32CB,txtPg5Sc5I33CB,txtPg5Sc5I34CB,txtPg5Sc5I35CB,txtPg6Sc5I36CB,txtPg6Sc5I37CB,txtPg6Sc5I38CB,txtPg6Sc5I39CB', 'txtPg6Sc5I40CB');
    this.getSum('txtPg5Sc5I1CC,txtPg5Sc5I2CC,txtPg5Sc5I3CC,txtPg5Sc5I4CC,txtPg5Sc5I5CC,txtPg5Sc5I6CC,txtPg5Sc5I7CC,txtPg5Sc5I8CC,txtPg5Sc5I9CC,txtPg5Sc5I10CC,txtPg5Sc5I11CC,txtPg5Sc5I12CC,txtPg5Sc5I13CC,txtPg5Sc5I14CC,txtPg5Sc5I15CC,txtPg5Sc5I16CC,txtPg5Sc5I17CC,txtPg5Sc5I18CC,txtPg5Sc5I19CC,txtPg5Sc5I20CC,txtPg5Sc5I21CC,txtPg5Sc5I22CC,txtPg5Sc5I23CC,txtPg5Sc5I24CC,txtPg5Sc5I25CC,txtPg5Sc5I26CC,txtPg5Sc5I27CC,txtPg5Sc5I28CC,txtPg5Sc5I29CC,txtPg5Sc5I30CC,txtPg5Sc5I31CC,txtPg5Sc5I32CC,txtPg5Sc5I33CC,txtPg5Sc5I34CC,txtPg5Sc5I35CC,txtPg6Sc5I36CC,txtPg6Sc5I37CC,txtPg6Sc5I38CC,txtPg6Sc5I39CC', 'txtPg6Sc5I40CC');
    this.getSum('txtPg5Sc5I1CD,txtPg5Sc5I2CD,txtPg5Sc5I3CD,txtPg5Sc5I4CD,txtPg5Sc5I5CD,txtPg5Sc5I6CD,txtPg5Sc5I7CD,txtPg5Sc5I8CD,txtPg5Sc5I9CD,txtPg5Sc5I10CD,txtPg5Sc5I11CD,txtPg5Sc5I12CD,txtPg5Sc5I13CD,txtPg5Sc5I14CD,txtPg5Sc5I15CD,txtPg5Sc5I16CD,txtPg5Sc5I17CD,txtPg5Sc5I18CD,txtPg5Sc5I19CD,txtPg5Sc5I20CD,txtPg5Sc5I21CD,txtPg5Sc5I22CD,txtPg5Sc5I23CD,txtPg5Sc5I24CD,txtPg5Sc5I25CD,txtPg5Sc5I26CD,txtPg5Sc5I27CD,txtPg5Sc5I28CD,txtPg5Sc5I29CD,txtPg5Sc5I30CD,txtPg5Sc5I31CD,txtPg5Sc5I32CD,txtPg5Sc5I33CD,txtPg5Sc5I34CD,txtPg5Sc5I35CD,txtPg6Sc5I36CD,txtPg6Sc5I37CD,txtPg6Sc5I38CD,txtPg6Sc5I39CD', 'txtPg6Sc5I40CD');
    this.computePg3Sc1I6();
  }
  computePg6Sc6I5(): void {
    this.getSum('txtPg6Sc6I1CA,txtPg6Sc6I2CA,txtPg6Sc6I3CA,txtPg6Sc6I4CA', 'txtPg6Sc6I5CA');
    this.getSum('txtPg6Sc6I1CB,txtPg6Sc6I2CB,txtPg6Sc6I3CB,txtPg6Sc6I4CB', 'txtPg6Sc6I5CB');
    this.getSum('txtPg6Sc6I1CC,txtPg6Sc6I2CC,txtPg6Sc6I3CC,txtPg6Sc6I4CC', 'txtPg6Sc6I5CC');
    this.getSum('txtPg6Sc6I1CD,txtPg6Sc6I2CD,txtPg6Sc6I3CD,txtPg6Sc6I4CD', 'txtPg6Sc6I5CD');
    this.computePg3Sc1I7();
  }
  computePg6Sc7I3(): void {
    this.getDifference('txtPg6Sc7I1', 'txtPg6Sc7I2', 'txtPg6Sc7I3');
    this.computePg6Sc7AI4();
  }
  computePg6Sc7AI4(): void {
    this.set("txtPg6Sc7AI4year", 2000 + Number(this.g("txtPg1I2YearEnd")));
    let netLoss = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7I3")));
    if (netLoss < 0) {
    this.set("txtPg6Sc7AI4CA", formatCurrencyWOC(Math.abs(netLoss)));
    }
    else {
    this.set("txtPg6Sc7AI4CA", 0);
    }
    this.computePg6Sc7AI4CE();
  }
  computePg6Sc7AI4CE(): void {
    this.getDifference('txtPg6Sc7AI4CA', 'txtPg6Sc7AI4CB,txtPg6Sc7AI4CC,txtPg6Sc7AI4CD', 'txtPg6Sc7AI4CE');
  }
  computePg6Sc7AI5CE(elem: string): void {
    let columnA = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7AI5CA")));
    let columnD = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7AI5CD")));
    let totalBCD = this.getSum("txtPg6Sc7AI5CB,txtPg6Sc7AI5CC,txtPg6Sc7AI5CD", "hidden");
    if (totalBCD > columnA) {
    this.set("txtPg6Sc7AI5CB", 0);
    this.set("txtPg6Sc7AI5CC", 0);
    this.set("txtPg6Sc7AI5CD", 0);
    }
    else if (columnD > columnA) {
    this.set("txtPg6Sc7AI5CD", 0);
    }
    else {
    this.getDifference('txtPg6Sc7AI5CA', 'txtPg6Sc7AI5CB,txtPg6Sc7AI5CC,txtPg6Sc7AI5CD', 'txtPg6Sc7AI5CE');
    }
    this.set("hidden", 0);
  }
  computePg6Sc7AI6CE(elem: string): void {
    let columnA = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7AI6CA")));
    let columnD = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7AI6CD")));
    let totalBCD = this.getSum("txtPg6Sc7AI6CB,txtPg6Sc7AI6CC,txtPg6Sc7AI6CD", "hidden");
    if (columnD > columnA) {
    this.set("txtPg6Sc7AI6CD", 0);
    }
    else if (totalBCD > columnA) {
    this.set("txtPg6Sc7AI6CB", 0);
    this.set("txtPg6Sc7AI6CC", 0);
    this.set("txtPg6Sc7AI6CD", 0);
    }
    else {
    this.getDifference('txtPg6Sc7AI6CA', 'txtPg6Sc7AI6CB,txtPg6Sc7AI6CC,txtPg6Sc7AI6CD', 'txtPg6Sc7AI6CE');
    }
    this.set("hidden", 0);
  }
  computePg6Sc7AI7CE(elem: string): void {
    let columnA = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7AI7CA")));
    let columnD = NumWithComma(NumWithParenthesis(this.g("txtPg6Sc7AI7CD")));
    let totalBCD = this.getSum("txtPg6Sc7AI7CB,txtPg6Sc7AI7CC,txtPg6Sc7AI7CD", "hidden");
    if (columnD > columnA) {
    this.set("txtPg6Sc7AI7CD", 0);
    }
    else if (totalBCD > columnA) {
    this.set("txtPg6Sc7AI7CB", 0);
    this.set("txtPg6Sc7AI7CC", 0);
    this.set("txtPg6Sc7AI7CD", 0);
    }
    else {
    this.getDifference('txtPg6Sc7AI7CA', 'txtPg6Sc7AI7CB,txtPg6Sc7AI7CC,txtPg6Sc7AI7CD', 'txtPg6Sc7AI7CE');
    }
    this.set("hidden", 0);
  }
  computePg6Sc7AI8(): void {
    this.getSum('txtPg6Sc7AI4CD,txtPg6Sc7AI5CD,txtPg6Sc7AI6CD,txtPg6Sc7AI7CD', 'txtPg6Sc7AI8');
    this.computePg3Sc1I8();
  }
  computePg6Sc8I4CD(): void {
    this.getSum('txtPg6Sc8I4CA,txtPg6Sc8I4CB,txtPg6Sc8I4CC', 'txtPg6Sc8I4CD');
    this.computePg7Sc8I13();
  }
  computePg7Sc8I13(): void {
    this.getSum('txtPg6Sc8I1CA,txtPg6Sc8I2CA,txtPg6Sc8I3CA,txtPg6Sc8I4CA,txtPg6Sc8I5CA,txtPg6Sc8I6CA,txtPg7Sc8I7CA,txtPg7Sc8I8CA,txtPg7Sc8I9CA,txtPg7Sc8I10CA,txtPg7Sc8I11CA,txtPg7Sc8I12CA', 'txtPg7Sc8I13CA,txtPg2Pt5I38CA');
    this.getSum('txtPg6Sc8I1CB,txtPg6Sc8I2CB,txtPg6Sc8I3CB,txtPg6Sc8I4CB,txtPg6Sc8I5CB,txtPg6Sc8I6CB,txtPg7Sc8I7CB,txtPg7Sc8I8CB,txtPg7Sc8I9CB,txtPg7Sc8I10CB,txtPg7Sc8I11CB,txtPg7Sc8I12CB', 'txtPg7Sc8I13CB,txtPg2Pt5I38CB');
    this.getSum('txtPg6Sc8I1CC,txtPg6Sc8I2CC,txtPg6Sc8I3CC,txtPg6Sc8I4CC,txtPg6Sc8I5CC,txtPg6Sc8I6CC,txtPg7Sc8I7CC,txtPg7Sc8I8CC,txtPg7Sc8I9CC,txtPg7Sc8I10CC,txtPg7Sc8I11CC,txtPg7Sc8I12CC', 'txtPg7Sc8I13CC,txtPg2Pt5I38CC');
    this.getSum('txtPg6Sc8I1CD,txtPg6Sc8I2CD,txtPg6Sc8I3CD,txtPg6Sc8I4CD,txtPg6Sc8I5CD,txtPg6Sc8I6CD,txtPg7Sc8I7CD,txtPg7Sc8I8CD,txtPg7Sc8I9CD,txtPg7Sc8I10CD,txtPg7Sc8I11CD,txtPg7Sc8I12CD', 'txtPg7Sc8I13CD,txtPg2Pt5I38CD,txtPg1Pt2I17LessTotalTax');
    this.computePg1Pt2I18();
    this.computePg2Pt5I39();
  }
  computePg7Sc9I1CC(): void {
    this.getDifference('txtPg7Sc9I1CB', 'txtPg7Sc9I1CA', 'txtPg7Sc9I1CC');
    let cValue = NumWithComma(NumWithParenthesis(this.g("txtPg7Sc9I1CC")));
    if (cValue < 0) {
    this.set("txtPg7Sc9I1CC", 0);
    }
  }
  computePg7Sc9I2CC(): void {
    this.getDifference('txtPg7Sc9I2CB', 'txtPg7Sc9I2CA', 'txtPg7Sc9I2CC');
    let cValue = NumWithComma(NumWithParenthesis(this.g("txtPg7Sc9I2CC")));
    if (cValue < 0) {
    this.set("txtPg7Sc9I2CC", 0);
    }
  }
  computePg7Sc9I3CC(): void {
    this.getDifference('txtPg7Sc9I3CB', 'txtPg7Sc9I3CA', 'txtPg7Sc9I3CC');
    let cValue = NumWithComma(NumWithParenthesis(this.g("txtPg7Sc9I3CC")));
    if (cValue < 0) {
    this.set("txtPg7Sc9I3CC", 0);
    }
  }
  computePg7Sc9I1CG(): void {
    this.getDifference('txtPg7Sc9I1CC', 'txtPg7Sc9I1CD,txtPg7Sc9I1CE,txtPg7Sc9I1CF', 'txtPg7Sc9I1CG');
    let gValue = NumWithComma(NumWithParenthesis(this.g("txtPg7Sc9I1CG")));
    if (gValue < 0) {
    this.set("txtPg7Sc9I1CG", 0);
    }
  }
  computePg7Sc9I2CG(): void {
    this.getDifference('txtPg7Sc9I2CC', 'txtPg7Sc9I2CD,txtPg7Sc9I2CE,txtPg7Sc9I2CF', 'txtPg7Sc9I2CG');
    let gValue = NumWithComma(NumWithParenthesis(this.g("txtPg7Sc9I2CG")));
    if (gValue < 0) {
    this.set("txtPg7Sc9I2CG", 0);
    }
  }
  computePg7Sc9I3CG(): void {
    this.getDifference('txtPg7Sc9I3CC', 'txtPg7Sc9I3CD,txtPg7Sc9I3CE,txtPg7Sc9I3CF', 'txtPg7Sc9I3CG');
    let gValue = NumWithComma(NumWithParenthesis(this.g("txtPg7Sc9I3CG")));
    if (gValue < 0) {
    this.set("txtPg7Sc9I3CG", 0);
    }
  }
  computePg7Sc9I4(): void {
    this.getSum('txtPg7Sc9I1CF,txtPg7Sc9I2CF,txtPg7Sc9I3CF', 'txtPg7Sc9I4,txtPg6Sc8I4CC');
    this.computePg6Sc8I4CD();
  }
  computePg7Sc10I4(): void {
    this.getSum('txtPg7Sc10I1CA,txtPg7Sc10I2CA,txtPg7Sc10I3CA', 'txtPg7Sc10I4CA');
    this.getSum('txtPg7Sc10I1CB,txtPg7Sc10I2CB,txtPg7Sc10I3CB', 'txtPg7Sc10I4CB');
    this.getSum('txtPg7Sc10I1CC,txtPg7Sc10I2CC,txtPg7Sc10I3CC', 'txtPg7Sc10I4CC');
    this.getSum('txtPg7Sc10I1CD,txtPg7Sc10I2CD,txtPg7Sc10I3CD', 'txtPg7Sc10I4CD');
    this.computePg7Sc10I10();
  }
  computePg7Sc10I9(): void {
    this.getSum('txtPg7Sc10I5CA,txtPg7Sc10I6CA,txtPg7Sc10I7CA,txtPg7Sc10I8CA', 'txtPg7Sc10I9CA');
    this.getSum('txtPg7Sc10I5CB,txtPg7Sc10I6CB,txtPg7Sc10I7CB,txtPg7Sc10I8CB', 'txtPg7Sc10I9CB');
    this.getSum('txtPg7Sc10I5CC,txtPg7Sc10I6CC,txtPg7Sc10I7CC,txtPg7Sc10I8CC', 'txtPg7Sc10I9CC');
    this.getSum('txtPg7Sc10I5CD,txtPg7Sc10I6CD,txtPg7Sc10I7CD,txtPg7Sc10I8CD', 'txtPg7Sc10I9CD');
    this.computePg7Sc10I10();
  }
  computePg7Sc10I10(): void {
    this.getDifference('txtPg7Sc10I4CA', 'txtPg7Sc10I9CA', 'txtPg7Sc10I10CA');
    this.getDifference('txtPg7Sc10I4CB', 'txtPg7Sc10I9CB', 'txtPg7Sc10I10CB');
    this.getDifference('txtPg7Sc10I4CC', 'txtPg7Sc10I9CC', 'txtPg7Sc10I10CC');
    this.getDifference('txtPg7Sc10I4CD', 'txtPg7Sc10I9CD', 'txtPg7Sc10I10CD');
  }
  computePg8Sc11I7(): void {
    this.getSum('txtPg8Sc11I1,txtPg8Sc11I2,txtPg8Sc11I3,txtPg8Sc11I4,txtPg8Sc11I5,txtPg8Sc11I6', 'txtPg8Sc11I7');
  }
  computePg8Sc11I12(): void {
    this.getSum('txtPg8Sc11I8,txtPg8Sc11I9,txtPg8Sc11I10,txtPg8Sc11I11', 'txtPg8Sc11I12');
    this.computePg8Sc11I17();
  }
  computePg8Sc11I16(): void {
    this.getSum('txtPg8Sc11I13,txtPg8Sc11I14,txtPg8Sc11I15', 'txtPg8Sc11I16');
    this.computePg8Sc11I17();
  }
  computePg8Sc11I17(): void {
    this.getSum('txtPg8Sc11I12,txtPg8Sc11I16', 'txtPg8Sc11I17');
  }
  enableMCITFields(): void {
    let isSubjectToMCIT = !!this.chk.chkPg1I5ATCR1;
    this.dis.txtPg6Sc8I2CA = !isSubjectToMCIT;
    this.dis.txtPg6Sc8I2CB = !isSubjectToMCIT;
    this.dis.txtPg6Sc8I2CC = !isSubjectToMCIT;
    this.getSum("txtPg6Sc8I2CA,txtPg6Sc8I2CB,txtPg6Sc8I2CC", "txtPg6Sc8I2CD");
    this.dis.txtPg7Sc9I1 = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I1CA = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I1CB = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I1CD = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I1CE = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I1CF = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I2 = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I2CA = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I2CB = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I2CD = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I2CE = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I2CF = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I3 = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I3CA = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I3CB = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I3CD = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I3CE = !isSubjectToMCIT;
    this.dis.txtPg7Sc9I3CF = !isSubjectToMCIT;
    if (!isSubjectToMCIT) {
    this.set("txtPg6Sc8I2CA", "0");
    this.set("txtPg6Sc8I2CB", "0");
    this.set("txtPg6Sc8I2CC", "0");
    this.set("txtPg6Sc8I2CD", "0");
    this.set("txtPg7Sc9I1", "");
    this.set("txtPg7Sc9I1CA", "0");
    this.set("txtPg7Sc9I1CB", "0");
    this.set("txtPg7Sc9I1CD", "0");
    this.set("txtPg7Sc9I1CC", "0");
    this.set("txtPg7Sc9I1CE", "0");
    this.set("txtPg7Sc9I1CF", "0");
    this.set("txtPg7Sc9I2", "");
    this.set("txtPg7Sc9I2CA", "0");
    this.set("txtPg7Sc9I2CB", "0");
    this.set("txtPg7Sc9I2CC", "0");
    this.set("txtPg7Sc9I2CD", "0");
    this.set("txtPg7Sc9I2CE", "0");
    this.set("txtPg7Sc9I2CF", "0");
    this.set("txtPg7Sc9I3", "");
    this.set("txtPg7Sc9I3CA", "0");
    this.set("txtPg7Sc9I3CB", "0");
    this.set("txtPg7Sc9I3CC", "0");
    this.set("txtPg7Sc9I3CD", "0");
    this.set("txtPg7Sc9I3CE", "0");
    this.set("txtPg7Sc9I3CF", "0");;
    }
    this.computePg7Sc9I1CG();
    this.computePg7Sc9I2CG();
    this.computePg7Sc9I3CG();
    this.computePg7Sc9I4();
    this.computePg7Sc8I13()
    this.computePg3Sc2I1();
  }
  checkDateOfIncorporation(): boolean {
    const element = "txtPg1Pt1I8";
    let isValid = true;
    if (!!this.validateDate(element) && (bTrim(this.g(element)) !== "")) {
    let elemValue = this.g(element).split("/");
    const [mm = "1", _dd = "1", yyyy = "1900"] = elemValue;
    let incorpDate = new Date(Number(yyyy), (Number(mm) - 1), Number(_dd));
    let incorpMonth = Number(mm);
    let incorpYear = Number(yyyy);
    let filingMonth = Number(this.g("ddlPg1I2Date"));
    let filingYear = 2000 + Number(this.g("txtPg1I2YearEnd"));
    let filingDate = new Date(filingYear, (filingMonth - 1), 1);
    let elapsedTime = (filingDate.getTime() - incorpDate.getTime()) / 31536000000;
    let filingDateIsEmpty = (((bTrim(this.g("ddlPg1I2Date"))) || (bTrim(this.g("txtPg1I2YearEnd")))) === "");
    if (!filingDateIsEmpty && ((incorpYear > filingYear) || ((incorpMonth > filingMonth) && (incorpYear === filingYear)))) {
    this.set(element, "");
    isValid = false;
    }
    else if (((filingYear - incorpYear) === 4) && (!!this.chk.chkPg1I5ATCR1 === false)) {
    this.chk.chkPg1I5ATCR1 = true;
    }
    else if (((filingYear - incorpYear) < 4) && (!!this.chk.chkPg1I5ATCR1 === true)) {
    this.chk.chkPg1I5ATCR1 = false;
    isValid = false;
    }
    else if ((elapsedTime >= 4) && (!!this.chk.chkPg1I5ATCR1 === false)) {
    this.chk.chkPg1I5ATCR1 = true;
    }
    }
    else if (bTrim(this.g(element)) === "") {
    isValid = false;
    }
    this.computePg3Sc1I15();
    this.enableMCITFields();
    return isValid;
  }
  validateYearEnd(): boolean {
    const element = "txtPg1I2YearEnd";
    let inputYear = 2000 + Number(this.g(element));
    let inputMonth = Number(this.g("ddlPg1I2Date")) - 1;
    let currentDate = new Date();
    let isValid = true;
    if (this.g(element) !== "") {
    if ((!!this.chk.rdoPg1I1Fiscal === true) &&
    (inputYear > currentDate.getFullYear() || (inputMonth > currentDate.getMonth() && inputYear === currentDate.getFullYear()))) {
    this.set(element, "");
    isValid = false;
    }
    else if (!!this.chk.rdoPg1I1Fiscal === true && inputMonth === 11) {
    this.set("ddlPg1I2Date", "");
    isValid = false;
    }
    else if ((inputYear < 2013) || (inputYear <= 2013 && (inputMonth < 8))) {
    if (inputYear < 2013 || !!this.dis.ddlPg1I2Date === true) {
    this.set(element, "");
    }
    else {
    }
    isValid = false;
    }
    else if ((!!this.chk.rdoPg1I1Calendar === true)) {
    if ((!!this.chk.rdoPg1I4ShortPeriodNo === true) && (inputYear >= currentDate.getFullYear())) {
    this.set(element, "");
    isValid = false;
    }
    else if ((!!this.chk.rdoPg1I4ShortPeriodYes === true)) {
    if ((inputYear > currentDate.getFullYear())) {
    this.set(element, "");
    isValid = false;
    }
    else if ((inputYear === currentDate.getFullYear()) && (inputMonth > currentDate.getMonth())) {
    this.set("ddlPg1I2Date", '');
    isValid = false;
    }
    else if ((inputYear === currentDate.getFullYear()) && (inputMonth == 11)) {
    this.set("ddlPg1I2Date", '');
    isValid = false;
    }
    else if (inputMonth < 0) {
    isValid = false;
    }
    }
    }
    this.computePg6Sc7AI4();
    }
    else if (this.g(element) === "") {
    }
    const y = Number(this.g(element));
    if (this.g(element) !== "" && y > -1 && y < 10) {
    this.set(element, "0" + y);
    }
    return isValid;
  }
  checkNullP8Sc12I1toI20Enable(): void {
    for (let i = 1; i < 19; i++) {
    if (bTrim(this.g(`txtPg8Sc12I${i}C1`)) != "") {
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C1');
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C2tin1');
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C2tin2');
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C2tin3');
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C2tin4');
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C3');
    this.enableField('txtPg8Sc12I' + (i + 1) + 'C4');
    }
    }
  }
  verifyselectSchedule12(): void {
    let selectedATC = this.g("drpPg1I5ATCR2");
    if (selectedATC === "IC011") {
    this.dis.radPg8Sc12stockholder = false;
    this.dis.radPg8Sc12partner = true;
    this.dis.radPg8Sc12member = false;
    }
    else if (selectedATC === "IC021") {
    this.dis.radPg8Sc12stockholder = true;
    this.dis.radPg8Sc12partner = false;
    this.dis.radPg8Sc12member = true;
    }
  }
  validateDateOfIssueItem23(): boolean {
    let strmmddyyyy = this.g("txtPg1Pt2I23Date");
    let selectedItem22 = !!(!!this.chk.rdoPg1Pt2I22CTC) ? "CTC" : "SEC";
    let isValid = true;
    let currentDate = new Date();
    let inputDate = new Date();
    let result = strmmddyyyy.split("/");
    if (strmmddyyyy != "") {
    // BIR's month/day compares are JS string-vs-number coercions, written here as Number()
    const [mmRaw = "", ddRaw = "", yyyyRaw = ""] = result;
    const isLeap = new Date(Number(yyyyRaw), 1, 29).getMonth() === 1;
    const month31 = ["01", "03", "05", "07", "08", "10", "12"];
    const month30 = ["04", "06", "09", "11"];
    const month = mmRaw;
    const day = ddRaw;
    if (result.length === 3) {
    if (isNaN(Number(mmRaw || ddRaw || yyyyRaw))) {
    isValid = false;
    }
    else if ((mmRaw.length != 2 || (Number(mmRaw) > 12 || Number(mmRaw) < 1))) {
    isValid = false;
    }
    else if (ddRaw.length != 2 || (Number(ddRaw) > 31 || Number(ddRaw) < 1)) {
    isValid = false;
    }
    else if ((yyyyRaw.length != 4) || (Number(yyyyRaw) < 1800)) {
    isValid = false;
    }
    else if (Number(month) === 2) {
    if (!isLeap && Number(day) === 29) {
    isValid = false;
    }
    else if (!isLeap && Number(day) > 29) {
    isValid = false;
    }
    else if (isLeap && Number(day) > 29) {
    isValid = false;
    }
    }
    else if (month31.includes(month) && Number(day) > 31) {
    isValid = false;
    }
    else if (month30.includes(month) && Number(day) > 30) {
    isValid = false;
    }
    inputDate = new Date(Number(yyyyRaw), Number(month) - 1, Number(day));
    }
    else {
    isValid = false;
    }
    if (!isValid) {
    this.set("txtPg1Pt2I23Date", '');
    }
    else if (inputDate > currentDate) {
    this.set("txtPg1Pt2I23Date", '');
    }
    else if ((result[2] !== currentDate.getFullYear().toString()) && (selectedItem22 === "CTC")) {
    this.set("txtPg1Pt2I23Date", '');
    }
    }
    return isValid;
  }
  validateIssueDateSchedule13(element: string): void {
    if (!!this.validateDate(element) && (bTrim(this.g(element)) !== "")) {
    let issueDate = new Date(this.g(element)),
    filingDate = new Date((2000 + Number(this.g("txtPg1I2YearEnd"))), Number(this.g("ddlPg1I2Date")), 0),
    validDate = new Date((2000 + Number(this.g("txtPg1I2YearEnd"))), Number(this.g("ddlPg1I2Date")), 1),
    filingDateString = "", validDateString = "";
    validDate = new Date(validDate.setMonth(validDate.getMonth() - 12));
    filingDateString = (filingDate.getMonth() + 1) + "/" + filingDate.getDate() + "/" + filingDate.getFullYear();
    validDateString = (validDate.getMonth() + 1) + "/" + validDate.getDate() + "/" + validDate.getFullYear();
    if (issueDate < validDate || issueDate > filingDate) {
    this.set(element, "");
    }
    }
  }
  validatePg1Pt2I22(isFromLoad: string): void {
    let isCTC = !!this.chk.rdoPg1Pt2I22CTC;
    let isSEC = !!this.chk.rdoPg1Pt2I22SEC;
    if (!isFromLoad) {
    // $("input[id$=…]").val("") — every element whose id ends with the suffix
    for (const k of Object.keys(this.v)) if (k.endsWith("txtPg1Pt2I23Date")) this.set(k, "");
    for (const k of Object.keys(this.v)) if (k.endsWith("txtPg1Pt2I22")) this.set(k, "");
    }
    if (!!isCTC) {
    // the maxlength / onkeypress attribute changes are DOM-only; no saved value changes
    this.dis.txtPg1Pt2I25AmountCTC = false;
    }
    else if (!!isSEC) {
    this.set("txtPg1Pt2I25AmountCTC", 0);
    this.dis.txtPg1Pt2I25AmountCTC = true;
    }
  }
  checkPg2Pt6I5051(elem: string): void {
    const item50 = "txtPg2Pt6I50IssueDate";
    const item51 = "txtPg2Pt6I51ExpiryDate";
    const item50value = bTrim(this.g(item50));
    const item51value = bTrim(this.g(item51));
    if (!!this.validateFutureDate(item50) && ((item50value !== "") && (item51value === ""))) {
    const elemValue = this.g(item50).split("/");
    elemValue[2] = String(parseInt(elemValue[2] ?? "0") + 3);
    this.set(item51, elemValue.join("/"));
    if (!this.validateFutureDate(item51, true)) {
    this.set(item50, "");
    this.set(item51, "");
    }
    }
    else if (!!this.validateFutureDate(item51, true) && ((item50value === "") && (item51value !== ""))) {
    this.set(item50, "");
    this.set(item51, "");
    }
    else if ((!!this.validateFutureDate(item50) && !!this.validateFutureDate(item51, true)) && ((item50value !== "") && (item51value !== ""))) {
    // IE's Date#getYear is year-1900; both sides shift equally so getFullYear compares identically
    const issueDate = new Date(this.g(item50));
    const expiryDate = new Date(this.g(item51));
    if (issueDate.getFullYear() >= expiryDate.getFullYear()) {
    this.set(elem, "");
    }
    else if (((expiryDate.getFullYear() - issueDate.getFullYear()) > 3) || ((expiryDate.getMonth() > issueDate.getMonth()) && ((expiryDate.getFullYear() - issueDate.getFullYear()) === 3))) {
    this.set(item51, "");
    }
    }
    if (!this.validateFutureDate(item51, true)) {
    this.set(item51, "");
    }
  }
  computePg9Sc13I19(): void {
    let colA_Pg9Sc13II = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I9CA")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I9CA"))));
    let colB_Pg9Sc13II = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I9CB")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I9CB"))));
    let colA_Pg9Sc13III = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I15CA")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I15CA"))));
    let colB_Pg9Sc13III = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I15CB")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I15CB"))));
    let colA_Pg9Sc13IV = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I18CA")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I18CA"))));
    let colB_Pg9Sc13IV = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I18CB")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc13I18CB"))));
    let total = 0;
    let subtotal1 = (isNaN(NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-I')))) ? 0 : NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-I'))));
    let subtotal2 = (isNaN(NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-II')))) ? 0 : NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-II'))));
    let subtotal3 = (isNaN(NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-III')))) ? 0 : NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-III'))));
    let subtotal4 = (isNaN(NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-IV')))) ? 0 : NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc13-IV'))));
    total = subtotal1 + subtotal2 + subtotal3 + subtotal4 + colA_Pg9Sc13II + colB_Pg9Sc13II + colA_Pg9Sc13III + colB_Pg9Sc13III + colA_Pg9Sc13IV + colB_Pg9Sc13IV;
    this.set("txtPg9Sc13I19", NegativeValue(formatCurrencyWOC(total)));
  }
  computePg9Sc14I8(): void {
    let colA_Pg9Sc14I = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I5CA")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I5CA"))));
    let colB_Pg9Sc14I = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I5CB")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I5CB"))));
    let colA_Pg9Sc14II = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I7CA")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I7CA"))));
    let colB_Pg9Sc14II = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I7CB")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I7CB"))));
    let total = 0;
    let subtotal1 = (isNaN(NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I1")))) ? 0 : NumWithComma(NumWithParenthesis(this.g("txtPg9Sc14I1"))));
    let subtotal2 = (isNaN(NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc14-I')))) ? 0 : NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc14-I'))));
    let subtotal3 = (isNaN(NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc14-II')))) ? 0 : NumWithComma(NumWithParenthesis(this.g('hidden-frm1702MX:txtPg9Sc14-II'))));
    total = subtotal1 + subtotal2 + subtotal3 + colA_Pg9Sc14I + colB_Pg9Sc14I + colA_Pg9Sc14II + colB_Pg9Sc14II;
    this.set("txtPg9Sc14I8", NegativeValue(formatCurrencyWOC(total)));
  }

  // ── BIR's shared field helpers, ported from BIR-Form1702MX.hta (the old layout's own copies) ──
  /** validateTIN on blur: only an alert (auto-accepted by the harness) and a focus; no value change. */
  validateTIN(_e: string, _checkFull?: boolean): boolean {
    return true;
  }
  /** item 24's blur asks to jump to the Schedules; the harness (like a filer) accepts, so the saved pager moves to 3. */
  redirectToSchedule(): void {
    this.set("txtCurrentPage", "3");
  }
  checkNullRow_OnBlur(textbox: string, button: string): void {
    if (this.g(textbox).trim() !== "") this.enableField(button);
    else this.disableField(button);
  }
  checkNullRow_OnBlur2(t1: string, t2: string, button: string): void {
    if (this.g(t1).trim() !== "" && this.g(t2).trim() !== "") this.enableField(button);
    else this.disableField(button);
  }
  checkNullRow_OnBlur3(textbox: string, param: string): void {
    const first = param.split(",")[0]!;
    if (this.g(textbox).trim() !== "" && this.g(first).trim() !== "OTHERS") this.enableField(param);
  }
  checkNullRow_OnBlur4(t1: string, t2: string, param: string): void {
    const [a, b] = param.split(",") as [string, string];
    if (this.g(t1).trim() !== "" && this.g(t2).trim() !== "" && this.g(a).trim() !== "OTHERS" && this.g(b).trim() !== "OTHERS") this.enableField(param);
  }
  compareFutureDate(e: string, from: string, to: string): void {
    const f = `txtPg2Pt4I${from}`;
    const t = `txtPg2Pt4I${to}`;
    if (this.validateFutureDate(f) && this.validateFutureDate(t) && "" !== (this.g(f) && this.g(t))) {
      if (new Date(this.g(t)) < new Date(this.g(f))) this.set(e, "");
    }
  }
  /** BIR's validateNOLCOYear: the Sc7A years share the name frm1702MX:txtPg6Sc7ANOLCOYear, so the duplicate
   *  check runs over the three siblings; a bad year is cleared. The RA9513 branch reads the Part V attachment
   *  rows, which never exist (totalSP = 0), so isRA9513and10Percent stays false. */
  validateNOLCOYear(e: string): void {
    const nolcoYear = Number(this.g(e).trim());
    const filingYear = 2000 + Number(this.g("txtPg1I2YearEnd"));
    if (this.g(e).trim() !== "" && this.checkDateOfIncorporation() && filingYear !== 2000) {
      const incorpYear = Number(this.g("txtPg1Pt1I8").split("/")[2]);
      const dup = ["txtPg6Sc7AI5year", "txtPg6Sc7AI6year", "txtPg6Sc7AI7year"].filter((id) => this.g(id) === this.g(e)).length;
      if (dup > 1) this.set(e, "");
      else if (nolcoYear >= filingYear || nolcoYear < filingYear - 3) this.set(e, "");
      else if (nolcoYear < incorpYear) this.set(e, "");
    } else if (filingYear === 2000) this.set(e, "");
    else if (this.checkDateOfIncorporation() === false && this.g(e).trim() !== "") this.set(e, "");
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
    else if (this.checkDateOfIncorporation() === false && this.g(e).trim() !== "") this.set(e, "");
  }
  /** getSpecialTaxRates / changeSpecialTaxRate / populatePg3Sc1I11, on the old form's ids. */
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
    this.computePg3Sc1I12();
  }
  populatePg3Sc1I11(): void {
    this.tempVarForSc1I12 = false;
    const ipa = this.g("txtPg2Pt4I31CB").toUpperCase();
    const legal = this.g("txtPg2Pt4I32CB").toUpperCase().replace(/[. ]/g, "");
    let optionToSelect = 0;
    const isIC030or031 = !!this.chk.chkPg1I5ATCR2 && ["IC030", "IC031"].includes(this.g("drpPg1I5ATCR2"));
    const isPEZA5 = (IPA_LIST.includes(ipa) || LEGAL_BASIS.includes(legal)) && Number(this.g("txtPg2Pt4I34SpecialTaxRate")) * 1 === 5;
    const isRA10693 = LEGAL_RA10693.includes(legal);
    const b = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I1CB")));
    const c = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I1CC")));
    const someValue = Math.round((c / (b + c)) * 100);
    if (isIC030or031 && isPEZA5) {
      const item5B = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I5CB"))) * 0.05;
      const item10B = NumWithComma(NumWithParenthesis(this.g("txtPg3Sc1I10CB"))) * 0.3;
      optionToSelect = someValue > 50 ? (item5B > item10B ? 5 : 30) : 5;
      this.tempVarForSc1I12 = optionToSelect === 5;
    } else if (isIC030or031) {
      if (someValue > 50) optionToSelect = 30;
    } else if (isPEZA5) {
      optionToSelect = 5;
      this.tempVarForSc1I12 = true;
    } else if (isRA10693) {
      // BIR rebuilds the drop-down with the single 2.0% option; its `option.value === 2` pick compares a
      // number against the string "0.02" and never fires, so the sole option stays selected
      this.set("txtPg2Pt4I34SpecialTaxRate", "2.0");
      this.drpOption = ["0.02"];
      this.set("drpPg3Sc1I11CB", "0.02");
      this.dis.drpPg3Sc1I11CB = true;
    }
    if (optionToSelect > 0) {
      // BIR bug: `option.value * 100 === optionToSelect` — 0.05 * 100 is 5.000000000000001 and 0.3 * 100 is
      // 30.000000000000004, so the pick never happens and the drop-down keeps its current selection
      const hit = this.drpOption.find((o) => Number(o) * 100 === optionToSelect);
      if (hit !== undefined) this.set("drpPg3Sc1I11CB", hit);
      this.dis.drpPg3Sc1I11CB = true;
    }
    this.computePg3Sc1I12();
  }

  /** checkItemsFromParent: the profile fields enable themselves when the loaded value is empty. */
  checkItemsFromParent(): void {
    if (this.g("txtPg1Pt1I9RegisteredName") === "") this.dis.txtPg1Pt1I9RegisteredName = false;
    if (this.g("txtPg1Pt1I10RegisteredAddress") === "") this.dis.txtPg1Pt1I10RegisteredAddress = false;
    if (this.g("txtPg1Pt1I7RDO") === "000") this.dis.drpPg1Pt1I7RDO = false;
    if (this.g("txtPg1Pt1I11ContactNumber") === "") this.dis.txtPg1Pt1I11ContactNumber = false;
    if (this.g("txtPg1Pt1I13MainLine") === "") this.dis.txtPg1Pt1I13MainLine = false;
  }
  enableATCList(checked: boolean): void {
    this.dis.drpPg1I5ATCR2 = !checked;
    this.changeSpecialTaxRate();
  }
  recomputeSchedule1(): void {
    this.changeSpecialTaxRate();
    this.computePg3Sc1I1();
    this.computePg3Sc1I2();
    this.computePg3Sc1I4();
    this.computePg3Sc1I7();
    this.computePg3Sc1I6();
    this.computePg3Sc1I8();
    this.computePg3Sc1I12();
  }
  /** The modal OK (Save_modalTablePg5Sc4I3-class): count the non-blank rows, then 0 → the line is cleared and
   *  enabled, 1 → the (first!) row copies into the line, else → OTHERS + the subtotals and the line disables. */
  saveModal(m: Modal): void {
    const rows = this.tbl[m.name] ?? [];
    const kept = rows.filter((row) => m.key.some((c) => (row[c - 1] ?? "").trim() !== ""));
    const count = kept.length;
    const lineIds = [...m.line_text, ...m.line_amount.slice(0, 3)];
    if (count === 0) {
      this.enableField(lineIds.join(","));
      this.disableField(`btnModal${m.name}`);
      for (const id of m.line_text) this.set(id, "");
      for (const id of m.line_amount.slice(0, 3)) this.set(id, "0");
    } else if (count === 1) {
      this.enableField(lineIds.join(","));
      this.disableField(`btnModal${m.name}`);
      const first = rows[0]!; // BIR copies table row 0, not the first counted row
      m.line_text.forEach((id, j) => this.set(id, first[m.text[j]! - 1] ?? ""));
      m.line_amount.slice(0, 3).forEach((id, j) => this.set(id, first[m.amount[j]! - 1] ?? ""));
    } else {
      this.tbl[m.name] = kept.map((row) => row.slice()); // the reload rebuilds from the counted rows
      this.summation(m);
      for (const id of m.line_text) this.set(id, "OTHERS");
      m.line_amount.forEach((id, j) => this.set(id, this.g(m.subtotal[j]!)));
      this.disableField(lineIds.join(","));
    }
    this.set(m.counter, count);
    this.getSum(m.line_amount.slice(0, 3).join(","), m.line_amount[3]);
    (this as unknown as Record<string, (() => void) | undefined>)[m.after]?.();
  }
  /** The modal's summation: each row's due and the four subtotals (A/B/C + the D total). */
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

  // ── events ──
  change(e: string): void {
    HANDLER.get(e)?.[0]?.(this, e);
  }
  blur(e: string): void {
    HANDLER.get(e)?.[1]?.(this, e);
  }
}

const H: Array<[string, Handler | null, Handler | null]> = [
  ["txtPg1I2YearEnd", null, (s, e) => { s.validateYearEnd(); }],
  ["txtPg1Pt1I8", null, (s, e) => { s.checkDateOfIncorporation(); }],
  ["txtPg1Pt1I9RegisteredName txtPg1Pt1I10RegisteredAddress txtPg1Pt1I13MainLine txtPg1Pt1I14PSICCode txtPg1Pt2AuthorizedRepresentative txtPg1Pt2Treasurer txtPg1Pt2TitleofSignatory txtPg1Pt2I22 txtPg1Pt1I26CashC1 txtPg1Pt1I27CheckC1 txtPg1Pt1I29Others txtPg1Pt1I29OthersC1 txtPg2Pt4I31CA txtPg2Pt4I31CC txtPg2Pt4I32CA txtPg2Pt4I32CC txtPg2Pt4I33CA txtPg2Pt4I33CB txtPg2Pt4I33CC txtPg2Pt6I45External txtPg2Pt6I47Partner txtPg9Sc13I5CA txtPg9Sc13I5CB txtPg9Sc13I6CA txtPg9Sc13I6CB txtPg9Sc13I7CA txtPg9Sc13I7CB txtPg9Sc13I10CA-2 txtPg9Sc13I10CB-2 txtPg9Sc13I11CA txtPg9Sc13I11CB txtPg9Sc13I16CA txtPg9Sc13I16CB txtPg9Sc14I2CA txtPg9Sc14I2CB txtPg9Sc14I3CA txtPg9Sc14I3CB txtPg9Sc14I4CA txtPg9Sc14I4CB txtPg9Sc14I6CA txtPg9Sc14I6CB", null, (s, e) => { s.capitalize(e); }],
  ["txtPg1Pt1I12Email", null, (s, e) => { s.validateEmail(); }],
  ["txtPg1Pt2I23Date", null, (s, e) => { s.validateDateOfIssueItem23(); }],
  ["txtPg1Pt2I24PlaceofIssue", (s, e) => { s.redirectToSchedule(); }, (s, e) => { s.capitalize(e); }],
  ["txtPg1Pt2I25AmountCTC txtPg1Pt1I26CashC4 txtPg1Pt1I27CheckC4 txtPg1Pt1I28TaxDebitC4 txtPg1Pt1I29OthersC4 txtPg8Sc12I1C3 txtPg8Sc12I2C3 txtPg8Sc12I3C3 txtPg8Sc12I4C3 txtPg8Sc12I5C3 txtPg8Sc12I6C3 txtPg8Sc12I7C3 txtPg8Sc12I8C3 txtPg8Sc12I9C3 txtPg8Sc12I10C3 txtPg8Sc12I11C3 txtPg8Sc12I12C3 txtPg8Sc12I13C3 txtPg8Sc12I14C3 txtPg8Sc12I15C3 txtPg8Sc12I16C3 txtPg8Sc12I17C3 txtPg8Sc12I18C3 txtPg8Sc12I19C3 txtPg8Sc12I20C3 txtPg9Sc13I1CA txtPg9Sc13I1CB txtPg9Sc13I2CA txtPg9Sc13I2CB txtPg9Sc13I3CA txtPg9Sc13I3CB txtPg9Sc13I4CA txtPg9Sc13I4CB txtPg9Sc13I8CA txtPg9Sc13I8CB txtPg9Sc13I12CA txtPg9Sc13I12CB txtPg9Sc13I14CA txtPg9Sc13I14CB txtPg9Sc13I17CA txtPg9Sc13I17CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.addCommas1702MX(e); }],
  ["txtPg1Pt1I26CashC3 txtPg1Pt1I27CheckC3 txtPg1Pt1I28TaxDebitC3 txtPg1Pt1I29OthersC3", null, (s, e) => { s.validateDate(e); }],
  ["txtPg2Pt4I31CB txtPg2Pt4I32CB", (s, e) => { s.changeSpecialTaxRate(); }, (s, e) => { s.capitalize(e); }],
  ["txtPg2Pt4I34SpecialTaxRate", (s, e) => { s.changeSpecialTaxRate(); }, (s, e) => { s.setPercentage(e, 1); }],
  ["txtPg2Pt4I35CA txtPg2Pt4I36CA", null, (s, e) => { s.compareFutureDate(e, '35CA', '36CA'); }],
  ["txtPg2Pt4I35CB txtPg2Pt4I36CB", null, (s, e) => { s.compareFutureDate(e, '35CB', '36CB'); }],
  ["txtPg2Pt4I35CC txtPg2Pt4I36CC", null, (s, e) => { s.compareFutureDate(e, '35CC', '36CC'); }],
  ["txtPg2Pt5I37CD", null, null],
  ["txtPg2Pt5I40 txtPg2Pt5I41 txtPg2Pt5I42", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg2Pt5I43(); s.addCommas1702MX(e); }],
  ["txtPg2Pt6I46TIN1 txtPg2Pt6I46TIN2 txtPg2Pt6I46TIN3 txtPg2Pt6I46TIN4 txtPg2Pt6I48TIN1 txtPg2Pt6I48TIN2 txtPg2Pt6I48TIN3 txtPg2Pt6I48TIN4 txtPg8Sc12I1C2tin1 txtPg8Sc12I1C2tin2 txtPg8Sc12I1C2tin3 txtPg8Sc12I1C2tin4 txtPg8Sc12I2C2tin1 txtPg8Sc12I2C2tin2 txtPg8Sc12I2C2tin3 txtPg8Sc12I2C2tin4 txtPg8Sc12I3C2tin1 txtPg8Sc12I3C2tin2 txtPg8Sc12I3C2tin3 txtPg8Sc12I3C2tin4 txtPg8Sc12I4C2tin1 txtPg8Sc12I4C2tin2 txtPg8Sc12I4C2tin3 txtPg8Sc12I4C2tin4 txtPg8Sc12I5C2tin1 txtPg8Sc12I5C2tin2 txtPg8Sc12I5C2tin3 txtPg8Sc12I5C2tin4 txtPg8Sc12I6C2tin1 txtPg8Sc12I6C2tin2 txtPg8Sc12I6C2tin3 txtPg8Sc12I6C2tin4 txtPg8Sc12I7C2tin1 txtPg8Sc12I7C2tin2 txtPg8Sc12I7C2tin3 txtPg8Sc12I7C2tin4 txtPg8Sc12I8C2tin1 txtPg8Sc12I8C2tin2 txtPg8Sc12I8C2tin3 txtPg8Sc12I8C2tin4 txtPg8Sc12I9C2tin1 txtPg8Sc12I9C2tin2 txtPg8Sc12I9C2tin3 txtPg8Sc12I9C2tin4 txtPg8Sc12I10C2tin1 txtPg8Sc12I10C2tin2 txtPg8Sc12I10C2tin3 txtPg8Sc12I10C2tin4 txtPg8Sc12I11C2tin1 txtPg8Sc12I11C2tin2 txtPg8Sc12I11C2tin3 txtPg8Sc12I11C2tin4 txtPg8Sc12I12C2tin1 txtPg8Sc12I12C2tin2 txtPg8Sc12I12C2tin3 txtPg8Sc12I12C2tin4 txtPg8Sc12I13C2tin1 txtPg8Sc12I13C2tin2 txtPg8Sc12I13C2tin3 txtPg8Sc12I13C2tin4 txtPg8Sc12I14C2tin1 txtPg8Sc12I14C2tin2 txtPg8Sc12I14C2tin3 txtPg8Sc12I14C2tin4 txtPg8Sc12I15C2tin1 txtPg8Sc12I15C2tin2 txtPg8Sc12I15C2tin3 txtPg8Sc12I15C2tin4 txtPg8Sc12I16C2tin1 txtPg8Sc12I16C2tin2 txtPg8Sc12I16C2tin3 txtPg8Sc12I16C2tin4 txtPg8Sc12I17C2tin1 txtPg8Sc12I17C2tin2 txtPg8Sc12I17C2tin3 txtPg8Sc12I17C2tin4 txtPg8Sc12I18C2tin1 txtPg8Sc12I18C2tin2 txtPg8Sc12I18C2tin3 txtPg8Sc12I18C2tin4 txtPg8Sc12I19C2tin1 txtPg8Sc12I19C2tin2 txtPg8Sc12I19C2tin3 txtPg8Sc12I19C2tin4 txtPg8Sc12I20C2tin1 txtPg8Sc12I20C2tin2 txtPg8Sc12I20C2tin3 txtPg8Sc12I20C2tin4", null, (s, e) => { s.validateTIN(e, false); }],
  ["txtPg2Pt6I50IssueDate txtPg2Pt6I51ExpiryDate", null, (s, e) => { s.checkPg2Pt6I5051(e); }],
  ["txtPg3Sc1I13CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg3Sc1I13(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3I1CA txtPg4Sc3I1CB txtPg4Sc3I1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3I1CA,txtPg4Sc3I1CB,txtPg4Sc3I1CC', 'txtPg4Sc3I1CD'); s.computePg4Sc3I4(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3I2CA txtPg4Sc3I2CB txtPg4Sc3I2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3I2CA,txtPg4Sc3I2CB,txtPg4Sc3I2CC', 'txtPg4Sc3I2CD'); s.computePg4Sc3I4(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3I3CA txtPg4Sc3I3CB txtPg4Sc3I3CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3I3CA,txtPg4Sc3I3CB,txtPg4Sc3I3CC', 'txtPg4Sc3I3CD'); s.computePg4Sc3I4(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3I5CA txtPg4Sc3I5CB txtPg4Sc3I5CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3I5CA,txtPg4Sc3I5CB,txtPg4Sc3I5CC', 'txtPg4Sc3I5CD'); s.computePg4Sc3I6(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3AI1CA txtPg4Sc3AI1CB txtPg4Sc3AI1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3AI1CA,txtPg4Sc3AI1CB,txtPg4Sc3AI1CC', 'txtPg4Sc3AI1CD'); s.computePg4Sc3AI3(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3AI2CA txtPg4Sc3AI2CB txtPg4Sc3AI2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3AI2CA,txtPg4Sc3AI2CB,txtPg4Sc3AI2CC', 'txtPg4Sc3AI2CD'); s.computePg4Sc3AI3(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3AI4CA txtPg4Sc3AI4CB txtPg4Sc3AI4CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3AI4CA,txtPg4Sc3AI4CB,txtPg4Sc3AI4CC', 'txtPg4Sc3AI4CD'); s.computePg4Sc3AI5(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI6CA txtPg4Sc3BI6CB txtPg4Sc3BI6CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI6CA,txtPg4Sc3BI6CB,txtPg4Sc3BI6CC', 'txtPg4Sc3BI6CD'); s.computePg4Sc3BI8(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI7CA txtPg4Sc3BI7CB txtPg4Sc3BI7CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI7CA,txtPg4Sc3BI7CB,txtPg4Sc3BI7CC', 'txtPg4Sc3BI7CD'); s.computePg4Sc3BI8(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI9CA txtPg4Sc3BI9CB txtPg4Sc3BI9CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI9CA,txtPg4Sc3BI9CB,txtPg4Sc3BI9CC', 'txtPg4Sc3BI9CD'); s.computePg4Sc3BI10(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI11CA txtPg4Sc3BI11CB txtPg4Sc3BI11CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI11CA,txtPg4Sc3BI11CB,txtPg4Sc3BI11CC', 'txtPg4Sc3BI11CD'); s.computePg4Sc3BI13(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI12CA txtPg4Sc3BI12CB txtPg4Sc3BI12CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI12CA,txtPg4Sc3BI12CB,txtPg4Sc3BI12CC', 'txtPg4Sc3BI12CD'); s.computePg4Sc3BI13(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI14CA txtPg4Sc3BI14CB txtPg4Sc3BI14CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI14CA,txtPg4Sc3BI14CB,txtPg4Sc3BI14CC', 'txtPg4Sc3BI14CD'); s.computePg4Sc3BI16(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI15CA txtPg4Sc3BI15CB txtPg4Sc3BI15CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI15CA,txtPg4Sc3BI15CB,txtPg4Sc3BI15CC', 'txtPg4Sc3BI15CD'); s.computePg4Sc3BI16(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI17CA txtPg4Sc3BI17CB txtPg4Sc3BI17CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI17CA,txtPg4Sc3BI17CB,txtPg4Sc3BI17CC', 'txtPg4Sc3BI17CD'); s.computePg4Sc3BI19(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3BI18CA txtPg4Sc3BI18CB txtPg4Sc3BI18CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3BI18CA,txtPg4Sc3BI18CB,txtPg4Sc3BI18CC', 'txtPg4Sc3BI18CD'); s.computePg4Sc3BI19(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3CI20CA txtPg4Sc3CI20CB txtPg4Sc3CI20CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3CI20CA,txtPg4Sc3CI20CB,txtPg4Sc3CI20CC', 'txtPg4Sc3CI20CD'); s.computePg4Sc3CI26(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3CI21CA txtPg4Sc3CI21CB txtPg4Sc3CI21CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3CI21CA,txtPg4Sc3CI21CB,txtPg4Sc3CI21CC', 'txtPg4Sc3CI21CD'); s.computePg4Sc3CI26(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3CI22CA txtPg4Sc3CI22CB txtPg4Sc3CI22CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3CI22CA,txtPg4Sc3CI22CB,txtPg4Sc3CI22CC', 'txtPg4Sc3CI22CD'); s.computePg4Sc3CI26(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3CI23CA txtPg4Sc3CI23CB txtPg4Sc3CI23CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3CI23CA,txtPg4Sc3CI23CB,txtPg4Sc3CI23CC', 'txtPg4Sc3CI23CD'); s.computePg4Sc3CI26(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3CI24CA txtPg4Sc3CI24CB txtPg4Sc3CI24CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3CI24CA,txtPg4Sc3CI24CB,txtPg4Sc3CI24CC', 'txtPg4Sc3CI24CD'); s.computePg4Sc3CI26(); s.addCommas1702MX(e); }],
  ["txtPg4Sc3CI25CA txtPg4Sc3CI25CB txtPg4Sc3CI25CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg4Sc3CI25CA,txtPg4Sc3CI25CB,txtPg4Sc3CI25CC', 'txtPg4Sc3CI25CD'); s.computePg4Sc3CI26(); s.addCommas1702MX(e); }],
  ["txtPg5Sc4I1", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg5Sc4I1','txtPg5Sc4I2,txtPg5Sc4I2CA,txtPg5Sc4I2CB,txtPg5Sc4I2CC'); }],
  ["txtPg5Sc4I1CA txtPg5Sc4I1CB txtPg5Sc4I1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc4I1CA,txtPg5Sc4I1CB,txtPg5Sc4I1CC', 'txtPg5Sc4I1CD'); s.computePg5Sc4I4(); s.addCommas1702MX(e); }],
  ["txtPg5Sc4I2", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg5Sc4I2','txtPg5Sc4I3,txtPg5Sc4I3CA,txtPg5Sc4I3CB,txtPg5Sc4I3CC'); }],
  ["txtPg5Sc4I2CA txtPg5Sc4I2CB txtPg5Sc4I2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc4I2CA,txtPg5Sc4I2CB,txtPg5Sc4I2CC', 'txtPg5Sc4I2CD'); s.computePg5Sc4I4(); s.addCommas1702MX(e); }],
  ["txtPg5Sc4I3", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg5Sc4I3','btnModalPg5Sc4I3'); }],
  ["txtPg5Sc4I3CA txtPg5Sc4I3CB txtPg5Sc4I3CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc4I3CA,txtPg5Sc4I3CB,txtPg5Sc4I3CC', 'txtPg5Sc4I3CD'); s.computePg5Sc4I4(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I1CA txtPg5Sc5I1CB txtPg5Sc5I1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I1CA,txtPg5Sc5I1CB,txtPg5Sc5I1CC', 'txtPg5Sc5I1CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I2", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg5Sc5I2','txtPg5Sc5I3,txtPg5Sc5I3CA,txtPg5Sc5I3CB,txtPg5Sc5I3CC'); }],
  ["txtPg5Sc5I2CA txtPg5Sc5I2CB txtPg5Sc5I2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I2CA,txtPg5Sc5I2CB,txtPg5Sc5I2CC', 'txtPg5Sc5I2CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I3", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg5Sc5I3','txtPg5Sc5I4,txtPg5Sc5I4CA,txtPg5Sc5I4CB,txtPg5Sc5I4CC'); }],
  ["txtPg5Sc5I3CA txtPg5Sc5I3CB txtPg5Sc5I3CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I3CA,txtPg5Sc5I3CB,txtPg5Sc5I3CC', 'txtPg5Sc5I3CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I4", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg5Sc5I4','btnModalPg5Sc5I4'); }],
  ["txtPg5Sc5I4CA txtPg5Sc5I4CB txtPg5Sc5I4CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I4CA,txtPg5Sc5I4CB,txtPg5Sc5I4CC', 'txtPg5Sc5I4CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I5CA txtPg5Sc5I5CB txtPg5Sc5I5CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I5CA,txtPg5Sc5I5CB,txtPg5Sc5I5CC', 'txtPg5Sc5I5CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I6CA txtPg5Sc5I6CB txtPg5Sc5I6CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I6CA,txtPg5Sc5I6CB,txtPg5Sc5I6CC', 'txtPg5Sc5I6CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I7CA txtPg5Sc5I7CB txtPg5Sc5I7CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I7CA,txtPg5Sc5I7CB,txtPg5Sc5I7CC', 'txtPg5Sc5I7CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I8CA txtPg5Sc5I8CB txtPg5Sc5I8CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I8CA,txtPg5Sc5I8CB,txtPg5Sc5I8CC', 'txtPg5Sc5I8CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I9CA txtPg5Sc5I9CB txtPg5Sc5I9CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I9CA,txtPg5Sc5I9CB,txtPg5Sc5I9CC', 'txtPg5Sc5I9CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I10CA txtPg5Sc5I10CB txtPg5Sc5I10CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I10CA,txtPg5Sc5I10CB,txtPg5Sc5I10CC', 'txtPg5Sc5I10CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I11CA txtPg5Sc5I11CB txtPg5Sc5I11CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I11CA,txtPg5Sc5I11CB,txtPg5Sc5I11CC', 'txtPg5Sc5I11CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I12CA txtPg5Sc5I12CB txtPg5Sc5I12CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I12CA,txtPg5Sc5I12CB,txtPg5Sc5I12CC', 'txtPg5Sc5I12CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I13CA txtPg5Sc5I13CB txtPg5Sc5I13CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I13CA,txtPg5Sc5I13CB,txtPg5Sc5I13CC', 'txtPg5Sc5I13CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I14CA txtPg5Sc5I14CB txtPg5Sc5I14CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I14CA,txtPg5Sc5I14CB,txtPg5Sc5I14CC', 'txtPg5Sc5I14CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I15CA txtPg5Sc5I15CB txtPg5Sc5I15CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I15CA,txtPg5Sc5I15CB,txtPg5Sc5I15CC', 'txtPg5Sc5I15CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I16CA txtPg5Sc5I16CB txtPg5Sc5I16CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I16CA,txtPg5Sc5I16CB,txtPg5Sc5I16CC', 'txtPg5Sc5I16CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I17CA txtPg5Sc5I17CB txtPg5Sc5I17CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I17CA,txtPg5Sc5I17CB,txtPg5Sc5I17CC', 'txtPg5Sc5I17CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I18CA txtPg5Sc5I18CB txtPg5Sc5I18CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I18CA,txtPg5Sc5I18CB,txtPg5Sc5I18CC', 'txtPg5Sc5I18CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I19CA txtPg5Sc5I19CB txtPg5Sc5I19CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I19CA,txtPg5Sc5I19CB,txtPg5Sc5I19CC', 'txtPg5Sc5I19CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I20CA txtPg5Sc5I20CB txtPg5Sc5I20CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I20CA,txtPg5Sc5I20CB,txtPg5Sc5I20CC', 'txtPg5Sc5I20CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I21CA txtPg5Sc5I21CB txtPg5Sc5I21CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I21CA,txtPg5Sc5I21CB,txtPg5Sc5I21CC', 'txtPg5Sc5I21CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I22CA txtPg5Sc5I22CB txtPg5Sc5I22CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I22CA,txtPg5Sc5I22CB,txtPg5Sc5I22CC', 'txtPg5Sc5I22CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I23CA txtPg5Sc5I23CB txtPg5Sc5I23CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I23CA,txtPg5Sc5I23CB,txtPg5Sc5I23CC', 'txtPg5Sc5I23CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I24CA txtPg5Sc5I24CB txtPg5Sc5I24CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I24CA,txtPg5Sc5I24CB,txtPg5Sc5I24CC', 'txtPg5Sc5I24CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I25CA txtPg5Sc5I25CB txtPg5Sc5I25CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I25CA,txtPg5Sc5I25CB,txtPg5Sc5I25CC', 'txtPg5Sc5I25CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I26CA txtPg5Sc5I26CB txtPg5Sc5I26CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I26CA,txtPg5Sc5I26CB,txtPg5Sc5I26CC', 'txtPg5Sc5I26CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I27CA txtPg5Sc5I27CB txtPg5Sc5I27CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I27CA,txtPg5Sc5I27CB,txtPg5Sc5I27CC', 'txtPg5Sc5I27CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I28CA txtPg5Sc5I28CB txtPg5Sc5I28CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I28CA,txtPg5Sc5I28CB,txtPg5Sc5I28CC', 'txtPg5Sc5I28CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I29CA txtPg5Sc5I29CB txtPg5Sc5I29CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I29CA,txtPg5Sc5I29CB,txtPg5Sc5I29CC', 'txtPg5Sc5I29CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I30CA txtPg5Sc5I30CB txtPg5Sc5I30CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I30CA,txtPg5Sc5I30CB,txtPg5Sc5I30CC', 'txtPg5Sc5I30CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I31CA txtPg5Sc5I31CB txtPg5Sc5I31CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I31CA,txtPg5Sc5I31CB,txtPg5Sc5I31CC', 'txtPg5Sc5I31CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I32CA txtPg5Sc5I32CB txtPg5Sc5I32CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I32CA,txtPg5Sc5I32CB,txtPg5Sc5I32CC', 'txtPg5Sc5I32CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I33CA txtPg5Sc5I33CB txtPg5Sc5I33CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I33CA,txtPg5Sc5I33CB,txtPg5Sc5I33CC', 'txtPg5Sc5I33CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I34CA txtPg5Sc5I34CB txtPg5Sc5I34CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I34CA,txtPg5Sc5I34CB,txtPg5Sc5I34CC', 'txtPg5Sc5I34CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg5Sc5I35CA txtPg5Sc5I35CB txtPg5Sc5I35CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg5Sc5I35CA,txtPg5Sc5I35CB,txtPg5Sc5I35CC', 'txtPg5Sc5I35CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg6Sc5I36other", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg6Sc5I36other','txtPg6Sc5I37other,txtPg6Sc5I37CA,txtPg6Sc5I37CB,txtPg6Sc5I37CC'); }],
  ["txtPg6Sc5I36CA txtPg6Sc5I36CB txtPg6Sc5I36CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc5I36CA,txtPg6Sc5I36CB,txtPg6Sc5I36CC','txtPg6Sc5I36CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg6Sc5I37other", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg6Sc5I37other','txtPg6Sc5I38other,txtPg6Sc5I38CA,txtPg6Sc5I38CB,txtPg6Sc5I38CC'); }],
  ["txtPg6Sc5I37CA txtPg6Sc5I37CB txtPg6Sc5I37CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc5I37CA,txtPg6Sc5I37CB,txtPg6Sc5I37CC','txtPg6Sc5I37CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg6Sc5I38other", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg6Sc5I38other','txtPg6Sc5I39other,txtPg6Sc5I39CA,txtPg6Sc5I39CB,txtPg6Sc5I39CC'); }],
  ["txtPg6Sc5I38CA txtPg6Sc5I38CB txtPg6Sc5I38CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc5I38CA,txtPg6Sc5I38CB,txtPg6Sc5I38CC','txtPg6Sc5I38CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg6Sc5I39other", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg6Sc5I39other','btnModalPg6Sc5I39'); }],
  ["txtPg6Sc5I39CA txtPg6Sc5I39CB txtPg6Sc5I39CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc5I39CA,txtPg6Sc5I39CB,txtPg6Sc5I39CC','txtPg6Sc5I39CD'); s.computePg6Sc5I40(); s.addCommas1702MX(e); }],
  ["txtPg6Sc6I1description txtPg6Sc6I1legal", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur4('txtPg6Sc6I1description','txtPg6Sc6I1legal','txtPg6Sc6I2description,txtPg6Sc6I2legal,txtPg6Sc6I2CA,txtPg6Sc6I2CB,txtPg6Sc6I2CC'); }],
  ["txtPg6Sc6I1CA txtPg6Sc6I1CB txtPg6Sc6I1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc6I1CA,txtPg6Sc6I1CB,txtPg6Sc6I1CC', 'txtPg6Sc6I1CD'); s.computePg6Sc6I5(); s.addCommas1702MX(e); }],
  ["txtPg6Sc6I2description txtPg6Sc6I2legal", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur4('txtPg6Sc6I2description','txtPg6Sc6I2legal','txtPg6Sc6I3description,txtPg6Sc6I3legal,txtPg6Sc6I3CA,txtPg6Sc6I3CB,txtPg6Sc6I3CC'); }],
  ["txtPg6Sc6I2CA txtPg6Sc6I2CB txtPg6Sc6I2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc6I2CA,txtPg6Sc6I2CB,txtPg6Sc6I2CC', 'txtPg6Sc6I2CD'); s.computePg6Sc6I5(); s.addCommas1702MX(e); }],
  ["txtPg6Sc6I3description txtPg6Sc6I3legal", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur4('txtPg6Sc6I3description','txtPg6Sc6I3legal','txtPg6Sc6I4description,txtPg6Sc6I4legal,txtPg6Sc6I4CA,txtPg6Sc6I4CB,txtPg6Sc6I4CC'); }],
  ["txtPg6Sc6I3CA txtPg6Sc6I3CB txtPg6Sc6I3CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc6I3CA,txtPg6Sc6I3CB,txtPg6Sc6I3CC', 'txtPg6Sc6I3CD'); s.computePg6Sc6I5(); s.addCommas1702MX(e); }],
  ["txtPg6Sc6I4description txtPg6Sc6I4legal", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur2('txtPg6Sc6I4description','txtPg6Sc6I4legal','btnModalPg6Sc6'); }],
  ["txtPg6Sc6I4CA txtPg6Sc6I4CB txtPg6Sc6I4CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc6I4CA,txtPg6Sc6I4CB,txtPg6Sc6I4CC', 'txtPg6Sc6I4CD'); s.computePg6Sc6I5(); s.addCommas1702MX(e); }],
  ["txtPg6Sc7I1 txtPg6Sc7I2", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7I3(); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI4CA txtPg6Sc7AI4CB txtPg6Sc7AI4CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI4CE(); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI5year txtPg6Sc7AI6year txtPg6Sc7AI7year", null, (s, e) => { s.validateNOLCOYear(e); }],
  ["txtPg6Sc7AI5CA txtPg6Sc7AI5CB txtPg6Sc7AI5CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI5CE(e); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI6CA txtPg6Sc7AI6CB txtPg6Sc7AI6CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI6CE(e); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI7CA txtPg6Sc7AI7CB txtPg6Sc7AI7CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI7CE(e); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI4CD", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI4CE(); s.computePg6Sc7AI8(); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI5CD", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI5CE(e); s.computePg6Sc7AI8(); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI6CD", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI6CE(e); s.computePg6Sc7AI8(); s.addCommas1702MX(e); }],
  ["txtPg6Sc7AI7CD", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg6Sc7AI7CE(e); s.computePg6Sc7AI8(); s.addCommas1702MX(e); }],
  ["txtPg6Sc8I1CA txtPg6Sc8I1CB txtPg6Sc8I1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc8I1CA,txtPg6Sc8I1CB,txtPg6Sc8I1CC', 'txtPg6Sc8I1CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg6Sc8I2CA txtPg6Sc8I2CB txtPg6Sc8I2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc8I2CA,txtPg6Sc8I2CB,txtPg6Sc8I2CC', 'txtPg6Sc8I2CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg6Sc8I3CA txtPg6Sc8I3CB txtPg6Sc8I3CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc8I3CA,txtPg6Sc8I3CB,txtPg6Sc8I3CC', 'txtPg6Sc8I3CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg6Sc8I4CA txtPg6Sc8I4CB txtPg6Sc8I4CC", null, (s, e) => { s.getSum('txtPg6Sc8I4CA,txtPg6Sc8I4CB,txtPg6Sc8I4CC', 'txtPg6Sc8I4CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg6Sc8I5CA txtPg6Sc8I5CB txtPg6Sc8I5CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc8I5CA,txtPg6Sc8I5CB,txtPg6Sc8I5CC', 'txtPg6Sc8I5CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg6Sc8I6CA txtPg6Sc8I6CB txtPg6Sc8I6CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg6Sc8I6CA,txtPg6Sc8I6CB,txtPg6Sc8I6CC', 'txtPg6Sc8I6CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg7Sc8I7CA txtPg7Sc8I7CB txtPg7Sc8I7CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc8I7CA,txtPg7Sc8I7CB,txtPg7Sc8I7CC', 'txtPg7Sc8I7CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg7Sc8I8CA txtPg7Sc8I8CB txtPg7Sc8I8CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc8I8CA,txtPg7Sc8I8CB,txtPg7Sc8I8CC', 'txtPg7Sc8I8CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg7Sc8I9CA txtPg7Sc8I9CB txtPg7Sc8I9CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc8I9CA,txtPg7Sc8I9CB,txtPg7Sc8I9CC', 'txtPg7Sc8I9CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg7Sc8I10CA txtPg7Sc8I10CB txtPg7Sc8I10CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc8I10CA,txtPg7Sc8I10CB,txtPg7Sc8I10CC', 'txtPg7Sc8I10CD'); s.computePg7Sc8I13(); s.computePg3Sc2I6(); s.addCommas1702MX(e); }],
  ["txtPg7Sc8I11", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg7Sc8I11','txtPg7Sc8I12,txtPg7Sc8I12CA,txtPg7Sc8I12CB,txtPg7Sc8I12CC'); }],
  ["txtPg7Sc8I11CA txtPg7Sc8I11CB txtPg7Sc8I11CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc8I11CA,txtPg7Sc8I11CB,txtPg7Sc8I11CC', 'txtPg7Sc8I11CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg7Sc8I12", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg7Sc8I12','btnModalPg7Sc8'); }],
  ["txtPg7Sc8I12CA txtPg7Sc8I12CB txtPg7Sc8I12CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc8I12CA,txtPg7Sc8I12CB,txtPg7Sc8I12CC', 'txtPg7Sc8I12CD'); s.computePg7Sc8I13(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I1 txtPg7Sc9I2 txtPg7Sc9I3", null, (s, e) => { s.validateMCITYear(e); }],
  ["txtPg7Sc9I1CA txtPg7Sc9I1CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I1CC(); s.computePg7Sc9I1CG(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I2CA txtPg7Sc9I2CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I2CC(); s.computePg7Sc9I2CG(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I3CA txtPg7Sc9I3CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I3CC(); s.computePg7Sc9I3CG(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I1CD txtPg7Sc9I1CE", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I1CG(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I1CF", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I1CG(); s.computePg7Sc9I4(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I2CD txtPg7Sc9I2CE", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I2CG(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I2CF", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I2CG(); s.computePg7Sc9I4(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I3CD txtPg7Sc9I3CE", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I3CG(); s.addCommas1702MX(e); }],
  ["txtPg7Sc9I3CF", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg7Sc9I3CG(); s.computePg7Sc9I4(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I1CA txtPg7Sc10I1CB txtPg7Sc10I1CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I1CA,txtPg7Sc10I1CB,txtPg7Sc10I1CC', 'txtPg7Sc10I1CD'); s.computePg7Sc10I4(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I2", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg7Sc10I2','txtPg7Sc10I3,txtPg7Sc10I3CA,txtPg7Sc10I3CB,txtPg7Sc10I3CC'); }],
  ["txtPg7Sc10I2CA txtPg7Sc10I2CB txtPg7Sc10I2CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I2CA,txtPg7Sc10I2CB,txtPg7Sc10I2CC', 'txtPg7Sc10I2CD'); s.computePg7Sc10I4(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I3", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg7Sc10I3','btnModalPg7Sc10I3'); }],
  ["txtPg7Sc10I3CA txtPg7Sc10I3CB txtPg7Sc10I3CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I3CA,txtPg7Sc10I3CB,txtPg7Sc10I3CC', 'txtPg7Sc10I3CD'); s.computePg7Sc10I4(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I5", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg7Sc10I5','txtPg7Sc10I6,txtPg7Sc10I6CA,txtPg7Sc10I6CB,txtPg7Sc10I6CC'); }],
  ["txtPg7Sc10I5CA txtPg7Sc10I5CB txtPg7Sc10I5CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I5CA,txtPg7Sc10I5CB,txtPg7Sc10I5CC', 'txtPg7Sc10I5CD'); s.computePg7Sc10I9(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I6", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg7Sc10I6','btnModalPg7Sc10I6'); }],
  ["txtPg7Sc10I6CA txtPg7Sc10I6CB txtPg7Sc10I6CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I6CA,txtPg7Sc10I6CB,txtPg7Sc10I6CC', 'txtPg7Sc10I6CD'); s.computePg7Sc10I9(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I7", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur3('txtPg7Sc10I7','txtPg7Sc10I8,txtPg7Sc10I8CA,txtPg7Sc10I8CB,txtPg7Sc10I8CC'); }],
  ["txtPg7Sc10I7CA txtPg7Sc10I7CB txtPg7Sc10I7CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I7CA,txtPg7Sc10I7CB,txtPg7Sc10I7CC', 'txtPg7Sc10I7CD'); s.computePg7Sc10I9(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I8", null, (s, e) => { s.capitalize(e); s.checkNullRow_OnBlur('txtPg7Sc10I8','btnModalPg7Sc10I8'); }],
  ["txtPg7Sc10I8CA txtPg7Sc10I8CB txtPg7Sc10I8CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.getSum('txtPg7Sc10I8CA,txtPg7Sc10I8CB,txtPg7Sc10I8CC', 'txtPg7Sc10I8CD'); s.computePg7Sc10I9(); s.addCommas1702MX(e); }],
  ["txtPg7Sc10I9CA txtPg7Sc10I9CB txtPg7Sc10I9CC", null, (s, e) => { s.getSum('txtPg7Sc10I9CA,txtPg7Sc10I9CB,txtPg7Sc10I9CC', 'txtPg7Sc10I9CD'); s.addCommas1702MX(e); }],
  ["txtPg8Sc11I1 txtPg8Sc11I2 txtPg8Sc11I3 txtPg8Sc11I4 txtPg8Sc11I5 txtPg8Sc11I6", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg8Sc11I7(); s.addCommas1702MX(e); }],
  ["txtPg8Sc11I8 txtPg8Sc11I9 txtPg8Sc11I10 txtPg8Sc11I11", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg8Sc11I12(); s.addCommas1702MX(e); }],
  ["txtPg8Sc11I13 txtPg8Sc11I14 txtPg8Sc11I15", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg8Sc11I16(); s.addCommas1702MX(e); }],
  ["txtPg8Sc12I1C1 txtPg8Sc12I2C1 txtPg8Sc12I3C1 txtPg8Sc12I4C1 txtPg8Sc12I5C1 txtPg8Sc12I6C1 txtPg8Sc12I7C1 txtPg8Sc12I8C1 txtPg8Sc12I9C1 txtPg8Sc12I10C1 txtPg8Sc12I11C1 txtPg8Sc12I12C1 txtPg8Sc12I13C1 txtPg8Sc12I14C1 txtPg8Sc12I15C1 txtPg8Sc12I16C1 txtPg8Sc12I17C1 txtPg8Sc12I18C1 txtPg8Sc12I19C1 txtPg8Sc12I20C1", null, (s, e) => { s.capitalize(e); s.checkNullP8Sc12I1toI20Enable(); }],
  ["txtPg8Sc12I1C4 txtPg8Sc12I2C4 txtPg8Sc12I3C4 txtPg8Sc12I4C4 txtPg8Sc12I5C4 txtPg8Sc12I6C4 txtPg8Sc12I7C4 txtPg8Sc12I8C4 txtPg8Sc12I9C4 txtPg8Sc12I10C4 txtPg8Sc12I11C4 txtPg8Sc12I12C4 txtPg8Sc12I13C4 txtPg8Sc12I14C4 txtPg8Sc12I15C4 txtPg8Sc12I16C4 txtPg8Sc12I17C4 txtPg8Sc12I18C4 txtPg8Sc12I19C4 txtPg8Sc12I20C4", null, (s, e) => { s.setPercentage(e, 0); }],
  // BIR's own typo: an undefined computePg9Sc13I19I is called first and throws on IE too
  ["txtPg9Sc13I1CC txtPg9Sc13I2CC txtPg9Sc13I3CC txtPg9Sc13I4CC", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { try { (s as unknown as { computePg9Sc13I19I: () => void }).computePg9Sc13I19I(); } catch { return; } s.computePg9Sc13I19(); s.addCommas1702MX(e); }],
  ["txtPg9Sc13I9CA txtPg9Sc13I9CB txtPg9Sc13I15CA txtPg9Sc13I15CB txtPg9Sc13I18CA txtPg9Sc13I18CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg9Sc13I19(); s.addCommas1702MX(e); }],
  ["txtPg9Sc13I13CA txtPg9Sc13I13CB", null, (s, e) => { s.validateIssueDateSchedule13(e); }],
  ["txtPg9Sc14I1 txtPg9Sc14I5CA txtPg9Sc14I5CB txtPg9Sc14I7CA txtPg9Sc14I7CB", (s, e) => { s.setToZeroIfEmpty(e); }, (s, e) => { s.computePg9Sc14I8(); s.addCommas1702MX(e); }],
];
const HANDLER = new Map<string, [Handler | null, Handler | null]>();
for (const [ids, c, b] of H) for (const id of ids.split(" ")) HANDLER.set(id, [c, b]);

// ── runner ────────────────────────────────────────────────────────────────────────────────────────────────────────

const enabledAtBlankOld = (id: string): boolean => ENABLED_AT_BLANK.has(id);

/** The filer's tab-through of every enabled text input, in DOM order. */
function fillOld(s: OldSim): void {
  for (const id of PAGE_TEXT) {
    if (s.dis[id] || INVISIBLE.has(id)) continue;
    s.change(id);
    s.blur(id);
  }
}

/** parityCheck's page-1 pass: every enabled page-1 text input left (blurred), in DOM order. */
function tabPage1Old(s: OldSim): void {
  for (const id of PAGE_TEXT.slice(0, PAGE1_END + 1)) if (!s.dis[id] && !INVISIBLE.has(id)) s.blur(id);
}

export interface OldModel {
  /** BIR's final field strings by bare id (DOM form: "(1,234)" negatives). */
  value: Record<string, string>;
  checked: Record<string, boolean>;
  table: Record<string, string[][]>;
}

/** BIR's reopen: save → load → the reload's own sequence — validatePg1Pt2I22(true), the numbertext comma pass,
 *  txtCurrentPage back to 1, then checkEnableManual (checkItemsFromParent, enableMCITFields, computePg6Sc7AI4,
 *  enableATCList, the counter-gated modal saves, the OTHERS row-enabling chains, checkNullP8Sc12I1toI20Enable,
 *  verifyselectSchedule12) and recomputeSchedule1. The Part V attachments (totalEX/SP) never exist. */
function reopenOld(s: OldSim): void {
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
  for (const id of PAGE_TEXT) s.dis[id] = !enabledAtBlankOld(id);
  // validatePg1Pt2I22(true) — isFromLoad skips the clearing; the CTC/SEC branch still runs
  s.validatePg1Pt2I22("load");
  // sleeptime: the pager is reset and every whole numbertext gets its commas back (the loaded() pass did)
  s.set("txtCurrentPage", "1");
  // checkEnableManual
  s.checkItemsFromParent();
  s.enableMCITFields();
  s.computePg6Sc7AI4();
  s.enableATCList(!!s.chk.chkPg1I5ATCR2);
  for (const m of MODAL) if (Number(s.g(m.counter)) > 0) s.saveModal(m);
  if (s.g("txtPg6Sc6I2description").trim() !== "" || true) s.checkNullRow_OnBlur4("txtPg6Sc6I2description", "txtPg6Sc6I2legal", "txtPg6Sc6I3description,txtPg6Sc6I3legal,txtPg6Sc6I3CA,txtPg6Sc6I3CB,txtPg6Sc6I3CC");
  if (s.g("txtPg6Sc6I4description") !== "OTHERS")
    s.checkNullRow_OnBlur4("txtPg6Sc6I3description", "txtPg6Sc6I3legal", "txtPg6Sc6I4description,txtPg6Sc6I4legal,txtPg6Sc6I4CA,txtPg6Sc6I4CB,txtPg6Sc6I4CC");
  if (s.g("txtPg7Sc8I12") !== "OTHERS") s.checkNullRow_OnBlur3("txtPg7Sc8I11", "txtPg7Sc8I12,txtPg7Sc8I12CA,txtPg7Sc8I12CB,txtPg7Sc8I12CC");
  if (s.g("txtPg7Sc10I3") !== "OTHERS") s.checkNullRow_OnBlur3("txtPg7Sc10I2", "txtPg7Sc10I3,txtPg7Sc10I3CA,txtPg7Sc10I3CB,txtPg7Sc10I3CC");
  if (s.g("txtPg7Sc10I6") !== "OTHERS") s.checkNullRow_OnBlur3("txtPg7Sc10I5", "txtPg7Sc10I6,txtPg7Sc10I6CA,txtPg7Sc10I6CB,txtPg7Sc10I6CC");
  if (s.g("txtPg7Sc10I8") !== "OTHERS") s.checkNullRow_OnBlur3("txtPg7Sc10I7", "txtPg7Sc10I8,txtPg7Sc10I8CA,txtPg7Sc10I8CB,txtPg7Sc10I8CC");
  s.checkNullP8Sc12I1toI20Enable();
  s.verifyselectSchedule12();
  // saveAttachmentIterationData: the Part V attachments never exist, so it writes nothing
  s.recomputeSchedule1();
}

/** Run BIR on the native inputs: the filer types them into the blank form, OKs the modals and tabs through twice
 *  more; then the return is saved, reopened and page 1 tabbed through — what BIR shows after the reopen. */
export function run1702MXOld(read: Read, groups: GroupState, now = new Date()): OldModel {
  const s = new OldSim(now);
  const input: Record<string, string> = {};
  for (const [k, value, radio] of TEMPLATE) {
    if (!k.startsWith(P)) continue;
    const id = bare(k);
    const typed = isComputed(id) ? "" : read(k);
    s.v[id] = value;
    // the checkboxes (chkPg1I5ATCR1/2, chkPg2Pt4I30MoreThanOne, radPg8Sc12*) carry no radio name in the
    // capture, but they are boolean state — BIR's computes read their .checked
    if (radio || /^(chk|rad)/.test(id)) s.chk[id] = typed === "" ? value === "true" : typed === "true";
    else if (/^(ddl|drp)/.test(id)) s.v[id] = typed || value;
    else if (typed !== "") input[id] = typed;
  }
  s.v.hidden = "0";
  // the markup's hidden rate input (never saved, never typed): frm1702MX:hidden30 value="0.3"
  s.v.hidden30 = "0.3";
  for (const id of PAGE_TEXT) s.dis[id] = !enabledAtBlankOld(id);
  s.dis.ddlPg1I2Date = !s.chk.rdoPg1I1Fiscal && !s.chk.rdoPg1I4ShortPeriodYes;
  for (const id of PAGE_TEXT) {
    if (id in input) s.v[id] = input[id]!;
    if (s.dis[id] || INVISIBLE.has(id)) continue;
    s.change(id);
    s.blur(id);
  }
  for (const [id, v] of Object.entries(input)) if (!PAGE_TEXT.includes(id)) s.v[id] = v;
  // loadBGData repeats page 1's TIN and registered name on every page header
  for (const [pg, pgs] of [[2, ["txtPg2Pt4TIN", "txtPg2Pt4TaxFilerLastName"]], [3, ["txtPg3Pt5TIN", "txtPg3Pt5TaxFilerLastName"]], [4, ["txtPg4TIN", "txtPg4LastName"]]] as const) {
    for (const k of [1, 2, 3]) s.v[`txtPg${pg}TIN${k}`] = s.g(`txtPg1Pt1I6TINC${k}`);
    s.v[`${pgs[0]}BranchCode`.replace(pgs[0], `${pgs[0].replace(/TIN$/, "")}BranchCode`)] = s.g("txtPg1Pt1I6TINC4");
    s.v[pgs[1]] = s.g("txtPg1Pt1I9RegisteredName").toUpperCase();
  }
  // the modals' rows are typed (each row's blur sums it) and OK'd, then the filer tabs through twice more
  for (const m of MODAL) s.tbl[m.name] = tableOf(m, groups);
  const okModals = () => {
    for (const m of MODAL) if ((s.tbl[m.name] ?? []).length) s.summation(m), s.saveModal(m);
  };
  okModals();
  fillOld(s);
  okModals();
  fillOld(s);
  // the overpayment choice is made last: computePg1Pt2I20 clears (and disables) it whenever item 20 is not negative
  const over = ["rdoPg1Pt2I21Refund", "rdoPg1Pt2I21IssueTCC", "rdoPg1Pt2I21CarriedOver"];
  if (!s.dis[over[0]!]) for (const x of over) s.chk[x] = read(`${P}${x}`) === "true";
  reopenOld(s);
  tabPage1Old(s);
  tabPage1Old(s);
  return { value: s.v, checked: s.chk, table: s.tbl };
}

/** tableOf: the modal rows from the group state, keyed by column. */
function tableOf(m: Modal, groups: GroupState): string[][] {
  return (groups[m.name] ?? []).map((row) =>
    Array.from({ length: m.total - 1 }, (_, j) => row[`${P}${m.stem}{i}Col${j + 1}`] ?? ""),
  );
}

// ── schema ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The keys the model reads (BIR's inputs); the cache is keyed on their values. */
const INPUT_KEY_OLD = TEMPLATE.map(([k]) => k).filter((k) => k.startsWith(P) && !isComputed(bare(k)));
const cacheOld = new Map<string, OldModel>();
function modelOld(read: Read, groups: GroupState): OldModel {
  const key = JSON.stringify([INPUT_KEY_OLD.map((k) => (isComputed(bare(k)) ? "" : read(k))), groups]);
  let m = cacheOld.get(key);
  if (!m) {
    m = run1702MXOld(read, groups);
    if (cacheOld.size > 8) cacheOld.delete(cacheOld.keys().next().value!);
    cacheOld.set(key, m);
  }
  return m;
}

/** Every saved value BIR derives, overlaid on the template: the computed figures (with the modal rows, which the
 *  schema's derive cannot see), BIR's rewrites of the inputs (rounded amounts, cleared dates, upper-cased text, the
 *  ATC ticks), the modal lines / counters / subtotals and the rebuilt rows. */
function derivedRecordOld(state: FormState, groups: GroupState, json: FieldJson[]): SaveRecord[] {
  const r: Read = (id) => state[id] ?? "";
  const m = modelOld(r, groups);
  const out: SaveRecord[] = [];
  for (const f of json) {
    const id = bare(f.id);
    if (f.kind === "radio") out.push({ key: f.id, value: String(!!m.checked[id]) }); // booleans stay lowercase
    else {
      const v = savedValueOld(id, m.value[id] ?? "");
      out.push({ key: f.id, value: ESCAPED.has(id) ? legacyEscape(v) : v });
    }
  }
  for (const mo of MODAL) {
    out.push({ key: `${P}${mo.counter}`, value: m.value[mo.counter] ?? "0" });
    (m.table[mo.name] ?? []).forEach((row, i) => row.forEach((cell, j) => out.push({ key: `${P}${mo.stem}${i + 1}Col${j + 1}`, value: mo.text.includes(j + 1) ? cell.toUpperCase() : savedValueOld("x", cell) })));
  }
  return out;
}

const savedValueOld = (id: string, value: string): string => {
  if (isNumbertext(id)) {
    if (/^\([\d,]+\)$/.test(value)) return value === "(0)" ? "0" : `-${value.slice(1, -1)}`;
    return value;
  }
  return VERBATIM.has(id) ? value : value.toUpperCase();
};

function fieldListOld(record: TemplateRecord[]): FieldJson[] {
  return record
    .filter(([key]) => key.startsWith(P) && !UNMODELLED.test(bare(key)) && !MODAL.some((m) => m.counter === bare(key)))
    .map(([key, value, radio]): FieldJson => {
      if (radio || /:(chk|rad)/.test(key)) return { id: key, kind: "radio" };
      if (/:(ddl|drp)/.test(key)) return { id: key, kind: "select" };
      if (isNumbertext(bare(key))) return { id: key, kind: "money" };
      void value;
      return { id: key, kind: "text", ...(ESCAPED.has(bare(key)) ? { escaped: true } : {}) };
    });
}

export const FORM_1702MX: FormSchema = (() => {
  const json = fieldListOld(TEMPLATE);
  const field: FieldSpec[] = json.map((f) => {
    const id = bare(f.id);
    if (!isComputed(id)) return { ...f };
    // `compute` only marks the field read-only (FormView); `derive` writes BIR's string (modal rows are applied at save)
    return { ...f, compute: () => 0, derive: (r: Read) => { const m = modelOld(r, {}); return f.kind === "radio" ? String(!!m.checked[id]) : savedValueOld(id, m.value[id] ?? ""); } }; // prettier-ignore
  });
  for (const id of ["txtPg1Pt1I6TINC1", "txtPg1Pt1I6TINC2", "txtPg1Pt1I6TINC3", "txtPg1Pt1I6TINC4", "txtPg1Pt1I9RegisteredName", "txtPg1Pt1I10RegisteredAddress"]) {
    const f = field.find((x) => x.id === `${P}${id}`);
    if (f) f.required = true;
  }
  return { form_code: "1702MX", title: "Annual Income Tax — Corporations (Mixed Income, 2013 layout)", field, group: MODAL_GROUP, extra_record: (state, groups) => derivedRecordOld(state, groups, json), typed: addCommas1702MXValue };
})();

export function validate1702MXOld(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1702MX, state);
  const tin = `${state[`${P}txtPg1Pt1I6TINC1`] ?? ""}${state[`${P}txtPg1Pt1I6TINC2`] ?? ""}${state[`${P}txtPg1Pt1I6TINC3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I6TINC1`, message: "The TIN's check digit doesn't match." });
  const date = state[`${P}txtPg1Pt1I8`] ?? "";
  if (date && !birDateValid(date)) problem.push({ id: `${P}txtPg1Pt1I8`, message: "Date of incorporation must be a past date in MM/DD/YYYY form." });
  if (state[`${P}rdoPg1Pt1I13MethodOfDeducItemized`] !== "true" && state[`${P}rdoPg1Pt1I13MethodOfDeducOptional`] !== "true")
    problem.push({ id: `${P}rdoPg1Pt1I13MethodOfDeducItemized`, message: "Please select a Method of Deduction in page 1 Item 13." });
  const m = modelOld((id) => state[id] ?? "", groups);
  if (parseMoney(m.value.txtPg1Pt2I20TotalAmount ?? "0") < 0 && !["Refund", "IssueTCC", "CarriedOver"].some((x) => m.checked[`rdoPg1Pt2I21${x}`]))
    problem.push({ id: `${P}rdoPg1Pt2I21Refund`, message: "Choose how the overpayment (item 21) is to be handled." });
  for (const mo of MODAL)
    (groups[mo.name] ?? []).forEach((row, i) => {
      if (!mo.key.some((c) => (row[`${P}${mo.stem}{i}Col${c}`] ?? "").trim())) problem.push({ id: `${P}${mo.stem}${i + 1}Col1`, message: `Row ${i + 1}: the description should not be blank (BIR drops the row).` });
    });
  return problem;
}
