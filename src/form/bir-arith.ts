// BIR's own number helpers (js/string-util.js), ported verbatim so a native compute reproduces BIR's float
// arithmetic to the centavo — including its `.toFixed(0)` whole-peso rounding on the TRAIN-era 1707 / 2552 forms.
// Use these only where BIR's float path changes a saved value; plain sums stay in exact centavos.

/** NumWithComma: strips commas and parseFloats. BIR quirk kept: "" → NaN (`"" != 0` is false → parseFloat("")). */
export function numWithComma(s: string): number {
  // eslint-disable-next-line eqeqeq
  return (s as unknown) != 0 ? parseFloat(String(s).replace(/,/g, "")) : parseFloat(s);
}

/** formatCurrency: "1,234.50", round half up via Math.floor(n*100 + 0.50000000001); NaN → "0.00". */
export function formatCurrency(input: number | string): string {
  let num: string | number = String(input).replace(/\$|,/g, "");
  const n = Number(num);
  if (num.indexOf(".") > 0 && n > 0) {
    const part = num.split(".");
    if (part[0]!.length > 15) num = `${part[0]!.substring(0, 15)}.${part[1]}`;
  } else if (num.indexOf(".") > 0 && n < 0) {
    const part = num.split(".");
    if (part[0]!.length > 13) num = `${part[0]!.substring(0, 15)}.${part[1]}`;
  } else if (n > 0 && num.length > 15) num = num.substring(0, 15);
  if (isNaN(Number(num))) num = "0";
  const abs = Math.abs(Number(num));
  const sign = Number(num) === abs;
  const scaled = Math.floor(abs * 100 + 0.50000000001);
  const cents = scaled % 100;
  let peso = Math.floor(scaled / 100).toString();
  for (let i = 0; i < Math.floor((peso.length - (1 + i)) / 3); i++) peso = `${peso.substring(0, peso.length - (4 * i + 3))},${peso.substring(peso.length - (4 * i + 3))}`;
  return `${sign ? "" : "-"}${peso}.${cents < 10 ? "0" : ""}${cents}`;
}

/** `formatCurrency((x).toFixed(digit))` — the shape of nearly every BIR compute line. */
export const fixed = (x: number, digit: number): string => formatCurrency(x.toFixed(digit));

/** round(this) on blur: a value whose integer part exceeds 12 digits becomes "0.00", else formatCurrency. */
export function roundInput(value: string): string {
  const num = value.replace(/\$|,/g, "");
  const int = num.indexOf(".") > 0 ? num.split(".")[0]! : num;
  if (int.length > 12) return "0.00";
  return formatCurrency(isNaN(Number(num)) ? "0" : num);
}
