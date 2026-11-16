// BIR Form 1707A (Annual Capital Gains Tax Return for Onerous Transfer of Shares Not Traded Through the LSE),
// P3. Two fixed schedules: Sched 1 (7 rows: selling price / cost / capital gains / tax paid), Sched 2 (4 rows:
// selling price / cost / capital loss).
//   C5 (per row) = Sched1 C3 − C4 / Sched2 C4 − C3, computed (disabled in BIR)
//   I12 = Σ Sched1 capital gains;  I13 = Σ Sched2 capital loss;  I14 = I12 − I13 (net capital gain/loss)
//   I15 tax due (bracket): net ≤ 100,000 → net × 5% ; else 5,000 + (net − 100,000) × 10% ; floored at 0
//   I16A = Σ Sched1 tax paid;  I16B = input on an amended return only;  I16C = I16A + I16B;  I17 = I15 − I16C
//   I18D = I18A + I18B + I18C;  I19 = (I17 < 0 && I18D > 0) ? I18D : I17 + I18D
// "(more...)" pop-ups (sched1More / sched2More): when Sched 1 (7 rows) or Sched 2 (4 rows) is full, the pop-up holds
//   row 7 / row 4 and every row after it, numbered from 1 (`txtS1C1DateOfTransaction_<n>` ... `txtS2C5CapitalLoss_<n>`).
//   Modelled as the groups `sched1more` / `sched2more` (>= 2 rows; BIR moves a lone row back into row 7 / row 4).
//   While the pop-up has rows, row 7 / row 4 reads ("", "OTHERS", pop-up totals); the totals are the savefile's
//   `txtS<n>ModalTotal*`, the row count is `ModalSched<n>Length`. The CSV import (btnOpenSched1CSV / btnOpenSched2CSV)
//   is `parseSched1Csv` / `parseSched2Csv` / `placeSchedCsv` below.
// Negatives render as accounting parentheses (the form's `roundAmount`), so this schema uses formatMoneyParen.

