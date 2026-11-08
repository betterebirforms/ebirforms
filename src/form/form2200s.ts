// BIR Form 2200S (Excise Tax Return for Sugar-Sweetened Beverages), P3.
// Schedule 1 (a modal) has ten fixed beverage rows (XB010..XB100: txtSalesValue / txtVolumeRemovals /
// txtBasicTaxDue 0..9) and an Others table (txtsched1*<i>, row 0 static, rows 1+ rebuilt on reopen by the
// loadXML scan of the saved `frm2200S:sched1Chk<i>` records). Row due = roundDown(rate × volume removals).
// The per-row rate lives in an unsaved hidden input that getBeverages fills from setATCSchedule1(year) —
// but xml/atcCodes.xml has no "==<year>" entries for the XB codes, so sched1ATCList is always empty and the
// hardcoded fallback applies for EVERY year: rows 0–7 ₱6.00, row 8 (high-fructose corn syrup) ₱12.00,
// row 9 (coconut sap sugar / steviol) ₱0.00.
// Every compute is a float through roundDownComputation (toPrecision(14), then TRUNCATED to two decimals).
// Part II (sched1OK copies the schedule total into item 16 on a payment-on-removal return; recomputePrepayment
// zeroes it — the radio's onclick fires on every reopen, so both re-run then):
//   17C = 17A + 17B ; 18 = 16 − 17C ; 20 = 18 − 19 (19 only on an amended return) ;
//   21D = 21A + 21B + 21C (a prepayment disables 21A–C) ; PayPenalties = 21D ≠ 0 ; 23B = PayPenalties ? 21D : 0 ;
//   22 = 20 + 21D ; 23C = 23A + 23B ; 24 = 22 − 23C.
// dateMonthYear() re-stamps a prepayment with TODAY on every reopen. saveXML escape()s the taxpayer name,
// address and line of business; loadData unescapes them.
import fieldJson from "./fields/2200S.json";
import { parseMoney, type Centavo } from "./money.ts";
import { pct, roundDown, woc } from "./form2200a.ts";
import { appRate, cleanText, num, quantity, trunc2, trunc2Entered } from "./form2200t-pre2020.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200S:";
type Read = (id: string) => string;

const addCommas = (s: string | number): string => String(s).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
const rd = (x: number): Centavo => parseMoney(roundDown(x));
const capitalize = (v: string): string => v.toUpperCase().trim();

// ── the beverage rows: constant rates (setATCSchedule1 never matches; getBeverages' fallback) ──
/** Row order = XB010..XB100 with getBeverages' hardcoded rate per row. */
export const BEVERAGE: ReadonlyArray<readonly [string, string, string]> = [
  ["XB010", "a. Sweetened Juice Drinks", "6.00"],
  ["XB020", "b. Sweetened Tea", "6.00"],
  ["XB030", "c. Carbonated Beverages", "6.00"],
  ["XB040", "d. Flavored Water", "6.00"],
  ["XB050", "e. Energy and Sports Drinks", "6.00"],
  ["XB060", "f. Powdered Drinks not classified as Milk, Juice, Tea and Coffee", "6.00"],
  ["XB070", "g. Cereal and Grain Beverages", "6.00"],
  ["XB080", "h. Other Non-Alcoholic Beverages that contain added Sugar", "6.00"],
  ["XB090", "2. Using purely high fructose corn syrup or in combination with any caloric or non-caloric sweeteners", "12.00"],
  ["XB100", "3. Using purely coconut sap sugar and purely Steviol Glycosides", "0.00"],
];
const beverageRate = (_year: string, i: number): string => BEVERAGE[i]![2]!;
const beverageDue = (r: Read, i: number): Centavo => rd(num(beverageRate(r(`${P}txtForYr`), i)) * num(trunc2(r(`${P}txtVolumeRemovals${i}`) || "0.00")));

