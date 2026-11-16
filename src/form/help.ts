// BIR's help pages on the web: Help > <tax type> > BIR Form <X> in the main screen's and every form's menu opens
// BIR's own help page (helpfile/Help<X>.hta), captured as asset/bir/layout/help-<X>.html (test/capture-layout.test.ts).
// The main screen links straight to the file; a form calls goToHelpPage('<X>'), whose argument is the label's code
// except for the labels below. Some of BIR's targets are missing from BIR's own package (0620, 1701MS, ...): the
// web says so instead of showing nothing.
import { hasLayout } from "./LayoutView.tsx";

/** A form menu's label -> the goToHelpPage argument BIR's page passes, where they differ (read off BIR's forms). */
export const HELP_ALIAS: Record<string, string> = {
  "1602Qv2018": "1602Q",
  "1602Qv2021": "1602Q",
  "1603Q (NEW)": "1603Q",
  "1603Qv2018": "1603Q",
  "1603Qv2021": "1603Q",
  "1702Qv2018": "1702Q",
  "2551Q": "2551",
};

/** The help page a Help menu item opens: from the main screen's link, else from the form menu's label. */
export function helpCode(label: string, href: string | null): string | null {
  const file = href?.match(/(?:^|\/)Help([^/]+)\.hta$/)?.[1];
  if (file) return file;
  const code = label.trim().match(/^BIR Form (.+)$/)?.[1];
  return code ? (HELP_ALIAS[code] ?? code) : null;
}

/** Whether BIR's package has this help page. */
export const hasHelp = (code: string) => hasLayout(`help-${code}`);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const helpHref = (code: string) => `${BASE}/help/${encodeURIComponent(code)}`;

/** BIR's goToHelpPage asks first on a form page: leaving it loses what was not saved. */
export const HELP_LEAVE =
  "Navigating away to this page that have changes will be lost.\n\nPlease note that saved tax returns can be viewed from the Main Screen.\n\nClick 'OK' should you wish to proceed anyway.\nOtherwise, click 'Cancel' if you want to save your changes first.";

/** Open the help page for a Help menu item; `leaving` asks first, as BIR's form pages do. */
export function openHelp(label: string, href: string | null, leaving = false): void {
  const code = helpCode(label, href);
  if (!code) return;
  if (!hasHelp(code)) return window.alert(`BIR's eBIRForms package has no help page for BIR Form ${code}, so BIR's own app can't show one either.`);
  if (leaving && !window.confirm(HELP_LEAVE)) return;
  window.location.assign(helpHref(code));
}
