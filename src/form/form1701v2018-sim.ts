// BIR Form 1701 (January 2018 / TRAIN edition) — BIR's own page logic, ported onto a mini-DOM and RUN.
//
// The legacy form is ~90 mutually-calling enable/disable/compute functions whose results depend on the order the
// filer clicks and types: a blur recomputes only its own chain, radios reset whole schedules, and the reopened form
// (loadData) rebuilds the enabled state from scratch and re-runs a few handlers (checkFieldsAfterXMLLoad). No closed
// formula reproduces that, so the native form runs BIR's own logic, verbatim, over the native state:
//
//   1. session — start from BIR's blank form (the save template's values + the MEASURED post-init disabled set),
//      fill the profile (loadBGData), then a filer pass: every radio / checkbox the filer chose is clicked in DOM
//      order (its onclick runs), every enabled input is typed and blurred in DOM order (its onblur runs); twice, so
//      options enabled by a later figure (the overpayment radios) can be picked.
//   2. save + reopen — the enabled state is rebuilt from the blank form, checkFieldsAfterXMLLoad runs, and every
//      enabled input of pages 1–4 is blurred twice: exactly what test/parity.ts does to the saved file in WebKit.
//
// The result is what BIR shows (and saves again) after the native file is reopened in BIR's own form, so the native
// save is 1:1 by construction wherever this port is faithful. BIR's arithmetic is kept: getSum / getDifference /
// differenceOfElements / getProduct write formatCurrency(Math.round(x).toFixed(2)) (whole pesos, half up), the
// graduated tables (calcTaxAmt) are the 2018–2022 and 2023+ ones, page 1 (24/26/30/31/32) keeps centavos.
// BIR bugs that change saved values are kept and named where they happen (search "BIR bug").

import template from "./template/1701v2018.json";
import { formatCurrency, numWithComma as NumWithComma } from "./bir-arith.ts";

export const PFX = "frm1701:";
type TemplateRecord = [string, string, string?];
export type CellType = "text" | "select-one" | "radio" | "checkbox";
interface Cell {
  id: string;
  type: CellType;
  name: string;
  v: string;
  dis: boolean;
  chk: boolean;
}

const SELECT = new Set([`${PFX}txtPg1I1Month`, `${PFX}txtPg1I5RDOCode`, `${PFX}txtPg2I2SpouseRDOCode`, "driveSelectTPExport"]);
const RECORD = template as TemplateRecord[];
/** The element type behind a template record (a text input whose default is the word "false" is still text). */
export const cellType = (key: string, value: string, radio?: string): CellType =>
  radio ? "radio" : SELECT.has(key) ? "select-one" : (value === "true" || value === "false") && key !== `${PFX}txtIsTaxFilerDisabled` ? "checkbox" : "text";

/** BIR's form after init() (blank, before any file loads): which elements are disabled. MEASURED in WebKit from the
 *  blank form (frmMain elements with `.disabled`, prefix stripped); init()'s enableAllControl → checkFields →
 *  disableSpouseFields('noSpouse') is why the spouse column starts disabled. */
const INIT_DISABLED = new Set(
  (
    "txtPg1I4TIN1 txtPg1I4TIN2 txtPg1I4TIN3 txtPg1I4BranchCode txtPg1I5RDOCode txtPg1I8TaxpayerName txtPg1I9Address " +
    "txtPg1I9Address2 txtPg1I9AZipCode =txtEmail txtPg1I14ForeignTaxNumber txtPg1I15TelNum rdoPg1I17SpouseIncomeYes " +
    "rdoPg1I17SpouseIncomeNo rdoPg1I18FilingStatusJ rdoPg1I18FilingStatusS txtPg1I22ATaxDue txtPg1I22BTaxDue txtPg1I23A " +
    "txtPg1I23B txtPg1I24ATaxPayable txtPg1I24BTaxPayable txtPg1I25B txtPg1I26A txtPg1I26B txtPg1I27B txtPg1I28B " +
    "txtPg1I29B txtPg1I30A txtPg1I30B txtPg1I31ATotalAmtPyble txtPg1I31BTotalAmtPyble txtPg1I32AggregateAmtPyble " +
    "rdoPg1OverpaymentRefund rdoPg1OverpaymentTCC rdoPg1OverpaymentCarryOver txtPg1I34Agency txtPg1I34Number " +
    "txtPg1I34Date txtPg1I34Amount txtPg1I35Agency txtPg1I235Number txtPg1I35Date txtPg1I35Amount txtPg1I36Number " +
    "txtPg1I36Date txtPg1I36Amount txtPg1I37Particular txtPg1I37Agency txtPg1I37Number txtPg1I37Date txtPg1I37Amount " +
    "txtPg2TIN1 txtPg2TIN2 txtPg2TIN3 txtPg2BranchCode txtPg2TaxpayerName txtPg2I1TIN1 txtPg2I1TIN2 txtPg2I1TIN3 " +
    "txtPg2I1BranchCode txtPg2I2SpouseRDOCode rdoPg2I3SpouseTypeS rdoPg2I3SpouseTypeP rdoPg2I3SpouseTypeC " +
    "rdoPg2I4ATC_II012 rdoPg2I4ATC_II014 rdoPg2I4ATC_II013 rdoPg2I4ATC_II011 rdoPg2I4ATC_II015 rdoPg2I4ATC_II017 " +
    "rdoPg2I4ATC_II016 txtPg2I5SpouseName txtPg2I6TelNum txtPg2I7Citizenship rdoPg2I8ForeignTaxCreditsYes " +
    "rdoPg2I8ForeignTaxCreditsNo txtPg2I9ForeignTaxNumber rdoPg2I10IncomeExemptYes rdoPg2I10IncomeExemptNo " +
    "rdoPg2I11IncomeSpecialYes rdoPg2I11IncomeSpecialNo rdoPg2I12TaxRateG rdoPg2I12AMethodDeductionI " +
    "rdoPg2I12AMethodDeductionO rdoPg2I12TaxRateP chkPg2IShed1a_1Spouse txtPg2IShed1a_1SName chkPg2IShed2a_2Spouse " +
    "txtPg2IShed2a_2SName txtPg2IShed1c_3BCI txtPg2IShed1c_3BTW txtPg2IShed2_4A txtPg2IShed2_4B txtPg2IShed2_5B " +
    "txtPg2IShed2_6A txtPg2IShed2_6B txtPg2IShed2_7A txtPg2IShed2_7B txtPg2IShed3_8B txtPg2IShed3_9B txtPg2IShed3_10A " +
    "txtPg2IShed3_10B txtPg2IShed3_11A txtPg2IShed3_11B txtPg2IShed3_12A txtPg2IShed3_12B txtPg2IShed3_13A " +
    "txtPg2IShed3_13B txtPg2IShed3_14A txtPg2IShed3_14B txtPg2IShed3_15A txtPg2IShed3_15B txtPg2IShed3_16A " +
    "txtPg2IShed3_16B txtPg2IShed3_17A txtPg2IShed3_17B txtPg2IShed3_18A txtPg2IShed3_18B txtPg2IShed3_19B " +
    "txtPg2IShed3_20B txtPg2IShed3_21B txtPg2IShed3_22A txtPg2IShed3_22B txtPg2IShed3_23A txtPg2IShed3_23B " +
    "txtPg2IShed3_24A txtPg2IShed3_24B txtPg2IShed3_25A txtPg2IShed3_25B txtPg3TIN1 txtPg3TIN2 txtPg3TIN3 " +
    "txtPg3BranchCode txtPg3TaxpayerName txtPg3IShed3_26B txtPg3IShed3_27Desc txtPg3IShed3_27B txtPg3IShed3_28A " +
    "txtPg3IShed3_28B txtPg3IShed3_29B txtPg3IShed3_30A txtPg3IShed3_30B txtPg3IShed3_31A txtPg3IShed3_31B " +
    "txtPg3IShed3_32A txtPg3IShed3_32B txtPg3IShed4_1B txtPg3IShed4_2B txtPg3IShed4_3B txtPg3IShed4_4B txtPg3IShed4_5B " +
    "txtPg3IShed4_6B txtPg3IShed4_7B txtPg3IShed4_8B txtPg3IShed4_9B txtPg3IShed4_10B txtPg3IShed4_11B txtPg3IShed4_12B " +
    "txtPg3IShed4_13B txtPg3IShed4_14B txtPg3IShed4_15B txtPg3IShed4_16B txtPg3IShed4_17aB txtPg3IShed4_17bB " +
    "txtPg3IShed4_17cB txtPg3IShed4_17dB txtPg3IShed4_18A txtPg3IShed4_18B txtPg3IShed5_3 txtPg3IShed5_4Desc " +
    "txtPg3IShed5_4Legal txtPg3IShed5_4Amt txtPg3IShed5_5Desc txtPg3IShed5_5Legal txtPg3IShed5_5Amt txtPg3IShed5_6 " +
    "txtPg3IShed6_1B txtPg3IShed6_2B txtPg3IShed6_3A txtPg3IShed6_3B txtPg3IShed6_4E txtPg3IShed6_5E txtPg3IShed6_6E " +
    "txtPg3IShed6_7Year txtPg3IShed6_7A txtPg3IShed6_7E txtPg3IShed6_8D txtPg4TIN1 txtPg4TIN2 txtPg4TIN3 " +
    "txtPg4BranchCode txtPg4TaxpayerName txtPg4IShed6_9Year txtPg4IShed6_9A txtPg4IShed6_9B txtPg4IShed6_9C " +
    "txtPg4IShed6_9D txtPg4IShed6_9E txtPg4IShed6_10Year txtPg4IShed6_10A txtPg4IShed6_10B txtPg4IShed6_10C " +
    "txtPg4IShed6_10D txtPg4IShed6_10E txtPg4IShed6_11Year txtPg4IShed6_11A txtPg4IShed6_11B txtPg4IShed6_11C " +
    "txtPg4IShed6_11D txtPg4IShed6_11E txtPg4IShed6_12Year txtPg4IShed6_12A txtPg4IShed6_12B txtPg4IShed6_12C " +
    "txtPg4IShed6_12D txtPg4IShed6_12E txtPg4IShed6_13D txtPg4ISc6_1A txtPg4ISc6_1B txtPg4ISc6_3B txtPg4ISc6_4A " +
    "txtPg4ISc6_4B txtPg4ISc6_5A txtPg4ISc6_5B txtPg4IPart7_1B txtPg4IPart7_2B txtPg4IPart7_3B txtPg4IPart7_4B " +
    "txtPg4IPart7_5A txtPg4IPart7_5B txtPg4IPart7_6B txtPg4IPart7_7B txtPg4IPart7_8B txtPg4IPart7_9B txtPg4IPart7_10A " +
    "txtPg4IPart7_10B txtPg4IPart8_3A txtPg4IPart8_3B txtPg4IPart8_5A txtPg4IPart8_5B txtPg4IPart8_7A txtPg4IPart8_7B " +
    "txtPg4IPart8_10A txtPg4IPart8_10B txtPg4IPart9_1B txtPg4IPart9_2B txtPg4IPart9_3B txtPg4IPart9_4B txtPg4IPart9_5A " +
    "txtPg4IPart9_5B txtPg4IPart9_6B txtPg4IPart9_7B txtPg4IPart9_8B txtPg4IPart9_9B txtPg4IPart9_10A txtPg4IPart9_10B " +
    "txtPg4IPart9_11A txtPg4IPart9_11B txtPg1mTIN1 txtPg1mTIN2 txtPg1mTIN3 txtPg1mBranchCode txtPg1mTaxpayerName " +
    "txtPg2mTIN1 txtPg2mTIN2 txtPg2mTIN3 txtPg2mBranchCode txtPg2mTaxpayerName txtPg3mTIN1 txtPg3mTIN2 txtPg3mTIN3 " +
    "txtPg3mBranchCode txtPg3mTaxpayerName txtPg4mTIN1 txtPg4mTIN2 txtPg4mTIN3 txtPg4mBranchCode txtPg4mTaxpayerName"
  )
    .split(" ")
    .map((x) => (x.startsWith("=") ? x.slice(1) : PFX + x)),
);

/** Which "page" an element sits on: 1–4 the main pages (the only ones a filer reviewing the reopened return — and
 *  test/parity — tabs through), "m" the consolidated Part X/XI pop-up, "t" the hidden attachment template (TYPE). */
function pageOf(id: string): "1" | "2" | "3" | "4" | "m" | "t" | "x" {
  if (/TYPE$/.test(id)) return "t";
  const m = /^frm1701:(?:txt|rdo|chk)Pg(\d)(m?)/.exec(id);
  if (!m) return "x";
  return m[2] ? "m" : (m[1] as "1" | "2" | "3" | "4");
}

type Person = "taxpayer" | "spouse";
type Read = (id: string) => string;

