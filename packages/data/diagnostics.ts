// Bounded, session-local diagnostics. No payloads, identities, URLs, or tokens.
export type DiagnosticKind =
  "request_failed" | "access_denied" | "unexpected_error";
const key = "sontu-diagnostics-v1";
type Entry = { reference: string; time: string; kind: DiagnosticKind };
export function diagnosticEntries(): Entry[] {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}
export function recordDiagnostic(kind: DiagnosticKind): string {
  const reference = crypto.randomUUID();
  try {
    const entry = { reference, time: new Date().toISOString(), kind };
    sessionStorage.setItem(
      key,
      JSON.stringify([...diagnosticEntries(), entry].slice(-30)),
    );
  } catch {
    /* Diagnostics must never block product behavior. */
  }
  return reference;
}
export function clearDiagnostics() {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
