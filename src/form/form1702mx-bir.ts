// BIR's number and text helpers (js/string-util.js, js/string-util2014.js and the 1702-MX forms' own copies), ported
// with their exact semantics so the 1702-MX model below computes the strings BIR's own code would leave in each
// field. Values are BIR's DOM strings ("1,234", "(1,234)" for a negative, "1,234.00" for the NOLCO rows).
// Amounts are carried as integer centavos (never binary floats); the few products BIR rounds (rate × amount) are
// evaluated exactly as BIR's float expression is, since that rounding is what it saves.

/** NumWithParenthesis: the first "(" becomes "-", the first ")" is dropped. */
export const NumWithParenthesis = (num: string): string => num.replace("(", "-").replace(")", "");
/** NumWithComma: parseFloat with the commas removed (NaN for "" or text). */
export const NumWithComma = (num: string): number => parseFloat(String(num).replace(/,/g, ""));
/** WholeNumWithComma: parseInt with the commas removed. */
export const WholeNumWithComma = (num: string): number => parseInt(String(num).replace(/,/g, ""), 10);
/** addCommas: groups a bare digit run that ends the string ("1234" → "1,234"; "1,234.50" is left alone). */
export const addCommas = (intNum: string): string => String(intNum).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
/** removeCommaParenthesis: a number when the text had a comma, else the (sign-fixed) string. */
export function removeCommaParenthesis(senderValue: string): string | number {
  let s: string | number = senderValue;
  if (String(s).includes("(") || String(s).includes(")")) s = NumWithParenthesis(String(s));
  if (String(s).includes(",")) s = NumWithComma(String(s));
  return s;
}
/** JS `x * 1` on BIR's mixed string / number values. */
export const jsNumber = (x: string | number): number => (typeof x === "number" ? x : Number(x));
export const convertToNumber = (x: string | number): number => (Number.isNaN(jsNumber(x)) ? 0 : jsNumber(x));
export const isNumeric = (x: string | number): boolean => !Number.isNaN(jsNumber(x));

const group = (digit: string): string => digit.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** formatCurrencyWOC(x) for an exact centavo amount: |x| rounded to the centavo (already exact), then the whole
 *  pesos only (toward zero), comma-grouped, "-" when negative — so −0.40 is "-0". */
export function wocCents(cents: number): string {
  const peso = Math.floor(Math.abs(cents) / 100);
  return `${cents < 0 ? "-" : ""}${group(String(peso))}`;
}

/** formatCurrencyWOC(number) on an arbitrary value (string or number), BIR's own steps: strip "$" and ",", cap the
 *  integer digits, NaN → 0, round half up to the centavo, keep the whole pesos. */
export function formatCurrencyWOC(number: string | number): string {
  let num: string = String(number).replace(/\$|,/g, "");
  const n = Number(num);
  if (num.indexOf(".") > 0 && n > 0) {
    const part = num.split(".");
    if (part[0]!.length > 16) num = `${part[0]!.substring(0, 16)}.${part[1]}`;
  } else if (num.indexOf(".") > 0 && n < 0) {
    const part = num.split(".");
    if (part[0]!.length > 13) num = `${part[0]!.substring(0, 16)}.${part[1]}`;
  } else if (n > 0 && num.length > 16) num = num.substring(0, 16);
  if (Number.isNaN(Number(num))) num = "0";
  const abs = Math.abs(Number(num));
  const sign = Number(num) === abs;
  const cents = Math.floor(abs * 100 + 0.50000000001);
  return `${sign ? "" : "-"}${group(String(Math.floor(cents / 100)))}`;
}

/** formatCurrency(number): like formatCurrencyWOC but with the ".cc" kept (15-digit cap). */
export function formatCurrency(number: string | number): string {
  let num: string = String(number).replace(/\$|,/g, "");
  const n = Number(num);
  if (num.indexOf(".") > 0 && n > 0) {
    const part = num.split(".");
    if (part[0]!.length > 15) num = `${part[0]!.substring(0, 15)}.${part[1]}`;
  } else if (num.indexOf(".") > 0 && n < 0) {
    const part = num.split(".");
    if (part[0]!.length > 13) num = `${part[0]!.substring(0, 15)}.${part[1]}`;
  } else if (n > 0 && num.length > 15) num = num.substring(0, 15);
  if (Number.isNaN(Number(num))) num = "0";
  const abs = Math.abs(Number(num));
  const sign = Number(num) === abs;
  const all = Math.floor(abs * 100 + 0.50000000001);
  const cents = all % 100;
  return `${sign ? "" : "-"}${group(String(Math.floor(all / 100)))}.${cents < 10 ? "0" : ""}${cents}`;
}

