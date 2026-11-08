// BIR Form 2552 v2018 (Percentage Tax Return for transactions involving shares of stock listed and traded through
// the local stock exchange or sold through an IPO, TRAIN / January 2018 ENCS), P3.
//
//   • Page 1: date (1), amended (2), TIN / RDO / name / address / contact / email (4–9), tax relief (10), kind of
//     transaction (11: sale through the LSE / primary offering / secondary offering) and, for an IPO, the number of
//     shares sold vs outstanding (12A/12B — cleared for an LSE sale). Item 11 picks ONE live schedule of Part V
//     (enableSchedule): LSE → Schedule 1 (PT 200, rate fixed at "6/10 of 1%"), primary → Schedule 2 (PT 201),
//     secondary → Schedule 3 (PT 202), each 5 rows (date, seller, buyer, issuing corporation, shares, tax base,
//     rate, tax due); the other two are reset (disablePageTwoSchedule).
//   • pageTwoComputation: row tax due = base × rate ÷ 100 (Schedule 1: × 0.6 ÷ 100); totTaxDueComp: Σ rows, and
//     pageTwoSchedTotalToPageOne copies the total to item 13 / 14 / 15.
//   • pageOneComputation: 16 = 13+14+15 ; 19 = 17+18 ; 20 = 16 − 19 ; 24 = 21+22+23 ; 25 = 20 + 24 — EXCEPT (BIR
//     quirk, kept) 25 = 24 when 20 < 0 and 24 > 0. The refund / TCC choice only stands while 20 is an overpayment.
//   • Part IV (transactions not subject to tax: 5 class / amount rows) and Part VI (shares sold, not subject to
//     tax: 5 rows) are information only.
//   • "Add More" (all 5 rows full): a pop-up whose first row is row 5 and that holds the overflow
//     (`frm2552:txtPg2Pt5Sch<s>_<n>Col1..8`); row 5 then reads "OTHERS" with the pop-up's tax-due subtotal
//     (Save_Pg2Pt5AddMorePopTable). Modelled as the groups `sched1more` / `sched2more` / `sched3more` (= rows 5…N).
//
// BIR arithmetic replicated (the server re-checks it):
//   • every computed amount goes through `.toFixed(0)` — row tax due, the running schedule totals, 16/19/20/24/25 —
//     so BIR's 2018 2552 rounds percentage tax to WHOLE PESOS (e.g. 0.6% of 100,000.55 = 600.0033 → 600.00).
//   • the pop-up's shares / tax base / rate inputs run toComma (FormatValue keeps only the integer part) before
//     round(), so BIR drops their centavos (and a rate's fraction) — validate asks for whole numbers there.
//   • Save_Pg2Pt5AddMorePopTable tests `Sch1.length == 0 || Sch2.length == 0 || Sch3.length == 0` (OR across all
//     three schedules), so its "empty" branch always fires first; the later branches overwrite it, so the saved
//     row 5 is unaffected.
// Reload (loadData): pop-up rows first (PopLength of each), values by id, isAmended / availTaxRelief; then
// scheduleFromSaveFile re-runs kindOfTransaction + enableSchedule (the other two schedules reset, their PopLength
// cleared). Row tax dues are NOT recomputed by the reload (page 2 is only recomputed on its own blur).

import { fixed, numWithComma as nwc } from "./bir-arith.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";
import fieldJson from "./fields/2552v2018.json";
import template from "./template/2552v2018.json";

const P = "frm2552:";
type Read = (id: string) => string;
const ROW = [1, 2, 3, 4, 5];
const SCHED = [1, 2, 3] as const;
type Sched = (typeof SCHED)[number];
export const SCH1_RATE = "6/10 of 1%";
const RADIO: Record<Sched, string> = { 1: "rdoPg1I11TransactionLSE", 2: "rdoPg1I11TransactionPrimary", 3: "rdoPg1I11TransactionSecondary" };

