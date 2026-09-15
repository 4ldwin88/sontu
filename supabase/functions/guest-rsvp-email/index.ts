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
  if (request.method !== "POST")
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const body = await request.json().catch(() => null);
  const eventId = body?.event_id;
  const token = body?.manage_token;
  const hubUrl = body?.guest_hub_url;
  if (
    typeof eventId !== "string" ||
    typeof token !== "string" ||
    typeof hubUrl !== "string" ||
    !/^https?:\/\//.test(hubUrl)
  )
    return json({ error: "INVALID_INPUT" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  const claim = await admin.rpc("sontu_claim_guest_rsvp_email", {
    event_id: eventId,
    manage_token: token,
  });
  if (claim.error) return json({ error: "QUEUE_UNAVAILABLE" }, 503);
  const row = claim.data?.[0];
  if (!row) return json({ status: "nothing_to_send" });
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SONTU_EMAIL_FROM");
  if (!resendKey || !sender) {
    await admin.rpc("sontu_complete_event_email_outbox", {
      outbox_id: row.outbox_id,
      outcome: "CONFIGURATION_UNAVAILABLE",
      error_message: "Application email sender is not configured.",
    });
    return json({ status: "configuration_unavailable" });
  }
  const when = row.starts_at
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: row.timezone || "UTC",
      }).format(new Date(row.starts_at))
    : "Schedule to be confirmed";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [row.recipient_email],
        subject: `You're going to ${row.event_title}`,
        text: `Hi ${row.recipient_name},\n\nYour guest RSVP is recorded for ${row.event_title}.\n\nWhen: ${when}\nWhere: ${row.venue_label || "To be confirmed"}\n\nManage your RSVP or revisit event details: ${hubUrl}\n\nThis private link expires after the event's guest-access period. We use your email for your reservation and essential event updates, not marketing.\n\nSontu`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result?.message || `Resend returned ${response.status}`);
    await admin.rpc("sontu_complete_event_email_outbox", {
      outbox_id: row.outbox_id,
      outcome: "SENT",
      provider_message_id: result?.id ?? null,
    });
    return json({ status: "sent" });
  } catch (error) {
    await admin.rpc("sontu_complete_event_email_outbox", {
      outbox_id: row.outbox_id,
      outcome: "FAILED_RETRYABLE",
      error_message:
        error instanceof Error ? error.message : "Delivery request failed.",
    });
    return json({ status: "failed" }, 502);
  }
});