/** NegativeValue: a numeric "-…" becomes "(…)" with the centavos dropped and commas re-grouped; "-0" → "(0)". */
export function NegativeValue(number: string | number): string {
  const s = String(number);
  let num = s.replace(/\$|,/g, "");
  if (!(num.indexOf("-") >= 0 && !Number.isNaN(Number(num)))) return s;
  num = String(Math.abs(Number(num)));
  if (num.indexOf(".") > 0 && Number(num) > 0) num = num.split(".")[0]!;
  if (Number.isNaN(Number(num))) num = "0";
  num = num !== "0" && num !== "0.00" ? group(num) : "0";
  return `(${num})`;
}

/** round(element, 2) on a value: 2-decimal, comma-grouped, round half up; > 12 integer digits are truncated to 12
 *  (host/form-patch.ts fixSilentAmountZeroing serves BIR's own intent there instead of silently zeroing). */
export function round2(value: string): string {
  let num = String(value).replace(/\$|,/g, "");
  if (num.indexOf(".") > 0) {
    const part = num.split(".");
    if (part[0]!.length > 12) num = `${part[0]!.substring(0, 12)}.${part[1]}`;
  } else if (num.length > 12) num = num.substring(0, 12);
  if (Number.isNaN(Number(num))) num = "0";
  const abs = Math.abs(Number(num));
  const sign = Number(num) === abs;
  const all = Math.floor(abs * 100 + 0.50000000001);
  const cents = all % 100;
  return `${sign ? "" : "-"}${group(String(Math.floor(all / 100)))}.${cents < 10 ? "0" : ""}${cents}`;
}

/** validateDate / validateFutureDate's calendar check (MM/DD/YYYY, a real day). */
export function birDateValid(s: string): boolean {
  const result = s.split("/");
  if (result.length !== 3) return false;
  const [mm, dd, yyyy] = result as [string, string, string];
  if (Number.isNaN(Number(mm || dd || yyyy))) return false;
  if (mm.length !== 2 || Number(mm) > 12 || Number(mm) < 1) return false;
  if (dd.length !== 2 || Number(dd) > 31 || Number(dd) < 1) return false;
  if (yyyy.length !== 4 || Number(yyyy) < 1800) return false;
  const leap = new Date(Number(yyyy), 1, 29).getMonth() === 1;
  if (Number(mm) === 2) return !(Number(dd) > 29 || (!leap && Number(dd) === 29));
  if (["04", "06", "09", "11"].includes(mm) && Number(dd) > 30) return false;
  return true;
}

/** BIR's form state (field strings, ticks, disabled flags) with the helpers every 1702-MX edition shares
 *  (js/string-util*.js and the forms' own getSum / getDifference / product* / setToZeroIfEmpty / …), ported under
 *  BIR's names. A form's simulation extends it with its own compute functions and event wiring. */
export abstract class BirDom {
  v: Record<string, string> = {};
  chk: Record<string, boolean> = {};
  dis: Record<string, boolean> = {};
  constructor(readonly now: Date) {}
  /** The element's onblur (setPercentage re-fires it). */
  abstract blur(e: string): void;
  /** data-type="negative" fields keep a loss on setToZeroIfEmpty. */
  protected negative(_e: string): boolean {
    return false;
  }

  // value access, BIR-style
  g(id: string): string {
    return this.v[id] ?? "";
  }
  set(id: string, value: string | number): void {
    this.v[id] = String(value);
  }
  /** isNaN(NumWithComma(NumWithParenthesis(x))) ? 0 : x — as exact centavos. */
  cents(id: string): number {
    const x = NumWithComma(NumWithParenthesis(this.g(id)));
    return Number.isNaN(x) ? 0 : Math.round(x * 100);
  }
  /** getValAmount: the numeric value (0 when not a number). */
  getValAmount(id: string): number {
    const x = NumWithComma(NumWithParenthesis(this.g(id)));
    return Number.isNaN(x) ? 0 : x;
  }
  disp(cents: number): string {
    return NegativeValue(wocCents(cents));
  }

