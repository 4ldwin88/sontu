import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "apikey, authorization, content-type",
  "content-type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const body = await request.json().catch(() => null);
  const eventId = body?.event_id;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    typeof eventId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(eventId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return json({ error: "INVALID_INPUT" }, 400);

  // The recovery URL is server-owned. Never reflect a caller-supplied URL in
  // an authenticated Sontu email: that would turn recovery into phishing.
  const appOrigin = Deno.env.get("SONTU_APP_ORIGIN");
  if (!appOrigin || !/^https:\/\//.test(appOrigin))
    return json({ status: "accepted" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const issued = await admin.rpc("sontu_issue_guest_hub_recovery", {
    event_id: eventId,
    recipient_email: email,
  });
  if (issued.error) return json({ status: "accepted" });
  const row = issued.data?.[0];
  if (!row) return json({ status: "accepted" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SONTU_EMAIL_FROM");
  if (!resendKey || !sender) return json({ status: "accepted" });
  const eventUrl = new URL(`/event/${eventId}`, appOrigin);
  eventUrl.hash = `guest=${row.manage_token}`;
  const when = row.starts_at
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: row.timezone || "UTC",
      }).format(new Date(row.starts_at))
    : "Schedule to be confirmed";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
        to: [row.email],
        subject: `Your Sontu RSVP link for ${row.event_title}`,
        text: `Hi ${row.recipient_name},\n\nHere is your private link to revisit ${row.event_title}, see its details, or cancel your RSVP:\n${eventUrl}\n\nWhen: ${when}\nWhere: ${row.venue_label || "To be confirmed"}\n\nThis link expires in 24 hours. We use your email for your reservation and essential event updates, not marketing.\n\nSontu`,
      }),
    });
  } catch {
    // Preserve the generic response so this endpoint cannot reveal whether a
    // person is registered for an event.
  }
  return json({ status: "accepted" });
});
