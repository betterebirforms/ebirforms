import { useEffect, useState } from "react";
import { IS_WEB, hostStatus, importPackage, listFolder, readText, removeFile } from "@/lib/vfs";
import { webExport, webImport, webPersist } from "@/lib/web-store.ts";
import { FormView } from "@/form/FormView.tsx";
import { LayoutView, hasLayout } from "@/form/LayoutView.tsx";
import { MainLayout } from "@/form/MainLayout.tsx";
import { ModScreen } from "./ModScreen.tsx";
import { NATIVE_FORM } from "@/form/registry.ts";
import { parseSavefile, profileFromSavefile, type Profile } from "@/lib/savefile.ts";
import { reopenSavefile, type FormState, type GroupState } from "@/form/schema.ts";
import { DONATE_URL } from "@/lib/donate.ts";

/** Where the app is served from: "/" on the desktop, "/ebirforms/" on GitHub Pages (vite `base`). */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
/** An app path under the base, e.g. at("/form") → "/ebirforms/form" on GitHub Pages. */
export const at = (path: string) => `${BASE}${path}`;
/** The current path without the base, for routing. */
const routePath = () => window.location.pathname.slice(BASE.length) || "/";

/** BIR's own main screen, served 1:1 through the host + shim. */
const MAIN_SCREEN = "/legacy/BIRForms.hta";

/**
 * The shell only exists for the first run: until the user imports BIR's package there is no main screen to
 * show. After that it hands straight over to BIR's `BIRForms.hta`.
 */