/** One run of BIR's page logic. Ids passed to the BIR-named methods are BIR's own (without "frm1701:"). */
class Sim {
  cell = new Map<string, Cell>();
  order: Cell[] = [];
  // BIR's page globals
  isTPCompIncOnly = false;
  isSPCompIncOnly = false;
  tpHasBusnOrProf = false;
  spHasBusnOrProf = false;
  resetSPRDO = true; // init()'s enableAllControl → checkFields → disableSpouseFields already set it

  constructor() {
    for (const [key, value, radio] of RECORD) {
      const type = cellType(key, value, radio);
      const c: Cell = { id: key, type, name: radio ?? "", v: type === "radio" || type === "checkbox" ? "" : value, dis: INIT_DISABLED.has(key), chk: value === "true" };
      this.cell.set(key, c);
      this.order.push(c);
    }
  }

  // ── DOM primitives ──────────────────────────────────────────────────────────────────────────────────────────
  /** document.getElementById('frm1701:' + id) */
  el(id: string): Cell {
    const c = this.cell.get(PFX + id);
    if (!c) throw new Error(`1701v2018 sim: no element ${id}`);
    return c;
  }
  val(id: string): string {
    return this.el(id).v;
  }
  set(id: string, v: string): void {
    this.el(id).v = v;
  }
  check(c: Cell, on: boolean): void {
    if (on && c.type === "radio" && c.name) for (const o of this.order) if (o.name === c.name && o !== c) o.chk = false;
    c.chk = on;
  }
  checked(id: string): boolean {
    return this.el(id).chk;
  }
  enable(id: string, on = true): void {
    this.el(id).dis = !on;
  }

  // ── BIR's helpers (verbatim semantics) ──────────────────────────────────────────────────────────────────────
  disableAndReset(param: string, type: "radio" | "text" | "number"): void {
    const c = this.el(param);
    if (type === "radio") c.chk = false;
    else if (type === "text") c.v = "";
    else c.v = formatCurrency(NumWithComma(String(0))); // "0.00"
    c.dis = true;
  }
  num(id: string): number {
    return NumWithComma(this.val(id));
  }
  /** getSum: Σ NumWithComma (NaN → 0), written formatCurrency(Math.round(total).toFixed(2)). */
  getSum(params: string, output: string): void {
    let total = 0;
    for (const p of params.split(",")) {
      const n = NumWithComma(this.val(p));
      total += Number.isNaN(n) ? 0 : n;
    }
    for (const o of output.split(",")) this.set(o, formatCurrency(Math.round(total).toFixed(2)));
  }
  getDifference(minuend: string, subtrahend: string, output: string): void {
    const read = (p: string) => {
      const n = NumWithComma(numWithParenthesis(this.val(p)));
      return Number.isNaN(n) ? 0 : n;
    };
    const total = minuend.split(",").reduce((t, p) => t + read(p), 0);
    const total2 = subtrahend.split(",").reduce((t, p) => t + read(p), 0);
    this.set(output, formatCurrency(Math.round(convertToNumber(total) - convertToNumber(total2)).toFixed(2)));
  }
  removeCommaParenthesis(senderID: string): number | string {
    let s: string | number = this.val(senderID);
    if (String(s).includes("(") || String(s).includes(")")) s = numWithParenthesis(String(s));
    if (String(s).includes(",")) s = NumWithComma(String(s));
    return !Number.isNaN(Number(s)) ? Number(s) * 1 : s;
  }
  differenceOfElements(param: string, param2: string, output: string): void {
    const diff = convertToNumber(this.removeCommaParenthesis(param)) - convertToNumber(this.removeCommaParenthesis(param2));
    this.set(output, formatCurrency(Math.round(diff).toFixed(2)));
  }
  getProduct(param1: string, param2: number, output: string): void {
    const n = NumWithComma(numWithParenthesis(this.val(param1)));
    const product = (Number.isNaN(n) ? 0 : n) * param2;
    this.set(output, formatCurrency(Math.round(product).toFixed(2)));
  }
  allFormat(param: string, output: string): void {
    this.set(output, this.val(param));
  }
  /** round(this, 2) on blur. */
  round(c: Cell): void {
    c.v = roundValue(c.v);
  }
  blockletterWithout2Decimal(c: Cell): void {
    const n = parseFloat(c.v);
    c.v = Number.isNaN(n) ? "" : n.toFixed(0);
  }

  // ── page 1 ──────────────────────────────────────────────────────────────────────────────────────────────────
  checkYear(): void {
    if (this.val("txtPg3IShed6_7Year").length >= 3) this.set("txtPg3IShed6_7Year", this.val("txtPg1I1Year"));
    if (this.val("txtPg4IShed6_12Year").length >= 3) this.set("txtPg4IShed6_12Year", this.val("txtPg1I1Year"));
  }
  checkAmendedRtrn(): void {
    if (this.checked("rdoPg1I2AmendedYes")) {
      this.enable("txtPg4IPart7_6A");
      if (this.checked("rdoPg1I18FilingStatusJ")) this.enable("txtPg4IPart7_6B");
    } else if (this.checked("rdoPg1I2AmendedNo")) {
      this.enable("txtPg4IPart7_6A", false);
      this.enable("txtPg4IPart7_6B", false);
    }
  }
  checkShortPeriodRtrn(): void {
    if (this.checked("rdoPg1I3ShortPeriodYes")) {
      this.enable("txtPg1I1Month");
      this.set("txtPg1I1Month", "00");
    } else if (this.checked("rdoPg1I3ShortPeriodNo")) {
      this.set("txtPg1I1Month", "12");
      this.enable("txtPg1I1Month", false);
    }
  }
  TPFilerType(): void {
    let cur = 0;
    if (this.checked("rdoPg1I6TaxpayerTypeS")) cur += 1.5;
    if (this.checked("rdoPg1I6TaxpayerTypeP")) cur += 1.5;
    if (this.checked("rdoPg1I6TaxpayerTypeE")) cur += 2;
    if (this.checked("rdoPg1I6TaxpayerTypeT")) cur += 2;
    if (this.checked("rdoPg1I6TaxpayerTypeC")) cur += 0.5;
    if (cur > 2) for (const x of "SPETC") this.el(`rdoPg1I6TaxpayerType${x}`).chk = false; // resetTPfiler
    this.tpHasBusnOrProf = false;
    this.TPATCcodes();
  }
  TPATCcodes(): void {
    for (const x of ["11", "12", "13", "14", "15", "16", "17"]) this.disableAndReset(`rdoPg1I7ATC_II0${x}`, "radio");
    const t = (x: string) => this.checked(`rdoPg1I6TaxpayerType${x}`);
    const only = (...on: string[]) => [..."SPETC"].every((x) => t(x) === on.includes(x));
    const atc = (...x: string[]) => x.forEach((k) => this.enable(`rdoPg1I7ATC_II0${k}`));
    if (only("S", "C") || only("P", "C")) {
      atc("13", "16");
      this.disableAndReset("txtPg3IShed3_29A", "number");
      this.computeTxtPg3Sc3I30("taxpayer");
      this.isTPCompIncOnly = false;
    } else if (only("S") || only("E") || only("T")) {
      atc("12", "15");
      this.tpHasBusnOrProf = true;
      if (this.checked("rdoPg1I21TaxRateP")) this.enable("txtPg3IShed3_29A"); // isTPEligForReduction
      this.isTPCompIncOnly = false;
    } else if (only("P")) {
      atc("14", "17");
      this.tpHasBusnOrProf = true;
      if (this.checked("rdoPg1I21TaxRateP")) this.enable("txtPg3IShed3_29A");
      this.isTPCompIncOnly = false;
    } else if (only("C")) {
      this.enable("rdoPg1I7ATC_II011");
      this.check(this.el("rdoPg1I7ATC_II011"), true);
      this.disableAndReset("txtPg3IShed3_29A", "number");
      this.computeTxtPg3Sc3I30("taxpayer");
      this.TPATCeffect();
      this.allFormat("txtPg2IShed2_7A", "txtPg1I22ATaxDue");
      this.isTPCompIncOnly = true;
    }
  }
  SPFilerType(): void {
    let cur = 0;
    if (this.checked("rdoPg2I3SpouseTypeS")) cur += 1.5;
    if (this.checked("rdoPg2I3SpouseTypeP")) cur += 1.5;
    if (this.checked("rdoPg2I3SpouseTypeC")) cur += 0.5;
    if (cur > 2) for (const x of "SPC") this.el(`rdoPg2I3SpouseType${x}`).chk = false;
    this.spHasBusnOrProf = false;
    this.SPATCcodes();
  }
  SPATCcodes(): void {
    this.disableAllSPATCcodes();
    const t = (x: string) => this.checked(`rdoPg2I3SpouseType${x}`);
    const only = (...on: string[]) => [..."SPC"].every((x) => t(x) === on.includes(x));
    const atc = (...x: string[]) => x.forEach((k) => this.enable(`rdoPg2I4ATC_II0${k}`));
    if (only("S", "C") || only("P", "C")) {
      atc("13", "16");
      this.disableAndReset("txtPg3IShed3_29B", "number");
      this.computeTxtPg3Sc3I30("spouse");
      this.isSPCompIncOnly = false;
    } else if (only("S")) {
      atc("12", "15");
      this.spHasBusnOrProf = true;
      if (this.checked("rdoPg2I12TaxRateP")) this.enable("txtPg3IShed3_29B");
      this.isSPCompIncOnly = false;
    } else if (only("P")) {
      atc("14", "17");
      this.spHasBusnOrProf = true;
      if (this.checked("rdoPg2I12TaxRateP")) this.enable("txtPg3IShed3_29B");
      this.isSPCompIncOnly = false;
    } else if (only("C")) {
      this.enable("rdoPg2I4ATC_II011");
      this.check(this.el("rdoPg2I4ATC_II011"), true);
      this.disableAndReset("txtPg3IShed3_29B", "number");
      this.computeTxtPg3Sc3I30("spouse");
      this.SPATCeffect();
      this.allFormat("txtPg2IShed2_7B", "txtPg1I22BTaxDue");
      this.isSPCompIncOnly = true;
    }
  }
  disableAllSPATCcodes(): void {
    for (const x of ["11", "12", "13", "14", "15", "16", "17"]) this.disableAndReset(`rdoPg2I4ATC_II0${x}`, "radio");
  }
  checkTaxCred(param: "taxCredYes" | "taxCredNo", field: string): void {
    if (param === "taxCredYes") this.enable(field);
    else {
      this.set(field, "");
      this.enable(field, false);
    }
  }
  enableSpouseFields(param: string): void {
    if (param === "spouseHasInc") {
      this.enable("rdoPg1I17SpouseIncomeYes");
      this.enable("rdoPg1I17SpouseIncomeNo");
    } else if (param === "filingStat") {
      this.enable("rdoPg1I18FilingStatusJ");
      this.enable("rdoPg1I18FilingStatusS");
    } else if (param === "jointFiling") {
      this.spouseFields("enable");
      this.check(this.el("rdoPg2I8ForeignTaxCreditsNo"), true);
    }
  }
  spouseFields(param: "enable" | "disable"): void {
    if (param === "enable") {
      for (const id of ["txtPg1I25B", "txtPg1I27B", "txtPg1I28B", "txtPg1I29B", "txtPg2I2SpouseRDOCode", "txtPg2I1TIN1", "txtPg2I1TIN2", "txtPg2I1TIN3", "txtPg2I1BranchCode", "rdoPg2I3SpouseTypeS", "rdoPg2I3SpouseTypeP", "rdoPg2I3SpouseTypeC"])
        this.enable(id);
      for (let x = 1; x <= 7; x++) this.enable(`rdoPg2I4ATC_II01${x}`);
      for (const id of ["txtPg2I5SpouseName", "txtPg2I6TelNum", "txtPg2I7Citizenship", "rdoPg2I8ForeignTaxCreditsYes", "rdoPg2I8ForeignTaxCreditsNo", "rdoPg2I10IncomeExemptYes", "rdoPg2I10IncomeExemptNo", "rdoPg2I11IncomeSpecialYes", "rdoPg2I11IncomeSpecialNo", "rdoPg2I12TaxRateG", "rdoPg2I12TaxRateP", "chkPg2IShed1a_1Spouse", "chkPg2IShed2a_2Spouse", "txtPg2IShed2_5B"])
        this.enable(id);
      if (this.checked("rdoPg2I12AMethodDeductionI"))
        for (const id of ["txtPg3IShed5_4Desc", "txtPg3IShed5_4Legal", "txtPg3IShed5_4Amt", "txtPg3IShed5_5Desc", "txtPg3IShed5_5Legal", "txtPg3IShed5_5Amt"]) this.enable(id);
      this.enable("txtPg4ISc6_3B");
      for (let ctr = 1; ctr <= 9; ctr++) if (ctr !== 5 && !(ctr === 6 && this.checked("rdoPg1I2AmendedNo"))) this.enable(`txtPg4IPart7_${ctr}B`);
      for (const n of [1, 2, 4, 6, 8, 9]) this.enable(`txtPg4IPart8_${n}B`);
      for (let ctr = 1; ctr <= 9; ctr++) if (ctr !== 5) this.enable(`txtPg4IPart9_${ctr}B`);
      return;
    }
    for (const n of ["25B", "27B", "28B", "29B"]) this.disableAndReset(`txtPg1I${n}`, "number");
    if (this.resetSPRDO) this.set("txtPg2I2SpouseRDOCode", "000");
    this.enable("txtPg2I2SpouseRDOCode", false);
    for (const id of ["txtPg2I1TIN1", "txtPg2I1TIN2", "txtPg2I1TIN3", "txtPg2I1BranchCode"]) this.disableAndReset(id, "text");
    for (const x of "SPC") this.disableAndReset(`rdoPg2I3SpouseType${x}`, "radio");
    this.disableAllSPATCcodes();
    for (const id of ["txtPg2I5SpouseName", "txtPg2I6TelNum", "txtPg2I7Citizenship"]) this.disableAndReset(id, "text");
    this.disableAndReset("rdoPg2I8ForeignTaxCreditsYes", "radio");
    this.disableAndReset("rdoPg2I8ForeignTaxCreditsNo", "radio");
    this.disableAndReset("txtPg2I9ForeignTaxNumber", "text");
    for (const id of ["rdoPg2I10IncomeExemptYes", "rdoPg2I10IncomeExemptNo", "rdoPg2I11IncomeSpecialYes", "rdoPg2I11IncomeSpecialNo", "rdoPg2I12TaxRateG", "rdoPg2I12TaxRateP", "rdoPg2I12AMethodDeductionI", "rdoPg2I12AMethodDeductionO", "chkPg2IShed1a_1Spouse", "chkPg2IShed2a_2Spouse"])
      this.disableAndReset(id, "radio");
    this.disableAndReset("txtPg2IShed2a_2SName", "text"); // BIR bug: Sched 1 employer 1's spouse name (1a_1SName) is not cleared
    for (const id of ["txtPg2IShed1c_3BCI", "txtPg2IShed1c_3BTW", "txtPg2IShed2_5B", "txtPg2IShed3_8B", "txtPg2IShed3_9B", "txtPg2IShed3_11B", "txtPg2IShed3_19B", "txtPg2IShed3_20B", "txtPg2IShed3_21B", "txtPg3IShed3_26B", "txtPg3IShed3_27B", "txtPg3IShed3_29B"])
      this.disableAndReset(id, "number");
    for (let i = 1; i <= 16; i++) this.disableAndReset(`txtPg3IShed4_${i}B`, "number");
    for (const x of ["a", "b", "c", "d"]) this.disableAndReset(`txtPg3IShed4_17${x}B`, "number");
    if (this.el("txtPg3IShed4_17dA").dis && this.el("txtPg3IShed4_17dB").dis) this.disableAndReset("txtPg3IShed4_17dDesc", "text");
    for (const n of [4, 5]) {
      this.disableAndReset(`txtPg3IShed5_${n}Desc`, "text");
      this.disableAndReset(`txtPg3IShed5_${n}Legal`, "text");
      this.disableAndReset(`txtPg3IShed5_${n}Amt`, "number");
    }
    this.disableAndReset("txtPg3IShed6_1B", "number");
    this.disableAndReset("txtPg3IShed6_2B", "number");
    for (let ctr = 9; ctr <= 12; ctr++) {
      this.disableAndReset(`txtPg4IShed6_${ctr}Year`, "text");
      for (const c of "ABCD") this.disableAndReset(`txtPg4IShed6_${ctr}${c}`, "number");
    }
    this.disableAndReset("txtPg4ISc6_1B", "number");
    this.disableAndReset("txtPg4ISc6_3B", "number"); // BIR bug: Sc6_2B (special-rate tax due) stays live and keeps its value
    for (let ctr = 1; ctr <= 9; ctr++) if (ctr !== 5) this.disableAndReset(`txtPg4IPart7_${ctr}B`, "number");
    for (const n of [1, 2, 4, 6, 8, 9]) this.disableAndReset(`txtPg4IPart8_${n}B`, "number");
    for (let ctr = 1; ctr <= 9; ctr++) if (ctr !== 5) this.disableAndReset(`txtPg4IPart9_${ctr}B`, "number");
    this.computeTxtPg4Pt7I10("spouse");
    this.computeTxtPg1I24("spouse");
    this.copyToPt7I5("spouse");
    this.computeTxtPg2Sc2I4CI("spouse");
    this.computeTxtPg2I10("spouse");
    this.computeTxtPg2I22("spouse");
    this.computeTxtPg3Sc3I28("spouse");
    this.computePg3Sc4I18("spouse");
    this.computePg3Sc5I6();
    this.computePg3Sc6I3("spouse", "none");
    for (const n of [9, 10, 11]) this.computePg4Sc6IxE(n);
    this.computePg4Sc6I12E();
    this.computePg3Sc6I13D();
    this.computePg4Sc6I4("spouse");
    this.computeTxtPg4Pt8I3("spouse");
    this.computeTxtPg4Pt8I10("spouse");
    this.computeTxtPg4Pt9I5("spouse");
  }
  disableSpouseFields(param: string): void {
    if (param === "noSpouse") {
      for (const id of ["rdoPg1I17SpouseIncomeYes", "rdoPg1I17SpouseIncomeNo", "rdoPg1I18FilingStatusJ", "rdoPg1I18FilingStatusS"]) this.disableAndReset(id, "radio");
    } else if (param === "spouseNoInc") {
      this.disableAndReset("rdoPg1I18FilingStatusJ", "radio");
      this.disableAndReset("rdoPg1I18FilingStatusS", "radio");
    }
    this.resetSPRDO = true;
    this.spouseFields("disable");
    this.disableFieldsForGRRate("B");
    this.disableFieldsForEightPerRate("B");
  }
  emplyrDetails(param: string, field: "TP" | "SPS"): void {
    if (field === "TP") {
      this.set(`txt${param}SName`, "");
      this.enable(`txt${param}SName`, false);
      this.enable(`txt${param}TPName`);
    } else {
      this.set(`txt${param}TPName`, "");
      this.enable(`txt${param}TPName`, false);
      this.enable(`txt${param}SName`);
    }
    const tin = param === "Pg2IShed1a_1" ? "Pg2IShed1a" : "Pg2IShed2a";
    for (const x of ["TIN1", "TIN2", "TIN3", "BranchCode"]) this.enable(`txt${tin}_${x}`);
    if (param === "Pg2IShed1a_1") {
      if (field === "TP") {
        this.enable("txtPg2IShed1c_3ACI");
        this.enable("txtPg2IShed1c_3ATW");
      } else {
        this.disableAndReset("txtPg2IShed1c_3ACI", "number");
        this.disableAndReset("txtPg2IShed1c_3ATW", "number");
      }
    } else if (field === "SPS") {
      this.enable("txtPg2IShed1c_3BCI");
      this.enable("txtPg2IShed1c_3BTW");
    } else {
      this.disableAndReset("txtPg2IShed1c_3BCI", "number");
      this.disableAndReset("txtPg2IShed1c_3BTW", "number");
    }
  }