// ── Others (txtsched1*<i>) ──
const OTHER: GroupSpec = {
  name: "other",
  first_index: 0,
  row: [
    { id: `${P}sched1Chk`, kind: "checkbox", derive: (_r, v) => v || "false" },
    { id: `${P}txtsched1Atc`, kind: "text", derive: (_r, v) => capitalize(cleanText(v || "XB")) },
    { id: `${P}txtsched1Desc`, kind: "text", derive: (_r, v) => cleanText(v) },
    { id: `${P}txtsched1TaxBracket`, kind: "text", derive: (_r, v) => cleanText(v) },
    // setApplicableTaxrate on blur; a non-numeric rate → "0.00"
    { id: `${P}txtsched1AppTaxRate`, kind: "text", derive: (_r, v) => (v.includes("%") ? pct(v) : appRate(v || "0.00")) },
    { id: `${P}txtsched1SalesValue`, kind: "money", derive: (_r, v) => trunc2(v || "0.00") },
    { id: `${P}txtsched1VolumeRemovals`, kind: "money", derive: (_r, v) => trunc2(v || "0.00") },
    {
      id: `${P}txtsched1BasicTaxDue`, kind: "money",
      // derive (not row_compute) so it sees the rate / volume as their own derives left them
      derive: (r) => roundDown(num(r(`${P}txtsched1AppTaxRate`)) * num(r(`${P}txtsched1VolumeRemovals`))),
    },
  ],
  total: { into: `${P}otherDueTotal`, of: `${P}txtsched1BasicTaxDue` },
};

/** totalTaxDue: Σ the shown (truncated) beverage and Others dues — exact in centavos. */
export const scheduleTotal = (r: Read): Centavo =>
  BEVERAGE.reduce((s, _p, i) => s + beverageDue(r, i), 0) + parseMoney(r(`${P}otherDueTotal`));

const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };
const prepayment = (r: Read): boolean => r(`${P}chkPymntManner_2`) === "true";

// dateMonthYear() stamps a prepayment with TODAY and re-stamps on every reopen (the checked radio's onclick
// fires in loadData) — so the saved date is always the day of the last open
const prepayDate = (r: Read): string | null =>
  r(`${P}chkPymntManner_2`) === "true" ? String(new Date().getDate()).padStart(2, "0") : null;
const prepayMonth = (r: Read): string | null =>
  r(`${P}chkPymntManner_2`) === "true" ? String(new Date().getMonth() + 1).padStart(2, "0") : null;
const prepayYear = (r: Read): string | null =>
  r(`${P}chkPymntManner_2`) === "true" ? String(new Date().getFullYear()) : null;

// the Others group emits row 0's template keys itself, so the schema drops the static row-0 fields
const json = (fieldJson as FieldJson[]).filter((f) => !/^frm2200S:(sched1Chk|txtsched1(Atc|Desc|TaxBracket|AppTaxRate|SalesValue|VolumeRemovals|BasicTaxDue))0$/.test(f.id));