import fieldJson from "./fields/1707A.json";
import { formatMoneyParen, parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1707A:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const s1n = [1, 2, 3, 4, 5, 6, 7];
const s2n = [1, 2, 3, 4];
const s1sum = (r: Read, stem: string): number => s1n.reduce((t, i) => t + m(r, `txtS1${stem}I${i}`), 0);
const s2sum = (r: Read, stem: string): number => s2n.reduce((t, i) => t + m(r, `txtS2${stem}I${i}`), 0);
const gain = (r: Read, i: number): number => m(r, `txtS1C3SellingPriceI${i}`) - m(r, `txtS1C4CostI${i}`);
const loss = (r: Read, i: number): number => m(r, `txtS2C4CostI${i}`) - m(r, `txtS2C3SellingPriceI${i}`);
const gains = (r: Read): number => s1n.reduce((t, i) => t + gain(r, i), 0);
const losses = (r: Read): number => s2n.reduce((t, i) => t + loss(r, i), 0);
// capital-gains tax bracket, in centavos
const bracketTax = (netCents: number): number => {
  const net = netCents / 100;
  const due = net <= 100000 ? net * 0.05 : 5000 + (net - 100000) * 0.1;
  return due < 0 ? 0 : parseMoney(due);
};
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtI5TIN1`]: { required: true },
  [`${P}txtI5TIN2`]: { required: true },
  [`${P}txtI5TIN3`]: { required: true },
  [`${P}txtI5BranchMask`]: { required: true },
  [`${P}rdoI6RDO`]: { required: true },
  [`${P}txtI8RegisteredName`]: { required: true },
  [`${P}txtI1YearEndYear`]: { required: true },
};
// Schedule 1 inputs (rows 1–7)
for (const i of s1n) for (const stem of ["C3SellingPrice", "C4Cost", "C6TaxPaid"]) override[`${P}txtS1${stem}I${i}`] = money;
// column 5 is disabled in BIR: the C3/C4 blur handler writes gain = selling price − cost (negative allowed)
for (const i of s1n) override[`${P}txtS1C5CapitalGainsI${i}`] = { ...money, compute: (r) => gain(r, i) };
// Schedule 2 inputs (rows 1–4)
for (const i of s2n) for (const stem of ["C3SellingPrice", "C4Cost"]) override[`${P}txtS2${stem}I${i}`] = money;
// …and Schedule 2's loss = cost − selling price (a gain there shows as a negative loss)
for (const i of s2n) override[`${P}txtS2C5CapitalLossI${i}`] = { ...money, compute: (r) => loss(r, i) };
// Schedule totals
override[`${P}txtS1I20TotalSellingPrice`] = { ...money, compute: (r) => s1sum(r, "C3SellingPrice") };
override[`${P}txtS1I20TotalCost`] = { ...money, compute: (r) => s1sum(r, "C4Cost") };
override[`${P}txtS1I20TotalCapitalGains`] = { ...money, compute: (r) => gains(r) };
override[`${P}txtS1I20TotalTaxPaid`] = { ...money, compute: (r) => s1sum(r, "C6TaxPaid") };
override[`${P}txtS2I21TotalSellingPrice`] = { ...money, compute: (r) => s2sum(r, "C3SellingPrice") };
override[`${P}txtS2I21TotalCost`] = { ...money, compute: (r) => s2sum(r, "C4Cost") };
override[`${P}txtS2I21TotalCapitalLoss`] = { ...money, compute: (r) => losses(r) };
// Part II chain (self-contained reads of the schedule sums, since Part II is on page 1, schedules on page 2)
override[`${P}txtI12TotalCapitalGains`] = { ...money, compute: (r) => gains(r) };
override[`${P}txtI13TotalCapitalLoss`] = { ...money, compute: (r) => losses(r) };
override[`${P}txtI14NetCapitalGainLoss`] = { ...money, compute: (r) => gains(r) - losses(r) };
override[`${P}txtI15TaxDue`] = { ...money, compute: (r) => bracketTax(gains(r) - losses(r)) };
override[`${P}txtI16ATotalTaxPaid`] = { ...money, compute: (r) => s1sum(r, "C6TaxPaid") };
// checkAmendedForItem16A: 16B (tax paid in the original return) is live only on an amended return, else forced 0.00
override[`${P}txtI16BTotalTaxPaid`] = { ...money, gate: { on: `${P}rdoI2AmemdedYes`, equals: "true" } };
override[`${P}txtI16CTotalTaxPaid`] = { ...money, compute: (r) => m(r, "txtI16ATotalTaxPaid") + m(r, "txtI16BTotalTaxPaid") };
override[`${P}txtI17TaxStillPayable`] = { ...money, compute: (r) => m(r, "txtI15TaxDue") - m(r, "txtI16CTotalTaxPaid") };
override[`${P}txtI18ASurcharge`] = money;
override[`${P}txtI18BInterest`] = money;
override[`${P}txtI18CCompromise`] = money;
override[`${P}txtI18DPenalties`] = { ...money, compute: (r) => m(r, "txtI18ASurcharge") + m(r, "txtI18BInterest") + m(r, "txtI18CCompromise") };
override[`${P}txtI19TotalAmountPayable`] = {
  ...money,
  compute: (r) => {
    const i17 = m(r, "txtI17TaxStillPayable");
    const i18d = m(r, "txtI18DPenalties");
    return i17 < 0 && i18d > 0 ? i18d : i17 + i18d;
  },
};

// checkOverPaymentRadio: the refund / TCC choice only stands while item 17 is an overpayment "(…)"; else both unchecked
const overpayment = (r: Read, v: string): string => (r(`${P}txtI17TaxStillPayable`).includes(")") ? v : "false");
override[`${P}rdoI19Refund`] = { derive: overpayment };
override[`${P}rdoI19TaxCreditCertificate`] = { derive: overpayment };

// ---- the "(more...)" pop-ups -------------------------------------------------------------------------------------
const upper = (_r: Read, v: string): string => v.toUpperCase();
const SCHED = {
  1: { more: "sched1more", length: "ModalSched1Length", total: "txtS1ModalTotal", amount: ["C3SellingPrice", "C4Cost", "C5CapitalGains", "C6TaxPaid"], count: "_sched1moreCount" },
  2: { more: "sched2more", length: "ModalSched2Length", total: "txtS2ModalTotal", amount: ["C3SellingPrice", "C4Cost", "C5CapitalLoss"], count: "_sched2moreCount" },
} as const;
type Sched = keyof typeof SCHED;
/** One edition's pop-ups: its id prefix, and the row of each schedule that the pop-up takes over ("OTHERS"). 1707A has
 *  7 and 4 rows; 1707Av2021 (TRAIN) has 4 and 4. Everything else about the pop-ups (BIR's script) is the same. */
export interface MoreEdition {
  prefix: string;
  last: Record<Sched, number>;
}
export const EDITION_1707A: MoreEdition = { prefix: P, last: { 1: 7, 2: 4 } };
export const EDITION_1707AV2021: MoreEdition = { prefix: "frm1707Av2021:", last: { 1: 4, 2: 4 } };
/** The edition a form's state belongs to (the web's CSV button passes only the state). */
const editionOf = (state: FormState): MoreEdition => (Object.keys(state).some((k) => k.startsWith(EDITION_1707AV2021.prefix)) ? EDITION_1707AV2021 : EDITION_1707A);
/** The pop-up row stem of a column, e.g. column "C3SellingPrice" of Schedule 1 -> "frm1707A:txtS1C3SellingPrice_{i}". */
const moreStem = (sched: Sched, column: string, ed: MoreEdition = EDITION_1707A): string => `${ed.prefix}txtS${sched}${column}_{i}`;

/** One pop-up's rows. Column 5 is BIR's elemModalSched<n>Compute (gain = selling - cost; loss = cost - selling). */
export function moreGroup(sched: Sched, ed: MoreEdition = EDITION_1707A): GroupSpec {
  const spec = SCHED[sched];
  const gainColumn = spec.amount[2];
  const c5 = (r: Read): string => {
    const selling = parseMoney(r(moreStem(sched, "C3SellingPrice", ed)));
    const cost = parseMoney(r(moreStem(sched, "C4Cost", ed)));
    return formatMoneyParen(sched === 1 ? selling - cost : cost - selling);
  };
  const row: GroupSpec["row"] = [
    { id: moreStem(sched, "C1DateOfTransaction", ed), kind: "text" },
    { id: moreStem(sched, "C2NameOfCorporateStock", ed), kind: "text", derive: upper },
    ...spec.amount.map((column) => ({ id: moreStem(sched, column, ed), ...money, ...(column === gainColumn ? { derive: (r: Read) => c5(r) } : {}) })),
  ];
  const column = spec.amount.map((a) => ({ into: `${ed.prefix}${spec.total}${a.slice(2)}`, of: moreStem(sched, a, ed) }));
  // the row count rides along as a pseudo total, so row 7 / row 4 can tell the pop-up is in use
  const count = { into: spec.count, of: moreStem(sched, "C1DateOfTransaction", ed), sum: (rows: GroupRow[]) => String(rows.length) };
  return { name: spec.more, size_field: spec.length, first_index: 1, row, total: [...column, count] };
}

// row 7 / row 4 while the pop-up holds two or more rows: modalSched<n>Close writes "", "OTHERS" and the pop-up totals
export function applyMoreOverride(override: Record<string, Partial<FieldSpec>>, ed: MoreEdition): void {
  for (const sched of [1, 2] as const) {
    const spec = SCHED[sched];
    const used = (r: Read): boolean => Number(r(spec.count)) >= 2;
    const at = (column: string): string => `${ed.prefix}txtS${sched}${column}I${ed.last[sched]}`;
    override[at("C1DateOfTransaction")] = { derive: (r, v) => (used(r) ? "" : v), derive_shown: true };
    override[at("C2NameOfCorporateStock")] = { derive: (r, v) => (used(r) ? "OTHERS" : v), derive_shown: true };
    for (const column of spec.amount) {
      override[at(column)] = { ...override[at(column)], derive: (r, v) => (used(r) ? r(`${ed.prefix}${spec.total}${column.slice(2)}`) : v), derive_shown: true };
    }
  }
}
applyMoreOverride(override, EDITION_1707A);

export const FORM_1707A = buildSchema("1707A", "Annual Capital Gains Tax — Shares Not Traded", fieldJson as FieldJson[], override);
FORM_1707A.format = formatMoneyParen;
FORM_1707A.group = [moreGroup(1), moreGroup(2)];

export function validate1707A(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1707A, state);
  const tin = `${state[`${P}txtI5TIN1`] ?? ""}${state[`${P}txtI5TIN2`] ?? ""}${state[`${P}txtI5TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtI5TIN1`, message: "The TIN's check digit doesn't match." });
  problem.push(...validateMore(groups));
  return problem;
}