  // ── tax regime switches ─────────────────────────────────────────────────────────────────────────────────────
  TPATCeffect(): void {
    const a = (x: string) => this.checked(`rdoPg1I7ATC_II0${x}`);
    if (a("11")) {
      for (const id of ["rdoPg1I21TaxRateG", "rdoPg1I21TaxRateP", "rdoPg1I21AMethodDeductionI", "rdoPg1I21AMethodDeductionO"]) this.disableAndReset(id, "radio");
      this.TPenableP5Sched1Fields();
      this.P5Sched2Field("A", "enable");
      this.disableFieldsForGRRate("A");
      this.disableFieldsForEightPerRate("A");
      this.populateTotalAllowDeduc("taxpayer");
      this.computeTxtPg2I16("taxpayer");
      this.computeTxtPg3Sc3I32("taxpayer");
      this.TPdisableP5Sched4Fields();
      this.TPdisableP5Sched5Fields();
      this.TPdisableP5Sched6Fields();
    } else if (a("12") || a("14")) {
      this.check(this.el("rdoPg1I21TaxRateG"), true);
      this.disableAndReset("rdoPg1I21TaxRateP", "radio");
      this.taxRateEnableDisableFields("taxpayer", "GR");
      this.P5Sched2Field("A", "disable");
      this.TPdisableP5Sched1Fields();
      this.taxRateSelect("GR", "rdoPg1I21A");
    } else if (a("13")) {
      this.check(this.el("rdoPg1I21TaxRateG"), true);
      this.disableAndReset("rdoPg1I21TaxRateP", "radio");
      this.taxRateEnableDisableFields("taxpayer", "GR");
      this.TPenableP5Sched1Fields();
      this.P5Sched2Field("A", "enable");
      this.taxRateSelect("GR", "rdoPg1I21A");
    } else if (a("15") || a("17") || a("16")) {
      this.check(this.el("rdoPg1I21TaxRateP"), true);
      for (const id of ["rdoPg1I21TaxRateG", "rdoPg1I21AMethodDeductionI", "rdoPg1I21AMethodDeductionO"]) this.disableAndReset(id, "radio");
      this.taxRateEnableDisableFields("taxpayer", "8%");
      if (a("16")) {
        this.TPenableP5Sched1Fields();
        this.P5Sched2Field("A", "enable");
      } else {
        this.P5Sched2Field("A", "disable");
        this.TPdisableP5Sched1Fields();
      }
      this.disableFor8Perc();
      this.computePg3Sc4I18("taxpayer");
    }
  }
  SPATCeffect(): void {
    const a = (x: string) => this.checked(`rdoPg2I4ATC_II0${x}`);
    if (a("11")) {
      for (const id of ["rdoPg2I12TaxRateG", "rdoPg2I12AMethodDeductionI", "rdoPg2I12AMethodDeductionO", "rdoPg2I12TaxRateP"]) this.disableAndReset(id, "radio");
      this.SPenableP5Sched1Fields();
      this.P5Sched2Field("B", "enable");
      this.disableFieldsForGRRate("B");
      this.disableFieldsForEightPerRate("B");
      this.populateTotalAllowDeduc("spouse");
      this.computeTxtPg2I16("spouse");
      this.computeTxtPg3Sc3I32("spouse");
      this.SPdisableP5Sched4Fields();
      this.SPdisableP5Sched5Fields();
      this.SPdisableP5Sched6Fields();
      this.controlPart9Fields("spouse", "disable");
    } else if (a("12") || a("14")) {
      this.check(this.el("rdoPg2I12TaxRateG"), true);
      this.disableAndReset("rdoPg2I12TaxRateP", "radio");
      this.taxRateEnableDisableFields("spouse", "GR");
      this.P5Sched2Field("B", "disable");
      this.SPdisableP5Sched1Fields();
      this.taxRateSelect("GR", "rdoPg2I12A");
      this.controlPart9Fields("spouse", "enable");
    } else if (a("13")) {
      this.check(this.el("rdoPg2I12TaxRateG"), true);
      this.disableAndReset("rdoPg2I12TaxRateP", "radio");
      this.taxRateEnableDisableFields("spouse", "GR");
      this.SPenableP5Sched1Fields();
      this.P5Sched2Field("B", "enable");
      this.taxRateSelect("GR", "rdoPg2I12A");
      this.controlPart9Fields("spouse", "enable");
    } else if (a("15") || a("17") || a("16")) {
      this.check(this.el("rdoPg2I12TaxRateP"), true);
      for (const id of ["rdoPg2I12TaxRateG", "rdoPg2I12AMethodDeductionI", "rdoPg2I12AMethodDeductionO"]) this.disableAndReset(id, "radio");
      this.taxRateEnableDisableFields("spouse", "8%");
      if (a("16")) {
        this.SPenableP5Sched1Fields();
        this.P5Sched2Field("B", "enable");
      } else {
        this.P5Sched2Field("B", "disable");
        this.SPdisableP5Sched1Fields();
      }
      this.disableFor8Perc();
      this.computePg3Sc4I18("spouse");
      this.controlPart9Fields("spouse", "enable");
    }
  }
  disableFor8Perc(): void {
    if (this.checked("rdoPg1I21TaxRateP")) {
      this.TPdisableP5Sched4Fields();
      this.TPdisableP5Sched5Fields();
      this.TPdisableP5Sched6Fields();
    }
    if (this.checked("rdoPg2I12TaxRateP")) {
      this.SPdisableP5Sched4Fields();
      this.SPdisableP5Sched5Fields();
      this.SPdisableP5Sched6Fields();
    }
  }
  GRrateSelect(): void {
    if (this.checked("rdoPg1I21AMethodDeductionI")) {
      this.enableP5Sched4Fields("A");
      this.enableP5Sched5Fields(1, 2);
      this.enableP5Sched6Fields();
    } else if (this.checked("rdoPg1I21AMethodDeductionO")) {
      this.TPdisableP5Sched4Fields();
      this.TPdisableP5Sched5Fields();
      this.TPdisableP5Sched6Fields();
    }
    if (this.checked("rdoPg2I12AMethodDeductionI")) {
      this.enableP5Sched4Fields("B");
      this.enableP5Sched5Fields(4, 5);
      this.enableP5Sched6Fields();
    } else if (this.checked("rdoPg2I12AMethodDeductionO")) {
      this.SPdisableP5Sched4Fields();
      this.SPdisableP5Sched5Fields();
      this.SPdisableP5Sched6Fields();
    }
  }
  sched1Reset(): void {
    if (!this.checked("chkPg2IShed1a_1Taxpayer") && !this.checked("chkPg2IShed1a_1Spouse")) {
      this.disableAndReset("txtPg2IShed1c_1CI", "number");
      this.disableAndReset("txtPg2IShed1c_1TW", "number");
      for (const x of ["TIN1", "TIN2", "TIN3", "BranchCode"]) this.disableAndReset(`txtPg2IShed1a_${x}`, "text");
    }
    if (!this.checked("chkPg2IShed2a_2Taxpayer") && !this.checked("chkPg2IShed2a_2Spouse")) {
      this.disableAndReset("txtPg2IShed1c_2CI", "number");
      this.disableAndReset("txtPg2IShed1c_2TW", "number");
      for (const x of ["TIN1", "TIN2", "TIN3", "BranchCode"]) this.disableAndReset(`txtPg2IShed2a_${x}`, "text");
    }
  }
  TPdisableP5Sched1Fields(): void {
    this.disableAndReset("chkPg2IShed1a_1Taxpayer", "radio");
    this.disableAndReset("chkPg2IShed2a_2Taxpayer", "radio");
    this.disableAndReset("txtPg2IShed1a_1TPName", "text");
    this.disableAndReset("txtPg2IShed2a_2TPName", "text");
    this.disableAndReset("txtPg2IShed1c_3ACI", "number");
    this.disableAndReset("txtPg2IShed1c_3ATW", "number");
    this.sched1Reset();
    this.computeTxtPg2Sc2I4CI("taxpayer");
    this.copyToPt7I5("taxpayer");
  }
  TPenableP5Sched1Fields(): void {
    for (const id of ["chkPg2IShed1a_1Taxpayer", "chkPg2IShed2a_2Taxpayer", "txtPg2IShed1c_1CI", "txtPg2IShed1c_1TW", "txtPg2IShed1c_2CI", "txtPg2IShed1c_2TW", "txtPg2IShed1c_3ACI", "txtPg2IShed1c_3ATW"]) this.enable(id);
  }
  SPdisableP5Sched1Fields(): void {
    this.disableAndReset("chkPg2IShed1a_1Spouse", "radio");
    this.disableAndReset("chkPg2IShed2a_2Spouse", "radio");
    this.disableAndReset("txtPg2IShed1a_1SName", "text");
    this.disableAndReset("txtPg2IShed2a_2SName", "text");
    this.disableAndReset("txtPg2IShed1c_3BCI", "number");
    this.disableAndReset("txtPg2IShed1c_3BTW", "number");
    this.sched1Reset();
    this.computeTxtPg2Sc2I4CI("spouse");
    this.copyToPt7I5("spouse");
  }
  SPenableP5Sched1Fields(): void {
    for (const id of ["chkPg2IShed1a_1Spouse", "chkPg2IShed2a_2Spouse", "txtPg2IShed1c_1CI", "txtPg2IShed1c_1TW", "txtPg2IShed1c_2CI", "txtPg2IShed1c_2TW", "txtPg2IShed1c_3BCI", "txtPg2IShed1c_3BTW"]) this.enable(id);
  }
  P5Sched2Field(field: "A" | "B", param: "enable" | "disable"): void {
    if (param === "enable") this.enable(`txtPg2IShed2_5${field}`);
    else this.disableAndReset(`txtPg2IShed2_5${field}`, "number");
  }
  sched4Off(s: "A" | "B"): void {
    for (let i = 1; i <= 16; i++) this.disableAndReset(`txtPg3IShed4_${i}${s}`, "number");
    for (const x of ["a", "b", "c", "d"]) this.disableAndReset(`txtPg3IShed4_17${x}${s}`, "number");
  }
  sched5Off(a: number, b: number): void {
    for (const n of [a, b]) {
      this.disableAndReset(`txtPg3IShed5_${n}Desc`, "text");
      this.disableAndReset(`txtPg3IShed5_${n}Legal`, "text");
      this.disableAndReset(`txtPg3IShed5_${n}Amt`, "number");
    }
  }
  TPdisableP5Sched4Fields(): void {
    this.sched4Off("A");
    this.sched5Off(1, 2);
    if (this.el("txtPg3IShed4_17dA").dis && this.el("txtPg3IShed4_17dB").dis) this.disableAndReset("txtPg3IShed4_17dDesc", "text");
    this.disableAndReset("txtPg3IShed4_18A", "number");
  }
  SPdisableP5Sched4Fields(): void {
    this.sched4Off("B");
    this.sched5Off(4, 5);
    if (this.el("txtPg3IShed4_17dA").dis && this.el("txtPg3IShed4_17dB").dis) this.disableAndReset("txtPg3IShed4_17dDesc", "text");
    this.disableAndReset("txtPg3IShed4_18B", "number");
  }
  enableP5Sched4Fields(s: "A" | "B"): void {
    for (let i = 1; i <= 16; i++) this.enable(`txtPg3IShed4_${i}${s}`);
    this.enable("txtPg3IShed4_17dDesc");
    for (const x of ["a", "b", "c", "d"]) this.enable(`txtPg3IShed4_17${x}${s}`);
  }
  TPdisableP5Sched5Fields(): void {
    this.sched5Off(1, 2);
    this.computePg3Sc5I3();
  }
  SPdisableP5Sched5Fields(): void {
    this.sched5Off(4, 5);
    this.computePg3Sc5I6();
  }
  enableP5Sched5Fields(start: number, end: number): void {
    for (let i = start; i <= end; i++) for (const x of ["Desc", "Legal", "Amt"]) this.enable(`txtPg3IShed5_${i}${x}`);
  }
  TPdisableP5Sched6Fields(): void {
    this.disableAndReset("txtPg3IShed6_1A", "number");
    this.disableAndReset("txtPg3IShed6_2A", "number");
    for (let i = 4; i <= 7; i++) {
      this.disableAndReset(`txtPg3IShed6_${i}Year`, "text");
      for (const c of "ABCDE") this.disableAndReset(`txtPg3IShed6_${i}${c}`, "number");
    }
    this.computePg3Sc6I3("taxpayer", "none");
    this.disableAndReset("txtPg3IShed6_8D", "number");
  }
  SPdisableP5Sched6Fields(): void {
    this.disableAndReset("txtPg3IShed6_1B", "number");
    this.disableAndReset("txtPg3IShed6_2B", "number");
    for (let i = 9; i <= 12; i++) {
      this.disableAndReset(`txtPg4IShed6_${i}Year`, "text");
      for (const c of "ABCDE") this.disableAndReset(`txtPg4IShed6_${i}${c}`, "number");
    }
    this.computePg3Sc6I3("spouse", "none");
    this.disableAndReset("txtPg4IShed6_13D", "number");
  }
  enableP5Sched6Fields(): void {
    if (this.checked("rdoPg1I21TaxRateG") && this.checked("rdoPg1I21AMethodDeductionI")) {
      this.enable("txtPg3IShed6_1A");
      this.enable("txtPg3IShed6_2A");
      for (let i = 4; i <= 7; i++) {
        if (i !== 7) {
          this.enable(`txtPg3IShed6_${i}Year`);
          this.enable(`txtPg3IShed6_${i}A`);
        }
        for (const c of "BCD") this.enable(`txtPg3IShed6_${i}${c}`);
      }
    }
    if (this.checked("rdoPg2I12TaxRateG") && this.checked("rdoPg2I12AMethodDeductionI")) {
      this.enable("txtPg3IShed6_1B");
      this.enable("txtPg3IShed6_2B");
      for (let i = 9; i <= 12; i++) {
        if (i !== 12) {
          this.enable(`txtPg4IShed6_${i}Year`);
          this.enable(`txtPg4IShed6_${i}A`);
        }
        for (const c of "BCD") this.enable(`txtPg4IShed6_${i}${c}`);
      }
    }
  }
  taxRateSelect(param: "GR" | "8%", field: string): void {
    if (param === "GR") {
      this.enable(`${field}MethodDeductionI`);
      this.enable(`${field}MethodDeductionO`);
    } else {
      this.disableAndReset(`${field}MethodDeductionI`, "radio");
      this.disableAndReset(`${field}MethodDeductionO`, "radio");
    }
  }
  taxRateEnableDisableFields(person: Person, rate: "GR" | "8%"): void {
    const s = person === "taxpayer" ? "A" : "B";
    if (rate === "GR") {
      this.computeTxtPg2I22(person);
      this.enableFieldsForGRRate(s);
      this.disableFieldsForGRRate(s);
      this.populateTotalAllowDeduc(person);
      this.computeTxtPg2I16(person);
    } else {
      this.methodRate(person);
      this.enableFieldsForEightPerRate(s);
      this.disableFieldsForEightPerRate(s);
      this.computeTxtPg3Sc3I32(person);
    }
  }
  enableFieldsForGRRate(s: string): void {
    for (const id of [`txtPg2IShed3_8${s}`, `txtPg2IShed3_9${s}`, "txtPg2IShed3_19Desc", "txtPg2IShed3_20Desc", `txtPg2IShed3_19${s}`, `txtPg2IShed3_20${s}`, `txtPg2IShed3_21${s}`]) this.enable(id);
  }
  controlPart9Fields(person: Person, param: "enable" | "disable"): void {
    const s = person === "taxpayer" ? "A" : "B";
    for (let ctr = 1; ctr <= 9; ctr++) {
      if (ctr === 5) continue;
      if (param === "enable") this.enable(`txtPg4IPart9_${ctr}${s}`);
      else this.disableAndReset(`txtPg4IPart9_${ctr}${s}`, "number");
    }
    if (param === "disable") this.computeTxtPg4Pt9I5(person);
  }
  ifItemized(field: string, item: string): void {
    if (this.checked(`rdo${field}MethodDeductionI`)) this.enable(`txtPg2IShed3_11${item}`);
    else if (this.checked(`rdo${field}MethodDeductionO`)) {
      this.disableAndReset(`txtPg2IShed3_11${item}`, "number");
      this.differenceOfElements(`txtPg2IShed3_10${item}`, `txtPg2IShed3_11${item}`, `txtPg2IShed3_12${item}`);
    }
  }
  disableFieldsForGRRate(s: string): void {
    for (let ctr = 26; ctr <= 32; ctr++) this.disableAndReset(`txtPg3IShed3_${ctr}${s}`, "number");
    if (this.el("txtPg3IShed3_27A").dis && this.el("txtPg3IShed3_27B").dis) this.disableAndReset("txtPg3IShed3_27Desc", "text");
  }
  enableFieldsForEightPerRate(s: string): void {
    this.enable(`txtPg3IShed3_26${s}`);
    this.enable(`txtPg3IShed3_27${s}`);
    this.enable("txtPg3IShed3_27Desc");
    if (s === "A" && this.tpHasBusnOrProf) this.enable("txtPg3IShed3_29A");
    else if (s === "B" && this.spHasBusnOrProf) this.enable("txtPg3IShed3_29B");
  }
  disableFieldsForEightPerRate(s: string): void {
    for (let ctr = 8; ctr <= 25; ctr++) this.disableAndReset(`txtPg2IShed3_${ctr}${s}`, "number");
    if (this.el("txtPg2IShed3_19A").dis && this.el("txtPg2IShed3_19B").dis) {
      this.disableAndReset("txtPg2IShed3_19Desc", "text");
      this.disableAndReset("txtPg2IShed3_20Desc", "text");
    }
  }

