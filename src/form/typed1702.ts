// What a 1702-RT / 1702-EX amount box holds after the user types into it and leaves it (FormSchema.typed), and what
// BIR's pop-up row holds, ported from BIR's own string functions. Each is checked against BIR's page in
// test/typed-1702.test.ts.

const numWithParenthesis = (v: string): string => v.replace("(", "-").replace(")", "");
const numWithComma = (v: string): number => parseFloat(v.replace(/,/g, ""));
const group = (v: string): string => v.replace(/(\d)(?=(\d{3})+$)/g, "$1,");

/** The 1702-RT editions: onblur="checkNumValue(this), ..., this.value = addCommas(this.value)". A blank, negative or
 *  non-numeric entry becomes "0"; leading zeros go; a run of digits gets its commas; a decimal is left as typed. */
export function typedRT(raw: string): string {
  const n = numWithComma(numWithParenthesis(raw));
  if (raw === "" || Number(raw) < 0 || Number.isNaN(n) || n < 0) return "0";
  return group(group(raw.replace(/^0+(?!\.|$)/, "")));
}

/** BIR's FormatValue (1702-EX 2013 and 2018): whole pesos with commas, the decimals dropped, a negative in parentheses. */
export function formatValue(value: string): string {
  let positive = true;
  let num = value.replace(/^0+/, "").replace(/\$|,/g, "");
  if (num.indexOf("-") >= 0) {
    num = Math.abs(Number(num)).toString();
    positive = false;
  }
  if (num.indexOf(".") > 0 && Number(num) > 0) num = num.split(".")[0]!;
  if (Number.isNaN(Number(num))) num = "0";
  if (num !== "0" && num !== "0.00") {
    for (let i = 0; i < Math.floor((num.length - (1 + i)) / 3); i++) num = `${num.substring(0, num.length - (4 * i + 3))},${num.substring(num.length - (4 * i + 3))}`;
  } else num = "0";
  if (num === "" || num === "0") return "0";
  return `${positive ? "" : "("}${num}${positive ? "" : ")"}`;
}

/** 1702-EX toComma(elem): FormatValue, and a negative (it has a closing parenthesis) becomes "0". */
export function toComma(value: string): string {
  const v = formatValue(value);
  return v.indexOf(")") > 0 ? "0" : v;
}

/** The 1702-EX 2013 editions: onblur="onBlurIterate(this), toComma(this), ...". */
export const typedEX = toComma;

/** BIR's round(elem) (string-util.js): two decimals, commas, a value past 12 whole digits becomes "0.00". */
export function roundValue(value: string): string {
  let num = value.replace(/\$|,/g, "");
  const dot = num.indexOf(".");
  if (dot > 0 ? num.split(".")[0]!.length > 12 : num.length > 12) return "0.00";
  if (Number.isNaN(Number(num))) num = "0";
  const abs = Math.abs(Number(num));
  const sign = Number(num) === abs;
  const cent = Math.floor(abs * 100 + 0.50000000001);
  let cents = String(cent % 100);
  if (cent % 100 < 10) cents = `0${cents}`;
  let whole = Math.floor(cent / 100).toString();
  for (let i = 0; i < Math.floor((whole.length - (1 + i)) / 3); i++) whole = `${whole.substring(0, whole.length - (4 * i + 3))},${whole.substring(whole.length - (4 * i + 3))}`;
  return `${sign ? "" : "-"}${whole}.${cents}`;
}

/** The 1702-EX 2018 pop-up rows: onblur="onBlurIterate(this); toComma(this); Sum_...(); round(this);". The page's own
 *  boxes only take round(this), so this is the row's saved text, not the form's `typed`. */
export const rowEX2018 = (value: string): string => roundValue(toComma(value));
