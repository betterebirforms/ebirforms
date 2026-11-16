// BIR's calculator pop-ups on the web version (2200A Schedule 1: eleven "Calculator" links, each opening a table whose
// rows BIR's script adds). The captured page holds the pop-up empty, so the rows are drawn here, in BIR's own markup
// (its AddRowXA035Bottle / AddRowXA035Bulk / AddRowXA036 / AddRowOthers), from the engine's group rows; the engine
// does BIR's arithmetic (form2200a.ts), and LayoutView wires the links and buttons.
import { useState } from "react";
import { calcOpenAlert, calcRoute, calcSubTotal, calcDueExceeds, calcTableAlert, CALC } from "./form2200a.ts";
import type { GroupRow, GroupSpec } from "./schema.ts";

/** One box of a calculator row: BIR's maxlength, whether a person types it (else BIR disables it), which keys its
 *  keypress filter lets through ("whole" = digits, "number" = digits and the point), and the cell's width. */
export interface CalcColumn { n: number; max: number; typed: boolean; key: "text" | "whole" | "number"; width: string }

const text = (width: string): CalcColumn => ({ n: 2, max: 25, typed: true, key: "text", width });
const whole = (n: number, width: string): CalcColumn => ({ n, max: 12, typed: true, key: "whole", width });
const number = (n: number, max: number, width: string): CalcColumn => ({ n, max, typed: true, key: "number", width });
const fixed = (n: number, width: string): CalcColumn => ({ n, max: 0, typed: false, key: "text", width });

/** BIR's row for a calculator: its table width and its boxes from column 2 (column 1 is the row's tick box). */
export function calcLayout(kind: string): { width: string; column: CalcColumn[] } {
  switch (kind) {
    case "035Bottle": return { width: "100%", column: [text("156px"), whole(3, "100px"), whole(4, "100px"), fixed(5, "120px"), number(6, 15, "120px"), number(7, 5, "50px"), fixed(8, "65px"), fixed(9, "150px")] };
    case "035Bulk": return { width: "700px", column: [text(""), number(3, 15, "180px"), number(4, 5, "70px"), fixed(5, "70px"), fixed(6, "180px")] };
    case "036Bottle": return { width: "100%", column: [text("155px"), whole(3, "100px"), whole(4, "100px"), fixed(5, "120px"), number(6, 16, "120px"), number(7, 5, "50px"), fixed(8, "65px"), fixed(9, "130px"), fixed(10, "150px")] };
    case "036Bulk": return { width: "700px", column: [text(""), number(3, 16, "120px"), number(4, 5, "70px"), fixed(5, "70px"), fixed(6, "180px")] };
    default: return { width: "700px", column: [text(""), whole(3, "100px"), whole(4, "100px"), fixed(5, "100px"), number(6, 12, "100px"), fixed(7, "120px")] };
  }
}

/** The calculators a form's page links to: `link` is the calculator each of the page's "Calculator" links opens, in the
 *  order they sit on the page (BIR's own openDialog / openDialogForATC3536 calls), `alert` the alert BIR gives a link
 *  before it opens, the rest the routes and checks BIR's Add / Compute / Delete / Clear buttons run. */
export interface CalculatorSpec {
  /** the pop-up BIR's script hides while a calculator is open, and shows again when it closes */
  back: string;
  link: string[];
  /** every calculator the page holds, and the engine group that keeps each one's rows */
  all: string[];
  group: (name: string) => string;
  name: (group: string) => string;
  alert?: (name: string, empty: (calc: string) => boolean) => string | null;
  route: (name: string) => { source: string; target: string };
  /** the text a calculator copies into its taxable box, from the form's computed values */
  sub_total: (read: (id: string) => string, source: string) => string;
  exceeds: (read: (id: string) => string, source: string) => boolean;
  table_alert: (name: string, row: Array<Record<number, string>>) => string | null;
  kind: (name: string) => string;
  max_alert: (name: string) => string;
}