/** The pop-ups: btnSched<n>Save / validateSchedules(..., isForModal), for either edition. */
export function validateMore(groups: GroupState, ed: MoreEdition = EDITION_1707A): Problem[] {
  const problem: Problem[] = [];
  for (const sched of [1, 2] as const) {
    const spec = SCHED[sched];
    const row = groups[spec.more] ?? [];
    if (row.length === 1) problem.push({ id: spec.length, message: `Schedule ${sched}: put a single row in row ${ed.last[sched]}; "(more...)" is for two or more.` });
    row.forEach((x, k) => {
      const at = (column: string): string => x[moreStem(sched, column, ed)] ?? "";
      const n = k + 1;
      const date = at("C1DateOfTransaction");
      const empty = [date === "", at("C2NameOfCorporateStock") === "", parseMoney(at("C3SellingPrice")) === 0, parseMoney(at("C4Cost")) === 0].filter(Boolean).length;
      if (empty !== 0) problem.push({ id: moreStem(sched, "C1DateOfTransaction", ed).replace("{i}", String(n)), message: `Schedule ${sched} pop-up row ${n} is empty or incomplete. Fill in all items or remove the row.` });
      if (/^\d+$/.test(at("C2NameOfCorporateStock"))) problem.push({ id: moreStem(sched, "C2NameOfCorporateStock", ed).replace("{i}", String(n)), message: `Schedule ${sched} pop-up row ${n}: the name of the corporate stock should not be all numbers.` });
      if (parseMoney(at("C3SellingPrice")) < 0 || parseMoney(at("C4Cost")) < 0) problem.push({ id: moreStem(sched, "C3SellingPrice", ed).replace("{i}", String(n)), message: `Schedule ${sched} pop-up row ${n}: no negative value.` });
      const gain = parseMoney(at("C3SellingPrice")) - parseMoney(at("C4Cost"));
      if (sched === 1 ? gain < 0 : -gain < 0) problem.push({ id: moreStem(sched, "C4Cost", ed).replace("{i}", String(n)), message: sched === 1 ? `Schedule 1 pop-up row ${n}: the capital gain is negative. Encode it in Schedule 2.` : `Schedule 2 pop-up row ${n}: the capital loss is negative. Encode it in Schedule 1.` });
    });
  }
  return problem;
}