export function App() {
  const route = /^\/form(?:\/([^/?#]+))?\/?$/.exec(routePath());
  const form_code = route?.[1] ? decodeURIComponent(route[1]) : null;
  // the web version's home (`/` or `/form`) carries the donate link; a form page never does
  if (IS_WEB && !form_code)
    return (
      <>
        <NativeScreen form_code={null} />
        <DonateLink />
      </>
    );
  if (route) return <NativeScreen form_code={form_code} />;
  if (!IS_WEB && /^\/mod\/?$/.test(routePath())) return <ModScreen />;
  return <LegacyScreen />;
}

/** The web version's home only (never over a form page): a small corner link to the project's Ko-fi page. */
function DonateLink() {
  return (
    <a className="donate" href={DONATE_URL} target="_blank" rel="noopener noreferrer" title="Ko-fi takes PayPal and cards">
      Support this project
    </a>
  );
}

const EMPTY_PROFILE: Profile = { fn: "", tin1: "", tin2: "", tin3: "", tin4: "", rdo: "", lob: "", regAddr: "", zip: "", telNo: "", email: "", formType: "" };

/**
 * The native forms (`src/form/`, 1:1 with BIR's computations) on their own route: `/form` lists them,
 * `/form/<CODE>` opens one. No BIR page is involved, so this is the screen the web version builds on.
 */
// `#profile=<file>&file=<savefile>`: both names hold the TIN, so they ride in the fragment, which the browser
// never sends to the server (a static host would otherwise log every TIN).
const query = () => new URLSearchParams(window.location.hash.slice(1));
/** `#profile=<file>&file=<savefile>` carried between the list and a form. */
const formHref = (code: string, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ ...(query().get("profile") ? { profile: query().get("profile")! } : {}), ...extra }).toString();
  return at(`/form/${encodeURIComponent(code)}${q ? `#${q}` : ""}`);
};

/** The form code inside a savefile name `<TIN>-<CODE>-<period>.xml` (codes may hold a dash, e.g. 2550DS-old). */
export function codeOfSavefile(name: string): string | null {
  const rest = name.slice(name.indexOf("-") + 1);
  const hit = Object.keys(NATIVE_FORM).filter((c) => rest.startsWith(`${c}-`) || rest === `${c}.xml`);
  return hit.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * The native forms (`src/form/`, 1:1 with BIR's computations) on their own route: `/form` lists them,
 * `/form/<CODE>` opens one. No BIR page is involved, so this is the screen the web version builds on.
 */
function NativeScreen({ form_code }: { form_code: string | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initial, setInitial] = useState<{ state: FormState; groups: GroupState } | null | "none">(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // a fragment-only change (picking a profile on /form) doesn't reload the page by itself
    const reload = () => window.location.reload();
    window.addEventListener("hashchange", reload);
    return () => window.removeEventListener("hashchange", reload);
  }, []);
  const profile_name = query().get("profile");
  const file_name = query().get("file");
  useEffect(() => {
    if (!profile_name) return setProfile(EMPTY_PROFILE);
    readText(`profile/${profile_name}`)
      .then((t) => setProfile(profileFromSavefile(parseSavefile(t))))
      .catch(() => setProfile(EMPTY_PROFILE));
  }, [profile_name]);
  useEffect(() => {
    if (!form_code || !NATIVE_FORM[form_code] || !file_name) return setInitial("none");
    readText(`savefile/${file_name}`)
      .then((t) => setInitial(reopenSavefile(NATIVE_FORM[form_code]!.schema, parseSavefile(t), form_code)))
      .catch((e: Error) => {
        setError(`Couldn't open ${file_name}: ${e.message}`);
        setInitial("none");
      });
  }, [form_code, file_name]);

  if (form_code && NATIVE_FORM[form_code]) {
    if (!profile || initial === null) return null;
    return (
      <>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {/* the web version shows BIR's own page layout where it was captured, driven by the same engine */}
        {IS_WEB && hasLayout(form_code) ? (
          <LayoutView
            form_code={form_code}
            profile={profile}
            initial={initial === "none" ? undefined : initial}
            onClose={() => window.location.assign(at(profile_name ? `/form#profile=${encodeURIComponent(profile_name)}` : "/form"))}
            onSaved={() => {}}
          />
        ) : (
          <FormView
            form_code={form_code}
            profile={profile}
            initial={initial === "none" ? undefined : initial}
            onClose={() => window.location.assign(at(profile_name ? `/form#profile=${encodeURIComponent(profile_name)}` : "/form"))}
            onSaved={() => {}}
          />
        )}
      </>
    );
  }
  // the web version's home is BIR's own main screen layout, when it was captured
  if (IS_WEB && hasLayout("main") && !form_code) return <MainLayout profile_name={profile_name} formHref={formHref} codeOfSavefile={codeOfSavefile} />;
  const code = Object.keys(NATIVE_FORM).sort();
  return (
    <section className="panel">
      <h1>Forms</h1>
      {form_code && (
        <p className="notice" role="alert">
          Form {form_code} isn't available here.
        </p>
      )}
      <ProfilePick />
      <SavedReturn />
      <h2>New return</h2>
      <ul className="form-list">
        {code.map((c) => (
          <li key={c}>
            <a href={formHref(c)}>{c}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Taxpayer profiles (`profile/<TIN>.xml`, the same files BIR's main screen keeps) ; the one you pick fills in new forms. */
function ProfilePick() {
  const [name, setName] = useState<string[]>([]);
  useEffect(() => {
    listFolder("profile")
      .then((r) => setName(r.file.map((f) => f.name).filter((n) => n.endsWith(".xml")).sort()))
      .catch(() => setName([]));
  }, []);
  if (name.length === 0) return null;
  return (
    <label className="profile-pick">
      Taxpayer{" "}
      <select
        value={query().get("profile") ?? ""}
        onChange={(e) => window.location.assign(at(e.target.value ? `/form#profile=${encodeURIComponent(e.target.value)}` : "/form"))}
      >
        <option value="">None (type it on the form)</option>
        {name.map((n) => (
          <option key={n} value={n}>
            {n.replace(/\.xml$/, "")}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Saved returns, each reopened in its native form. On the web: also download, delete and add a savefile. */
function SavedReturn() {
  const [file, setFile] = useState<string[]>([]);
  const [is_kept, setIsKept] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () =>
    listFolder("savefile")
      .then((r) => setFile(r.file.map((f) => f.name).filter((n) => n.endsWith(".xml")).sort()))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void reload();
    if (IS_WEB) void webPersist().then(setIsKept);
  }, []);
  return (
    <div className="device-return">
      <h2>{IS_WEB ? "Returns on this device" : "Saved returns"}</h2>
      {IS_WEB && (
        <p>
          Returns are kept in this browser only and never sent anywhere. Download each one: the file opens in BIR's
          eBIRForms, and it is your copy if this browser's data is cleared.
          {is_kept === false && " This browser may delete its storage after a week without a visit; add this page to your Home Screen to keep it."}
        </p>
      )}
      {file.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <ul>
          {file.map((name) => {
            const c = codeOfSavefile(name);
            return (
              <li key={name}>
                {c ? <a href={formHref(c, { file: name })}>{name}</a> : <span title="Not a native form">{name}</span>}
                {IS_WEB && (
                  <>
                    {" "}
                    <button className="ghost" onClick={() => void webExport(`savefile/${name}`)}>
                      Download
                    </button>{" "}
                    <button className="ghost" onClick={() => void removeFile(`savefile/${name}`).then(reload)}>
                      Delete
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {IS_WEB && (
        <label className="file-pick">
          <input
            type="file"
            accept=".xml"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await webImport(f);
                await reload();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
          <span>Add a savefile from eBIRForms…</span>
        </label>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function LegacyScreen() {
  const [has_form, setHasForm] = useState<boolean | null>(null);
  useEffect(() => {
    hostStatus()
      .then((s) => setHasForm(s.has_form))
      .catch(() => setHasForm(false));
  }, []);
  useEffect(() => {
    if (has_form) window.location.replace(MAIN_SCREEN);
  }, [has_form]);
  if (has_form !== false) return null;
  return <ImportScreen onDone={() => setHasForm(true)} />;
}

function ImportScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="empty">
      <h1>Set up eBIRForms</h1>
      <p>
        This app runs BIR's official forms. Add them once from BIR's own download. They stay on this computer.
      </p>
      <ol className="steps">
        <li>
          Download the <strong>Offline eBIRForms Package</strong> from{" "}
          <a href="https://www.bir.gov.ph/eBIRForms" target="_blank" rel="noreferrer">
            bir.gov.ph
          </a>{" "}
          (the .zip for Windows is the right one; nothing in it is installed or run).
        </li>
        <li>Choose that file below.</li>
      </ol>
      <label className="file-pick">
        <input
          type="file"
          accept=".zip,.exe"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              await importPackage(file);
              onDone();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>{busy ? "Unpacking BIR's forms…" : "Choose the eBIRForms package…"}</span>
      </label>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