export const CALCULATOR: Record<string, CalculatorSpec> = {
  "2200A": {
    back: "modalSched1",
    link: ["XA035Bottle", "XA035Bulk", "XA036Bottle", "XA036Bulk", "XA061", "XA062", "XA070", "XA080", "XA055", "XA056", "XA057"],
    all: CALC.map((c) => c.name),
    group: (name) => `calc${name}`,
    name: (group) => group.slice(4),
    alert: calcOpenAlert,
    route: calcRoute,
    sub_total: calcSubTotal,
    exceeds: calcDueExceeds,
    table_alert: calcTableAlert,
    kind: (name) => CALC.find((c) => c.name === name)!.kind,
    max_alert: (name) => (/XA03[56]/.test(name) ? "Exceeded maximum amount of 999,999,999,999.99 on Tax Base/Total Tax Base." : `Exceeded maximum amount of 999,999,999,999.99 on Tax Base/Total Tax Base of ${name}.`),
  },
};

/** BIR's dateToday(): "m/d/yyyy  hh:mm am" for the "Date computed" line. */
export function dateToday(now = new Date()): string {
  const two = (n: number) => (n < 10 ? `0${n}` : String(n));
  const hour = ((now.getHours() + 11) % 12) + 1;
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}  ${two(hour)}:${two(now.getMinutes())} ${now.getHours() > 11 ? "pm" : "am"}`;
}

/** The rows of one calculator, in BIR's markup: a tick box, then each box with BIR's maxlength, keypress filter and
 *  disabled state. A box shows what the engine computed for it (BIR's blur formatting) except while it is being typed in. */
export function CalcRows({ spec, kind, group, row, shown, onSet, onBlur }: { spec: GroupSpec; kind: string; group: string; row: GroupRow[]; shown: GroupRow[]; onSet: (group: string, i: number, id: string, value: string) => void; onBlur: (group: string, i: number) => void }) {
  const [focus, setFocus] = useState<string | null>(null);
  const { width, column } = calcLayout(kind);
  const sub = spec.row;
  const id = (n: number) => sub[n - 1]!.id;
  return (
    <>
      {row.map((r, i) => (
        <div key={i}>
          <table className="RowSubTable tblForm" style={{ width, textAlign: "center" }}>
            <tbody>
              <tr style={{ textAlign: "center" }}>
                <td style={{ width: "20px" }}>
                  <input type="checkbox" checked={(shown[i]?.[id(1)] ?? r[id(1)]) === "true"} onChange={(e) => onSet(group, i, id(1), String(e.target.checked))} />
                </td>
                {column.map((c) => {
                  const key = `${i}:${c.n}`;
                  const raw = r[id(c.n)] ?? "";
                  const value = c.typed && focus === key ? raw : (shown[i]?.[id(c.n)] ?? raw);
                  return (
                    <td key={c.n} style={c.width ? { width: c.width } : undefined}>
                      <input
                        type="text"
                        value={value}
                        disabled={!c.typed}
                        className={c.typed ? undefined : "isDisabled"}
                        maxLength={c.typed ? c.max : undefined}
                        style={{ width: "90%", textAlign: c.key === "text" ? undefined : "right", background: focus === key ? "#ffffcc" : undefined }}
                        onFocus={(e) => {
                          setFocus(key);
                          e.currentTarget.select();
                        }}
                        onBlur={() => {
                          setFocus(null);
                          onBlur(group, i);
                        }}
                        onKeyPress={(e) => {
                          if (c.key === "text" || e.key === "Enter") return;
                          if (!(c.key === "whole" ? /^[0-9]$/ : /^[0-9.]$/).test(e.key)) e.preventDefault();
                        }}
                        onPaste={(e) => e.preventDefault()}
                        onDrop={(e) => e.preventDefault()}
                        onChange={(e) => onSet(group, i, id(c.n), e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