// ---- the CSV import (btnOpenSched1CSV / btnOpenSched2CSV -> btnSched<n>CSVReader -> checkCSVData -> addToTable) -----
//
// BIR's file format, from its script (no header row, no quoting, no thousands separators):
//   Schedule 1, 6 columns:  date MM/DD/YYYY , name of corporate stock , selling price , cost , capital gains , tax paid
//   Schedule 2, 5 columns:  date MM/DD/YYYY , name of corporate stock , selling price , cost , capital loss
//   * the file is read whole and split on "\n" only, then each line on ",": a CRLF file leaves "\r" on the last
//     column, and a final newline leaves an empty last line, which BIR rejects as "invalid number of columns"
//   * a row needs exactly that many columns; the date must be a real MM/DD/YYYY with year >= 2001; the name must
//     be non-blank and not all digits (it is upper-cased); selling price and cost must be numbers, not negative,
//     not zero (`Number(x)`, so "1e3" and "0x10" pass); the gain / loss column is never read as a value but is
//     added to a running total (below); the tax paid column (Schedule 1) is not checked at all
//   * capital gains / loss is recomputed: selling - cost (Schedule 1) or cost - selling (Schedule 2)
//   * BIR defects kept: each running total (existing box total + the file's rows so far) must not render as "0.00",
//     or the row is refused as "could cause the total to exceed billions". That also refuses a file whose gain /
//     loss column sums to 0 (BIR then throws a ReferenceError on an undeclared variable and silently stops) and
//     a Schedule 1 file whose tax paid column sums to 0 with nothing paid yet. `lenient` skips the gain / loss
//     column's check (and drops one empty last line) for a host that wants to be kinder than BIR.