const override: Record<string, Partial<FieldSpec>> = {
  ...Object.fromEntries(["txtMonth1", "txtDate", "txtForYr", "txtTIN1", "txtTIN2", "txtTIN3", "txtBranchCode", "txtRDOCode", "taxpayerName", "txtAddress", "txtZipCode", "txtTelNum", "txtLineBus", "txtPSIC"].map((k) => [`${P}${k}`, { required: true }])),
  ...Object.fromEntries(["ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret", "txtEmail"].map((k) => [k, { secret: true }])),
  [`${P}txtMonth1`]: { derive: (r: Read, v: string) => prepayMonth(r) ?? v },
  [`${P}txtDate`]: { derive: (r: Read, v: string) => prepayDate(r) ?? v },
  [`${P}txtForYr`]: { derive: (r: Read, v: string) => prepayYear(r) ?? v },
  // saveXML escape()s these three; loadBGData upper-cases them from the profile, capitalize() on blur
  ...Object.fromEntries(["taxpayerName", "txtAddress", "txtLineBus"].map((k) => [`${P}${k}`, { required: true, escaped: true, derive: (_r: Read, v: string) => capitalize(v) }])),
  // changeTreaty: no relief → the list back to its blank option "0"
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty_1`) === "true" || v === "" ? v : "0") },
  // item 17 "others" is a checkbox live only under prepayment; its text only while it is ticked
  [`${P}chkPymntManner_3`]: { gate: { on: `${P}chkPymntManner_2`, equals: "true" } },
  [`${P}txtOthMannerofPymnt`]: { gate: { on: `${P}chkPymntManner_3`, equals: "true" }, derive: (_r, v) => cleanText(v) },
  // Part II
  [`${P}txtTax16`]: { ...money, compute: (r) => (prepayment(r) ? 0 : scheduleTotal(r)) },
  [`${P}txtTax17A`]: money,
  [`${P}txtTax17B`]: money,
  [`${P}txtTax17C`]: { ...money, compute: (r) => m(r, "txtTax17A") + m(r, "txtTax17B") },
  [`${P}txtTax18`]: { ...money, compute: (r) => m(r, "txtTax16") - m(r, "txtTax17C") },
  [`${P}txtTax19`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtTax20`]: { ...money, compute: (r) => m(r, "txtTax18") - m(r, "txtTax19") },
  ...Object.fromEntries(["txtTax21A", "txtTax21B", "txtTax21C"].map((k) => [`${P}${k}`, { ...money, gate: { when: (r: Read) => !prepayment(r) } }])),
  [`${P}txtTax21D`]: { ...money, compute: (r) => m(r, "txtTax21A") + m(r, "txtTax21B") + m(r, "txtTax21C") },
  [`${P}txtTax22`]: { ...money, compute: (r) => m(r, "txtTax20") + m(r, "txtTax21D") },
  [`${P}txtTax23A`]: money,
  // compute21D: PayPenalties = (21D != 0); payPenalties: 23B = 21D when ticked
  [`${P}PayPenalties`]: { derive: (r) => String(m(r, "txtTax21D") !== 0) },
  [`${P}txtTax23B`]: { ...money, compute: (r) => m(r, "txtTax21D") },
  [`${P}txtTax23C`]: { ...money, compute: (r) => m(r, "txtTax23A") + m(r, "txtTax23B") },
  [`${P}txtTax24`]: { ...money, compute: (r) => m(r, "txtTax22") - m(r, "txtTax23C") },
  // Schedule 1 fixed beverage rows
  ...Object.fromEntries(
    BEVERAGE.flatMap((_p, i) => [
      [`${P}txtSalesValue${i}`, { ...money, derive: (_r: Read, v: string) => trunc2Entered(v) }],
      [`${P}txtVolumeRemovals${i}`, { ...money, derive: (_r: Read, v: string) => trunc2Entered(v) }],
      [`${P}txtBasicTaxDue${i}`, { ...money, compute: (r: Read) => beverageDue(r, i) }],
    ]),
  ),
  [`${P}totalTaxDue`]: { ...money, compute: scheduleTotal },
};

export const FORM_2200S: FormSchema = { ...buildSchema("2200S", "Excise Tax — Sugar-Sweetened Beverages", json, override), group: [OTHER] };

