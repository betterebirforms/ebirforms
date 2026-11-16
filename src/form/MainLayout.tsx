// The web version's home: BIR's own main screen LAYOUT (asset/bir/layout/main.html, captured from BIRForms.hta
// with no BIR code in it) in a shadow root, doing what BIR's main screen does: the taxpayer's background
// information (saved as profile/<TIN>.xml, BIR's own file), the List of BIR Forms, Fill-up, and the saved returns
// of that TIN and form with View / Delete. The web version adds Download and "Add a savefile" there, since a
// browser's storage is not a folder the user can open.
import { useEffect, useRef } from "react";
import { NATIVE_FORM } from "./registry.ts";
import { useLayoutRoot, wireMenu, WEB_SEND_STEP } from "./LayoutView.tsx";
import { openHelp } from "./help.ts";
import { listFolder, readText, removeFile, writeText } from "@/lib/vfs";
import { canPickFolder, webExport, webFolder, webForgetFolder, webImport, webPersist, webPickFolder, webReconnect } from "@/lib/web-store.ts";
import { parseSavefile, profileFileName, profileFromSavefile, profileToSavefile, serializeSavefile, type Profile } from "@/lib/savefile.ts";
import { TinStatus, tinMessage, validateTin } from "@/lib/tin.ts";
import { oldBranchFile, updateBranch, type BranchStore } from "@/lib/branch.ts";

const PROFILE_FIELD = ["tin1", "tin2", "tin3", "tin4", "rdo", "lob", "fn", "regAddr", "zip", "telNo"] as const;