/** A refusal of BIR's CSV import: `message` is BIR's own alert text, `row` the 1-based line it names (0 = none). */
export class CsvError extends Error {
  constructor(message: string, readonly row = 0) {
    super(message);
    this.name = "CsvError";
  }
}

/** What the schedule's total boxes held before the import (formatted amounts), for BIR's running-total checks. */
export interface CsvExisting {
  sellingPrice?: string;
  cost?: string;
  gainLoss?: string;
  taxPaid?: string;
}

// BIR's JScript helpers, ported as they are (strings in, strings out) so the cells come out character for character.
const addCommas = (n: number): string => `${n}`.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
function isValidAmount(amount: string): boolean {
  return amount.indexOf(".") > 0 ? amount.split(".")[0]!.length <= 12 : amount.length <= 12;
}
/** roundAmount: groups the whole part, truncates (never rounds) past two decimals, "-" becomes "(...)". */
export function birRoundAmount(amount: string): string {
  let out = "0.00";
  if (isValidAmount(amount)) {
    if (amount.indexOf(".") > -1) {
      const part = amount.split(".");
      if (part[1]!.length === 1) out = `${addCommas(Number(part[0]))}.${part[1]}0`;
      else if (part[1]!.length > 1) out = `${addCommas(Number(part[0]))}.${part[1]!.substring(0, 2)}`;
      else out = `${addCommas(Number(amount))}.00`;
    } else out = `${addCommas(Number(amount))}.00`;
  }
  if (out.indexOf("-") > -1) out = `(${out.split("-")[1]})`;
  return out;
}
const valForCompute = (num: string): number => parseFloat(`${num.indexOf(")") > 0 ? "-" : ""}${num.replace(/[()\,]/gi, "")}`) * 1;
// BIR's preciseCompute: the one place a CSV figure meets binary floats, kept so a gain / loss matches BIR's to the centavo
const preciseCompute = (n: number): number => Math.round(n * 100) / 100;

