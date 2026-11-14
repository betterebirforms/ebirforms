// The web version's form screen: BIR's own page LAYOUT (captured by test/capture-layout.test.ts, no BIR code in it)
// inside a shadow root, so BIR's stylesheet can't touch the app and the app's can't touch BIR's page. The native
// engine (schema.ts) drives every field it knows by BIR's own id: values in, computed totals out, read-only where
// BIR's are. BIR's buttons do what they say: Validate, Save, Prev / Next, File > Main Menu.
import { useEffect, useMemo, useRef, useState } from "react";
import { NATIVE_FORM } from "./registry.ts";
import { computeForm, computeGroupRows, formRecords, typedMoney, isGateOpen, radioGroupName, groupAggs, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState } from "./schema.ts";
import { ScheduleTable } from "./FormView.tsx";
import { formatMoney, parseMoney } from "./money.ts";
import { SAVEFILE_ADAPTER } from "./export.ts";
import { IS_WEB, writeText } from "@/lib/vfs";
import { webExport, webDownload } from "@/lib/web-store.ts";
import type { Profile } from "@/lib/savefile.ts";

const layoutFile = import.meta.glob("../../asset/bir/layout/*.html", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const imageFile = import.meta.glob("../../asset/bir/layout/img/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const layoutKey = (form_code: string) => `../../asset/bir/layout/${form_code}.html`;
/** Whether BIR's layout was captured for this form (else the web version shows the plain native form). */
export const hasLayout = (form_code: string): boolean => layoutKey(form_code) in layoutFile;

/** BIR's layout with its images pointed at the bundled copies. */
export async function loadLayout(name: string): Promise<string> {
  const raw = await layoutFile[layoutKey(name)]!();
  return raw.replace(/\{\{base\}\}(img\/[^"')\s]+)/g, (_, rel: string) => imageFile[`../../asset/bir/layout/${rel}`] ?? "");
}

/** A shadow root holding BIR's layout; resolves once it is in the page. */
export function useLayoutRoot(name: string): [React.RefObject<HTMLDivElement | null>, ShadowRoot | null] {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    let live = true;
    void loadLayout(name).then((html) => {
      if (!live || !host.current) return;
      const shadow = host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" });
      // BIR's page sizes itself against <body>; inside the shadow root that is the .bir-body wrapper.
      // BIR drew these pages for IE's defaults: black text, light controls. The app around them follows the
      // system's dark mode (style.css `color-scheme: light dark`), which a shadow root inherits: in dark mode the
      // labels went light on BIR's grey and typed text white on its white fields. The desktop never had this
      // (BIR's pages don't opt into dark mode there), so pin the layout to IE's defaults.
      shadow.innerHTML = `<style>:host{display:block;min-height:100vh;color-scheme:light only;color:#000;background:#fff} .bir-body{min-height:100vh}</style>${html}`;
      setRoot(shadow);
    });
    return () => {
      live = false;
    };
  }, [name]);
  // BIR's pages are laid out for an 800 px window: on a narrower screen (a phone) shrink the whole page to fit,
  // as a browser's "zoom out" would, instead of cutting off its right side
  useEffect(() => {
    const el = host.current;
    if (!root || !el) return;
    const body = root.querySelector(".bir-body") as HTMLElement | null;
    if (!body) return;
    const fit = () => {
      body.style.zoom = "";
      const need = body.scrollWidth;
      const have = el.clientWidth;
      body.style.zoom = need > have && have > 0 ? String(have / need) : "";
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [root]);
  return [host, root];
}

const byId = (root: ShadowRoot, id: string) => root.getElementById(id) as HTMLInputElement | null;

/** BIR's File / Help menus: a top item opens its list; a list item runs `action[text]`; items named in `hide`
 *  have nothing to do on the web and are taken out; BIR's help pages aren't in the web version yet. */
export function wireMenu(root: ShadowRoot, on: (el: EventTarget, type: string, fn: (e: Event) => void) => void, action: Record<string, () => void>, hide: string[]) {
  for (const a of Array.from(root.querySelectorAll("a.toplevel, a.atoplevel")) as HTMLElement[]) {
    on(a, "click", (e) => {
      e.preventDefault();
      const sub = a.parentElement?.querySelector("ul") as HTMLElement | null;
      if (sub) sub.style.display = sub.style.display === "block" ? "none" : "block";
    });
  }
  for (const a of Array.from(root.querySelectorAll("ul.subnav a:not(.atoplevel)")) as HTMLAnchorElement[]) {
    const t = a.textContent?.trim() ?? "";
    if (hide.includes(t)) a.parentElement?.setAttribute("hidden", "");
    else
      on(a, "click", (e) => {
        e.preventDefault();
        (a.closest("ul.subnav") as HTMLElement | null)?.style.setProperty("display", "none");
        action[t]?.();
      });
  }
}

export function LayoutView({ form_code, profile, initial, onClose, onSaved }: { form_code: string; profile: Profile; initial?: { state: FormState; groups: GroupState } | undefined; onClose: () => void; onSaved: () => void }) {
  const def = NATIVE_FORM[form_code]!;
  const { schema, validate } = def;
  const [host, root] = useLayoutRoot(form_code);

  const [state, setState] = useState<FormState>(() => {
    if (initial) return initial.state;
    const seed: FormState = {};
    for (const [id, key] of Object.entries(def.prefill)) seed[id] = profile[key];
    return seed;
  });
  const [groups, setGroups] = useState<GroupState>(() => initial?.groups ?? Object.fromEntries((schema.group ?? []).map((g) => [g.name, [] as GroupRow[]])));
  const computed = useMemo(() => computeForm(schema, state, groups), [schema, state, groups]);
  const latest = useRef({ state, computed, groups });
  const groupBox = useRef(new Map<Element, { group: GroupSpec; row: number; id: string }>());
  latest.current = { state, computed, groups };

  // the schedule pop-up open now (BIR's "Add more…" / "View Details"), with its column labels read off BIR's page
  const [openGroup, setOpenGroup] = useState<{ name: string; title: string; label: Record<string, string> } | null>(null);
  const setRow = (group: string, i: number, id: string, value: string) =>
    setGroups((g) => {
      const rows = [...(g[group] ?? [])];
      while (rows.length <= i) rows.push({});
      rows[i] = { ...rows[i], [id]: value };
      return { ...g, [group]: rows };
    });
  const addRow = (group: string) => setGroups((g) => ({ ...g, [group]: [...(g[group] ?? []), {}] }));
  const removeRow = (group: string, i: number) => setGroups((g) => ({ ...g, [group]: (g[group] ?? []).filter((_, j) => j !== i) }));

  const groupTotalTarget = useMemo(() => new Set((schema.group ?? []).flatMap((g) => groupAggs(g).map((a) => a.into))), [schema]);
  const readOnly = (f: FieldSpec, c: FormState) => ((Boolean(f.compute) && !f.is_editable) || groupTotalTarget.has(f.id)) || !isGateOpen(f, c);

  // wire BIR's inputs and buttons once the layout is in
  useEffect(() => {
    if (!root) return;
    const off: Array<() => void> = [];
    const on = (el: EventTarget, type: string, fn: (e: Event) => void) => {
      el.addEventListener(type, fn);
      off.push(() => el.removeEventListener(type, fn));
    };
    const set = (patch: FormState) => setState((s) => ({ ...s, ...patch }));

    for (const f of schema.field) {
      const el = byId(root, f.id);
      if (!el || f.secret) continue;
      if (f.kind === "radio") {
        on(el, "change", () => {
          const stem = radioGroupName(form_code, f.id);
          const sibling = schema.field.filter((g) => g.kind === "radio" && radioGroupName(form_code, g.id) === stem);
          set(Object.fromEntries(sibling.map((g) => [g.id, g.id === f.id ? "true" : "false"])));
        });
      } else if (f.kind === "checkbox") {
        on(el, "change", () => set({ [f.id]: String(el.checked) }));
      } else {
        on(el, f.kind === "select" ? "change" : "input", () => set({ [f.id]: el.value }));
        if (f.kind === "money") on(el, "blur", () => !el.readOnly && set({ [f.id]: typedMoney(schema, el.value) }));
      }
    }

    // pages: BIR shows one #Page<n>Content at a time, with Prev / Next and a page-number box
    // (the form's own pages only: Page<n>AttMContent and the like are attachment pages, not in the Prev / Next run)
    let pageCount = 0;
    while (root.getElementById(`Page${pageCount + 1}Content`)) pageCount++;
    let current = 1;
    const showPage = (n: number) => {
      if (n < 1 || n > pageCount) return;
      for (let i = 1; i <= pageCount; i++) {
        const p = root.getElementById(`Page${i}Content`) as HTMLElement | null;
        if (p) p.style.display = i === n ? "" : "none";
      }
      current = n;
      const box = root.querySelector("input[id$=':txtCurrentPage']") as HTMLInputElement | null;
      if (box) box.value = String(n);
      host.current?.scrollIntoView();
    };
    if (pageCount > 1) showPage(1);

    const save = async () => {
      const { state: s, computed: c, groups: g } = latest.current;
      const problem = validate(c, g);
      if (problem.length > 0) return window.alert(problem.map((p) => p.message).join("\n"));
      const { name, text } = SAVEFILE_ADAPTER.build({ form_code, state: s, groups: g, profile });
      if (IS_WEB) {
        try {
          await writeText(`savefile/${name}`, text);
          await webExport(`savefile/${name}`);
        } catch {
          webDownload(name, text);
        }
      } else await writeText(`savefile/${name}`, text);
      window.alert(`BIR Form saved successfully as : savefile/${name}`);
      onSaved();
    };
    const button = Array.from(root.querySelectorAll("input[type=button], button")) as HTMLInputElement[];
    for (const b of button) {
      const v = (b.value || b.textContent || "").trim();
      if (v === "Validate")
        on(b, "click", () => {
          const problem = validate(latest.current.computed, latest.current.groups);
          window.alert(problem.length ? problem.map((p) => p.message).join("\n") : "Validation successful. Click on Edit if you wish to modify your entries.");
        });
      else if (v === "Save") on(b, "click", () => void save());
      else if (v === "Prev") on(b, "click", () => showPage(current - 1));
      else if (v === "Next") on(b, "click", () => showPage(current + 1));
      else if (v === "Main Menu" || v === "Exit") on(b, "click", onClose);
      else if (v === "Submit / Final Copy" || v === "Print") {
        b.disabled = true;
        b.title = v === "Print" ? "Print from the desktop app" : "The web version saves drafts only. Nothing is sent to BIR.";
      }
    }
    // BIR's File / Help menu: File opens its list (Main Screen, Save, Print Preview, Exit)
    wireMenu(root, on, { "Main Screen": onClose, Save: () => void save() }, ["Print Preview", "Exit"]);
    const pageBox = root.querySelector("input[id$=':txtCurrentPage']") as HTMLInputElement | null;
    if (pageBox) on(pageBox, "change", () => showPage(Number(pageBox.value)));
    // BIR's page-jump links: "btnNavigatePage<N>_…" goes to page N, Next / Prev page by one, and a "(To / From …
    // Schedule X …)" note goes to the other page that holds Schedule X (or Part X)
    const pageOf = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const n = p.id.match(/^Page(\d+)Content$/)?.[1];
        if (n) return Number(n);
      }
      return 0;
    };
    // a page's own text, without the other jump links' labels (they name schedules that live elsewhere)
    const pageText = Array.from({ length: pageCount }, (_, i) => {
      const p = root.getElementById(`Page${i + 1}Content`)?.cloneNode(true) as HTMLElement | undefined;
      p?.querySelectorAll("[data-js]").forEach((a) => a.remove());
      return (p?.textContent ?? "").replace(/\s+/g, " ").replace(/\bSched\.?(?=\s)/gi, "Schedule").replace(/\s*-\s*/g, " ").toLowerCase();
    });
    const jumpTarget = (a: Element): number | null => {
      const id = a.id;
      const n = id.match(/^btnNavigatePage(\d+)/)?.[1];
      if (n) return Number(n);
      if (/btnNextPage$/.test(id)) return (pageOf(a) || current) + 1;
      if (/btnPrevPage$/.test(id)) return (pageOf(a) || current) - 1;
      const text = (a.textContent ?? "").replace(/\s+/g, " ").replace(/\bSched\.?(?=\s)/gi, "Schedule");
      if (!/\b(to|from)\b/i.test(text)) return null;
      const target = (text.match(/Schedule\s+[\w.]+?(?=[\s,)]|$)/i) ?? text.match(/Part\s+[IVX]+\b/))?.[0].toLowerCase().replace(/\s+/g, " ");
      if (!target) return null;
      const here = pageOf(a);
      const hit = pageText.findIndex((t, i) => i + 1 !== here && t.includes(target));
      return hit < 0 ? null : hit + 1;
    };
    // schedules: a group's row boxes BIR shows on the page are typed into like any field, and the link next to
    // its table ("Add more…", "View Details", BIR's btnModal<X> for its modalDiv<X>) opens the row editor
    const rowBox = new Map<Element, { group: GroupSpec; row: number; id: string }>();
    for (const g of schema.group ?? []) {
      for (const sub of g.row) {
        if (!sub.id.includes("{i}")) continue;
        const [head, tail] = sub.id.split("{i}") as [string, string];
        for (let n = g.first_index ?? 1, el = byId(root, `${head}${n}${tail}`); el; n++, el = byId(root, `${head}${n}${tail}`)) {
          rowBox.set(el, { group: g, row: n - (g.first_index ?? 1), id: sub.id });
          const at = n - (g.first_index ?? 1);
          if (sub.kind === "checkbox") on(el, "change", () => setRow(g.name, at, sub.id, String(el.checked)));
          else {
            on(el, sub.kind === "select" ? "change" : "input", () => setRow(g.name, at, sub.id, el.value));
            if (sub.kind === "money") on(el, "blur", () => !el.readOnly && setRow(g.name, at, sub.id, typedMoney(schema, el.value)));
          }
        }
      }
    }
    // a stem specific enough to name one group: it must end in a separator BIR puts before the row number
    const r_ok = (h: string) => /[_A-Za-z]$/.test(h) && h.length > 8;
    const groupIn = (box: Element | null): GroupSpec | null => {
      if (!box) return null;
      for (const [el, r] of rowBox) if (box.contains(el)) return r.group;
      // a size field (BIR's row counter) also names its group, and so does a box sharing the rows' id stem (BIR's
      // pop-up tables are empty until its script adds rows; their subtotals are named like the rows, e.g.
      // txtPg4Sc10Itm8_SubTotalCA for rows txtPg4Sc10Itm8_<i>Col<c>)
      for (const g of schema.group ?? []) if (box.querySelector(`[id="${g.size_field}"]`)) return g;
      const ids = Array.from(box.querySelectorAll("[id]"), (x) => x.id);
      for (const g of schema.group ?? []) {
        const stem = g.row.map((r) => r.id.split("{i}")[0]!).filter((h, i, all) => r_ok(h) && all.indexOf(h) === i);
        if (stem.some((h) => ids.some((id) => id.startsWith(h)))) return g;
      }
      return null;
    };
    const groupOf = (a: Element): GroupSpec | null => {
      const modal = a.id.match(/btnModal(.+)$/)?.[1];
      if (modal) {
        // BIR's row counter is named for the pop-up: txtCtrmodal<X> for btnModal<X> / modalDiv<X>
        const g = (schema.group ?? []).find((x) => x.size_field?.endsWith(`modal${modal}`)) ?? groupIn(root.getElementById(`modalDiv${modal}`));
        if (g) return g;
      }
      for (let p = a.parentElement; p && !/^Page\d+Content$/.test(p.id); p = p.parentElement) {
        const g = groupIn(p);
        if (g) return g;
      }
      return null;
    };
    // BIR's column heading for a row box: the text of the same column in the first row of its table that has text
    const labelOf = (g: GroupSpec): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [el, r] of rowBox) {
        if (r.group !== g || r.row !== 0) continue;
        const cell = el.closest("td");
        const table = cell?.closest("table");
        if (!cell || !table) continue;
        const col = Array.from(cell.parentElement!.children).indexOf(cell);
        for (const tr of Array.from(table.rows)) {
          if (tr.contains(el)) break;
          const text = tr.cells[col]?.textContent?.replace(/\s+/g, " ").trim();
          if (text) out[r.id] = text;
        }
      }
      return out;
    };
    // the pop-up's title: BIR's own heading in its modalDiv, else the link's words, else the schedule's name
    const titleOf = (a: Element, g: GroupSpec) => {
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").replace(/^[\s(]+|[\s)]+$/g, "").trim();
      const modal = a.id.match(/btnModal(.+)$/)?.[1];
      const box = modal ? root.getElementById(`modalDiv${modal}`) : null;
      const heading = box && Array.from(box.querySelectorAll("b, strong, th, td, span, font, div")).map((x) => clean(x.textContent)).find((t) => t.length > 3 && t.length < 120);
      const own = clean(a.textContent);
      return heading || (own && !/^(add more|view details)/i.test(own) ? own : `Schedule ${g.name}`);
    };
    const isPopup = (a: Element) => /btnModal|btnNewSched|part\d+btn/i.test(a.id) || /add more|view details/i.test(a.textContent ?? "") || !(a.textContent ?? "").trim();
    for (const a of Array.from(root.querySelectorAll("[data-js]"))) {
      // every other javascript: link (pickers, help) does nothing yet rather than navigating
      on(a, "click", (e) => {
        e.preventDefault();
        const to = pageCount < 2 ? null : jumpTarget(a);
        if (to !== null && !/btnModal/.test(a.id)) return showPage(to);
        const g = isPopup(a) ? groupOf(a) : null;
        if (g) setOpenGroup({ name: g.name, title: titleOf(a, g), label: labelOf(g) });
      });
    }
    groupBox.current = rowBox;
    return () => off.forEach((f) => f());
  }, [root, schema, form_code, validate, profile, onClose, onSaved, host]); // eslint-disable-line react-hooks/exhaustive-deps

  // engine → page: write every known field's value, and lock what BIR locks
  useEffect(() => {
    if (!root) return;
    const focused = root.activeElement;
    // an untouched box shows what the savefile will hold for it (BIR's blank-save default), so what you see is
    // what is saved; BIR's captured page default is only the fallback for a box the file doesn't carry
    const saved = new Map(formRecords(schema, state, groups).map((r) => [r.key, r.value]));
    for (const f of schema.field) {
      const el = byId(root, f.id);
      if (!el || f.secret) continue;
      const ro = readOnly(f, computed);
      if (f.kind === "radio" || f.kind === "checkbox") {
        el.checked = computed[f.id] === "true";
        el.disabled = !isGateOpen(f, computed);
        continue;
      }
      // what BIR's blank page showed: a text box's default, or a list's preselected option
      const shown = f.kind === "select" ? (Array.from((el as unknown as HTMLSelectElement).options).find((o) => o.defaultSelected)?.value ?? "") : el.defaultValue;
      const fallback = f.escaped ? shown : (saved.get(f.id) ?? shown);
      // a locked box shows what the file will hold: some totals (a schedule's rows summed into its item lines) are
      // derived only as the save is built, so the live compute alone would leave them stale
      const value = ro ? (f.escaped ? (computed[f.id] ?? "") : (saved.get(f.id) ?? computed[f.id] ?? "")) : (state[f.id] ?? (f.is_editable || f.derive ? (computed[f.id] || fallback) : fallback));
      if (el !== focused && el.value !== value) el.value = value;
      // BIR fills the taxpayer's details from the profile and greys them out; with no profile they stay open to type
      const fromProfile = f.id in def.prefill && Boolean(state[f.id]);
      if (f.kind === "select") el.disabled = ro || fromProfile;
      else {
        el.readOnly = ro;
        el.disabled = fromProfile;
      }
    }
    // schedule rows BIR shows on the page: the row's value, computed columns locked
    const rowsOf = new Map((schema.group ?? []).map((g) => [g.name, { rows: groups[g.name] ?? [], computed: computeGroupRows(g, groups[g.name] ?? [], computed) }]));
    for (const [box, r] of groupBox.current) {
      const el = box as HTMLInputElement;
      const sub = r.group.row.find((x) => x.id === r.id)!;
      const at = rowsOf.get(r.group.name)!;
      const value = sub.row_compute || sub.derive ? (at.computed[r.row]?.[r.id] ?? "") : (at.rows[r.row]?.[r.id] ?? "");
      if (sub.kind === "checkbox") el.checked = value === "true";
      else if (el !== focused && el.value !== value && (value !== "" || at.rows[r.row])) el.value = value;
      if (sub.row_compute) el.readOnly = true;
    }
  }, [root, schema, state, computed, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = openGroup && (schema.group ?? []).find((g) => g.name === openGroup.name);
  return (
    <>
      <div ref={host} className="bir-layout" data-form={form_code} />
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOpenGroup(null)}>
          <div className="modal schedule-modal" role="dialog" aria-label={openGroup.title}>
            <ScheduleTable typed={(raw) => typedMoney(schema, raw)} title={openGroup.title} group={open} rows={groups[open.name] ?? []} form={computed} label={{ ...def.label, ...openGroup.label }} onSet={setRow} onAdd={addRow} onRemove={removeRow} />
            <button onClick={() => setOpenGroup(null)}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