/** Go > Send Returns to BIR on the web: the desktop app's switch, which the web can't offer. */
export const WEB_SEND_NOTE =
  "The web version can't send returns to BIR: BIR's upload uses a connection a web page is not allowed to open.\n\n" +
  "Open the return, Validate, and click Submit / Final Copy. That saves BIR's final copy, locked. " +
  WEB_SEND_STEP;

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
    // BIR writes the branch code with 3 digits in older savefile names and 5 in newer ones, and lists only an
    // exact match, so a return saved as ...000-2551Q... never shows under a profile typed as ...00000. Here
    // 000 and 00000 are one branch: compare the 9-digit TIN, and the branch as a number.
    const sameTaxpayer = (digit: string) =>
      /^\d{12,14}$/.test(digit) && tin().length >= 12 && digit.slice(0, 9) === tin().slice(0, 9) && Number(digit.slice(9)) === Number(tin().slice(9));
    const ownerOf = (name: string) => name.slice(0, name.indexOf("-"));

    // BIR's Scan(): the returns of this TIN and form, newest first, each with a radio to pick it
    const scan = async () => {
      if (!table) return;
      table.innerHTML = "";
      if (listButton) listButton.style.display = "none";
      const code = formType?.value ?? "0";
      if (code === "0" || tin().length < 12) return;
      const { file } = await listFolder("savefile").catch(() => ({ file: [] as { name: string; modified_ms: number }[] }));
      const mine = file
        .filter((f) => sameTaxpayer(ownerOf(f.name)) && f.name.startsWith(`${ownerOf(f.name)}-${code}-`) && f.name.endsWith(".xml") && codeOfSavefile(f.name) === code)
        .sort((a, b) => b.modified_ms - a.modified_ms);
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
        cell[2]!.textContent = f.name.slice(`${ownerOf(f.name)}-${code}-`.length, -".xml".length);
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
        const name = (await webImport(f)).slice("savefile/".length);
        const code = codeOfSavefile(name);
        if (!code) window.alert(`Added "${name}", but its name is not an eBIRForms savefile name (TIN-form-period.xml), or this web version does not have that form yet, so it will not show in a list.`);
        if (code && formType) formType.value = code;
        const owner = ownerOf(name);
        if (code && /^\d{12,14}$/.test(owner) && !sameTaxpayer(owner)) {
          const shown = `${owner.slice(0, 3)}-${owner.slice(3, 6)}-${owner.slice(6, 9)}-${owner.slice(9)}`;
          if (tin().length === 0) {
            // no taxpayer on screen yet: show this return's own
            for (const [i, id] of (["tin1", "tin2", "tin3", "tin4"] as const).entries()) {
              const x = el(id);
              if (x) x.value = i < 3 ? owner.slice(i * 3, i * 3 + 3) : owner.slice(9);
            }
            await loadByTin();
          } else window.alert(`Added. This return belongs to TIN ${shown}, not the taxpayer on screen. Type that TIN, or pick it under "Saved profiles", to see it.`);
        }
        await scan();
        await showFolder();
      } catch (e) {
        window.alert((e as Error).message);
      }
    });
    // where returns live: this browser, or a folder the user picks (Chrome, Edge), e.g. their eBIRForms folder
    const where = add.querySelector("p")!;
    const folderRow = document.createElement("p");
    // files still named with the old 3-digit branch: BIR's current app lists only 5 digits, so offer to update them
    const branchRow = document.createElement("p");
    add.append(folderRow, branchRow);
    const branchStore: BranchStore = { list: (folder) => listFolder(folder).then((l) => l.file.map((x) => x.name)), read: readText, write: writeText, remove: removeFile };
    const branchKey = (name: string) => {
      const code = codeOfSavefile(name);
      return (code && Object.entries(NATIVE_FORM[code]?.prefill ?? {}).find(([, k]) => k === "tin4")?.[0]) || null;
    };
    const showFolder = async () => {
      const f = canPickFolder() ? await webFolder().catch(() => null) : null;
      folderRow.replaceChildren();
      const xml = (folder: string) => listFolder(folder).then((l) => l.file.filter((x) => x.name.endsWith(".xml")).length, () => 0);
      const [profile_count, savefile_count] = await Promise.all([xml("profile"), xml("savefile")]);
      const count = ` ${profile_count} profile${profile_count === 1 ? "" : "s"} and ${savefile_count} return${savefile_count === 1 ? "" : "s"} there now.`;
      void showProfile();
      const link = (text: string, title: string, run: () => Promise<unknown>) => {
        const u = Object.assign(document.createElement("u"), { textContent: text, title });
        u.style.cursor = "pointer";
        on(u, "click", () =>
          void run()
            .then(showFolder)
            .then(scan)
            .catch((e: Error) => e.name !== "AbortError" && window.alert(e.message)),
        );
        return u;
      };
      branchRow.replaceChildren();
      const stale = !f || f.permission === "granted" ? await oldBranchFile(branchStore) : { profile: [], savefile: [] };
      const stale_count = stale.profile.length + stale.savefile.length;
      if (stale_count > 0) {
        const what = [stale.profile.length && `${stale.profile.length} profile${stale.profile.length === 1 ? "" : "s"}`, stale.savefile.length && `${stale.savefile.length} return${stale.savefile.length === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
        branchRow.append(
          `${what} here ${stale_count === 1 ? "uses" : "use"} the old 3-digit branch code in the file name (000). BIR's current eBIRForms lists only 5 digits (00000). `,
          link("Update to 5 digits…", "Renames each file to its 5-digit name and sets the branch code inside it. No file is overwritten.", async () => {
            if (!window.confirm(`Update ${what} to the 5-digit branch code?\n\nEach file gets its 5-digit name (for example 123456789000 becomes 12345678900000) and the branch code inside it is set to match, so BIR's current eBIRForms lists it too. The old 3-digit name goes away. No file is overwritten.`)) return;
            const r = await updateBranch(branchStore, branchKey);
            window.alert(`Updated ${r.updated.length} file${r.updated.length === 1 ? "" : "s"} to the 5-digit branch code.` + (r.kept.length ? `\n\nLeft as they are, because a file with the 5-digit name is already there:\n${r.kept.join("\n")}` : ""));
          }),
        );
      }
      if (!f) {
        where.textContent = "This web version keeps returns in this browser only. Nothing is sent to BIR or anywhere else. Download each return: that file is your copy.";
        where.append(count);
        if (!(await webPersist()))
          where.append(" This browser may delete its storage after a week without a visit; add this page to your Home Screen to keep it.");
        if (!canPickFolder())
          folderRow.append("To keep them in a folder on this computer instead (your eBIRForms folder, or one synced by Google Drive), open this page in Chrome or Edge. Brave, Firefox and Safari do not let a web page use a folder.");
        if (canPickFolder())
          folderRow.append(
            link("Use a folder on this computer…", "Pick your eBIRForms folder (the one with profile and savefile in it). A folder synced by Google Drive or Dropbox works too.", async () => {
              const n = await webPickFolder();
              if (n) window.alert(`Copied ${n} file${n === 1 ? "" : "s"} from this browser into the folder. Files already in the folder were kept as they are.`);
            }),
          );
        return;
      }
      where.textContent = `Profiles and returns are kept in your folder "${f.name}" on this computer. Nothing is sent to BIR or anywhere else.`;
      if (f.permission === "granted") where.append(count);
      if (f.permission !== "granted") folderRow.append(link(`Allow access to "${f.name}"`, "The browser asks again after a restart.", webReconnect), " · ");
      folderRow.append(
        link("Change folder…", "Pick another folder.", webPickFolder),
        " · ",
        link("Keep returns in this browser instead", "The folder and its files stay as they are.", webForgetFolder),
      );
    };

    // "Saved profiles": pick a taxpayer instead of typing the TIN. BIR's screen has no such list; an accountant
    // with many clients asked for it. Reads profile/, the same files BIR's app keeps.
    const profileRow = document.createElement("div");
    profileRow.className = "mainLabel web-note";
    const profilePick = document.createElement("select");
    profilePick.className = "mainContent";
    profilePick.style.maxWidth = "420px";
    profileRow.append("Saved profiles: ", profilePick);
    profileRow.style.margin = "4px 0 10px";
    el("tin1")?.closest(".break")?.before(profileRow);
    const showProfile = async () => {
      const { file } = await listFolder("profile").catch(() => ({ file: [] as { name: string }[] }));
      const name = file.map((x) => x.name).filter((n) => /^\d{12,14}\.xml$/.test(n)).sort();
      const row = await Promise.all(
        name.map(async (n) => {
          const p = await readText(`profile/${n}`).then((t) => profileFromSavefile(parseSavefile(t)), () => null);
          return { n, label: `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 9)}-${n.slice(9, -".xml".length)}${p?.fn ? `  ${p.fn}` : ""}` };
        }),
      );
      profilePick.replaceChildren(new Option(row.length ? "Select a taxpayer…" : "None saved yet", ""), ...row.map((r) => new Option(r.label, r.n)));
      profilePick.disabled = row.length === 0;
      const here = `${tin()}.xml`;
      if (row.some((r) => r.n === here)) profilePick.value = here;
    };
    on(profilePick, "change", async () => {
      if (!profilePick.value) return;
      try {
        const p = profileFromSavefile(parseSavefile(await readText(`profile/${profilePick.value}`)));
        for (const id of PROFILE_FIELD) if (id !== "rdo") el(id)!.value = "";
        if (email) email.value = "";
        fill(p);
        await scan();
      } catch (e) {
        window.alert((e as Error).message);
      }
    });
    void showFolder();

    // the desktop app's Go menu, on the web: Show Saved Returns (where they are kept, and the list) and Send Returns
    // to BIR (the web can't: it says what can). Added next to BIR's File menu, in BIR's own menu markup.
    const fileMenu = root.querySelector("ul.topnav > li");
    if (fileMenu && !root.querySelector("[data-go-menu]")) {
      const go = document.createElement("li");
      go.dataset.goMenu = "";
      go.innerHTML = `<a href="#" class="toplevel">Go</a><ul class="subnav"><li><a href="#">Show Saved Returns</a></li><li><a href="#">Send Returns to BIR</a></li></ul><span></span>`;
      fileMenu.after(go);
    }
    const showSaved = async () => {
      const f = canPickFolder() ? await webFolder().catch(() => null) : null;
      const n = await listFolder("savefile").then((l) => l.file.filter((x) => x.name.endsWith(".xml")).length, () => 0);
      add.scrollIntoView();
      window.alert(
        `${n} saved return${n === 1 ? "" : "s"}, ${f ? `in the folder "${f.name}" on this computer` : "in this browser"}.\n\n` +
          "The list shows the taxpayer on screen and the form picked under Form Type: View opens one, Download saves a copy.",
      );
    };

    // BIR's File menu: Save (the profile), View (the picked return); Exit has no window to close on the web
    wireMenu(root, on, {
      "Show Saved Returns": () => void showSaved(),
      "Send Returns to BIR": () => window.alert(WEB_SEND_NOTE),
      Save: () =>
        void saveProfile().then((name) => name && window.alert(`Background information saved/updated successfully as : profile/${name}`)),
      View: () => root.getElementById("btnListViewRecord")?.click(),
    }, ["Exit"], (label, href) => openHelp(label, href));

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
