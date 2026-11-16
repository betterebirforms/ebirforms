// BIR's ATC pick list as a pop-up (picker.ts): the codes the form allows, with BIR's nature of payment and rate.
// Several can be ticked for a Part II table, one for a payee row. OK fills the form; Cancel changes nothing.
import { useState } from "react";
import { atcInfo, type AtcPick } from "./atc.ts";

export function AtcPicker({ title, list, multi, picked, onOk, onCancel }: { title: string; list: AtcPick[]; multi: boolean; picked: number[]; onOk: (picked: number[]) => void; onCancel: () => void }) {
  const [on, setOn] = useState(() => new Set(picked));
  const [filter, setFilter] = useState("");
  const toggle = (i: number) =>
    setOn((s) => {
      const next = new Set(multi ? s : []);
      if (s.has(i) && multi) next.delete(i);
      else next.add(i);
      return next;
    });
  const words = filter.trim().toLowerCase();
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal schedule-modal atc-picker" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <p className="muted">{multi ? "Please click a row to select and deselect ATC." : "Please click a row to select an ATC."}</p>
        <input type="search" placeholder="Find a code or a word" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find an ATC" />
        <table>
          <thead>
            <tr>
              <th>ATC</th>
              <th>Description</th>
              <th>Rate %</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a, i) => {
              const desc = a.atc_code === "N/A" ? "SPECIAL LAW" : (atcInfo(a.atc_code)?.desc ?? "");
              if (words && !`${a.atc_code} ${desc}`.toLowerCase().includes(words)) return null;
              return (
                <tr key={i} className={on.has(i) ? "on" : ""} onClick={() => toggle(i)}>
                  <td>
                    <label>
                      <input type={multi ? "checkbox" : "radio"} name="atc" checked={on.has(i)} onChange={() => toggle(i)} onClick={(e) => e.stopPropagation()} /> {a.atc_code}
                    </label>
                  </td>
                  <td>{desc}</td>
                  <td className="rate">{a.rate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="actions">
          <button onClick={() => onOk([...on].sort((x, y) => x - y))} disabled={!multi && on.size === 0}>
            OK
          </button>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a picker's description says for a code: BIR's nature of payment ("SPECIAL LAW" for N/A). */
export const natureOf = (atc_code: string) => (atc_code === "N/A" ? "SPECIAL LAW" : (atcInfo(atc_code)?.desc ?? ""));
