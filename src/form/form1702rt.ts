// BIR Form 1702-RT, the pre-2018 8-page layout (superseded by 1702RTv2018/C), P3. Same `frm1702RT:` prefix and
// whole-peso arithmetic as the 2018 editions (form1702rtv2018c.ts has the helpers and the BIR quirks they encode),
// but different item numbers and more schedules:
//   Sch 1  4 = 1+2+3, 6 = 4−5 → 30          Sch 2  cost of sales 5/19/26 → 27 → 31        32 = 30−31
//   Sch 3  4 = Σ other taxable income → 33   34 = 32 + Sch 3 4
//   Sch 4  40 = Σ ordinary deductions → 35   Sch 5  5 = Σ special deductions → 36   Sch 6A NOLCO 8 → 37
//   38 = 35+36+37 (itemized)   39 = 34 × 40% (OSD, only when 34 > 0)   40 = 34 − (38 | 39)
//   42 = max(0, 40 × 30%)   43 = 34 × 2% (IC055 ticked, 34 ≥ 0)   44 = max(42, 43)
//   Sch 7  12 = Σ credits → 45; 4 (excess MCIT, Sch 8) counts only when 42 ≥ 43   46 = 44 − 45
//   50 = 47+48+49   51 = 46 ≥ 0 ? 46+50 : 46   52 = 36 × 30%   53 = Sch 7 9   54 = 52+53
//   page 1: 16 = 44, 17 = 45, 18 = 46, 19 = 50, 20 = 51
//   Sch 9 reconciliation, Sch 10 balance sheet totals.
// BIR arithmetic replicated: Sch 12 item 19 and Sch 13 item 8 add each amount as parseInt (WholeNumWithComma), so every
// line loses its centavos BEFORE the sum (not after, as getSum does).
// The Sch 2 lines 16 and 19 (sumThenDifference) ROUND to the peso where every other line truncates.
// Not modelled (they keep BIR's blank defaults): the Sch 12 II–IV / Sch 13 I–II pop-up tables, the Sch 6A row-7 and
// Sch 12 item-4 modals, and Part III payment details are inputs only.

