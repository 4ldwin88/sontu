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

const invitedHubKey = "sontu-opened-invited-event";
function preserveInvitedHubAffordance() {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>(
      'a[href*="#/my-events/"], a[href^="/my-events/"]',
    );
    if (!link?.closest(".event-list-row")?.textContent?.includes("Invited"))
      return;
    const match = link.href.match(/#?\/my-events\/([^/?#]+)/);
    if (match?.[1]) sessionStorage.setItem(invitedHubKey, match[1]);
  });

  const relabelInvitedAction = () => {
    const eventId = location.hash.match(/^#\/my-events\/([^/?#]+)/)?.[1];
    if (!eventId || sessionStorage.getItem(invitedHubKey) !== eventId) return;
    const hub = document.querySelector(".connected-hub.public-event-hub");
    if (!hub?.textContent?.includes("Published")) return;
    const button = [...hub.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Going",
    );
    if (button) button.textContent = "Accept invitation";
  };

  window.addEventListener("hashchange", relabelInvitedAction);
  new MutationObserver(relabelInvitedAction).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

preserveInvitedHubAffordance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AccountProvider>
        <App />
      </AccountProvider>
    </HashRouter>
  </React.StrictMode>,
);
