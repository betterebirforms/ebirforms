// The web version's form screen: BIR's own page LAYOUT (captured by test/capture-layout.test.ts, no BIR code in it)
// inside a shadow root, so BIR's stylesheet can't touch the app and the app's can't touch BIR's page. The native
// engine (schema.ts) drives every field it knows by BIR's own id: values in, computed totals out, read-only where
// BIR's are. BIR's buttons do what they say: Validate, Save, Prev / Next, File > Main Menu.
import { useEffect, useMemo, useRef, useState } from "react";
import { NATIVE_FORM } from "./registry.ts";
import { computeForm, formRecords, isGateOpen, radioGroupName, groupAggs, type FieldSpec, type FormState, type GroupRow, type GroupState } from "./schema.ts";
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
      // BIR's page sizes itself against <body>; inside the shadow root that is the .bir-body wrapper
      shadow.innerHTML = `<style>:host{display:block;min-height:100vh} .bir-body{min-height:100vh}</style>${html}`;
      setRoot(shadow);
    });
    return () => {
      live = false;
    };
  }, [name]);
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
  const [groups] = useState<GroupState>(() => initial?.groups ?? Object.fromEntries((schema.group ?? []).map((g) => [g.name, [] as GroupRow[]])));
  const computed = useMemo(() => computeForm(schema, state, groups), [schema, state, groups]);
  const latest = useRef({ state, computed, groups });
  latest.current = { state, computed, groups };

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
        if (f.kind === "money") on(el, "blur", () => !el.readOnly && set({ [f.id]: formatMoney(parseMoney(el.value)) }));
      }
    }

    // pages: BIR shows one #Page<n>Content at a time, with Prev / Next and a page-number box
    const pageCount = root.querySelectorAll("[id^=Page][id$=Content]").length;
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
    // every other javascript: link (pickers, help) does nothing yet rather than navigating
    for (const a of Array.from(root.querySelectorAll("[data-js]"))) on(a, "click", (e) => e.preventDefault());
    return () => off.forEach((f) => f());
  }, [root, schema, form_code, validate, profile, onClose, onSaved, host]);

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
      const value = ro ? (computed[f.id] ?? "") : (state[f.id] ?? (f.is_editable || f.derive ? (computed[f.id] || fallback) : fallback));
      if (el !== focused && el.value !== value) el.value = value;
      // BIR fills the taxpayer's details from the profile and greys them out; with no profile they stay open to type
      const fromProfile = f.id in def.prefill && Boolean(state[f.id]);
      if (f.kind === "select") el.disabled = ro || fromProfile;
      else {
        el.readOnly = ro;
        el.disabled = fromProfile;
      }
    }
  }, [root, schema, state, computed, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="bir-layout" data-form={form_code} />;
}
