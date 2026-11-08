// Window controls for the faux-XP caption. Outside Tauri (plain browser dev) the caption is inert.
import { getCurrentWindow } from "@tauri-apps/api/window";

const isTauri = "__TAURI_INTERNALS__" in window;
const caption = document.getElementById("caption")!;
const button = (name: string) => caption.querySelector<HTMLButtonElement>(`button.${name}`)!;

if (isTauri) {
  const win = getCurrentWindow();
  button("minimize").onclick = () => void win.minimize();
  button("maximize").onclick = () => void win.toggleMaximize();
  button("close").onclick = () => void win.close();
  // double-clicking a caption maximises/restores, as on XP
  caption.ondblclick = (e) => {
    if (!(e.target as Element).closest("button")) void win.toggleMaximize();
  };
  const sync = async () => caption.classList.toggle("maximized", await win.isMaximized());
  void sync();
  void win.onResized(() => void sync());
  void win.onFocusChanged(({ payload }) => caption.classList.toggle("inactive", !payload));
}