  // ── computations ────────────────────────────────────────────────────────────────────────────────────────────
  methodRate(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    const rdo = person === "taxpayer" ? "Pg1I21A" : "Pg2I12A";
    this.ifItemized(rdo, s);
    if (this.checked(`rdo${rdo}MethodDeductionI`)) {
      this.populateTotalAllowDeduc(person);
      this.getSum(`txtPg2IShed3_13${s},txtPg2IShed3_14${s},txtPg2IShed3_15${s}`, `txtPg2IShed3_16${s}`);
      this.differenceOfElements(`txtPg2IShed3_12${s}`, `txtPg2IShed3_16${s}`, `txtPg2IShed3_18${s}`);
      this.disableAndReset(`txtPg2IShed3_17${s}`, "number");
    } else if (this.checked(`rdo${rdo}MethodDeductionO`)) {
      this.computeTxtPg2I17(person);
      this.differenceOfElements(`txtPg2IShed3_10${s}`, `txtPg2IShed3_17${s}`, `txtPg2IShed3_18${s}`);
      for (const n of [13, 14, 15, 16]) this.disableAndReset(`txtPg2IShed3_${n}${s}`, "number");
      this.disableAndReset(person === "taxpayer" ? "txtPg3IShed6_7Year" : "txtPg4IShed6_12Year", "text");
    } else this.disableAndReset(`txtPg2IShed3_18${s}`, "number");
    this.computeTxtPg2I23(person);
  }
  computeTxtPg2Sc2I4CI(person: Person): void {
    if (person === "taxpayer") this.allFormat("txtPg2IShed1c_3ACI", "txtPg2IShed2_4A");
    else this.allFormat("txtPg2IShed1c_3BCI", "txtPg2IShed2_4B");
    this.computeTxtPg2I6(person);
  }
  computeTxtPg2I6(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.differenceOfElements(`txtPg2IShed2_4${s}`, `txtPg2IShed2_5${s}`, `txtPg2IShed2_6${s}`);
    this.computeTxtPg1I7(person);
    this.computeTxtPg2I24(person);
  }
  computeTxtPg1I7(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.set(`txtPg2IShed2_7${s}`, this.calcTaxAmt(`txtPg2IShed2_6${s}`));
    this.set(`txtPg2IShed2_7${s}`, formatCurrency((NumWithComma(this.val(`txtPg2IShed2_7${s}`)) * 1).toFixed(0)));
    if (person === "taxpayer" ? this.isTPCompIncOnly : this.isSPCompIncOnly) {
      this.allFormat(`txtPg2IShed2_7${s}`, `txtPg1I22${s}TaxDue`);
      this.computeTxtPg1I24(person);
    }
    this.computeTxtPg3Sc3I30(person);
  }
  /** calcTaxAmt: BIR's two TRAIN tables by the year of item 1 (2018–2022 / 2023+). Any other year (blank, < 2018)
   *  returns `undefined`, which the caller writes and then reformats to "0.00". Returned as BIR assigns it to .value. */
  calcTaxAmt(field: string): string {
    const taxInc = this.num(field);
    const y = Number(this.val("txtPg1I1Year"));
    let amount: number | undefined;
    if (y >= 2018 && y <= 2022) {
      if (taxInc <= 250000) amount = 0;
      else if (taxInc <= 400000) amount = (taxInc - 250000) * 0.2;
      else if (taxInc <= 800000) amount = (taxInc - 400000) * 0.25 + 30000;
      else if (taxInc <= 2000000) amount = (taxInc - 800000) * 0.3 + 130000;
      else if (taxInc <= 8000000) amount = (taxInc - 2000000) * 0.32 + 490000;
      else if (taxInc > 8000000) amount = (taxInc - 8000000) * 0.35 + 2410000;
    } else if (y >= 2023) {
      if (taxInc <= 250000) amount = 0;
      else if (taxInc <= 400000) amount = (taxInc - 250000) * 0.15;
      else if (taxInc <= 800000) amount = (taxInc - 400000) * 0.2 + 22500;
      else if (taxInc <= 2000000) amount = (taxInc - 800000) * 0.25 + 102500;
      else if (taxInc <= 8000000) amount = (taxInc - 2000000) * 0.3 + 402500;
      else if (taxInc > 8000000) amount = (taxInc - 8000000) * 0.35 + 2202500;
    }
    return String(amount); // NaN income falls through every branch → "undefined"; 0 → "0"
  }
  computeTxtPg2I10(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.differenceOfElements(`txtPg2IShed3_8${s}`, `txtPg2IShed3_9${s}`, `txtPg2IShed3_10${s}`);
    this.computeTxtPg2I12(person);
  }
  computeTxtPg2I12(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.differenceOfElements(`txtPg2IShed3_10${s}`, `txtPg2IShed3_11${s}`, `txtPg2IShed3_12${s}`);
    this.computeTxtPg2I16(person);
  }
  computeTxtPg2I16(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg2IShed3_13${s},txtPg2IShed3_14${s},txtPg2IShed3_15${s}`, `txtPg2IShed3_16${s}`);
    this.computeTxtPg2I17(person);
    this.methodRate(person);
    this.computeTxtPg2I22(person);
  }
  computeTxtPg2I17(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getProduct(`txtPg2IShed3_10${s}`, 0.4, `txtPg2IShed3_17${s}`);
  }
  computeTxtPg2I22(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg2IShed3_19${s},txtPg2IShed3_20${s},txtPg2IShed3_21${s}`, `txtPg2IShed3_22${s}`);
    this.computeTxtPg2I23(person);
  }
  computeTxtPg2I23(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg2IShed3_18${s},txtPg2IShed3_22${s}`, `txtPg2IShed3_23${s}`);
    this.computeTxtPg2I24(person);
  }
  computeTxtPg2I24(person: Person): void {
    if (person === "taxpayer" && this.checked("rdoPg1I21TaxRateG")) {
      this.getSum("txtPg2IShed2_6A,txtPg2IShed3_23A", "txtPg2IShed3_24A");
      this.computeTxtPg2I25(person);
    } else if (person === "spouse" && this.checked("rdoPg2I12TaxRateG")) {
      this.getSum("txtPg2IShed2_6B,txtPg2IShed3_23B", "txtPg2IShed3_24B");
      this.computeTxtPg2I25(person);
    }
  }
  computeTxtPg2I25(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.set(`txtPg2IShed3_25${s}`, this.calcTaxAmt(`txtPg2IShed3_24${s}`));
    this.set(`txtPg2IShed3_25${s}`, formatCurrency((NumWithComma(this.val(`txtPg2IShed3_25${s}`)) * 1).toFixed(0)));
    this.allFormat(`txtPg2IShed3_25${s}`, `txtPg4ISc6_1${s}`);
    this.computePg4Sc6I4(person);
  }
  computeTxtPg1I24(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.set(`txtPg1I24${s}TaxPayable`, formatCurrency(this.num(`txtPg1I22${s}TaxDue`) - this.num(`txtPg1I23${s}`)));
    this.isTxtPg1I25Allowed(person);
    this.computeTxtPg1I26(person);
  }
  isTxtPg1I25Allowed(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    if (this.num(`txtPg1I24${s}TaxPayable`) <= 0) this.disableAndReset(`txtPg1I25${s}`, "number");
    else this.enable(`txtPg1I25${s}`);
  }
  validateTxtPg1I25Part2(person: Person): boolean {
    const s = person === "taxpayer" ? "A" : "B";
    const total = (this.num(`txtPg1I22${s}TaxDue`) * 50) / 100;
    return this.num(`txtPg1I25${s}`) > total;
  }
  computeTxtPg1I26(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    if (this.validateTxtPg1I25Part2(person)) this.set(`txtPg1I25${s}`, (0).toFixed(2)); // 25 may not exceed 50% of 22
    this.set(`txtPg1I26${s}`, formatCurrency(this.num(`txtPg1I24${s}TaxPayable`) - this.num(`txtPg1I25${s}`)));
    this.computeTxtPg1I30(person);
  }
  computeTxtPg1I30(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.set(`txtPg1I30${s}`, formatCurrency(this.num(`txtPg1I27${s}`) + this.num(`txtPg1I28${s}`) + this.num(`txtPg1I29${s}`)));
    this.computeTxtPg1I31(person);
  }
  computeTxtPg1I31(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.set(`txtPg1I31${s}TotalAmtPyble`, formatCurrency(this.num(`txtPg1I26${s}`) + this.num(`txtPg1I30${s}`)));
    // BIR quirk: an overpayment (26 < 0) with penalties shows just the penalties
    if (this.num(`txtPg1I26${s}`) < 0 && this.num(`txtPg1I30${s}`) > 0) this.set(`txtPg1I31${s}TotalAmtPyble`, formatCurrency(this.num(`txtPg1I30${s}`)));
    this.computeTxtPg1I32();
  }
  computeTxtPg1I32(): void {
    this.set("txtPg1I32AggregateAmtPyble", formatCurrency(this.num("txtPg1I31ATotalAmtPyble") + this.num("txtPg1I31BTotalAmtPyble")));
    this.ifOverpayment();
  }
  ifOverpayment(): void {
    const ids = ["rdoPg1OverpaymentRefund", "rdoPg1OverpaymentTCC", "rdoPg1OverpaymentCarryOver"];
    if (this.num("txtPg1I26A") < 0 || this.num("txtPg1I26B") < 0) for (const id of ids) this.enable(id);
    else if (this.num("txtPg1I26A") >= 0 && this.num("txtPg1I26B") >= 0) for (const id of ids) this.disableAndReset(id, "radio");
  }
  computeTxtPg3Sc3I28(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg3IShed3_26${s},txtPg3IShed3_27${s}`, `txtPg3IShed3_28${s}`);
    this.computeTxtPg3Sc3I30(person);
  }
  computeTxtPg3Sc3I30(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    if (!this.checked(person === "taxpayer" ? "rdoPg1I21TaxRateP" : "rdoPg2I12TaxRateP")) return;
    if (this.num(`txtPg3IShed3_29${s}`) > 250000) this.set(`txtPg3IShed3_29${s}`, "0.00"); // the ₱250,000 reduction cap
    this.differenceOfElements(`txtPg3IShed3_28${s}`, `txtPg3IShed3_29${s}`, `txtPg3IShed3_30${s}`);
    this.computeTxtPg3Sc3I31(person);
  }
  computeTxtPg3Sc3I31(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    const v = this.num(`txtPg3IShed3_30${s}`);
    if (v > 0) this.getProduct(`txtPg3IShed3_30${s}`, 0.08, `txtPg3IShed3_31${s}`);
    else if (v < 0) this.set(`txtPg3IShed3_31${s}`, "0.00"); // BIR bug: 30 = 0 leaves a stale 31
    this.computeTxtPg3Sc3I32(person);
  }
  computeTxtPg3Sc3I32(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg2IShed2_7${s},txtPg3IShed3_31${s}`, `txtPg3IShed3_32${s}`);
    this.allFormat(`txtPg3IShed3_32${s}`, `txtPg4ISc6_1${s}`);
    this.computePg4Sc6I4(person);
  }
  computePg3Sc4I18(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    const item = [...Array.from({ length: 16 }, (_, i) => `${i + 1}`), "17a", "17b", "17c", "17d"].map((n) => `txtPg3IShed4_${n}${s}`);
    this.getSum(item.join(","), `txtPg3IShed4_18${s}`);
    this.populateTotalAllowDeduc(person);
    this.computeTxtPg2I16(person);
  }
  computePg3Sc5I3(): void {
    this.getSum("txtPg3IShed5_1Amt,txtPg3IShed5_2Amt", "txtPg3IShed5_3");
    this.populateTotalAllowDeduc("taxpayer");
    this.computeTxtPg2I16("taxpayer");
  }
  computePg3Sc5I6(): void {
    this.getSum("txtPg3IShed5_4Amt,txtPg3IShed5_5Amt", "txtPg3IShed5_6");
    this.computeTxtPg2I16("spouse"); // (no populateTotalAllowDeduc here; methodRate's itemized branch refreshes 14B)
  }
  computePg3Sc6I3(person: Person, field: string): void {
    if (person === "taxpayer") {
      if (this.num("txtPg3IShed6_2A") < this.num("txtPg3IShed6_1A") && field === "item2") this.set("txtPg3IShed6_2A", "0.00");
      this.differenceOfElements("txtPg3IShed6_1A", "txtPg3IShed6_2A", "txtPg3IShed6_3A");
      this.computePg3Sc6I7E();
      if (this.checked("rdoPg1I21AMethodDeductionI") && this.num("txtPg3IShed6_7A") > 0) this.set("txtPg3IShed6_7Year", this.val("txtPg1I1Year"));
    } else {
      if (this.num("txtPg3IShed6_2B") < this.num("txtPg3IShed6_1B") && field === "item2") this.set("txtPg3IShed6_2B", "0.00");
      this.differenceOfElements("txtPg3IShed6_1B", "txtPg3IShed6_2B", "txtPg3IShed6_3B");
      this.computePg4Sc6I12E();
      if (this.checked("rdoPg2I12AMethodDeductionI") && this.num("txtPg4IShed6_12A") > 0) this.set("txtPg4IShed6_12Year", this.val("txtPg1I1Year"));
    }
  }
  checkValidNOLCOYear(field: string): void {
    const y = this.val("txtPg1I1Year");
    const v = this.val(field);
    // string vs number compares as numbers; an empty year reads 0
    if (Number(v) < Number(y) - 3 || Number(v) > Number(y) || v === y) this.set(field, "");
  }
  checkNOLCOoperLoss(field: string): void {
    const amount = this.num(`${field}A`);
    const tempTot = this.num(`${field}B`) + this.num(`${field}C`) + this.num(`${field}D`);
    if (amount < tempTot) for (const c of "BCD") this.set(`${field}${c}`, "0.00"); // B + C + D may not exceed A
  }
  computePg3Sc6IxE(n: number): void {
    const f = `txtPg${n <= 7 ? 3 : 4}IShed6_${n}`;
    this.checkNOLCOoperLoss(f);
    this.getDifference(`${f}A`, `${f}B,${f}C,${f}D`, `${f}E`);
  }
  computePg4Sc6IxE(n: number): void {
    this.computePg3Sc6IxE(n);
  }
  computePg3Sc6I7E(): void {
    this.allFormat("txtPg3IShed6_3A", "txtPg3IShed6_7A");
    if (this.num("txtPg3IShed6_7A") < 0) this.set("txtPg3IShed6_7A", formatCurrency(this.num("txtPg3IShed6_7A") * -1));
    else {
      this.disableAndReset("txtPg3IShed6_7A", "number");
      this.disableAndReset("txtPg3IShed6_7Year", "text");
    }
    this.checkNOLCOoperLoss("txtPg3IShed6_7");
    this.getDifference("txtPg3IShed6_7A", "txtPg3IShed6_7B,txtPg3IShed6_7C,txtPg3IShed6_7D", "txtPg3IShed6_7E");
  }
  computePg4Sc6I12E(): void {
    this.allFormat("txtPg3IShed6_3B", "txtPg4IShed6_12A");
    if (this.num("txtPg4IShed6_12A") < 0) this.set("txtPg4IShed6_12A", formatCurrency(this.num("txtPg4IShed6_12A") * -1));
    else {
      this.disableAndReset("txtPg4IShed6_12A", "number");
      this.disableAndReset("txtPg4IShed6_12Year", "text");
    }
    this.checkNOLCOoperLoss("txtPg4IShed6_12");
    this.getDifference("txtPg4IShed6_12A", "txtPg4IShed6_12B,txtPg4IShed6_12C,txtPg4IShed6_12D", "txtPg4IShed6_12E");
  }
  checkSched5Fields(item: string): void {
    if (this.val(`txtPg3IShed5_${item}Desc`) === "" || this.val(`txtPg3IShed5_${item}Legal`) === "") this.set(`txtPg3IShed5_${item}Amt`, "0.00");
  }
  check8percGross(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    if (this.num(`txtPg3IShed3_26${s}`) > 3000000) this.set(`txtPg3IShed3_26${s}`, "0.00"); // over the ₱3M VAT threshold: no 8%
  }
  forPart8Fields(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    const no = person === "taxpayer" ? this.checked("rdoPg1I19IncomeExemptNo") && this.checked("rdoPg1I20IncomeSpecialNo") : this.checked("rdoPg2I10IncomeExemptNo") && this.checked("rdoPg2I11IncomeSpecialNo");
    for (const n of [1, 2, 4, 6, 8, 9]) {
      if (no) this.disableAndReset(`txtPg4IPart8_${n}${s}`, "number");
      else this.enable(`txtPg4IPart8_${n}${s}`);
    }
    this.computeTxtPg4Pt8I3(person);
    this.computeTxtPg4Pt8I10(person);
  }
  computePg3Sc6I8D(): void {
    this.getSum("txtPg3IShed6_4D,txtPg3IShed6_5D,txtPg3IShed6_6D,txtPg3IShed6_7D", "txtPg3IShed6_8D");
    this.populateTotalAllowDeduc("taxpayer");
    this.computeTxtPg2I16("taxpayer");
  }
  computePg3Sc6I13D(): void {
    this.getSum("txtPg4IShed6_9D,txtPg4IShed6_10D,txtPg4IShed6_11D,txtPg4IShed6_12D", "txtPg4IShed6_13D");
    this.populateTotalAllowDeduc("spouse");
    this.computeTxtPg2I16("spouse");
  }
  populateTotalAllowDeduc(person: Person): void {
    if (person === "taxpayer" && this.checked("rdoPg1I21TaxRateG")) {
      this.allFormat("txtPg3IShed4_18A", "txtPg2IShed3_13A");
      this.allFormat("txtPg3IShed5_3", "txtPg2IShed3_14A");
      this.allFormat("txtPg3IShed6_8D", "txtPg2IShed3_15A");
    } else if (person === "spouse" && this.checked("rdoPg2I12TaxRateG")) {
      this.allFormat("txtPg3IShed4_18B", "txtPg2IShed3_13B");
      this.allFormat("txtPg3IShed5_6", "txtPg2IShed3_14B");
      this.allFormat("txtPg4IShed6_13D", "txtPg2IShed3_15B");
    }
  }
  computePg4Sc6I4(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.differenceOfElements(`txtPg4ISc6_2${s}`, `txtPg4ISc6_3${s}`, `txtPg4ISc6_4${s}`);
    this.computeTxtPg4Sc6I5(person);
  }
  computeTxtPg4Sc6I5(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg4ISc6_1${s},txtPg4ISc6_4${s}`, `txtPg4ISc6_5${s}`);
    this.set(`txtPg1I22${s}TaxDue`, this.val(`txtPg4ISc6_5${s}`));
    this.computeTxtPg1I24(person);
  }
  computeTxtPg4Pt7I10(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `txtPg4IPart7_${n}${s}`).join(","), `txtPg4IPart7_10${s}`);
    this.allFormat(`txtPg4IPart7_10${s}`, `txtPg1I23${s}`);
    this.computeTxtPg1I24(person);
  }
  copyToPt7I5(person: Person): void {
    if (person === "taxpayer") this.allFormat("txtPg2IShed1c_3ATW", "txtPg4IPart7_5A");
    else this.allFormat("txtPg2IShed1c_3BTW", "txtPg4IPart7_5B");
    this.computeTxtPg4Pt7I10(person);
  }
  copyToPart8(person: Person): void {
    // Part VIII 1/2 = Part X item 16/7 × the Part X Sched A item 4 rate; 4 = Part X item 17; 6 = Part VII item 8
    const [rate, sp, ex, b, f] = person === "taxpayer" ? ["txtPg1mI4BSchdA", "rdoPg1I20IncomeSpecialYes", "rdoPg1I19IncomeExemptYes", "B", "A"] : ["txtPg1mI4ESchdA", "rdoPg2I11IncomeSpecialYes", "rdoPg2I10IncomeExemptYes", "F", "E"];
    const s = person === "taxpayer" ? "A" : "B";
    const amt = Number(this.val(rate)) / 100; // BIR divides the raw text: a "1,000.00"-style rate reads NaN
    if (this.checked(sp)) {
      this.getProduct(`txtPg1mI16${b}SchdB`, amt, `txtPg4IPart8_1${s}`);
      this.getProduct(`txtPg1mI7${b}SchdB`, amt, `txtPg4IPart8_2${s}`);
      this.allFormat(`txtPg1mI17${b}SchdB`, `txtPg4IPart8_4${s}`);
      this.allFormat(`txtPg4IPart7_8${s}`, `txtPg4IPart8_6${s}`);
      this.computeTxtPg4Pt8I3(person);
    }
    if (this.checked(ex)) {
      this.getProduct(`txtPg1mI16${f}SchdB`, amt, `txtPg4IPart8_8${s}`);
      this.getProduct(`txtPg1mI7${f}SchdB`, amt, `txtPg4IPart8_9${s}`);
      this.computeTxtPg4Pt8I10(person);
    }
  }
  computeTxtPg4Pt8I3(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg4IPart8_1${s},txtPg4IPart8_2${s}`, `txtPg4IPart8_3${s}`);
    this.differenceOfElements(`txtPg4IPart8_3${s}`, `txtPg4IPart8_4${s}`, `txtPg4IPart8_5${s}`);
    this.computeTxtPg4Pt8I7(person);
  }
  computeTxtPg4Pt8I5(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.differenceOfElements(`txtPg4IPart8_3${s}`, `txtPg4IPart8_4${s}`, `txtPg4IPart8_5${s}`);
    this.computeTxtPg4Pt8I7(person);
  }
  computeTxtPg4Pt8I7(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg4IPart8_5${s},txtPg4IPart8_6${s}`, `txtPg4IPart8_7${s}`);
  }
  computeTxtPg4Pt8I10(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum(`txtPg4IPart8_8${s},txtPg4IPart8_9${s}`, `txtPg4IPart8_10${s}`);
  }
  computeTxtPg4Pt9I5(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum([1, 2, 3, 4].map((n) => `txtPg4IPart9_${n}${s}`).join(","), `txtPg4IPart9_5${s}`);
    this.computeTxtPg4Pt9I10(person);
  }
  computeTxtPg4Pt9I10(person: Person): void {
    const s = person === "taxpayer" ? "A" : "B";
    this.getSum([6, 7, 8, 9].map((n) => `txtPg4IPart9_${n}${s}`).join(","), `txtPg4IPart9_10${s}`);
    this.differenceOfElements(`txtPg4IPart9_5${s}`, `txtPg4IPart9_10${s}`, `txtPg4IPart9_11${s}`);
  }
  computePage2mScheduleC(person: Person): void {
    const [a, b] = person === "taxpayer" ? ["A", "B"] : ["C", "D"];
    const item = [...Array.from({ length: 16 }, (_, i) => `${i + 1}`), "17a", "17b", "17c", "17d"];
    for (const c of [a, b]) this.getSum(item.map((n) => `txtPg2mI${n}${c}SchdC`).join(","), `txtPg2mI18${c}SchdC`);
  }
  computePage2mScheduleD(person: Person): void {
    const c = person === "taxpayer" ? "A" : "B";
    this.getSum([1, 2, 3, 4].map((n) => `txtPg2mI${n}${c}SchdD`).join(","), `txtPg2mI5${c}SchdD`);
  }
  /** validateDate on a Part X date: anything but a real MM/DD/YYYY (year ≥ 1800) is cleared. */
  validateDate(c: Cell): void {
    if (!validDate(c.v)) c.v = "";
  }

  // ── event dispatch ──────────────────────────────────────────────────────────────────────────────────────────
  click(c: Cell): void {
    const id = c.id.slice(PFX.length);
    let m: RegExpExecArray | null;
    if (/^rdoPg1I2Amended/.test(id)) this.checkAmendedRtrn();
    else if (/^rdoPg1I3ShortPeriod/.test(id)) {
      this.checkShortPeriodRtrn();
      this.checkYear();
    } else if (/^rdoPg1I6TaxpayerType/.test(id)) this.TPFilerType();
    else if (/^rdoPg1I7ATC_/.test(id)) this.TPATCeffect();
    else if (id === "rdoPg1I13ForeignTaxCreditsYes") this.checkTaxCred("taxCredYes", "txtPg1I14ForeignTaxNumber");
    else if (id === "rdoPg1I13ForeignTaxCreditsNo") this.checkTaxCred("taxCredNo", "txtPg1I14ForeignTaxNumber");
    else if (id === "rdoPg1I16CivilStatusM") this.enableSpouseFields("spouseHasInc");
    else if (/^rdoPg1I16CivilStatus/.test(id)) this.disableSpouseFields("noSpouse");
    else if (id === "rdoPg1I17SpouseIncomeYes") this.enableSpouseFields("filingStat");
    else if (id === "rdoPg1I17SpouseIncomeNo") this.disableSpouseFields("spouseNoInc");
    else if (id === "rdoPg1I18FilingStatusJ") this.enableSpouseFields("jointFiling");
    else if (id === "rdoPg1I18FilingStatusS") this.disableSpouseFields("");
    else if (/^rdoPg1I(19|20)/.test(id)) this.forPart8Fields("taxpayer");
    else if (/^rdoPg2I1[01]/.test(id)) this.forPart8Fields("spouse");
    else if ((m = /^rdoPg(1I21|2I12)TaxRate([GP])$/.exec(id))) {
      const person: Person = m[1] === "1I21" ? "taxpayer" : "spouse";
      const field = m[1] === "1I21" ? "rdoPg1I21A" : "rdoPg2I12A";
      this.taxRateSelect(m[2] === "G" ? "GR" : "8%", field);
      this.taxRateEnableDisableFields(person, m[2] === "G" ? "GR" : "8%");
      if (m[2] === "P") this.disableFor8Perc();
    } else if ((m = /^rdoPg(1I21|2I12)AMethodDeduction[IO]$/.exec(id))) {
      this.GRrateSelect();
      this.methodRate(m[1] === "1I21" ? "taxpayer" : "spouse");
    } else if (/^rdoPg2I3SpouseType/.test(id)) this.SPFilerType();
    else if (/^rdoPg2I4ATC_/.test(id)) this.SPATCeffect();
    else if (id === "rdoPg2I8ForeignTaxCreditsYes") this.checkTaxCred("taxCredYes", "txtPg2I9ForeignTaxNumber");
    else if (id === "rdoPg2I8ForeignTaxCreditsNo") this.checkTaxCred("taxCredNo", "txtPg2I9ForeignTaxNumber");
    else if ((m = /^chkPg2IShed(1a_1|2a_2)(Taxpayer|Spouse)$/.exec(id))) this.emplyrDetails(`Pg2IShed${m[1]}`, m[2] === "Taxpayer" ? "TP" : "SPS");
    // rdoPg1mOption1/2 → numOfAct → computePage1mScheduleB, whose whole body BIR commented out
  }
  blur(c: Cell): void {
    const id = c.id.slice(PFX.length);
    let m: RegExpExecArray | null;
    const who = (s: string): Person => (s === "A" ? "taxpayer" : "spouse");
    if (id === "txtPg1I1Year") {
      this.checkYear();
      this.blockletterWithout2Decimal(c);
      return;
    }
    if ((m = /^txtPg(3IShed6_[456]|4IShed6_(9|10|11))Year$/.exec(id))) {
      this.blockletterWithout2Decimal(c);
      this.checkValidNOLCOYear(id);
      return;
    }
    if (/^txtPg(3IShed6_7|4IShed6_12)Year$/.test(id)) return this.blockletterWithout2Decimal(c);
    if ((m = /^txtPg1mI4([BE])SchdA$/.exec(id))) {
      if (Number(c.v) > 100) c.v = "0"; // p10rateChk: a rate over 100% is set to 0
      this.round(c);
      return;
    }
    if (/^txtPg1mI[56][A-F]SchdA$/.test(id)) return this.validateDate(c);
    if (c.type !== "text" || !isMoneyId(c.id)) return;
    this.round(c);
    if ((m = /^txtPg1I25([AB])$/.exec(id))) this.computeTxtPg1I26(who(m[1]!));
    else if ((m = /^txtPg1I2[789]([AB])$/.exec(id))) this.computeTxtPg1I30(who(m[1]!));
    else if ((m = /^txtPg2IShed1c_3([AB])CI$/.exec(id))) this.computeTxtPg2Sc2I4CI(who(m[1]!));
    else if ((m = /^txtPg2IShed1c_3([AB])TW$/.exec(id))) this.copyToPt7I5(who(m[1]!));
    else if ((m = /^txtPg2IShed2_5([AB])$/.exec(id))) this.computeTxtPg2I6(who(m[1]!));
    else if ((m = /^txtPg2IShed3_(8|9)([AB])$/.exec(id))) this.computeTxtPg2I10(who(m[2]!));
    else if ((m = /^txtPg2IShed3_11([AB])$/.exec(id))) this.computeTxtPg2I12(who(m[1]!));
    else if ((m = /^txtPg2IShed3_(19|20|21)([AB])$/.exec(id))) this.computeTxtPg2I22(who(m[2]!));
    else if ((m = /^txtPg3IShed3_26([AB])$/.exec(id))) {
      this.check8percGross(who(m[1]!));
      this.computeTxtPg3Sc3I28(who(m[1]!));
    } else if ((m = /^txtPg3IShed3_27([AB])$/.exec(id))) this.computeTxtPg3Sc3I28(who(m[1]!));
    else if ((m = /^txtPg3IShed3_(28|29)([AB])$/.exec(id))) this.computeTxtPg3Sc3I30(who(m[2]!));
    else if ((m = /^txtPg3IShed4_(\d+|17[abcd])([AB])$/.exec(id))) {
      if (m[1] !== "18") this.computePg3Sc4I18(who(m[2]!));
    } else if ((m = /^txtPg3IShed5_([1245])Amt$/.exec(id))) {
      this.checkSched5Fields(m[1]!);
      if (m[1] === "1" || m[1] === "2") this.computePg3Sc5I3();
      else this.computePg3Sc5I6();
    } else if ((m = /^txtPg3IShed6_([12])([AB])$/.exec(id))) this.computePg3Sc6I3(who(m[2]!), `item${m[1]}`);
    else if ((m = /^txtPg3IShed6_([456])([ABCD])$/.exec(id))) {
      this.computePg3Sc6IxE(Number(m[1]));
      if (m[2] === "D") this.computePg3Sc6I8D();
    } else if ((m = /^txtPg3IShed6_7([BCD])$/.exec(id))) {
      this.computePg3Sc6I7E();
      if (m[1] === "D") this.computePg3Sc6I8D();
    } else if ((m = /^txtPg4IShed6_(9|10|11)([ABCD])$/.exec(id))) {
      this.computePg4Sc6IxE(Number(m[1]));
      if (m[2] === "D") this.computePg3Sc6I13D();
    } else if ((m = /^txtPg4IShed6_12([BCD])$/.exec(id))) {
      this.computePg4Sc6I12E();
      if (m[1] === "D") this.computePg3Sc6I13D();
    } else if ((m = /^txtPg4ISc6_3([AB])$/.exec(id))) this.computePg4Sc6I4(who(m[1]!));
    else if ((m = /^txtPg4IPart7_([1-9])([AB])$/.exec(id))) {
      this.computeTxtPg4Pt7I10(who(m[2]!));
      if (m[1] === "8") this.copyToPart8(who(m[2]!));
    } else if ((m = /^txtPg4IPart8_([12])([AB])$/.exec(id))) this.computeTxtPg4Pt8I3(who(m[2]!));
    else if ((m = /^txtPg4IPart8_4([AB])$/.exec(id))) this.computeTxtPg4Pt8I5(who(m[1]!));
    else if ((m = /^txtPg4IPart8_6([AB])$/.exec(id))) this.computeTxtPg4Pt8I7(who(m[1]!));
    else if ((m = /^txtPg4IPart8_([89])([AB])$/.exec(id))) this.computeTxtPg4Pt8I10(who(m[2]!));
    else if ((m = /^txtPg4IPart9_([1-4])([AB])$/.exec(id))) this.computeTxtPg4Pt9I5(who(m[2]!));
    else if ((m = /^txtPg4IPart9_([6-9])([AB])$/.exec(id))) this.computeTxtPg4Pt9I10(who(m[2]!));
    else if ((m = /^txtPg2mI(\d+|17[abcd])([ABCD])SchdC$/.exec(id))) this.computePage2mScheduleC(m[2] === "A" || m[2] === "B" ? "taxpayer" : "spouse");
    else if ((m = /^txtPg2mI([1-4])([AB])SchdD$/.exec(id))) this.computePage2mScheduleD(who(m[2]!));
  }

  /** checkFieldsAfterXMLLoad — what the reopened form runs once the saved values are in. */
  checkFieldsAfterXMLLoad(): void {
    if (this.checked("rdoPg1I13ForeignTaxCreditsYes")) this.enable("txtPg1I14ForeignTaxNumber");
    if (this.checked("rdoPg1I18FilingStatusJ")) {
      for (const id of ["rdoPg1I17SpouseIncomeYes", "rdoPg1I17SpouseIncomeNo", "rdoPg1I18FilingStatusJ", "rdoPg1I18FilingStatusS"]) this.enable(id);
      this.spouseFields("enable");
      this.check(this.el("rdoPg2I8ForeignTaxCreditsNo"), true); // BIR bug: the spouse's foreign-tax-credit "Yes" never survives a reopen
      this.SPATCeffect();
    } else if (this.checked("rdoPg1I17SpouseIncomeNo")) this.disableSpouseFields("spouseNoInc");
    else if (!this.checked("rdoPg1I16CivilStatusM")) this.disableSpouseFields("noSpouse");
    this.forPart8Fields("taxpayer");
    this.forPart8Fields("spouse");
  }
}

