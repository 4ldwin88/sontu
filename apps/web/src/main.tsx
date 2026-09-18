import { recordDiagnostic } from "../../../packages/data/diagnostics";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AccountProvider } from "./account-state";
import App from "./App";
import "../../../packages/design-tokens/tokens.css";
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-500.css";
import "@fontsource/sora/latin-600.css";
import "@fontsource/sora/latin-700.css";
import "./style.css";
function restoreHashRouteFromDirectPath() {
  const directPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.hash || directPath === "/" || directPath.endsWith("/")) return;
  if (!/^\/(home|discover|events|feed|create|core|my-events|invite|event|respond|connections|profile|settings|privacy|help|about|organizations|sign-in|sign-up|account)(\/|\?|$)/.test(directPath)) return;
  window.history.replaceState(null, "", `${window.location.origin}/#${directPath}`);
}
restoreHashRouteFromDirectPath();
function showLocalStartupError(reason: unknown) {
  if (!import.meta.env.DEV) return;
  const message = reason instanceof Error ? reason.message : String(reason);
  const detail = reason instanceof Error && reason.stack ? reason.stack : message;
  const panel = document.createElement("pre");
  panel.setAttribute("role", "alert");
  panel.style.cssText =
    "position:fixed;inset:12px;z-index:2147483647;overflow:auto;padding:16px;border:2px solid #b42318;background:#fff7ed;color:#111827;font:13px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;";
  panel.textContent = `Sontu local startup error\n\n${detail}`;
  document.body.appendChild(panel);
}

window.addEventListener("error", (event) => {
  recordDiagnostic("unexpected_error");
  showLocalStartupError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  recordDiagnostic("unexpected_error");
  showLocalStartupError(event.reason);
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AccountProvider>
        <App />
      </AccountProvider>
    </HashRouter>
  </React.StrictMode>,
);
