export type CalendarEventInput = {
  id: string;
  title: string;
  description?: string | null;
  starts_at: string | null;
  ends_at?: string | null;
  venue_label?: string | null;
  url?: string | null;
  generated_at?: string;
};

export const icalText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export const icalTime = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function eventCalendarText(event: CalendarEventInput) {
  if (!event.starts_at) return "";
  const end =
    event.ends_at ??
    new Date(Date.parse(event.starts_at) + 60 * 60 * 1000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sontu//Event//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@sontu.cc`,
    `DTSTAMP:${icalTime(event.generated_at ?? new Date().toISOString())}`,
    `DTSTART:${icalTime(event.starts_at)}`,
    `DTEND:${icalTime(end)}`,
    `SUMMARY:${icalText(event.title)}`,
    `DESCRIPTION:${icalText(event.description ?? "")}`,
    `LOCATION:${icalText(event.venue_label ?? "")}`,
  ];
  if (event.url) lines.push(`URL:${icalText(event.url)}`);
  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

export function calendarFilename(title: string) {
  return `${
    title
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "sontu-event"
  }.ics`;
}