const numWithParenthesis = (s: string): string => s.replace("(", "-").replace(")", "");
const convertToNumber = (v: number | string): number => {
  const x = Number(v) * 1;
  return Number.isNaN(x) ? 0 : x;
};
const MONEY = new Set(RECORD.filter(([, v, r]) => !r && v === "0.00").map(([k]) => k));
const isMoneyId = (id: string): boolean => MONEY.has(id);

/** The profile fields loadBGData fills when a new return is opened (and the page-header copies it writes). */
const PROFILE = ["txtPg1I4TIN1", "txtPg1I4TIN2", "txtPg1I4TIN3", "txtPg1I4BranchCode", "txtPg1I5RDOCode", "txtPg1I8TaxpayerName", "txtLineBus", "txtPg1I9Address", "txtPg1I9Address2", "txtPg1I9AZipCode", "txtPg1I15TelNum"];
const HEADER_PAGE = ["Pg2", "Pg3", "Pg4", "Pg1m", "Pg2m", "Pg3m", "Pg4m"];

// ── Part XI attachments (one per exempt / special-rate activity) ──────────────────────────────────────────────────
//
// addAttachment clones the hidden template page (#attachmentPages_TEMP) with every "TYPE" replaced by EX<n> / SP<n>,
// so an attachment's elements are the template's ids with that suffix; txtAttachmentTypes "EX<n>,SP<m>" is what the
// reload reads to re-add them before loading values by id. (The template's page-header TIN / name inputs carry no
// TYPE, so each clone repeats those ids; BIR saves the duplicates but reloads them all from the first, so the native
// save writes them once.) The computes run on the attachment being viewed (global TYPE); viewing one runs
// setTaxRegime: under Part X option 2 ("per activity") an exempt attachment ticks its Exempt regime (and zeroes
// item 14, the rate), a special-rate one its Special regime; otherwise both regimes are cleared. Every element is
// live (init()'s enableAllControl ran on the template before any clone).