const upper = (_r: Read, v: string): string => v.trim().toUpperCase(); // capitalize(this) on blur
const is = (r: Read, id: string) => r(`${P}${id}`) === "true";
const live = (r: Read, s: Sched) => is(r, RADIO[s]);
const amount = (r: Read, id: string) => r(id) || "0.00";
const id = (s: Sched, stem: string, row: number | string) => `${P}txtPg2Pt5Sch${s}${stem}${row}`;
const popupBase = (s: Sched) => `${P}_s${s}moreBase`;
const popupDue = (s: Sched) => `${P}_s${s}moreDue`;
const popup = (r: Read, s: Sched) => live(r, s) && parseMoney(r(popupBase(s))) > 0;
/** Sum_Pg2Pt5AddMore: Pg2Pt5Sch<s>SubTotal = formatCurrency(Σ row tax due .toFixed(0)). */
const subTotal = (due: string) => fixed(nwc(due || "0.00"), 0);
/** pageTwoComputation: base × rate ÷ 100, toFixed(0). Schedule 1's rate is the literal 0.6. */
const rowDue = (s: Sched, base: string, rate: string): string => fixed(nwc(base) * 1 * (s === 1 ? 0.6 : nwc(rate)) / 100, 0);
/** checkRate: a rate ≥ 100 resets to 0.00. */
const rateOf = (v: string): string => (nwc(v || "0.00") >= 100 ? "0.00" : v || "0.00");

/** BIR's chain from the raw inputs, as the strings BIR leaves in each field. */
export function chain2552(r: Read): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of SCHED) {
    let tot = "0.00";
    for (const i of ROW) {
      let due = "0.00";
      if (live(r, s)) due = i === 5 && popup(r, s) ? subTotal(r(popupDue(s))) : rowDue(s, amount(r, id(s, "TaxBase", i)), rateOf(r(id(s, "TaxRate", i))));
      out[`due${s}_${i}`] = due;
      tot = fixed(nwc(tot) * 1 + nwc(due) * 1, 0);
    }
    out[`tot${s}`] = tot;
    out[`i${12 + s}`] = live(r, s) ? fixed(nwc(tot) * 1, 2) : "0.00"; // formatCurrency(NumWithComma(total) * 1), no toFixed
  }
  out.i16 = fixed(nwc(out.i13!) * 1 + nwc(out.i14!) * 1 + nwc(out.i15!) * 1, 0);
  const i17 = is(r, "rdoPg1I2AmendedYes") ? amount(r, `${P}txtPg1P2I17TaxPaidInPrevRtrn`) : "0.00";
  out.i19 = fixed(nwc(i17) * 1 + nwc(amount(r, `${P}txtPg1P2I18CredTaxWthhld`)) * 1, 0);
  out.i20 = fixed(nwc(out.i16) * 1 - nwc(out.i19) * 1, 0);
  const pen = (n: string) => nwc(amount(r, `${P}txtPg1P2I${n}`)) * 1;
  out.i24 = fixed(pen("21Surcharge") + pen("22Interest") + pen("23Compromise"), 0);
  out.i25 = nwc(out.i24) > 0 && nwc(out.i20) < 0 ? fixed(nwc(out.i24) * 1, 0) : fixed(nwc(out.i20) * 1 + nwc(out.i24) * 1, 0);
  return out;
}

const savedKey = new Set((template as Array<[string, string, string?]>).map(([key]) => key));
const apart = /^Pg2Pt5Sch[123](SubTotal|PopLength)$/;
const money = new Set([
  ...["I13TaxDue", "I14TaxDue", "I15TaxDue", "I16TotTaxDue", "I17TaxPaidInPrevRtrn", "I18CredTaxWthhld", "I19TotTaxCredPmnt", "I20TotTaxStllDueOvrPmnt",
    "I21Surcharge", "I22Interest", "I23Compromise", "I24TotPenalties", "I25TotAmntPyable"].map((s) => `${P}txtPg1P2${s}`),
  ...ROW.map((i) => `${P}txtPg2P4I${i}Amount`),
  ...ROW.map((i) => `${P}txtPg2Pt6NumShares${i}`),
  ...SCHED.flatMap((s) => [id(s, "TaxDueTot", ""), ...ROW.flatMap((i) => [id(s, "NumShares", i), id(s, "TaxBase", i), id(s, "TaxDue", i), ...(s === 1 ? [] : [id(s, "TaxRate", i)])])]),
]);
// saveXML escape()s only the name and the first address line (the scaffold also flags Address2 / email)
const escapedKey = new Set([`${P}txtPg1Pt1I6Name`, `${P}txtPg1Pt1I7RegisteredAddress`]);
const scalar = (fieldJson as FieldJson[])
  .filter((f) => savedKey.has(f.id) && !apart.test(f.id))
  .map((f): FieldJson => ({ id: f.id, kind: money.has(f.id) ? "money" : f.kind, ...(escapedKey.has(f.id) ? { escaped: true } : {}), ...(f.secret ? { secret: true } : {}) }));