/** BIR's initialValidateBeforeSave / validateDate / sched1OK / isValidDataOnSched1 / otherRateCheck checks. */
export function validate2200S(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2200S, state);
  const v = (id: string) => (state[`${P}${id}`] ?? "").trim();
  const tin = `${v("txtTIN1")}${v("txtTIN2")}${v("txtTIN3")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const month = parseInt(v("txtMonth1"), 10), day = parseInt(v("txtDate"), 10), y = parseInt(v("txtForYr"), 10);
  if (v("txtDate") && v("txtForYr")) {
    if (!/^\d{2}$/.test(v("txtDate")) || !(day >= 1 && day <= new Date(y, month, 0).getDate())) problem.push({ id: `${P}txtDate`, message: "Please provide a valid date (MM/DD/YYYY)." });
    else if (new Date(y, month - 1, day) > new Date()) problem.push({ id: `${P}txtForYr`, message: "This date cannot be a future date." });
    if (y < 1900) problem.push({ id: `${P}txtForYr`, message: "Invalid date entry on Item no.1. Entry should not be lower than 1900." });
  }
  if (v("txtRDOCode") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Please enter a valid RDO Code on Item 5." });
  if (v("txtZipCode") && v("txtZipCode").length < 4) problem.push({ id: `${P}txtZipCode`, message: "Please enter Taxpayer's Zip Code on Item 7A." });
  if (v("optTreaty_1") === "true" && (v("lstTaxTreaty") === "" || v("lstTaxTreaty") === "0")) problem.push({ id: `${P}lstTaxTreaty`, message: "Please select a tax relief on Item 14A." });
  if (v("chkPymntManner_2") === "true") {
    // dateMonthYear stamps a prepayment with today's date (and re-stamps it on every reopen)
    const now = new Date();
    if (month !== now.getMonth() + 1 || day !== now.getDate() || y !== now.getFullYear()) problem.push({ id: `${P}txtDate`, message: "A prepayment / advance deposit is dated today (item 1)." });
    if (v("chkPymntManner_3") === "true" && !v("txtOthMannerofPymnt")) problem.push({ id: `${P}txtOthMannerofPymnt`, message: "Please enter a value on Item 17." });
    if (!(parseMoney(v("txtTax23A")) > 0)) problem.push({ id: `${P}txtTax23A`, message: "Please enter Tax Payment / Deposit on Item 23A." });
  } else if (v("chkPymntManner_1") !== "true") problem.push({ id: `${P}chkPymntManner_1`, message: "Please select an option on Part II Manner of Payment." });
  // validateForm: parseFloat("" + item 24) > 0 — parseFloat stops at the first comma, still positive for any positive balance
  if (parseMoney(v("txtTax24")) > 0) problem.push({ id: `${P}txtTax23A`, message: "Payment not sufficient to cover amount payable (item 24 must not be positive)." });
  if (v("chkPymntManner_1") === "true") {
    // sched1OK: the static Others row 0 must be either untouched or valid
    const rows = groups.other ?? [];
    const cell = (row: GroupRow, k: string) => (row[`${P}txtsched1${k}`] ?? "").trim();
    const blank = (row: GroupRow) => ["", "XB"].includes(cell(row, "Atc").toUpperCase()) && !cell(row, "Desc") && !cell(row, "TaxBracket") && num(cell(row, "VolumeRemovals") || "0") === 0 && num(cell(row, "AppTaxRate") || "0") === 0;
    if (rows.length > 1 || (rows.length === 1 && !blank(rows[0]!)))
      rows.forEach((row, i) => {
        const atc = cell(row, "Atc").toUpperCase();
        const at = (k: string) => `${P}txtsched1${k}${i}`;
        const r = num(cell(row, "AppTaxRate") || "0");
        if (!atc || atc === "XB") problem.push({ id: at("Atc"), message: `Please enter a valid ATC at Row ${i + 1}.` });
        else if (!/^XB\d{3}$/.test(atc)) problem.push({ id: at("Atc"), message: `Invalid ATC at Row ${i + 1} (XB + 3 digits).` });
        else if (!cell(row, "Desc")) problem.push({ id: at("Desc"), message: `Please enter a Description at Row ${i + 1}.` });
        else if (!cell(row, "TaxBracket")) problem.push({ id: at("TaxBracket"), message: `Please enter a Tax Bracket at Row ${i + 1}.` });
        else if (!r) problem.push({ id: at("AppTaxRate"), message: `Please enter a valid Applicable rate at Row ${i + 1}.` });
        else if (num(cell(row, "VolumeRemovals") || "0") === 0) problem.push({ id: at("VolumeRemovals"), message: `Please enter a value on Volume Removals column in "Others" at Row ${i + 1}.` });
        else if (BEVERAGE.some(([, , x]) => num(x) === r) || rows.filter((o) => cell(o, "Atc").toUpperCase() === atc && num(cell(o, "AppTaxRate") || "0") === r).length > 1)
          problem.push({ id: at("AppTaxRate"), message: `Rate should be unique per ATC (row ${i + 1}).` });
      });
  }
  return problem;
}

// the Others row's entered sales value feeds nothing computed; keep the helper imported for the round-trip
void woc;
void quantity;
