// One of BIR's help pages on the web (helpfile/Help<X>.hta, captured; see help.ts), inside a shadow root like the
// form pages. Its File menu: Main Screen goes home; Exit has no window to close on the web.
import { useEffect } from "react";
import { useLayoutRoot, wireMenu } from "./LayoutView.tsx";
import { hasHelp } from "./help.ts";

export function HelpLayout({ code, home }: { code: string; home: string }) {
  const known = hasHelp(code);
  const [host, root] = useLayoutRoot(known ? `help-${code}` : "main");
  useEffect(() => {
    if (!root || !known) return;
    const off: Array<() => void> = [];
    const on = (el: EventTarget, type: string, fn: (e: Event) => void) => {
      el.addEventListener(type, fn);
      off.push(() => el.removeEventListener(type, fn));
    };
    wireMenu(root, on, { "Main Screen": () => window.location.assign(home) }, ["Exit"]);
    // BIR's own link to the main screen (href="../BIRForms.hta")
    for (const a of Array.from(root.querySelectorAll('a[href$="BIRForms.hta"]'))) on(a, "click", (e) => (e.preventDefault(), window.location.assign(home)));
    return () => off.forEach((f) => f());
  }, [root, known, home]);
  if (!known)
    return (
      <p className="notice" role="alert">
        BIR's eBIRForms package has no help page for BIR Form {code}. <a href={home}>Back to the main screen</a>
      </p>
    );
  return <div ref={host} className="bir-layout" data-form={`help-${code}`} />;
}
