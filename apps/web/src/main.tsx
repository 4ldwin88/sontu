import { recordDiagnostic } from "../../../packages/data/diagnostics";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AccountProvider } from "./account-state";
import App from "./App";
import "../../../packages/design-tokens/tokens.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./style.css";
import "./board-architecture.css";
window.addEventListener("error", () => recordDiagnostic("unexpected_error"));
window.addEventListener("unhandledrejection", () =>
  recordDiagnostic("unexpected_error"),
);
function preserveConnectedInvitationAffordance() {
  const sync = () => {
    if (!window.location.hash.startsWith("#/my-events/")) return;
    const primary = document.querySelector<HTMLButtonElement>(
      ".connected-hub .hub-rsvp button:first-of-type",
    );
    if (primary?.textContent?.trim() === "Going") {
      primary.textContent = "Accept invitation";
      primary.setAttribute("aria-label", "Accept invitation");
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", sync);
  requestAnimationFrame(sync);
}
preserveConnectedInvitationAffordance();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AccountProvider>
        <App />
      </AccountProvider>
    </HashRouter>
  </React.StrictMode>,
);