/** BIR's validateDate (MM/DD/YYYY, two-digit month and day, four-digit year >= 1800, real calendar day). */
export function birValidDate(text: string): boolean {
  if (text === "") return true;
  const part = text.split("/");
  if (part.length !== 3) return false;
  const [mm, dd, yyyy] = part as [string, string, string];
  const leap = new Date(Number(yyyy), 1, 29).getMonth() === 1;
  if (isNaN((mm || dd || yyyy) as unknown as number)) return false;
  if (mm.length !== 2 || Number(mm) > 12 || Number(mm) < 0) return false;
  if (dd.length !== 2 || Number(dd) > 31 || Number(dd) < 1) return false;
  if (yyyy.length !== 4 || Number(yyyy) < 1800) return false;
  if (Number(mm) === 2) return !(dd === "29" ? !leap : Number(dd) > 29);
  if (["01", "03", "05", "07", "08", "10", "12"].includes(mm) && Number(dd) > 31) return false;
  if (["04", "06", "09", "11"].includes(mm) && Number(dd) > 30) return false;
  return true;
}

function parseSchedCsv(sched: Sched, text: string, existing: CsvExisting = {}, lenient = false, ed: MoreEdition = EDITION_1707A): GroupRow[] {
  const column = sched === 1 ? 6 : 5;
  const line = text.split("\n");
  if (lenient && line.length > 1 && line[line.length - 1] === "") line.pop();
  let selling = valForCompute(existing.sellingPrice ?? "0.00");
  let cost = valForCompute(existing.cost ?? "0.00");
  let gainLoss = valForCompute(existing.gainLoss ?? "0.00");
  let taxPaid = sched === 1 ? valForCompute(existing.taxPaid ?? "0.00") : 0;
  const numeric = (item: string, name: string, row: number): void => {
    if (isNaN(Number(item))) throw new CsvError(`Column ${name} should be numeric only in row ${row}`, row);
    if (item.indexOf("-") !== -1) throw new CsvError(`Column ${name} should not be a negative value in row ${row}`, row);
    if (birRoundAmount(item) === "0.00") throw new CsvError(`Column ${name} should have a value in row ${row}`, row);
  };
  const out: GroupRow[] = [];
  line.forEach((raw, k) => {
    const row = k + 1;
    const cell = raw.split(",");
    if (cell.length !== column) throw new CsvError(`The csv file has invalid number of columns in row ${row}`, row);
    const date = cell[0]!;
    if (date.trim() === "" || !birValidDate(date)) throw new CsvError(`Please provide a valid date (MM/DD/YYYY format) for Column 1 (Date Of Transaction) in row ${row}`, row);
    if (Number(date.split("/")[2]) < 2001) throw new CsvError(`The year should not be less than 2001 for Column 1 (Date Of Transaction) in row ${row}`, row);
    const name = cell[1]!;
    if (name.trim() === "") throw new CsvError(`Please provide a value for Column 2 (Name of Corporate Stock) in row ${row}`, row);
    if (!isNaN(name as unknown as number)) throw new CsvError(`The value for Column 2 (Name of Corporate Stock) should not be all numbers in row ${row}`, row);
    numeric(cell[2]!, "3 (Selling Price)", row);
    numeric(cell[3]!, "4 (Cost)", row);
    selling += valForCompute(birRoundAmount(cell[2]!));
    if (birRoundAmount(`${selling}`) === "0.00") throw new CsvError(`Value for Column 3 (Selling Price) could cause the total to exceed billions in row ${row}`, row);
    cost += valForCompute(birRoundAmount(cell[3]!));
    if (birRoundAmount(`${cost}`) === "0.00") throw new CsvError(`Value for Column 4 (Cost) could cause the total to exceed billions in row ${row}`, row);
    if (!lenient) {
      gainLoss += valForCompute(birRoundAmount(cell[4]!));
      if (birRoundAmount(`${gainLoss}`) === "0.00") throw new CsvError("ReferenceError: 'gainOrLoss' is undefined (BIR's script stops here without a message)", row);
    }
    if (sched === 1) {
      taxPaid += valForCompute(birRoundAmount(cell[5]!));
      if (birRoundAmount(`${taxPaid}`) === "0.00") throw new CsvError(`Value for Column 5 (TaxPaid) could cause the total to exceed billions in row ${row}`, row);
    }
    // what addToTable writes into the cells (valForCompute / roundAmount / preciseCompute, as BIR does)
    const sellingValue = valForCompute(cell[2]!);
    const costValue = valForCompute(cell[3]!);
    const result: GroupRow = {
      [moreStem(sched, "C1DateOfTransaction", ed)]: date,
      [moreStem(sched, "C2NameOfCorporateStock", ed)]: name.toUpperCase(),
      [moreStem(sched, "C3SellingPrice", ed)]: birRoundAmount(`${sellingValue}`),
      [moreStem(sched, "C4Cost", ed)]: birRoundAmount(`${costValue}`),
      [moreStem(sched, sched === 1 ? "C5CapitalGains" : "C5CapitalLoss", ed)]: birRoundAmount(`${preciseCompute(sched === 1 ? sellingValue - costValue : costValue - sellingValue)}`),
    };
    if (sched === 1) result[moreStem(1, "C6TaxPaid", ed)] = birRoundAmount(cell[5]!);
    out.push(result);
  });
  return out;
}

