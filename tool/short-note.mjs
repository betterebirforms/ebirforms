// The update prompt's notes, kept short. Installed apps show `notes` from latest.json in a native alert that grows
// with its text: v0.2.1's 30 bullets made the Mac alert taller than the screen, so Install and Restart could not be
// reached and the app sat behind the modal alert (reported 2026-11-17). The full list stays in CHANGELOG.md.
export const CHANGELOG_URL = "https://github.com/betterebirforms/ebirforms/blob/main/CHANGELOG.md";
export const MAX_BULLET = 4;
export const MAX_CHAR = 180;

/** `text`: one version's CHANGELOG section. Returns at most MAX_BULLET bullets of at most MAX_CHAR characters each,
 * then a line naming how many more there are and where to read them. */
export function shortNote(text) {
  const bullet = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/\*\*/g, ""));
  if (!bullet.length) return `What's new: ${CHANGELOG_URL}`;
  const cut = (l) => (l.length > MAX_CHAR ? `${l.slice(0, MAX_CHAR - 3).replace(/\s+\S*$/, "")}...` : l);
  const kept = bullet.slice(0, MAX_BULLET).map(cut);
  const more = bullet.length - kept.length;
  const tail = more > 0 ? `And ${more} more ${more === 1 ? "change" : "changes"}: ${CHANGELOG_URL}` : `Details: ${CHANGELOG_URL}`;
  return [...kept, "", tail].join("\n");
}
