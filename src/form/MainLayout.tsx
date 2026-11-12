// The web version's home: BIR's own main screen LAYOUT (asset/bir/layout/main.html, captured from BIRForms.hta
// with no BIR code in it) in a shadow root, doing what BIR's main screen does: the taxpayer's background
// information (saved as profile/<TIN>.xml, BIR's own file), the List of BIR Forms, Fill-up, and the saved returns
// of that TIN and form with View / Delete. The web version adds Download and "Add a savefile" there, since a
// browser's storage is not a folder the user can open.
import { useEffect, useRef } from "react";
import { NATIVE_FORM } from "./registry.ts";
import { useLayoutRoot, wireMenu } from "./LayoutView.tsx";
import { listFolder, readText, removeFile, writeText } from "@/lib/vfs";
import { webExport, webImport, webPersist } from "@/lib/web-store.ts";
import { parseSavefile, profileFileName, profileFromSavefile, profileToSavefile, serializeSavefile, type Profile } from "@/lib/savefile.ts";
import { TinStatus, tinMessage, validateTin } from "@/lib/tin.ts";

const PROFILE_FIELD = ["tin1", "tin2", "tin3", "tin4", "rdo", "lob", "fn", "regAddr", "zip", "telNo"] as const;

export function MainLayout({ profile_name, formHref, codeOfSavefile }: { profile_name: string | null; formHref: (code: string, extra?: Record<string, string>) => string; codeOfSavefile: (name: string) => string | null }) {
  const [host, root] = useLayoutRoot("main");
  const busy = useRef(false);

  useEffect(() => {
    if (!root) return;
    const off: Array<() => void> = [];
    const on = (el: EventTarget, type: string, fn: (e: Event) => void) => {
      el.addEventListener(type, fn);
      off.push(() => el.removeEventListener(type, fn));
    };
    const el = <T extends HTMLElement = HTMLInputElement>(id: string) => root.getElementById(id) as T | null;
    const val = (id: string) => (el(id)?.value ?? "").trim();
    const email = el("txtEmail");
    const formType = el<HTMLSelectElement>("formType");
    const table = el<HTMLTableElement>("outPut");
    const listButton = el("listButtonsDiv") as HTMLElement | null;

    // BIR's desktop-only parts: the file finder bar, the USB "Have Disk" import/export
    for (const id of ["search", "path"]) el(id)?.closest("table, div")?.setAttribute("hidden", "");
    // the List of BIR Forms: only what this app can fill
    // the List of BIR Forms: only what this app can fill, plus the native forms BIR's list leaves out (BIR opens
    // those from inside other forms), so every one is reachable from here
    if (formType) {
      for (const o of Array.from(formType.options)) if (o.value !== "0" && !NATIVE_FORM[o.value]) o.remove();
      const listed = new Set(Array.from(formType.options).map((o) => o.value));
      for (const code of Object.keys(NATIVE_FORM).sort()) if (!listed.has(code)) formType.add(new Option(`BIR Form ${code} - ${NATIVE_FORM[code]!.schema.title}`, code));
    }
    // fields BIR greys out until a TIN is typed are open here: there is no "load" step on the web
    for (const id of [...PROFILE_FIELD, "txtEmail"]) {
      const x = el(id);
      if (x) x.disabled = false;
    }

    const read = (): Profile => ({
      tin1: val("tin1"),
      tin2: val("tin2"),
      tin3: val("tin3"),
      tin4: val("tin4"),
      rdo: val("rdo"),
      lob: val("lob").toUpperCase(),
      fn: val("fn").toUpperCase(),
      regAddr: val("regAddr").toUpperCase(),
      zip: val("zip"),
      telNo: val("telNo"),
      email: email?.value.trim() ?? "",
      formType: formType?.value ?? "0",
    });
    const fill = (p: Profile) => {
      for (const id of PROFILE_FIELD) {
        const x = el(id);
        if (x && p[id]) x.value = p[id];
      }
      if (email && p.email) email.value = p.email;
      if (formType && p.formType && NATIVE_FORM[p.formType]) formType.value = p.formType;
    };
    const tin = () => `${val("tin1")}${val("tin2")}${val("tin3")}${val("tin4")}`;

    // BIR's Scan(): the returns of this TIN and form, newest first, each with a radio to pick it
    const scan = async () => {
      if (!table) return;
      table.innerHTML = "";
      if (listButton) listButton.style.display = "none";
      const code = formType?.value ?? "0";
      if (code === "0" || tin().length < 12) return;
      const prefix = `${tin()}-${code}-`;
      const { file } = await listFolder("savefile").catch(() => ({ file: [] as { name: string; modified_ms: number }[] }));
      const mine = file.filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".xml") && codeOfSavefile(f.name) === code).sort((a, b) => b.modified_ms - a.modified_ms);
      for (const f of mine) {
        const row = table.insertRow();
        const pick = document.createElement("input");
        pick.type = "radio";
        pick.name = "rdoRecord";
        pick.value = f.name;
        const cell = [row.insertCell(), row.insertCell(), row.insertCell(), row.insertCell()];
        cell.forEach((c, i) => {
          c.className = "mainContent";
          c.width = ["20", "250", "125", "125"][i]!;
        });
        cell[0]!.append(pick);
        cell[1]!.textContent = `BIR Form ${code} - ${NATIVE_FORM[code]!.schema.title}`;
        cell[2]!.textContent = f.name.slice(prefix.length, -".xml".length);
        cell[3]!.textContent = new Date(f.modified_ms).toLocaleString();
      }
      if (mine.length > 0 && listButton) listButton.style.display = "block";
    };
    const picked = () => (root.querySelector("input[name=rdoRecord]:checked") as HTMLInputElement | null)?.value ?? null;

    // BIR's newForm(): the same checks, in the same order, then save the profile and open the form
    const problem = (p: Profile): string | null => {
      if (!p.tin1 || !p.tin2 || !p.tin3 || !p.tin4) return "Please enter valid TIN";
      const status = validateTin(`${p.tin1}${p.tin2}${p.tin3}`);
      if (status !== TinStatus.Valid) return tinMessage(status);
      if (!p.rdo || p.rdo === "000") return "Please enter a valid RDO Code";
      if (!p.email) return "Please enter valid Email Address";
      if (!p.lob) return "Please enter Line of Business";
      if (!p.fn) return "Please enter Taxpayer Name";
      if (!p.regAddr) return "Please enter Registered Address";
      if (!p.zip) return "Please enter Zip Code";
      if (!p.telNo) return "Please enter Telephone Number";
      return null;
    };
    const saveProfile = async (): Promise<string | null> => {
      const p = read();
      const why = problem(p);
      if (why) {
        window.alert(why);
        return null;
      }
      const name = profileFileName(p);
      await writeText(`profile/${name}`, serializeSavefile(profileToSavefile(p)));
      return name;
    };

    for (const b of Array.from(root.querySelectorAll("input[type=button]")) as HTMLInputElement[]) {
      const v = b.value.trim();
      if (b.id === "btnFillup")
        on(b, "click", async () => {
          if (busy.current) return;
          busy.current = true;
          try {
            if (!formType || formType.value === "0") return window.alert("Cannot save profile.  Please select form type.");
            const name = await saveProfile();
            if (name) window.location.assign(formHref(formType.value, { profile: name }));
          } finally {
            busy.current = false;
          }
        });
      else if (b.id === "btnListViewRecord")
        on(b, "click", () => {
          const name = picked();
          const code = name && codeOfSavefile(name);
          if (!name || !code) return window.alert("Please select a tax return.");
          window.location.assign(formHref(code, { file: name, ...(profile_name ? { profile: profile_name } : {}) }));
        });
      else if (b.id === "btnListDelete")
        on(b, "click", async () => {
          const name = picked();
          if (!name) return window.alert("Please select a tax return.");
          if (!window.confirm("Are you sure you want to delete this file?")) return;
          await removeFile(`savefile/${name}`);
          await scan();
        });
      else if (v === "Scan") b.hidden = true;
    }

    // the web version's own additions, in BIR's own button style, next to View / Delete
    if (listButton) {
      const download = document.createElement("input");
      download.type = "button";
      download.className = "mainContent";
      download.value = "Download";
      download.title = "Save a copy of this return as a file. It opens in BIR's eBIRForms too.";
      on(download, "click", () => {
        const name = picked();
        if (!name) return window.alert("Please select a tax return.");
        void webExport(`savefile/${name}`);
      });
      listButton.append(" ", download);
    }
    const add = document.createElement("div");
    add.className = "mainLabel web-note";
    add.innerHTML = `<label><input type="file" accept=".xml" hidden> <u style="cursor:pointer">Add a savefile from eBIRForms…</u></label>
      <p>This web version keeps returns in this browser only. Nothing is sent to BIR or anywhere else. Download each return: that file is your copy.</p>`;
    table?.closest("div")?.after(add);
    const fileInput = add.querySelector("input[type=file]") as HTMLInputElement;
    on(fileInput, "change", async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const name = await webImport(f);
        const code = codeOfSavefile(name);
        if (code && formType) formType.value = code;
        await scan();
      } catch (e) {
        window.alert((e as Error).message);
      }
    });
    void webPersist().then((kept) => {
      if (!kept) add.querySelector("p")!.append(" This browser may delete its storage after a week without a visit; add this page to your Home Screen to keep it.");
    });

    // BIR's File menu: Save (the profile), View (the picked return); Exit has no window to close on the web
    wireMenu(root, on, {
      Save: () =>
        void saveProfile().then((name) => name && window.alert(`Background information saved/updated successfully as : profile/${name}`)),
      View: () => root.getElementById("btnListViewRecord")?.click(),
    }, ["Exit"]);

    // typing a full TIN loads that taxpayer's saved profile, as BIR's does
    const loadByTin = async () => {
      if (tin().length < 12) return;
      try {
        fill(profileFromSavefile(parseSavefile(await readText(`profile/${tin()}.xml`))));
      } catch {
        /* a new taxpayer */
      }
      await scan();
    };
    for (const id of ["tin1", "tin2", "tin3", "tin4"]) {
      const x = el(id);
      if (x) on(x, "change", () => void loadByTin());
    }
    if (formType) on(formType, "change", () => void scan());

    // coming back from a form: the profile it was opened with
    if (profile_name)
      void readText(`profile/${profile_name}`)
        .then((t) => fill(profileFromSavefile(parseSavefile(t))))
        .catch(() => {})
        .then(scan);
    return () => off.forEach((f) => f());
  }, [root, profile_name, formHref, codeOfSavefile]);

  return <div ref={host} className="bir-layout" data-form="main" />;
}
