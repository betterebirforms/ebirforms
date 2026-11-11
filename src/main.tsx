import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/style.css";
import { IS_WEB } from "@/lib/vfs";

// web version: work offline after the first visit (public-web/sw.js caches the app, never a return)
if (IS_WEB && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
