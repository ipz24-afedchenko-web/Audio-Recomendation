import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Apply persisted CSS variable overrides immediately so the page
// renders with the user-chosen theme (avoids flash of default theme).
;(() => {
  try {
    const raw = localStorage.getItem("music_theme_vars");
    if (raw) {
      const vars = JSON.parse(raw);
      const root = document.documentElement;
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    }
  } catch { /* ignore malformed data */ }
})();


createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
