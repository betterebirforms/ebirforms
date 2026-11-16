// A schema-driven renderer for any rebuilt form: no inline IE JavaScript, live exact-centavo compute,
// real validation, and a save that writes a file byte-compatible with the legacy form and BIR.
import { useEffect, useMemo, useState } from "react";
import { NATIVE_FORM } from "./registry.ts";
import { computeForm, computeGroupRows, typedMoney, groupAggs, isGateOpen, radioGroupName, type FieldSpec, type RowOption, type FormState, type GroupRow, type GroupState, type GroupSpec } from "./schema.ts";
import { formatMoney, parseMoney } from "./money.ts";
import type { Profile } from "@/lib/savefile.ts";
import { SAVEFILE_ADAPTER } from "./export.ts";
import { IS_WEB, writeText } from "@/lib/vfs.ts";
import { webDownload, webExport } from "@/lib/web-store.ts";
import { barcodeUrl, birHeaderUrl } from "@/lib/bir-asset.ts";

const prettyId = (id: string) => id.replace(/^frm[^:]*:/, "").replace(/^txt/, "");

export function FormView({ form_code, profile, initial, onClose, onSaved }: { form_code: string; profile: Profile; initial?: { state: FormState; groups: GroupState } | undefined; onClose: () => void; onSaved: () => void }) {
  const def = NATIVE_FORM[form_code]!;
  const { schema, validate, label } = def;

  const [state, setState] = useState<FormState>(() => {
    if (initial) return initial.state;
    const seed: FormState = {};
    for (const [id, key] of Object.entries(def.prefill)) seed[id] = profile[key];
    return seed;
  });
  const [groups, setGroups] = useState<GroupState>(() => initial?.groups ?? Object.fromEntries((schema.group ?? []).map((g) => [g.name, [] as GroupRow[]])));
  const [saved, setSaved] = useState<string | null>(null);

  const computed = useMemo(() => computeForm(schema, state, groups), [schema, state, groups]);
  const problem = useMemo(() => validate(computed, groups), [validate, computed, groups]);
  const set = (id: string, value: string) => {
    setSaved(null);
    setState((s) => ({ ...s, [id]: value }));
  };

  // fields the group fills (schedule totals) are read-only + show the computed value, like a `compute` field
  const groupTotalTarget = new Set((schema.group ?? []).flatMap((g) => groupAggs(g).map((a) => a.into)));
  const isComputed = (id: string, hasCompute: boolean) => hasCompute || groupTotalTarget.has(id);

  // internal/hidden fields never shown to the user: the schedule size field, duplicate totals, submission flags
  const sizeFields = new Set((schema.group ?? []).map((g) => g.size_field));
  const internal = (id: string) =>
    sizeFields.has(id) || /TableSize|TotaltaxWithheld|txtFinalFlag|txtEnroll|driveSelect|SpecialLawSelect|^txtEmail$|:txtEmail$|^txtSheets$|:txtSheets$|:j_id/i.test(id);

  // which fields to render: skip checkboxes/secrets, render text + money + select (radios get their own groups)
  const shown = schema.field.filter(
    (f) => !f.secret && !internal(f.id) && (f.kind === "text" || f.kind === "money" || f.kind === "select"),
  );
  const identity = shown.filter((f) => f.kind !== "money");
  const moneyField = shown.filter((f) => f.kind === "money");

  // radio fields, grouped by BIR's own radio name (CatAgent_P / CatAgent_G share one; ids alone can't tell)
  const radioStem = (id: string) => radioGroupName(form_code, id);
  const radioGroup = new Map<string, FieldSpec[]>();
  for (const f of schema.field.filter((f) => f.kind === "radio" && !f.secret && !internal(f.id))) {
    const stem = radioStem(f.id);
    if (!radioGroup.has(stem)) radioGroup.set(stem, []);
    radioGroup.get(stem)!.push(f);
  }
  const setRadio = (chosen: string, siblings: FieldSpec[]) => {
    setSaved(null);
    setState((s) => ({ ...s, ...Object.fromEntries(siblings.map((f) => [f.id, f.id === chosen ? "true" : "false"])) }));
  };

  // a field is read-only when it is computed, a schedule total, or a gated field whose gate is currently closed
  const readOnly = (f: FieldSpec) => isComputed(f.id, Boolean(f.compute) && !f.is_editable) || !isGateOpen(f, computed);
  const render = (f: FieldSpec) => {
    const ro = readOnly(f);
    return (
      <label key={f.id} className={f.kind === "money" ? (ro ? "money total" : "money") : ""}>
        {label[f.id] ?? prettyId(f.id)}
        <input
          data-id={f.id}
          inputMode={f.kind === "money" ? "decimal" : undefined}
          readOnly={ro}
          value={ro ? computed[f.id] : (state[f.id] ?? (f.is_editable ? computed[f.id] : ""))}
          onChange={(e) => set(f.id, e.target.value)}
          onBlur={f.kind === "money" && !ro ? (e) => set(f.id, typedMoney(schema, e.target.value)) : undefined}
        />
      </label>
    );
  };

  const save = async () => {
    const { name, text } = SAVEFILE_ADAPTER.build({ form_code, state, groups, profile });
    if (IS_WEB) {
      // web: storage can be evicted, so every save also hands the user the file; with no storage
      // (private browsing) the download is the only copy
      try {
        await writeText(`savefile/${name}`, text);
        await webExport(`savefile/${name}`);
      } catch {
        webDownload(name, text);
      }
    } else await writeText(`savefile/${name}`, text);
    setSaved(name);
    onSaved();
  };

  const setRow = (group: string, i: number, id: string, value: string) => {
    setSaved(null);
    setGroups((g) => ({ ...g, [group]: g[group]!.map((row, j) => (j === i ? { ...row, [id]: value } : row)) }));
  };
  const addRow = (group: string) => setGroups((g) => ({ ...g, [group]: [...g[group]!, {}] }));
  const removeRow = (group: string, i: number) => setGroups((g) => ({ ...g, [group]: g[group]!.filter((_, j) => j !== i) }));

  return (
    <section className="panel form-view">
      <div className="bir-banner">
        <img src={birHeaderUrl} alt="Republic of the Philippines, Bureau of Internal Revenue" />
        {barcodeUrl(form_code).slice(0, 1).map((url) => (
          <img key={url} className="bir-barcode" src={url} alt={`BIR Form ${form_code} barcode, page 1`} />
        ))}
      </div>
      <header className="form-head">
        <h2>
          BIR Form {form_code}: {schema.title} (rebuilt)
        </h2>
        <button className="ghost" onClick={onClose}>
          Back
        </button>
      </header>
      <p className="muted">A native rewrite: no IE engine, exact-centavo math, real validation. It saves a file the legacy form and BIR read unchanged.</p>

      <div className="identity-grid">{identity.map((f) => render(f))}</div>

      {radioGroup.size > 0 && (
        <div className="radio-grid">
          {[...radioGroup].map(([stem, options]) => (
            <fieldset key={stem} className="radio-group">
              <legend>{label[stem] ?? prettyId(stem)}</legend>
              {options.map((f) => (
                <label key={f.id} className="radio-option">
                  <input type="radio" data-id={f.id} name={stem} checked={computed[f.id] === "true"} disabled={!isGateOpen(f, computed)} onChange={() => setRadio(f.id, options)} />
                  {label[f.id] ?? prettyId(f.id)}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}

      {(schema.group ?? []).map((g) => (
        <ScheduleTable key={g.name} typed={(raw) => typedMoney(schema, raw)} group={g} rows={groups[g.name]!} form={state} label={label} onSet={setRow} onAdd={addRow} onRemove={removeRow} />
      ))}

      <div className="money-grid">{moneyField.map((f) => render(f))}</div>

      {problem.length > 0 && (
        <ul className="problem">
          {problem.slice(0, 6).map((p) => (
            <li key={p.id}>{p.message}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button disabled={problem.length > 0} onClick={() => void save()}>
          Save
        </button>
      </div>
      {saved && <p className="ok-text">Saved as {saved}. It opens unchanged in BIR's eBIRForms.</p>}
    </section>
  );
}

/** One schedule's rows (a BIR "Add more…" table): add, edit, remove. Also the web version's pop-up editor. */
export function ScheduleTable({
  group,
  rows,
  form,
  label,
  onSet,
  onAdd,
  onRemove,
  title = "Schedule",
  typed = (raw) => formatMoney(parseMoney(raw)),
}: {
  title?: string;
  /** What BIR's page leaves in an amount box after typing (FormSchema.typed). */
  typed?: (raw: string) => string;
  group: GroupSpec;
  rows: GroupRow[];
  form: FormState;
  label: Record<string, string>;
  onSet: (group: string, i: number, id: string, value: string) => void;
  onAdd: (group: string) => void;
  onRemove: (group: string, i: number) => void;
}) {
  const computed = computeGroupRows(group, rows, form);
  // a sub-field the editor shows: BIR's own row-selection ticks (chk…Delete) stay hidden, the ones it saves as data show
  const shown = group.row.filter((sub) => (sub.kind !== "checkbox" && sub.kind !== "radio") || sub.row_tick);
  // a row's box, else a form box (a list that follows the form: the ATC list follows the agent's category)
  const reader = (i: number) => (id: string) => computed[i]?.[id] ?? form[id] ?? "";
  const optionOf = (sub: FieldSpec, i: number): RowOption[] => (typeof sub.option === "function" ? sub.option(reader(i)) : (sub.option ?? []));
  // a new row's drop-down starts on BIR's first option, so the savefile carries the value BIR's own select would
  useEffect(() => {
    rows.forEach((row, i) => {
      for (const sub of group.row) {
        const first = sub.kind === "select" ? optionOf(sub, i)[0] : undefined;
        if (first && row[sub.id] === undefined) onSet(group.name, i, sub.id, first.value);
      }
    });
  });
  const keyOf = (o: RowOption) => o.key ?? o.value;
  const pick = (i: number, sub: FieldSpec, key: string) => {
    const o = optionOf(sub, i).find((x) => keyOf(x) === key);
    if (!o) return;
    onSet(group.name, i, sub.id, o.value);
    for (const [id, filled] of Object.entries(o.fill ?? {})) onSet(group.name, i, id, filled);
  };
  const tick = (i: number, sub: FieldSpec, on: boolean) => {
    onSet(group.name, i, sub.id, String(on));
    if (on) for (const id of sub.row_tick?.exclude ?? []) onSet(group.name, i, id, "false");
    else for (const [id, blank] of Object.entries(sub.row_tick?.clear ?? {})) onSet(group.name, i, id, blank);
  };
  // a box a tick governs (row_tick.clear) is greyed while none of the row's ticks is on
  const guarded = (sub: FieldSpec, row: GroupRow) => {
    const tick = group.row.filter((t) => t.row_tick?.clear && sub.id in t.row_tick.clear);
    return tick.length > 0 && !tick.some((t) => row[t.id] === "true");
  };
  const cell = (sub: FieldSpec & { row_compute?: unknown }, row: GroupRow, i: number) => {
    const value = sub.row_compute || sub.derive ? (computed[i]![sub.id] ?? "") : (row[sub.id] ?? "");
    if (sub.kind === "select" && sub.option) {
      const list = optionOf(sub, i);
      // the entry the row holds: of two that save one value, the one whose fill the row still carries
      const same = list.filter((o) => o.value === value);
      const shown = same.find((o) => Object.entries(o.fill ?? {}).every(([id, v]) => (computed[i]?.[id] ?? row[id] ?? "") === v)) ?? same[0] ?? list[0];
      return (
        <select value={shown ? keyOf(shown) : ""} onChange={(e) => pick(i, sub, e.target.value)}>
          {list.map((o) => (
            <option key={keyOf(o)} value={keyOf(o)}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
      );
    }
    if (sub.kind === "checkbox" || sub.kind === "radio") {
      // greyed while a sibling in its pair is ticked or its own gate is off; a BIR-derived tick is read-only
      const taken = group.row.some((o) => o.row_tick?.exclude?.includes(sub.id) && row[o.id] === "true");
      const gated = sub.row_tick?.enabled ? !sub.row_tick.enabled(reader(i)) : false;
      return (
        <input
          type={sub.kind === "radio" ? "radio" : "checkbox"}
          checked={value === "true"}
          disabled={Boolean(sub.derive) || taken || gated}
          onChange={(e) => tick(i, sub, sub.kind === "radio" ? true : e.target.checked)}
        />
      );
    }
    return (
      <input
        inputMode={sub.kind === "money" ? "decimal" : undefined}
        readOnly={Boolean(sub.row_compute)}
        className={sub.kind === "money" ? "money" : ""}
        disabled={guarded(sub, row) || (sub.row_enabled ? !sub.row_enabled(row) : false)}
        value={value}
        onChange={(e) => onSet(group.name, i, sub.id, e.target.value)}
        onBlur={sub.kind === "money" && !sub.row_compute ? (e) => onSet(group.name, i, sub.id, typed(e.target.value)) : undefined}
      />
    );
  };
  return (
    <div className="schedule">
      <div className="schedule-head">
        <h3>{title}</h3>
        <button className="ghost" onClick={() => onAdd(group.name)}>
          + Add row
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No rows yet. Add one for each line.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {shown.map((sub) => (
                <th key={sub.id}>{label[sub.id] ?? sub.id.split(":").pop()}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {shown.map((sub) => (
                  <td key={sub.id}>{cell(sub, row, i)}</td>
                ))}
                <td>
                  <button className="ghost row-del" onClick={() => onRemove(group.name, i)} title="Remove row">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