import frozen from "./template/1702RT.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1702RT", frozen as Array<[string, string, string?]>);
import { parseMoney, type Centavo } from "./money.ts";
import { validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { domPeso, formatPeso, nolcoRows, numWithParenthesis, out, product, validIncorporationDate, wholeNum } from "./form1702rtv2018c.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1702RT:";
type Read = (id: string) => string;
type TemplateRecord = [string, string, string?];

interface Modal {
  name: string;
  stem: string;
  amount: string;
  text: string[];
}
/** The "(Add more…)" item lines whose rows loadData rebuilds from a CtrModal (3-element rows, plus Sch 5 item 4). */
export const MODAL_RT: Modal[] = [
  { name: "sc3_3", stem: "txtPg4Sc3I3", amount: "C2", text: ["C1"] },
  { name: "sc4_4", stem: "txtPg4Sc4I4", amount: "C2", text: ["C1"] },
  { name: "sc4_39", stem: "txtPg5Sc4I39", amount: "C2", text: ["C1"] },
  { name: "sc5_4", stem: "txtPg5Sc5I4", amount: "C3", text: ["C1", "C2"] },
  { name: "sc7_11", stem: "txtPg6Sc7I11", amount: "C2", text: ["C1"] },
  { name: "sc9_3", stem: "txtPg6Sc9I3", amount: "C2", text: ["C1"] },
  { name: "sc9_6", stem: "txtPg6Sc9I6", amount: "C2", text: ["C1"] },
  { name: "sc9_8", stem: "txtPg6Sc9I8", amount: "C2", text: ["C1"] },
];
const total = (m: Modal) => `_total_${m.name}`;
export const MODAL_RT_GROUP: GroupSpec[] = MODAL_RT.map((m) => ({
  name: m.name,
  size_field: `${P}${m.stem}CtrModal`,
  first_index: 1,
  row: [...m.text.map((c) => ({ id: `${P}${m.stem}.{i}${c}`, kind: "text" as const })), { id: `${P}${m.stem}.{i}${m.amount}`, kind: "money" as const }],
  total: { into: total(m), of: `${P}${m.stem}.{i}${m.amount}` },
}));

/** validateYearEnd, old layout: fiscal rules as in 2018, but the floor is September 2013 and from 2018 on the
 *  calendar-year checks are skipped (an empty `else if (inputYear >= 2018) {}` branch). */
export function yearEndRT(r: Read, now = new Date()): { month: string; year: string } {
  let month = r(`${P}ddlPg1I2Month`) || "12";
  let year = r(`${P}txtPg1I2Year`) || "25";
  const fiscal = r(`${P}rdoPg1I1Fiscal`) === "true";
  const calendar = !fiscal && r(`${P}rdoPg1I1Calendar`) !== "false";
  const shortYes = r(`${P}rdoPg1I4ShortPeriodYes`) === "true";
  const shortNo = !shortYes && r(`${P}rdoPg1I4ShortPeriodNo`) !== "false";
  const inputYear = 2000 + Number(year);
  const inputMonth = Number(month) - 1;
  const nowYear = now.getFullYear();
  if (fiscal && (inputYear > nowYear || (inputMonth > now.getMonth() && inputYear === nowYear))) year = "";
  else if (fiscal && inputMonth === 11) month = "";
  else if (inputYear < 2013 || (inputYear <= 2013 && inputMonth < 8)) year = "";
  else if (inputYear >= 2018) {
    /* BIR skips the calendar-year checks */
  } else if (calendar) {
    if (shortNo && inputYear >= nowYear) year = "";
    else if (shortYes) {
      if (inputYear > nowYear) year = "";
      else if (inputYear === nowYear && (inputMonth > now.getMonth() || inputMonth === 11)) month = "";
    }
  }
  if (year !== "" && Number(year) > -1 && Number(year) < 10) year = `0${Number(year)}`;
  return { month, year };
}

/** checkDateOfIncorporation (item 8): IC055 ticked once the filing year is ≥ 4 years after incorporation. */
function mcitRT(r: Read, period: { month: string; year: string }): { mcit: boolean; clear: boolean } {
  const date = r(`${P}txtPg1Pt1I8`).trim();
  if (date === "") return { mcit: false, clear: false };
  if (!validIncorporationDate(date)) return { mcit: false, clear: true };
  const [mm, dd, yyyy] = date.split("/").map(Number) as [number, number, number];
  const filingMonth = Number(period.month);
  const filingYear = 2000 + Number(period.year);
  const empty = period.month === "" && period.year === "";
  if (!empty && (yyyy > filingYear || (mm > filingMonth && yyyy === filingYear))) return { mcit: false, clear: true };
  if (filingYear - yyyy === 4) return { mcit: true, clear: false };
  if (filingYear - yyyy < 4) return { mcit: false, clear: false };
  const elapsed = (new Date(filingYear, filingMonth - 1, 1).getTime() - new Date(yyyy, mm - 1, dd).getTime()) / 31536000000;
  return { mcit: elapsed >= 4, clear: false };
}

const SC4_ITEM = [
  "txtPg4Sc4I1Advertising", "txtPg4Sc4I2AmortizationAmount", "txtPg4Sc4I3AmortizationAmount", "txtPg4Sc4I5BadDebts",
  "txtPg4Sc4I6CharitableContributions", "txtPg4Sc4I7Commissions", "txtPg4Sc4I8Communication", "txtPg4Sc4I9Depletion",
  "txtPg4Sc4I10Depreciation", "txtPg4Sc4I11DirectorsFee", "txtPg4Sc4I12FringeBenefits", "txtPg4Sc4I13Fuel", "txtPg4Sc4I14Insurance",
  "txtPg4Sc4I15Interest", "txtPg4Sc4I16Janitorial", "txtPg4Sc4I17Losses", "txtPg4Sc4I18Management", "txtPg4Sc4I19Miscellaneous",
  "txtPg4Sc4I20OfficeSupplies", "txtPg4Sc4I21OtherServices", "txtPg4Sc4I22ProfessionalFees", "txtPg4Sc4I23Rental",
  "txtPg4Sc4I24Repairs", "txtPg4Sc4I25Repairs", "txtPg4Sc4I26Representation", "txtPg4Sc4I27Research", "txtPg4Sc4I28Royalties",
  "txtPg4Sc4I29Salaries", "txtPg5Sc4I30SecurityServices", "txtPg5Sc4I31Contributions", "txtPg5Sc4I32TaxesandLicenses",
  "txtPg5Sc4I33TollingFees", "txtPg5Sc4I34TrainingandSeminars", "txtPg5Sc4I35TransportationandTravel",
  "txtPg5Sc4I36C2", "txtPg5Sc4I37C2", "txtPg5Sc4I38C2",
];
const SC4_TEXT = ["txtPg4Sc4I2Amortization", "txtPg4Sc4I3Amortization", "txtPg4Sc4I4C1", "txtPg5Sc4I36C1", "txtPg5Sc4I37C1", "txtPg5Sc4I38C1", "txtPg5Sc4I39C1"];
const CREDIT7 = [
  "txtPg6Sc7I1ExcessCredits", "txtPg6Sc7I2IncomeTaxPaymentUnderMCIT", "txtPg6Sc7I3IncomeTaxUnderRegular", "txtPg6Sc7I4ExcessMCIT",
  "txtPg6Sc7I5CreditableTaxWithheldFromPrevious", "txtPg6Sc7I6CreditableTaxWithheldFor4thQuarter", "txtPg6Sc7I7ForeignTaxCredits",
  "txtPg6Sc7I8TaxPaidInReturn", "txtPg6Sc7I9SpecialTaxCredits", "txtPg5Sc7I10C2", "txtPg6Sc7I11C2",
];

export interface ModelRT {
  osd: boolean;
  mcit: boolean;
  amount: Record<string, Centavo>;
  forced: Record<string, string>;
  text: Record<string, string>;
}

export function modelRT(r: Read): ModelRT {
  const raw = (id: string): Centavo => parseMoney(r(`${P}${id}`));
  const osd = r(`${P}rdoPg1Pt1I15OptionalStandard`) === "true";
  const item = !osd;
  const period = yearEndRT(r);
  const { mcit, clear } = mcitRT(r, period);
  const amount: Record<string, Centavo> = {};
  const forced: Record<string, string> = {};
  const text: Record<string, string> = {};
  const force = (id: string, v: string) => (forced[id] = v);
  if (period.month !== (r(`${P}ddlPg1I2Month`) || "12")) text.ddlPg1I2Month = period.month;
  if (period.year !== (r(`${P}txtPg1I2Year`) || "25")) text.txtPg1I2Year = period.year;
  if (clear) text.txtPg1Pt1I8 = "";
  text.rdoPg1I5Atc = String(mcit);

  const lineOf = (stem: string): Centavo => {
    const m = MODAL_RT.find((x) => x.stem === stem)!;
    const t = parseMoney(r(total(m)));
    return t !== 0 ? t : raw(`${m.stem}${m.amount}`);
  };
  for (const m of MODAL_RT) {
    const t = parseMoney(r(total(m)));
    amount[`${m.stem}Subtotal`] = out(t);
    if (t !== 0) force(`${m.stem}${m.amount}`, formatPeso(out(t)));
  }
  const sum = (...c: Centavo[]) => out(c.reduce((s, x) => s + x, 0));
  // sumThenDifference: Math.round(a + b − c), not truncation
  const roundSum = (a: Centavo, b: Centavo, c: Centavo): Centavo => Math.round((a + b - c) / 100) * 100;

  // Schedules 1–3 → 30, 31, 33
  amount.txtPg3Sc1I4Total = sum(raw("txtPg3Sc1I1GoodsProp"), raw("txtPg3Sc1I2SaleServices"), raw("txtPg3Sc1I3LeaseProp"));
  amount.txtPg3Sc1I6NetSales = out(amount.txtPg3Sc1I4Total - raw("txtPg3Sc1I5LessSales"));
  amount.txtPg3Sc2I3TotalGoods = sum(raw("txtPg3Sc2I1MerchInventory"), raw("txtPg3Sc2I2AddPurchases"));
  amount.txtPg3Sc2I5CostofSales = out(amount.txtPg3Sc2I3TotalGoods - raw("txtPg3Sc2I4LessMerch"));
  amount.txtPg3Sc2I8MaterialsAvaliable = sum(raw("txtPg3Sc2I6DirectMaterials"), raw("txtPg3Sc2I7AddPurchases"));
  amount.txtPg3Sc2I10RawMatUsed = out(amount.txtPg3Sc2I8MaterialsAvaliable - raw("txtPg3Sc2I9LessDirectMat"));
  amount.txtPg3Sc2I13TotalManCost = sum(amount.txtPg3Sc2I10RawMatUsed, raw("txtPg3Sc2I11DirectLabor"), raw("txtPg3Sc2I12ManOverhead"));
  amount.txtPg3Sc2I16CostOfGoods = roundSum(amount.txtPg3Sc2I13TotalManCost, raw("txtPg3Sc2I14WorkProcess"), raw("txtPg3Sc2I15LessWorkProcess"));
  amount.txtPg3Sc2I19CostOfGoods = roundSum(amount.txtPg3Sc2I16CostOfGoods, raw("txtPg3Sc2I17FinishedGoods"), raw("txtPg3Sc2I18LessFinishGoods"));
  amount.txtPg3Sc2I26TotalService = sum(...["I20DirectSalaries", "I21DirectMaterials", "I22DirectDepreciation", "I23DirectRental", "I24DirectOutside", "I25DirectOthers"].map((x) => raw(`txtPg3Sc2${x}`)));
  amount.txtPg3Sc2I27TotalSales = sum(amount.txtPg3Sc2I5CostofSales, amount.txtPg3Sc2I19CostOfGoods, amount.txtPg3Sc2I26TotalService);
  amount.txtPg4Sc3I4OtherTaxTotalAmount = sum(raw("txtPg4Sc3I1OtherTaxAmount"), raw("txtPg4Sc3I2OtherTaxAmount"), lineOf("txtPg4Sc3I3"));
  amount.txtPg2Pt4I30NetSales = amount.txtPg3Sc1I6NetSales;
  amount.txtPg2Pt4I31LessCost = amount.txtPg3Sc2I27TotalSales;
  amount.txtPg2Pt4I32GrossIncome = out(amount.txtPg2Pt4I30NetSales - amount.txtPg2Pt4I31LessCost);
  amount.txtPg2Pt4I33AddOtherTaxable = amount.txtPg4Sc3I4OtherTaxTotalAmount;
  const i34 = sum(amount.txtPg2Pt4I32GrossIncome, amount.txtPg4Sc3I4OtherTaxTotalAmount);
  amount.txtPg2Pt4I34TotalGross = i34;

  // Schedules 4–6A (itemized; a click on OSD zeroes and clears them)
  const sc4 = item ? sum(...SC4_ITEM.map(raw), lineOf("txtPg4Sc4I4"), lineOf("txtPg5Sc4I39")) : 0;
  amount.txtPg5Sc4I40TotalOrdinaryAllowable = sc4;
  amount.txtPg2Pt4I35OrdinaryAllowable = sc4;
  const sc5 = item ? sum(raw("txtPg5Sc5I1C3"), raw("txtPg5Sc5I2C3"), raw("txtPg5Sc5I3C3"), lineOf("txtPg5Sc5I4")) : 0;
  amount.txtPg5Sc5I5TotalSpecialAllowable = sc5;
  amount.txtPg2Pt4I36SpecialAllowable = sc5;
  if (osd) {
    for (const id of [...SC4_ITEM, "txtPg4Sc4I4C2", "txtPg5Sc4I39C2"]) force(id, "0");
    for (const id of SC4_TEXT) force(id, "");
    for (const k of [1, 2, 3, 4]) force(`txtPg5Sc5I${k}C1`, ""), force(`txtPg5Sc5I${k}C2`, ""), force(`txtPg5Sc5I${k}C3`, "0");
    for (const k of [5, 6, 7]) for (const c of ["C1", "C2", "C3", "C4", "C5"]) force(`txtPg5Sc6AI${k}${c}`, c === "C1" ? "" : "0");
  }
  // Schedule 6: this year's NOL (computeP2Pt4I40 fills 1/2 only when 34 < 35 under itemized)
  const sc6a = item && i34 < sc4 ? i34 : 0;
  const sc6b = item && i34 < sc4 ? sc4 : 0;
  amount.txtPg5Sc6I1GrossIncome = sc6a;
  amount.txtPg5Sc6I2TotalDeductions = sc6b;
  const loss = out(sc6a - sc6b);
  amount.txtPg5Sc6I3NetOperatingLoss = loss;
  const nol = wholeNum(domPeso(loss)) < 0 ? Math.abs(wholeNum(domPeso(loss))) * 100 : 0;
  text.txtPg5Sc6AI4C1 = nol && period.year !== "" ? `20${period.year}` : "";
  amount.txtPg5Sc6AI4C2 = nol;
  amount.txtPg5Sc6AI4C6 = nol;
  const nrow = [5, 6, 7].map((k) => ({ C2: r(`${P}txtPg5Sc6AI${k}C2`), C3: r(`${P}txtPg5Sc6AI${k}C3`), C4: r(`${P}txtPg5Sc6AI${k}C4`), C5: r(`${P}txtPg5Sc6AI${k}C5`) }));
  const zero = item ? nolcoRows(nrow) : nrow.map(() => ({ C3: true, C4: true, C5: true }));
  let nolco = 0;
  [5, 6, 7].forEach((k, j) => {
    const col = (c: "C2" | "C3" | "C4" | "C5"): Centavo => (osd || (c !== "C2" && zero[j]![c]) ? 0 : raw(`txtPg5Sc6AI${k}${c}`));
    if (item) for (const c of ["C3", "C4", "C5"] as const) if (zero[j]![c]) force(`txtPg5Sc6AI${k}${c}`, "0");
    amount[`txtPg5Sc6AI${k}C6`] = item ? out(col("C2") - (col("C3") + col("C4") + col("C5"))) : 0;
    nolco += col("C5");
  });
  amount.txtPg5Sc6AI8TotalNOLCO = item ? out(nolco) : 0;
  amount.txtPg2Pt4I37Nolco = amount.txtPg5Sc6AI8TotalNOLCO;

  // Part IV
  const i38 = item ? sum(sc4, sc5, amount.txtPg5Sc6AI8TotalNOLCO) : 0;
  amount.txtPg2Pt4I38TotalItemized = i38;
  const i39 = osd && i34 > 0 ? out(product(i34, 0.4)) : 0;
  amount.txtPg2Pt4I39OptionalStandard = i39;
  const i40 = out(i34 - (osd ? i39 : i38));
  amount.txtPg2Pt4I40NetTaxable = i40;
  const i42 = Math.max(0, out(product(i40, 0.3)));
  amount.txtPg2Pt4I42IncomeTaxDue = i42;
  const i43 = !mcit || i34 < 0 ? 0 : out(product(i34, 0.02));
  amount.txtPg2Pt4I43MinimumCorporate = i43;
  const i44 = i42 >= i43 ? i42 : i43;
  amount.txtPg2Pt4I44TotalIncomeTax = i44;
  amount.txtPg1Pt2I16IncomeTax = i44;

  // Schedule 8 (excess MCIT) — enableMCITFields clears it unless IC055 is ticked; C4 and C8 floor at 0
  let excess = 0;
  for (const k of [1, 2, 3]) {
    const c4 = Math.max(0, out(raw(`txtPg6Sc8I${k}C3`) - raw(`txtPg6Sc8I${k}C2`)));
    const c8 = Math.max(0, out(c4 - (raw(`txtPg6Sc8I${k}C5`) + raw(`txtPg6Sc8I${k}C6`) + raw(`txtPg6Sc8I${k}C7`))));
    amount[`txtPg6Sc8I${k}C4`] = mcit ? c4 : 0;
    amount[`txtPg6Sc8I${k}C8`] = mcit ? c8 : 0;
    if (mcit) excess += raw(`txtPg6Sc8I${k}C7`);
    else {
      force(`txtPg6Sc8I${k}C1`, "");
      for (const c of ["C2", "C3", "C5", "C6", "C7"]) force(`txtPg6Sc8I${k}${c}`, "0");
    }
  }
  amount.txtPg6Sc8I4TotalExcessMCIT = mcit ? out(excess) : 0;
  if (!mcit) force("txtPg6Sc7I2IncomeTaxPaymentUnderMCIT", "0");
  // computeP2Pt4I44: the excess MCIT credit (Sch 7 item 4) applies only when the regular tax is the one due
  amount.txtPg6Sc7I4ExcessMCIT = i42 >= i43 ? amount.txtPg6Sc8I4TotalExcessMCIT : 0;

  // Schedule 7 credits, 45–54, page 1
  const credit = (id: string): Centavo => {
    if (id === "txtPg6Sc7I4ExcessMCIT") return amount.txtPg6Sc7I4ExcessMCIT!;
    if (id in forced) return parseMoney(forced[id]!);
    if (id === "txtPg6Sc7I11C2") return lineOf("txtPg6Sc7I11");
    return raw(id);
  };
  const i45 = sum(...CREDIT7.map(credit));
  amount.txtPg6Sc7I12TotalTaxCredits = i45;
  amount.txtPg2Pt4I45LessTotalTax = i45;
  amount.txtPg1Pt2I17TotalTaxCredits = i45;
  const i46 = out(i44 - i45);
  amount.txtPg2Pt4I46NetTax = i46;
  amount.txtPg1Pt2I18NetTax = i46;
  const i50 = sum(raw("txtPg2Pt4I47Surcharge"), raw("txtPg2Pt4I48Interest"), raw("txtPg2Pt4I49Compromise"));
  amount.txtPg2Pt4I50TotalPenalties = i50;
  amount.txtPg1Pt2I19TotalPenalties = i50;
  const i51 = i46 >= 0 ? out(i46 + i50) : i46;
  amount.txtPg2Pt4I51TotalAmount = i51;
  amount.txtPg1Pt2I20TotalAmount = i51;
  amount.txtPg2Pt5I52SpecialAllowable = out(product(sc5, 0.3));
  amount.txtPg2Pt5I53AddSpecialTax = out(raw("txtPg6Sc7I9SpecialTaxCredits"));
  amount.txtPg2Pt5I54TotalTax = sum(amount.txtPg2Pt5I52SpecialAllowable, amount.txtPg2Pt5I53AddSpecialTax);

  // Schedule 9 reconciliation and Schedule 10 balance sheet
  amount.txtPg6Sc9I4Total = sum(raw("txtPg6Sc9I1NetIncome"), raw("txtPg6Sc9I2C2"), lineOf("txtPg6Sc9I3"));
  amount.txtPg6Sc9I9Total = sum(raw("txtPg6Sc9I5C2"), lineOf("txtPg6Sc9I6"), raw("txtPg6Sc9I7C2"), lineOf("txtPg6Sc9I8"));
  amount.txtPg6Sc9I10NetTaxableIncome = out(amount.txtPg6Sc9I4Total - amount.txtPg6Sc9I9Total);
  const s10 = (k: number[]) => sum(...k.map((n) => raw(`txtPg7Sc10I${n}${["", "CurrentAssets", "LongTermInvestment", "PropertyPlantEquipment", "LongTermReceivables", "IntangibleAssets", "OtherAssets", "", "CurrentLiabilities", "LongTermLiabilities", "DeferredCredits", "OtherLiabilities", "", "CapitalStock", "AdditionalCapital", "RetainedEarnings"][n]}`)));
  amount.txtPg7Sc10I7TotalAssets = s10([1, 2, 3, 4, 5, 6]);
  amount.txtPg7Sc10I12TotalLiabilities = s10([8, 9, 10, 11]);
  amount.txtPg7Sc10I16TotalEquity = s10([13, 14, 15]);
  amount.txtPg7Sc10I17TotalLiabilitiesEquity = sum(amount.txtPg7Sc10I12TotalLiabilities, amount.txtPg7Sc10I16TotalEquity);
  // Schedules 12 and 13 (computePg8Sc12I19 / computePg8Sc13I8): per-line parseInt, then the sum
  const whole = (ids: string[]) => ids.reduce((s, id) => s + wholeNum(r(`${P}${id}`) || "0"), 0) * 100;
  amount.txtSc12I19TotalFinalTaxWitheld = whole(["I1C3", "I2C3", "I3C3", "I4C3", "I9C1", "I9C2", "I15C1", "I15C2", "I18C1", "I18C2"].map((x) => `txtPg8Sc12${x}`));
  amount.txtPg8Sc13I8TotalIncome = whole(["txtPg8Sc13I1ReturnOfPremium", "txtPg8Sc13I5C1", "txtPg8Sc13I5C2", "txtPg8Sc13I7C1", "txtPg8Sc13I7C2"]);
  return { osd, mcit, amount, forced, text };
}

const ESCAPED = new Set([`${P}txtPg1Pt1I9Name`, `${P}txtPg1Pt1I10Address`, `${P}txtPg1Pt1I13Business`]);
const VERBATIM = /:txtPg[1-8](Pt1I6)?TIN[1-4]$|:txtPg[5-8]BranchCode$|:txtPg1Pt1I7RDO$|:txtPg1Pt1I11Contact$|:txtZIP$|:txtPg1Pt1I12Email$/;
/** BIR never lets the user set these (masks, signatures, pager, flags, the Sch 12 / 13 totals BIR cannot compute,
 *  the unmodelled pop-up tables' counters/subtotals, page count); they keep BIR's own default. */
const UNMODELLED = /BranchMask|:txtSignature|:txtPg5Sc6AI4C[345]$|:txtCurrentPage|:txtMaxPage|driveSelectTPExport|txtFinalFlag|txtEnroll|ebirOnline|Ctrmodal|:txtPg5Sc6AI7CtrModal|:txtPg8Sc12I4CtrModal|:txtPg5Sc6AI7C\dSubtotal|:txtPg8Sc12I4Subtotal|:txtPg1Pt2PagesFilled|CtrModal$/;
const PERCENT = /:txtPg7Sc11I\d+C4$/;

export function fieldListRT(record: TemplateRecord[]): FieldJson[] {
  return record
    .filter(([key]) => !UNMODELLED.test(key))
    .map(([key, value, radio]): FieldJson => {
      if (radio) return { id: key, kind: "radio" };
      if (key.startsWith(`${P}chk`)) return { id: key, kind: "checkbox" };
      if (/:(ddl|drp)/.test(key)) return { id: key, kind: "select" };
      if (value === "0" && !PERCENT.test(key)) return { id: key, kind: "money" };
      return { id: key, kind: "text", ...(ESCAPED.has(key) ? { escaped: true } : {}) };
    });
}

const json = fieldListRT(template as TemplateRecord[]);
const computedKey = new Set(Object.keys(modelRT(() => "").amount));
export const FORM_1702RT: FormSchema = {
  form_code: "1702RT",
  title: "Annual Income Tax — Corporations (Regular Rate), pre-2018 layout",
  field: json.map((f): FieldSpec => {
    const key = f.id.slice(P.length);
    const spec: FieldSpec = f.kind === "money" && computedKey.has(key) ? { ...f, compute: (r) => modelRT(r).amount[key] ?? 0 } : { ...f };
    if (/:txtPg1Pt1I6TIN[1-4]$|:txtPg1Pt1I9Name$|:txtPg1Pt1I10Address$/.test(f.id)) spec.required = true;
    return spec;
  }),
  group: MODAL_RT_GROUP,
  format: formatPeso,
  extra_record: (state, groups) => derivedRT(state, groups),
};

function derivedRT(state: FormState, groups: GroupState): SaveRecord[] {
  const r: Read = (id) => state[id] ?? "";
  const m = modelRT(r);
  const record = new Map<string, string>();
  const set = (id: string, v: string) => record.set(id.startsWith(P) ? id : `${P}${id}`, v);
  for (const f of json) {
    if (f.kind !== "text" || f.escaped || VERBATIM.test(f.id) || !(f.id in state)) continue;
    const v = numWithParenthesis(state[f.id]!);
    if (v !== state[f.id]) record.set(f.id, v);
  }
  for (const mo of MODAL_RT) {
    const row = groups[mo.name] ?? [];
    row.forEach((x, i) => {
      for (const c of mo.text) {
        const v = x[`${P}${mo.stem}.{i}${c}`] ?? "";
        if (numWithParenthesis(v) !== v) set(`${mo.stem}.${i + 1}${c}`, numWithParenthesis(v));
      }
    });
    if (row.length) mo.text.forEach((c) => set(`${mo.stem}${c}`, row.length === 1 ? numWithParenthesis(row[0]![`${P}${mo.stem}.{i}${c}`] ?? "") : "OTHERS"));
  }
  for (const [id, v] of Object.entries(m.forced)) set(id, v);
  for (const [id, v] of Object.entries(m.text)) set(id, v);
  set("rdoPg1Pt1I15ItemizedDeduction", String(!m.osd));
  set("rdoPg1Pt1I15OptionalStandard", String(m.osd));
  if (m.amount.txtPg1Pt2I20TotalAmount! >= 0) for (const x of ["Refunded", "Issued", "Carried"]) set(`rdoPg1Pt2I21Overpayment${x}`, "false");
  const name = r(`${P}txtPg1Pt1I9Name`);
  for (const pg of [2, 3, 4, 5, 6, 7, 8]) {
    const tin4 = pg >= 5 ? `txtPg${pg}BranchCode` : `txtPg${pg}TIN4`;
    for (const k of [1, 2, 3]) set(`txtPg${pg}TIN${k}`, r(`${P}txtPg1Pt1I6TIN${k}`));
    set(tin4, r(`${P}txtPg1Pt1I6TIN4`));
    set(`txtPg${pg}RegisteredName`, numWithParenthesis(name));
  }
  if (r(`${P}txtPg1Pt1I7RDO`)) set("drpPg1Pt1I7RDOCode", r(`${P}txtPg1Pt1I7RDO`));
  return [...record].map(([key, value]) => ({ key, value: ESCAPED.has(key) ? legacyEscape(value) : value }));
}

export function validate1702RT(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1702RT, state);
  const tin = `${state[`${P}txtPg1Pt1I6TIN1`] ?? ""}${state[`${P}txtPg1Pt1I6TIN2`] ?? ""}${state[`${P}txtPg1Pt1I6TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I6TIN1`, message: "The TIN's check digit doesn't match." });
  const date = state[`${P}txtPg1Pt1I8`] ?? "";
  if (date && !validIncorporationDate(date)) problem.push({ id: `${P}txtPg1Pt1I8`, message: "Date of incorporation must be a past date in MM/DD/YYYY form." });
  if (state[`${P}rdoPg1Pt1I15ItemizedDeduction`] === "true" && state[`${P}rdoPg1Pt1I15OptionalStandard`] === "true")
    problem.push({ id: `${P}rdoPg1Pt1I15OptionalStandard`, message: "Choose one method of deduction (BIR keeps OSD when both are ticked)." });
  const m = modelRT((id) => state[id] ?? "");
  if (m.amount.txtPg1Pt2I20TotalAmount! < 0 && !["Refunded", "Issued", "Carried"].some((x) => state[`${P}rdoPg1Pt2I21Overpayment${x}`] === "true"))
    problem.push({ id: `${P}rdoPg1Pt2I21OverpaymentRefunded`, message: "Choose how the overpayment (item 21) is to be handled." });
  for (const mo of MODAL_RT)
    (groups[mo.name] ?? []).forEach((row, i) => {
      if (parseMoney(row[`${P}${mo.stem}.{i}${mo.amount}`] ?? "") === 0) problem.push({ id: `${P}${mo.stem}.${i + 1}${mo.amount}`, message: `Row ${i + 1}: the amount should not be zero.` });
    });
  return problem;
}
