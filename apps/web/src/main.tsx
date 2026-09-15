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
  const isConnectedEventHub = () =>
    window.location.hash.startsWith("#/my-events/") ||
    window.location.pathname.includes("/my-events/");
  const sync = () => {
    if (!isConnectedEventHub()) return;
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      ".connected-hub .hub-rsvp button",
    )) {
      if (button.textContent?.trim() === "Going") {
        button.textContent = "Accept invitation";
        button.setAttribute("aria-label", "Accept invitation");
        return;
      }
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  window.addEventListener("hashchange", sync);
  window.addEventListener("popstate", sync);
  requestAnimationFrame(sync);
  window.setTimeout(sync, 0);
  window.setTimeout(sync, 250);
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