export type AttachKind = "EX" | "SP";
/** The attachment template's keys (DOM order), with their blank defaults and radio group. */
export const ATTACH: TemplateRecord[] = RECORD.filter(([k]) => k.endsWith("TYPE")).map(([k, v, r]): TemplateRecord => (r ? [k.slice(PFX.length, -4), v, r] : [k.slice(PFX.length, -4), v]));
/** An attachment element's id for a row stem: `frm1701:<key><EX|SP>{i}`. */
export const attachStem = (key: string, kind: AttachKind): string => `${PFX}${key}${kind}{i}`;
const ATTACH_COMPUTED = new Set(["txtPg3mSchedB_3", "txtPg3mSchedB_5", "txtPg3mSchedB_6", "txtPg3mSchedB_7", "txtPg3mSchedB_8", "txtPg3mSchedB_9", "txtPg3mSchedB_12", "txtPg3mSchedB_13", "txtPg3mSchedB_15", "txtPg4mSchedC_18", "txtPg4mSchedD1_5", "txtPg4mSchedD2_10"].flatMap((k) => [`${k}A`, `${k}B`]));
const SCHED_C = [...Array.from({ length: 16 }, (_, i) => `${i < 3 ? "txtPg3m" : "txtPg4m"}SchedC_${i + 1}`), "txtPg4mSchedC_17a", "txtPg4mSchedC_17b", "txtPg4mSchedC_17c", "txtPg4mSchedC_17d"];

