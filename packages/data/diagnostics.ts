// Bounded, session-local diagnostics. No payloads, identities, URLs, or tokens.
import { clientUuid } from "./ids";
export type DiagnosticKind =
  "request_failed" | "access_denied" | "unexpected_error";
const key = "sontu-diagnostics-v1";
type Entry = { reference: string; time: string; kind: DiagnosticKind };
let memoryEntries: Entry[] = [];
function storage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}
export function diagnosticEntries(): Entry[] {
  try {
    const store = storage();
    return store ? JSON.parse(store.getItem(key) ?? "[]") : memoryEntries;
  } catch {
    return [];
  }
}
export function recordDiagnostic(kind: DiagnosticKind): string {
  const reference = clientUuid();
  try {
    const entry = { reference, time: new Date().toISOString(), kind };
    const entries = [...diagnosticEntries(), entry].slice(-30);
    const store = storage();
    if (store) store.setItem(key, JSON.stringify(entries));
    else memoryEntries = entries;
  } catch {
    /* Diagnostics must never block product behavior. */
  }
  return reference;
}
export function clearDiagnostics() {
  try {
    const store = storage();
    if (store) store.removeItem(key);
    memoryEntries = [];
  } catch {}
}
