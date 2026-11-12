// BIR's blank forms fill some boxes from today's date in their init() ("For the Month", "Year Ended", due dates).
// Each such key, per form, is measured by test/capture-template.test.ts (EBF_CAPTURE_CLOCK) and named by one of
// these rules; the save template's frozen value for it is replaced by the rule applied to today.
import CLOCK_KEY from "./template-clock.json";

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (d: Date, month: number) => new Date(d.getFullYear(), d.getMonth() + month, 1);

/** Rule name → the value BIR's page shows for that date. */
export const CLOCK_RULE: Record<string, (d: Date) => string> = {
  month: (d) => pad(d.getMonth() + 1),
  month_bare: (d) => String(d.getMonth() + 1),
  last_month: (d) => pad(shift(d, -1).getMonth() + 1),
  next_month: (d) => pad(shift(d, 1).getMonth() + 1),
  year: (d) => String(d.getFullYear()),
  last_month_year: (d) => String(shift(d, -1).getFullYear()),
  next_month_year: (d) => String(shift(d, 1).getFullYear()),
  last_year: (d) => String(d.getFullYear() - 1),
  day: (d) => pad(d.getDate()),
  quarter: (d) => String(Math.floor(d.getMonth() / 3) + 1),
  date: (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`,
  last_year_yy: (d) => pad((d.getFullYear() - 1) % 100),
  // BIR's own January results, kept 1:1: 2551M sets selectedIndex = getMonth() ("00" in January); 0619E/F leave the
  // month blank in January and their due month becomes "0NaN"
  last_month_index: (d) => pad(d.getMonth()),
  last_month_or_blank: (d) => (d.getMonth() === 0 ? "" : pad(d.getMonth())),
  due_month_or_nan: (d) => (d.getMonth() === 0 ? "0NaN" : pad(d.getMonth() + 1)),
  // 1702Q ticks quarter 1, 2 or 3 by month; from July on the page keeps its default, quarter 3
  q1702_1: (d) => String(d.getMonth() < 3),
  q1702_2: (d) => String(d.getMonth() >= 3 && d.getMonth() < 6),
  q1702_3: (d) => String(d.getMonth() >= 6),
  // 2553 compares `month.getMonth == 2` (no call), so March, June, September and December tick nothing and the
  // page keeps its default, quarter 4
  q2553_1: (d) => String([0, 1].includes(d.getMonth())),
  q2553_2: (d) => String([3, 4].includes(d.getMonth())),
  q2553_3: (d) => String([6, 7].includes(d.getMonth())),
  q2553_4: (d) => String(![0, 1, 3, 4, 6, 7].includes(d.getMonth())),
};

const KEY = CLOCK_KEY as Record<string, Record<string, string>>;

/** Today's value for a date-driven blank-form default, or undefined for any other key. */
export function clockValue(form_code: string, key: string, now: Date = new Date()): string | undefined {
  const rule = KEY[form_code]?.[key];
  return rule ? CLOCK_RULE[rule]?.(now) : undefined;
}

type Record3 = [string, string, string?];
/** A form's save template as BIR's blank page would save it TODAY: every read of a record applies clockValue, so
 *  a form that walks its own template (1700, 1701, the 1702 family) sees the live date too, not the capture day's. */
export function liveTemplate<T extends Record3[] | Array<[string, string] | [string, string, string]>>(form_code: string, frozen: T): T {
  if (!KEY[form_code]) return frozen;
  return new Proxy(frozen, {
    get(t, p, receiver) {
      const r = Reflect.get(t, p, receiver) as unknown;
      if (typeof p !== "string" || !/^\d+$/.test(p) || !Array.isArray(r)) return r;
      const live = clockValue(form_code, r[0] as string);
      return live === undefined ? r : r[2] === undefined ? [r[0], live] : [r[0], live, r[2]];
    },
  });
}