/** One attachment, as BIR leaves it after the filer views it (setTaxRegime) and tabs through it in DOM order. `read`
 *  gets an element by its template key (e.g. "txtPg3mSchedB_1A"); the result is every element's value by key. */
export function attachmentRow(read: (key: string) => string, kind: AttachKind, option2: boolean): Record<string, string> {
  const v: Record<string, string> = {};
  const dis = new Set<string>();
  for (const [k, d, r] of ATTACH) v[k] = r ? "false" : d;
  const n0 = (k: string) => {
    const n = NumWithComma(numWithParenthesis(v[k]!));
    return Number.isNaN(n) ? 0 : n;
  };
  const sum = (ks: string[], out: string) => (v[out] = formatCurrency(Math.round(ks.reduce((t, k) => t + n0(k), 0)).toFixed(2)));
  const diff = (a: string, b: string, out: string) => (v[out] = formatCurrency(Math.round(convertToNumber(rcp(v[a]!)) - convertToNumber(rcp(v[b]!))).toFixed(2)));
  // setTaxRegime
  if (option2 && kind === "EX") {
    v.rdoPg3mExempt = "true";
    v.rdoPg3mSpecialRate = "false";
    v.txtPg3mSchedB_14A = v.txtPg3mSchedB_14B = "0.00";
    dis.add("txtPg3mSchedB_14A").add("txtPg3mSchedB_14B");
  } else if (option2 && kind === "SP") v.rdoPg3mSpecialRate = "true";
  const scheduleB = (s: "A" | "B") => {
    const b = (n: number | string) => `txtPg3mSchedB_${n}${s}`;
    diff(b(1), b(2), b(3));
    diff(b(3), b(4), b(5));
    sum([b(6), b(7)], b(8));
    diff(b(5), b(8), b(9));
    sum([b(10), b(11)], b(12));
    sum([b(9), b(12)], b(13));
    const rate = Number(v[b(14)]) / 100;
    const product = (from: string) => (v[b(15)] = formatCurrency(Math.round(n0(from) * rate).toFixed(2)));
    if (v.rdoPg3mExempt === "true") product(b(13));
    else if (v.rdoPg3mSpecialRate === "true") product(b(5));
  };
  for (const [k, , r] of ATTACH) {
    if (r || ATTACH_COMPUTED.has(k) || dis.has(k)) continue;
    const want = read(k);
    if (want !== "") v[k] = want;
    const s = k.slice(-1) as "A" | "B";
    let m: RegExpExecArray | null;
    if (/^txtPg3mSchedA_4[AB]$/.test(k)) {
      if (Number(v[k]) > 100) v[k] = "0"; // p11rateChk
      v[k] = roundValue(v[k]!);
    } else if (/^txtPg3mSchedA_[56][AB]$/.test(k)) v[k] = validDate(v[k]!) ? v[k]! : "";
    else if (/^txtPg3mSchedB_14[AB]$/.test(k)) {
      v[k] = setPercentage(v[k]!);
      scheduleB(s);
    } else if (/^txtPg3mSchedB_(1|2|4|10|11)[AB]$/.test(k)) {
      v[k] = roundValue(v[k]!);
      scheduleB(s);
    } else if ((m = /^txtPg[34]mSchedC_(\d+|17[abcd])([AB])$/.exec(k))) {
      v[k] = roundValue(v[k]!);
      sum(SCHED_C.map((c) => `${c}${s}`), `txtPg4mSchedC_18${s}`);
      v[`txtPg3mSchedB_6${s}`] = v[`txtPg4mSchedC_18${s}`]!;
      scheduleB(s);
    } else if (/^txtPg4mSchedD1_[1-4]A$/.test(k)) {
      v[k] = roundValue(v[k]!);
      sum([1, 2, 3, 4].map((n) => `txtPg4mSchedD1_${n}A`), "txtPg4mSchedD1_5A");
      v.txtPg3mSchedB_7A = v.txtPg4mSchedD1_5A!;
      scheduleB("A");
    } else if (/^txtPg4mSchedD2_[6-9]B$/.test(k)) {
      v[k] = roundValue(v[k]!);
      sum([6, 7, 8, 9].map((n) => `txtPg4mSchedD2_${n}B`), "txtPg4mSchedD2_10B");
      v.txtPg3mSchedB_7B = v.txtPg4mSchedD2_10B!;
      scheduleB("B");
    }
  }
  return v;
}