  // ── BIR's arithmetic helpers ──
  getSum(params: string, output?: string): number {
    const total = params.split(",").reduce((s, id) => s + this.cents(id), 0);
    if (output) for (const o of output.split(",")) this.set(o, this.disp(total));
    return total / 100;
  }
  getDifference(minuend: string, subtrahend: string, output: string): void {
    const a = minuend.split(",").reduce((s, id) => s + this.cents(id), 0);
    const b = subtrahend.split(",").reduce((s, id) => s + this.cents(id), 0);
    this.set(output, this.disp(a - b));
  }
  /** BIR's float operand: isNaN(NumWithComma(NumWithParenthesis(x))) ? 0 : x. */
  protected operand(id: string): number {
    const x = NumWithComma(NumWithParenthesis(this.g(id)));
    return Number.isNaN(x) ? 0 : x;
  }
  /** product1: param1 × param2 / 100, negative → 0, Math.round (BIR's float expression, evaluated as BIR does). */
  product1(param1: string, param2: string, out: string): void {
    let product = this.operand(param1) * (this.operand(param2) / 100);
    if (product < 0) product = 0;
    this.set(out, NegativeValue(formatCurrencyWOC(Math.round(product))));
  }
  /** product2: param1 × a literal, negative → 0, Math.round, formatCurrency(…).slice(0, -3). */
  product2(param1: string, param2: string, out: string): void {
    let product = this.operand(param1) * NumWithComma(NumWithParenthesis(param2));
    if (product < 0) product = 0;
    this.set(out, NegativeValue(formatCurrency(Math.round(product)).slice(0, -3)));
  }
  allFormat(param: string, out: string): void {
    this.set(out, NegativeValue(formatCurrency(NumWithComma(NumWithParenthesis(this.g(param)))).slice(0, -3)));
  }
  setValuesTo(params: string, val: string): void {
    for (const id of params.split(",")) this.set(id, val);
  }
  disableField(params: string): void {
    for (const id of params.split(",")) this.dis[id] = true;
  }
  enableField(params: string): void {
    // with no Part V attachments (totalEX = totalSP = 0) every field is enabled
    for (const id of params.split(",")) this.dis[id] = false;
  }
  enableField1(params: string): void {
    this.enableField(params);
  }

  // ── element handlers' helpers (an element is its id) ──
  setToZeroIfEmpty(e: string): void {
    const value = this.g(e);
    const negative = this.negative(e); // data-type="negative"
    if (value.trim() === "" || !isNumeric(removeCommaParenthesis(value))) this.set(e, "0");
    else if (convertToNumber(removeCommaParenthesis(value)) <= 0 && !negative) this.set(e, "0");
    else if (negative) this.set(e, NegativeValue(formatCurrencyWOC(NumWithParenthesis(value))));
    else this.set(e, Math.round(Number(removeCommaParenthesis(value))));
  }
  checkNumValue(e: string): void {
    const value = this.g(e);
    const n = NumWithComma(NumWithParenthesis(value));
    if (value === "" || Number(value) < 0 || Number.isNaN(n) || n < 0) this.set(e, "0");
    else this.set(e, value.replace(/^0+(?!\.|$)/, "").replace(/(\d)(?=(\d{3})+$)/g, "$1,"));
  }
  addCommas1702MX(e: string): void {
    this.set(e, NegativeValue(formatCurrencyWOC(NumWithComma(NumWithParenthesis(this.g(e))))));
  }
  capitalize(e: string): void {
    this.set(e, this.g(e).toUpperCase().trim());
  }
  round(e: string, _dec: number): void {
    this.set(e, round2(this.g(e)));
  }
  setPercentage(e: string, decimalPlaces: number): void {
    const value = this.g(e);
    if (value.trim() === "" || !isNumeric(value)) this.set(e, "0.0");
    else if (convertToNumber(value) < 0 || convertToNumber(value) >= 100) {
      this.set(e, "0.0");
      this.blur(e); // e.onblur()
    } else {
      const part = value.split(".");
      if (part.length === 2 && part[1]!.length > 2) this.set(e, (Number(value) * 1).toFixed(2));
      else if (decimalPlaces !== 0) this.set(e, (Number(value) * 1).toFixed(decimalPlaces));
    }
  }

  /** validateDate(element): clears an invalid or future MM/DD/YYYY date. */
  validateDate(e: string): boolean {
    const s = this.g(e);
    if (s === "") return true;
    let ok = birDateValid(s);
    if (ok) {
      const [mm, dd, yyyy] = s.split("/").map(Number) as [number, number, number];
      if (new Date(yyyy, mm - 1, dd) > this.now) ok = false;
    }
    if (!ok) this.set(e, "");
    return ok;
  }
  /** BIR's validateFutureDate(element, checkPastDate): with checkPastDate the date must also be in the future. */
  validateFutureDate(e: string, checkPastDate?: boolean): boolean {
    const s = this.g(e);
    if (s === "") return true;
    let ok = birDateValid(s);
    if (ok && checkPastDate) {
      const [mm, dd, yyyy] = s.split("/").map(Number) as [number, number, number];
      if (new Date(yyyy, mm - 1, dd) <= this.now) ok = false;
    }
    if (!ok) this.set(e, "");
    return ok;
  }
  validateEmail(): void {
    const s = this.g("txtPg1Pt1I12Email");
    if (s.match(/\b[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,4}\b/) || s === "") return;
    this.set("txtPg1Pt1I12Email", "");
  }
}
