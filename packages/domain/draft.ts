export interface DraftFields {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_label: string;
  cover_key: string;
  capacity: string;
}
export const emptyDraft: DraftFields = {
  title: "",
  description: "",
  starts_at: "",
  ends_at: "",
  timezone: "America/Toronto",
  venue_label: "",
  cover_key: "none",
  capacity: "",
};
export function wallTime(iso: string, zone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
// Require an unambiguous real wall time. Do not silently shift a DST gap or choose one occurrence of a repeated time.
export function instantForWall(value: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const center = Date.parse(value + "Z");
  if (!Number.isFinite(center)) return null;
  const matches: string[] = [];
  for (let m = -840; m <= 840; m += 15) {
    const iso = new Date(center + m * 60000).toISOString();
    if (wallTime(iso, zone) === value) matches.push(iso);
  }
  return matches.length === 1 ? matches[0] : null;
}
export function draftBlockers(d: DraftFields, now = Date.now()): string[] {
  const issues: string[] = [];
  if (!d.title.trim()) issues.push("Add an event title.");
  if (!d.venue_label.trim()) issues.push("Add a location.");
  if (!d.starts_at || Date.parse(d.starts_at) <= now)
    issues.push("Choose a future start time.");
  if (!d.ends_at || Date.parse(d.ends_at) <= Date.parse(d.starts_at))
    issues.push("Choose an end time after the start.");
  return issues;
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