/** Schedule 1's CSV (6 columns) as pop-up rows (the `sched1more` row shape), or a CsvError with BIR's alert. */
export const parseSched1Csv = (text: string, existing?: CsvExisting, lenient = false, ed?: MoreEdition): GroupRow[] => parseSchedCsv(1, text, existing, lenient, ed);
/** Schedule 2's CSV (5 columns) as pop-up rows (the `sched2more` row shape), or a CsvError with BIR's alert. */
export const parseSched2Csv = (text: string, existing?: CsvExisting, lenient = false, ed?: MoreEdition): GroupRow[] => parseSchedCsv(2, text, existing, lenient, ed);

/** BIR's addToTable: the parsed rows fill the schedule's empty fixed rows first (1..7 / 1..4, "empty" = blank
 *  text and 0.00 amounts); the rest go to the pop-up, which first takes over row 7 / row 4's own content when it was
 *  empty. Returns the fixed cells to set and the pop-up's new rows. */
export function placeSchedCsv(sched: Sched, state: FormState, more: GroupRow[], csvRow: GroupRow[]): { state: FormState; more: GroupRow[] } {
  const ed = editionOf(state);
  const last = ed.last[sched];
  // rows parsed without an edition carry 1707A's ids: move them to this form's
  const csv = ed === EDITION_1707A ? csvRow : csvRow.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.startsWith(P) ? ed.prefix + k.slice(P.length) : k, v])));
  const next: FormState = {};
  const fixed = (column: string, n: number): string => `${ed.prefix}txtS${sched}${column}I${n}`;
  const columns = sched === 1 ? ["C1DateOfTransaction", "C2NameOfCorporateStock", "C3SellingPrice", "C4Cost", "C5CapitalGains", "C6TaxPaid"] : ["C1DateOfTransaction", "C2NameOfCorporateStock", "C3SellingPrice", "C4Cost", "C5CapitalLoss"];
  const cell = (c: string, n: number): string => next[fixed(c, n)] ?? state[fixed(c, n)] ?? (c.startsWith("C1") || c.startsWith("C2") ? "" : "0.00");
  const emptyRow = (n: number): boolean => columns.every((c) => cell(c, n) === (c.startsWith("C1") || c.startsWith("C2") ? "" : "0.00"));
  let used = 0;
  for (let n = 1; n <= last && used < csv.length; n++) {
    if (!emptyRow(n)) continue;
    for (const c of columns) next[fixed(c, n)] = csv[used]![moreStem(sched, c, ed)] ?? "";
    used++;
  }
  const rows = [...more];
  if (used < csv.length && rows.length === 0) rows.push(Object.fromEntries(columns.map((c) => [moreStem(sched, c, ed), cell(c, last)])));
  rows.push(...csv.slice(used));
  return { state: next, more: rows };
}