const fromChain = (key: string): Partial<FieldSpec> => ({ kind: "money", compute: (r) => parseMoney(chain2552(r)[key]!) });
const overpayment = (r: Read, v: string): string => (nwc(chain2552(r).i20!) < 0 ? v : "false"); // handleOverpayment('disable')
const ipo = (r: Read) => is(r, "rdoPg1I11TransactionPrimary") || is(r, "rdoPg1I11TransactionSecondary");

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtPg1I1Month`]: { required: true },
  [`${P}txtPg1I1Day`]: { required: true },
  [`${P}txtPg1I1Year`]: { required: true },
  [`${P}txtPg1TIN1`]: { required: true },
  [`${P}txtPg1TIN2`]: { required: true },
  [`${P}txtPg1TIN3`]: { required: true },
  [`${P}txtPg1TIN4`]: { required: true },
  [`${P}txtPg1Pt1I6Name`]: { required: true, derive: upper },
  [`${P}txtPg1Pt1I7RegisteredAddress`]: { required: true, derive: upper }, // the reload upper-cases both address lines
  [`${P}txtPg1Pt1I7RegisteredAddress2`]: { derive: upper },
  [`${P}txPg1I7ZipCode`]: { required: true },
  [`${P}txtPg1Pt1I8ContactNumber`]: { required: true },
  [`${P}txtPg1Pt1I10TaxReliefSpec`]: { gate: { on: `${P}rdoPg1I10TaxReliefYes`, equals: "true" }, derive: upper },
  // kindOfTransaction: 12A/12B only for an offering (primary / secondary); an LSE sale clears them
  [`${P}txtPg1Pt1I12NumOfShare`]: { derive: (r, v) => (ipo(r) ? upper(r, v) : "") },
  [`${P}txtPg1Pt1I12TotShare`]: { derive: (r, v) => (ipo(r) ? upper(r, v) : "") },
  [`${P}txtPg1P2I13TaxDue`]: fromChain("i13"),
  [`${P}txtPg1P2I14TaxDue`]: fromChain("i14"),
  [`${P}txtPg1P2I15TaxDue`]: fromChain("i15"),
  [`${P}txtPg1P2I16TotTaxDue`]: fromChain("i16"),
  [`${P}txtPg1P2I17TaxPaidInPrevRtrn`]: { gate: { on: `${P}rdoPg1I2AmendedYes`, equals: "true" } },
  [`${P}txtPg1P2I19TotTaxCredPmnt`]: fromChain("i19"),
  [`${P}txtPg1P2I20TotTaxStllDueOvrPmnt`]: fromChain("i20"),
  [`${P}txtPg1P2I24TotPenalties`]: fromChain("i24"),
  [`${P}txtPg1P2I25TotAmntPyable`]: fromChain("i25"),
  [`${P}rdoPg1OverpaymentRefund`]: { derive: overpayment },
  [`${P}rdoPg1OverpaymentTaxCredCert`]: { derive: overpayment },
};
for (const i of ROW) {
  override[`${P}txtPg2P4I${i}TransClass`] = { derive: upper };
  for (const stem of ["Seller", "Buyer", "Corp"]) override[`${P}txtPg2Pt6${stem}${i}`] = { derive: upper };
}
for (const s of SCHED) {
  // disablePageTwoSchedule resets a schedule that item 11 did not pick; row 5 shows "OTHERS" while a pop-up is in use
  const keep = (reset: string, other: string, format = (_r: Read, v: string) => v) => (i: number) => (r: Read, v: string) =>
    !live(r, s) ? reset : i === 5 && popup(r, s) ? other : format(r, v);
  for (const i of ROW) {
    for (const stem of ["Date", "Seller", "Buyer", "Corp"]) override[id(s, stem, i)] = { derive: keep("", "OTHERS", stem === "Date" ? undefined : upper)(i) };
    override[id(s, "NumShares", i)] = { kind: "money", derive: keep("0.00", "OTHERS")(i) };
    override[id(s, "TaxBase", i)] = { kind: "money", derive: keep("0.00", "OTHERS")(i) };
    // Schedule 1's rate is a fixed, disabled "6/10 of 1%" that no reset touches
    override[id(s, "TaxRate", i)] = s === 1 ? { derive: () => SCH1_RATE } : { kind: "money", derive: keep("0.00", "OTHERS", (_r, v) => rateOf(v))(i) };
    override[id(s, "TaxDue", i)] = { kind: "money", compute: (r) => parseMoney(chain2552(r)[`due${s}_${i}`]!) };
  }
  override[id(s, "TaxDueTot", "")] = { kind: "money", compute: (r) => parseMoney(chain2552(r)[`tot${s}`]!) };
}

export const FORM_2552V2018 = buildSchema("2552v2018", "Percentage Tax Return — Shares of Stock / IPO (2018)", scalar, override);

const more = (s: Sched): GroupSpec => {
  const col = (n: number) => `${P}txtPg2Pt5Sch${s}_{i}Col${n}`;
  return {
    name: `sched${s}more`,
    first_index: 1,
    row: [
      { id: col(1), kind: "text" }, // date
      { id: col(2), kind: "text", derive: upper }, // seller
      { id: col(3), kind: "text", derive: upper }, // buyer
      { id: col(4), kind: "text", derive: upper }, // issuing corporation
      { id: col(5), kind: "money" }, // shares
      { id: col(6), kind: "money" }, // tax base
      s === 1 ? { id: col(7), kind: "text", derive: () => SCH1_RATE } : { id: col(7), kind: "money" }, // rate
      { id: col(8), kind: "money", row_compute: (read) => parseMoney(rowDue(s, read(col(6)) || "0.00", read(col(7)) || "0.00")) }, // tax due
    ],
    total: [
      { into: popupBase(s), of: col(6) },
      { into: popupDue(s), of: col(8) },
    ],
  };
};
FORM_2552V2018.group = SCHED.map(more);
// Save_Pg2Pt5AddMorePopTable records the live schedule's pop-up row count and subtotal (enableSchedule clears the
// other schedules' PopLength)
FORM_2552V2018.extra_record = (state, groups): SaveRecord[] => {
  const read: Read = (k) => state[k] ?? "";
  const record: SaveRecord[] = [];
  for (const s of SCHED) {
    const row = groups[`sched${s}more`] ?? [];
    if (row.length === 0 || !live(read, s)) continue;
    record.push({ key: `Pg2Pt5Sch${s}SubTotal`, value: subTotal(state[popupDue(s)] ?? "") }, { key: `Pg2Pt5Sch${s}PopLength`, value: String(row.length) });
  }
  return record;
};

export function validate2552v2018(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2552V2018, state);
  const read: Read = (k) => state[k] ?? "";
  const tin = `${state[`${P}txtPg1TIN1`] ?? ""}${state[`${P}txtPg1TIN2`] ?? ""}${state[`${P}txtPg1TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
  if ((state[`${P}txtPg1I1Month`] ?? "00") === "00") problem.push({ id: `${P}txtPg1I1Month`, message: "Select the month (item 1)." });
  if (!state[`${P}txtPg1I5RDO`] || state[`${P}txtPg1I5RDO`] === "000") problem.push({ id: `${P}txtPg1I5RDO`, message: "Enter a valid RDO code (item 5)." });
  if (is(read, "rdoPg1I10TaxReliefYes") && !(state[`${P}txtPg1Pt1I10TaxReliefSpec`] ?? "").trim()) problem.push({ id: `${P}txtPg1Pt1I10TaxReliefSpec`, message: "Specify the tax relief (item 10A)." });
  if (!SCHED.some((s) => live(read, s))) problem.push({ id: `${P}rdoPg1I11TransactionLSE`, message: "Select the kind of transaction (item 11)." });
  if (ipo(read) && (!(state[`${P}txtPg1Pt1I12NumOfShare`] ?? "").trim() || !(state[`${P}txtPg1Pt1I12TotShare`] ?? "").trim())) {
    problem.push({ id: `${P}txtPg1Pt1I12NumOfShare`, message: "Items 12A and 12B cannot be empty for a primary / secondary offering." });
  }
  const c = chain2552(read);
  if (nwc(c.i20!) < 0 && !is(read, "rdoPg1OverpaymentRefund") && !is(read, "rdoPg1OverpaymentTaxCredCert")) problem.push({ id: `${P}rdoPg1OverpaymentRefund`, message: "Choose refund or tax credit certificate for the overpayment." });
  for (const i of ROW) {
    const cls = (state[`${P}txtPg2P4I${i}TransClass`] ?? "").trim();
    const amt = parseMoney(state[`${P}txtPg2P4I${i}Amount`] ?? "");
    if ((amt === 0 && cls !== "") || (amt !== 0 && cls === "")) problem.push({ id: `${P}txtPg2P4I${i}TransClass`, message: `Complete Part IV item ${i} (classification and amount).` });
    const text6 = ["Date", "Seller", "Buyer", "Corp"].map((k) => (state[`${P}txtPg2Pt6${k}${i}`] ?? "").trim());
    const share6 = parseMoney(state[`${P}txtPg2Pt6NumShares${i}`] ?? "");
    if ((text6.some((t) => t === "") && share6 !== 0) || (text6.some((t) => t !== "") && share6 === 0)) problem.push({ id: `${P}txtPg2Pt6Date${i}`, message: `Complete Part VI row ${i}.` });
  }
  for (const s of SCHED) {
    const row = groups[`sched${s}more`] ?? [];
    if (!live(read, s)) {
      // BIR resets a schedule item 11 did not pick and clears its PopLength, so its reload would drop these rows
      if (row.length) problem.push({ id: `Pg2Pt5Sch${s}PopLength`, message: `Schedule ${s} is not used for this kind of transaction (item 11); clear its Add-More rows.` });
      continue;
    }
    for (const i of ROW) {
      if (i === 5 && row.length > 1) continue;
      const text = ["Date", "Seller", "Buyer", "Corp"].map((k) => (state[id(s, k, i)] ?? "").trim());
      const num = [state[id(s, "NumShares", i)], state[id(s, "TaxBase", i)], ...(s === 1 ? [] : [state[id(s, "TaxRate", i)]])].map((v) => parseMoney(v ?? ""));
      if ((text.some((t) => t === "") && num.some((n) => n !== 0)) || (text.some((t) => t !== "") && num.some((n) => n === 0))) {
        problem.push({ id: id(s, "Date", i), message: `Complete Part V Schedule ${s} row ${i}.` });
      }
      if (s !== 1 && nwc(state[id(s, "TaxRate", i)] || "0") >= 100) problem.push({ id: id(s, "TaxRate", i), message: "Tax rate should be below 100." });
    }
    if (row.length === 1) problem.push({ id: `Pg2Pt5Sch${s}PopLength`, message: `Schedule ${s}: put a single fifth line in row 5; "Add More" is for two or more.` });
    row.forEach((x, n) => {
      for (const k of s === 1 ? [5, 6] : [5, 6, 7]) {
        const key = `${P}txtPg2Pt5Sch${s}_{i}Col${k}`;
        const v = parseMoney(x[key] ?? "");
        if (v <= 0) problem.push({ id: key.replace("{i}", String(n + 1)), message: `Schedule ${s} pop-up row ${n + 1}: enter the ${k === 5 ? "shares" : k === 6 ? "tax base" : "rate"}.` });
        else if (v % 100 !== 0) problem.push({ id: key.replace("{i}", String(n + 1)), message: `Schedule ${s} pop-up row ${n + 1}: BIR drops the decimals here (toComma); enter a whole number.` });
      }
    });
  }
  return problem;
}

export const LABEL_2552V2018: Record<string, string> = {
  [`${P}txtPg1I1Month`]: "1 — Date (MM)", [`${P}txtPg1I1Day`]: "DD", [`${P}txtPg1I1Year`]: "YYYY",
  [`${P}rdoPg1I2AmendedYes`]: "2 — Amended return: Yes", [`${P}rdoPg1I2AmendedNo`]: "2 — Amended return: No",
  [`${P}txtPg1I3NoOfSheets`]: "3 — No. of sheets attached", [`${P}txtPg1TIN1`]: "4 — TIN", [`${P}txtPg1TIN4`]: "Branch code",
  [`${P}txtPg1I5RDO`]: "5 — RDO code", [`${P}txtPg1Pt1I6Name`]: "6 — Taxpayer / stockbroker name",
  [`${P}txtPg1Pt1I7RegisteredAddress`]: "7 — Registered address", [`${P}txtPg1Pt1I7RegisteredAddress2`]: "Registered address (cont.)",
  [`${P}txPg1I7ZipCode`]: "7A — ZIP", [`${P}txtPg1Pt1I8ContactNumber`]: "8 — Contact number", [`${P}txtPg1Pt1I9Email`]: "9 — Email",
  [`${P}rdoPg1I10TaxReliefYes`]: "10 — Tax relief: Yes", [`${P}rdoPg1I10TaxReliefNo`]: "10 — Tax relief: No", [`${P}txtPg1Pt1I10TaxReliefSpec`]: "10A — Specify",
  [`${P}rdoPg1I11TransactionLSE`]: "11 — Sale through the LSE (Schedule 1)", [`${P}rdoPg1I11TransactionPrimary`]: "11 — Primary offering (Schedule 2)",
  [`${P}rdoPg1I11TransactionSecondary`]: "11 — Secondary offering (Schedule 3)",
  [`${P}txtPg1Pt1I12NumOfShare`]: "12A — Shares sold in the offering", [`${P}txtPg1Pt1I12TotShare`]: "12B — Total shares outstanding",
  [`${P}txtPg1P2I13TaxDue`]: "13 — PT 200 tax due (Schedule 1)", [`${P}txtPg1P2I14TaxDue`]: "14 — PT 201 tax due (Schedule 2)",
  [`${P}txtPg1P2I15TaxDue`]: "15 — PT 202 tax due (Schedule 3)", [`${P}txtPg1P2I16TotTaxDue`]: "16 — Total tax due",
  [`${P}txtPg1P2I17TaxPaidInPrevRtrn`]: "17 — Tax paid in return previously filed", [`${P}txtPg1P2I18CredTaxWthhld`]: "18 — Creditable tax withheld",
  [`${P}txtPg1P2I19TotTaxCredPmnt`]: "19 — Total tax credits / payments", [`${P}txtPg1P2I20TotTaxStllDueOvrPmnt`]: "20 — Tax still due / (overpayment)",
  [`${P}txtPg1P2I21Surcharge`]: "21 — Surcharge", [`${P}txtPg1P2I22Interest`]: "22 — Interest", [`${P}txtPg1P2I23Compromise`]: "23 — Compromise",
  [`${P}txtPg1P2I24TotPenalties`]: "24 — Total penalties", [`${P}txtPg1P2I25TotAmntPyable`]: "25 — Total amount payable / (overpayment)",
  [`${P}rdoPg1OverpaymentRefund`]: "Overpayment: to be refunded", [`${P}rdoPg1OverpaymentTaxCredCert`]: "Overpayment: tax credit certificate",
  ...Object.fromEntries(ROW.flatMap((i) => [[`${P}txtPg2P4I${i}TransClass`, `Part IV ${i} — Classification`], [`${P}txtPg2P4I${i}Amount`, "Amount"],
    [`${P}txtPg2Pt6Date${i}`, `Part VI row ${i} — Date`], [`${P}txtPg2Pt6NumShares${i}`, "No. of shares"]])),
  ...Object.fromEntries(SCHED.flatMap((s) => [
    [id(s, "TaxDueTot", ""), `Schedule ${s} — Total tax due`],
    ...ROW.flatMap((i) => [[id(s, "Date", i), `Sched ${s} row ${i} — Date`], [id(s, "TaxBase", i), "Tax base"], [id(s, "TaxRate", i), "Rate %"], [id(s, "TaxDue", i), "Tax due"]]),
    ...["Date", "Seller", "Buyer", "Issuing corporation", "No. of shares", "Tax base", "Rate %", "Tax due"].map((label, k) => [`${P}txtPg2Pt5Sch${s}_{i}Col${k + 1}`, label]),
  ])),
};