/** setPercentage(e, 1): blank / non-numeric / outside [0, 100) → "0.0"; more than 2 decimals → toFixed(2); else toFixed(1). */
function setPercentage(s: string): string {
  if (s.trim() === "" || Number.isNaN(Number(s))) return "0.0";
  if (convertToNumber(s) < 0 || convertToNumber(s) >= 100) return "0.0";
  const t = s.split(".");
  return t.length === 2 && t[1]!.length > 2 ? (Number(s) * 1).toFixed(2) : (Number(s) * 1).toFixed(1);
}
/** round(this, 2): > 12 integer digits → "0.00", else formatCurrency's rounding with commas. */
function roundValue(s: string): string {
  const raw = s.replace(/\$|,/g, "");
  const int = raw.indexOf(".") > 0 ? raw.split(".")[0]! : raw;
  if (int.length > 12) return "0.00";
  return formatCurrency(Number.isNaN(Number(raw)) ? "0" : raw);
}
/** validateDate: "" or a real MM/DD/YYYY with a year ≥ 1800 (its future-date check is commented out). */
function validDate(s: string): boolean {
  if (s === "") return true;
  const part = s.split("/");
  if (part.length !== 3) return false;
  const [mm, dd, yyyy] = part as [string, string, string];
  const leap = new Date(Number(yyyy), 1, 29).getMonth() === 1;
  if (Number.isNaN(Number(mm || dd || yyyy))) return false;
  if (mm.length !== 2 || Number(mm) > 12 || Number(mm) < 0) return false;
  if (dd.length !== 2 || Number(dd) > 31 || Number(dd) < 1) return false;
  if (yyyy.length !== 4 || Number(yyyy) < 1800) return false;
  if (Number(mm) === 2) return !((!leap && Number(dd) === 29) || Number(dd) > 29);
  if (["04", "06", "09", "11"].includes(mm) && Number(dd) > 30) return false;
  return true;
}
/** removeCommaParenthesis on a value. */
function rcp(s: string): number | string {
  let x: string | number = s;
  if (x.includes("(") || x.includes(")")) x = numWithParenthesis(x);
  if (String(x).includes(",")) x = NumWithComma(String(x));
  return !Number.isNaN(Number(x)) ? Number(x) * 1 : x;
}

/** The attachments' effect on Part X (Pg1m Sched B, Pg2m Sched C / D), as their blurs leave it. Under option 2 the
 *  regime's columns get the sum over every attachment of that kind (computeConsolSchedBAmt / computeConsolSchedC);
 *  Sched D is consolidated whatever the option (computeConsolSchedD) — and BIR bug: its running total is not reset
 *  between the exempt and the special loop, so with both kinds declared each item is exempt + special. Tabbing
 *  through an attachment's "other" descriptions writes "OTHERS" into Part X (othersToPart10). */
function consolidate(s: Sim, row: Record<AttachKind, Array<Record<string, string>>>, option2: boolean): void {
  const total = (kind: AttachKind, key: string) => row[kind].reduce((t, r) => NumWithComma(formatCurrency(t + NumWithComma(r[key] ?? "0"))), 0);
  const put = (id: string, n: number) => s.set(id, formatCurrency(n));
  for (const kind of ["EX", "SP"] as const) {
    if (!row[kind].length || !option2) continue;
    const [tp, sp, ctp, csp] = kind === "EX" ? ["A", "E", "A", "C"] : ["B", "F", "B", "D"];
    for (const [from, to] of [["1", "1"], ["2", "2"], ["4", "4"], ["10", "12"], ["11", "13"], ["15", "17"]]) {
      put(`txtPg1mI${to}${tp}SchdB`, total(kind, `txtPg3mSchedB_${from}A`));
      put(`txtPg1mI${to}${sp}SchdB`, total(kind, `txtPg3mSchedB_${from}B`));
    }
    for (const c of SCHED_C) {
      const n = c.replace(/^txtPg[34]mSchedC_/, "");
      put(`txtPg2mI${n}${ctp}SchdC`, total(kind, `${c}A`));
      put(`txtPg2mI${n}${csp}SchdC`, total(kind, `${c}B`));
    }
  }
  const ex = s.checked("rdoPg1I19IncomeExemptYes") || s.checked("rdoPg2I10IncomeExemptYes");
  const sp = s.checked("rdoPg1I20IncomeSpecialYes") || s.checked("rdoPg2I11IncomeSpecialYes");
  if (row.EX.length || row.SP.length) {
    for (let n = 1; n <= 4; n++) {
      for (const [from, to] of [[`txtPg4mSchedD1_${n}A`, `txtPg2mI${n}ASchdD`], [`txtPg4mSchedD2_${n + 5}B`, `txtPg2mI${n}BSchdD`]] as const) {
        let t = 0;
        if (ex) put(to, (t = total("EX", from)));
        if (sp) put(to, t + total("SP", from));
      }
    }
    s.computePage2mScheduleC("taxpayer");
    s.computePage2mScheduleC("spouse");
    s.computePage2mScheduleD("taxpayer");
    s.computePage2mScheduleD("spouse");
    s.set("txtPg1mI12DescSchdB", "OTHERS");
    s.set("txtPg1mI13DescSchdB", "OTHERS");
    s.set("txtPg2mI17dDescSchdC", "OTHERS");
    const all = [...row.EX, ...row.SP];
    for (let n = 1; n <= 4; n++) {
      const lb = n === 3 ? "txtPg4mSchedD2_8LBB" : `txtPg4mSchedD2_${n + 5}BLB`;
      if (all.some((r) => (r[`txtPg4mSchedD1_${n}`] ?? "") !== "" || (r[`txtPg4mSchedD2_${n + 5}`] ?? "") !== "")) s.set(`txtPg2mI${n}DescSchdD`, "OTHERS");
      if (all.some((r) => (r[`txtPg4mSchedD1_${n}ALB`] ?? "") !== "" || (r[lb] ?? "") !== "")) s.set(`txtPg2mI${n}LBSchdD`, "OTHERS");
    }
  }
}

/** Hidden state keys through which the attachment groups hand their computed rows (by template key) to the page logic. */
export const ATTACH_STATE: Record<AttachKind, string> = { EX: "_attachment_EX", SP: "_attachment_SP" };

export interface SimResult {
  /** Every element's saved string (value, or "true"/"false" for radios / checkboxes), by full id. */
  value: Record<string, string>;
  /** Which elements BIR leaves disabled in the session (for the native UI). */
  disabled: Set<string>;
}

/** Run BIR's logic over a native state (see the header). Attachment-template (TYPE) elements keep BIR's default. */
export function simulate(read: Read): SimResult {
  const s = new Sim();
  // loadBGData: the profile, and its copies into every page header (names up to the first comma)
  for (const id of PROFILE) {
    const v = read(PFX + id);
    if (v !== "") s.el(id).v = v;
  }
  const name = s.val("txtPg1I8TaxpayerName").split(",")[0]!;
  for (const pg of HEADER_PAGE) {
    for (const [k, src] of [["TIN1", "txtPg1I4TIN1"], ["TIN2", "txtPg1I4TIN2"], ["TIN3", "txtPg1I4TIN3"], ["BranchCode", "txtPg1I4BranchCode"]] as const) s.el(`txt${pg}${k}`).v = s.val(src);
    s.el(`txt${pg}TaxpayerName`).v = name;
  }
  const editable = (c: Cell) => !c.dis && pageOf(c.id) !== "t" && pageOf(c.id) !== "x" && !PROFILE.includes(c.id.slice(PFX.length));
  // pass 1 clicks what the filer chose; pass 2 (`again`) also re-clicks every option still ticked — as a filer fixing
  // an input BIR locked would: a later choice resets an earlier schedule (the spouse's ATC clears employer 1 before
  // its taxpayer tick is reached), and compensation-only's tax due (Part VI 1 = Sched 3.B 32) is only refreshed by a
  // click on its ATC (II011), never by typing the compensation
  const controls = (again: boolean) => {
    for (const c of s.order) {
      if (!editable(c)) continue;
      const want = read(c.id);
      if (c.type === "radio") {
        if ((want === "true" && !c.chk) || (again && c.chk)) {
          s.check(c, true);
          s.click(c);
        }
      } else if (c.type === "checkbox") {
        if ((want === "true") !== c.chk && want !== "") {
          c.chk = want === "true";
          s.click(c);
        }
      } else if (c.type === "select-one" && want !== "") c.v = want;
    }
  };
  // the attachments (computed rows, by template key) and BIR's counters for them (setView after the last addAttachment)
  const attachment: Record<AttachKind, Array<Record<string, string>>> = { EX: [], SP: [] };
  for (const kind of ["EX", "SP"] as const) {
    const raw = read(ATTACH_STATE[kind]);
    const rows = raw ? (JSON.parse(raw) as Array<Record<string, string>>) : [];
    attachment[kind] = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.slice(PFX.length).replace(/(EX|SP)\{i\}$/, ""), v])));
  }
  const count = { EX: attachment.EX.length, SP: attachment.SP.length };
  if (count.EX || count.SP) {
    s.cell.get(`${PFX}txtAttachmentTypes`)!.v = `EX${count.EX},SP${count.SP}`;
    const last = count.SP ? count.SP : count.EX;
    s.cell.get("attachmentCurrent")!.v = String(last);
    s.cell.get("attachmentTotal")!.v = String(last);
  }
  const typing = () => {
    let attached = false;
    for (const c of s.order) {
      // #attachmentEX / #attachmentSP sit right before the template page: the filer tabs through them there
      if (!attached && pageOf(c.id) === "t") {
        attached = true;
        consolidate(s, attachment, s.checked("rdoPg1mOption2"));
      }
      if (c.type !== "text" || !editable(c)) continue;
      const want = read(c.id);
      if (want !== "") c.v = want;
      s.blur(c);
    }
  };
  controls(false);
  typing();
  controls(true);
  typing();
  // save + reopen: the blank form's enabled state, BIR's reload handlers, then a review pass over pages 1–4
  for (const c of s.order) c.dis = INIT_DISABLED.has(c.id);
  s.isTPCompIncOnly = s.isSPCompIncOnly = s.tpHasBusnOrProf = s.spHasBusnOrProf = false;
  // …except that the spouse's foreign-tax-credit choice is what the filer saved: the reopen's forced "No" is a BIR
  // reload bug (test/parity.test.ts BIR_DEFECT), and the choice feeds no computation
  const ftc = ["rdoPg2I8ForeignTaxCreditsYes", "rdoPg2I8ForeignTaxCreditsNo"].map((id) => [s.el(id), s.checked(id)] as const);
  s.checkFieldsAfterXMLLoad();
  for (let pass = 0; pass < 2; pass++) for (const c of s.order) if (c.type === "text" && !c.dis && /^[1-4]$/.test(pageOf(c.id))) s.blur(c);
  for (const [c, chk] of ftc) c.chk = chk;
  const value: Record<string, string> = {};
  const disabled = new Set<string>();
  for (const c of s.order) {
    value[c.id] = c.type === "radio" || c.type === "checkbox" ? String(c.chk) : c.v;
    if (c.dis) disabled.add(c.id);
  }
  return { value, disabled };
}
