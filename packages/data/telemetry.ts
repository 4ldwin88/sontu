import { supabase } from "./sontu";

export type TelemetryScreen =
  | "home"
  | "discover"
  | "events"
  | "feed"
  | "hosting"
  | "invitation"
  | "account"
  | "profile"
  | "other";

type MetadataValue = string | number | boolean | null;

const key = "sontu-beta-telemetry-session-v1";
const sensitive = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|\/invite\/|\/respond\/|token|password|secret)/i;

function sessionId() {
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function cleanMetadata(metadata: Record<string, MetadataValue> = {}) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value === null) return true;
      if (typeof value === "string") return value.length <= 80 && !sensitive.test(value);
      return typeof value === "number" || typeof value === "boolean";
    }),
  );
}

export function screenFromPath(pathname: string): TelemetryScreen {
  if (pathname.startsWith("/core/events/")) return "hosting";
  if (pathname.startsWith("/event/") || pathname.startsWith("/invite/") || pathname.startsWith("/respond/")) return "invitation";
  if (pathname.startsWith("/discover")) return "discover";
  if (pathname.startsWith("/events")) return "events";
  if (pathname.startsWith("/feed")) return "feed";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/settings") || pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/home") || pathname === "/") return "home";
  return "other";
}

export function trackBeta(
  eventName: string,
  screen: TelemetryScreen,
  metadata?: Record<string, MetadataValue>,
) {
  const payload = {
    session_id: sessionId(),
    event_name: eventName,
    screen,
    metadata: cleanMetadata(metadata),
  };
  void supabase
    .from("sontu_beta_telemetry")
    .insert(payload)
    .then(() => undefined, () => undefined);
}
