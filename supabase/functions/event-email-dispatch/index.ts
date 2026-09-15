import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type QueueRow = {
  outbox_id: string;
  recipient_email: string;
  recipient_name: string;
  kind: "EVENT_CHANGE" | "GUEST_RSVP_CONFIRMATION" | "EVENT_CANCELLED";
  event_title: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue_label: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function message(row: QueueRow) {
  const schedule = row.starts_at
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: row.timezone || "UTC",
      }).format(new Date(row.starts_at))
    : "Schedule to be confirmed";
  if (row.kind === "EVENT_CANCELLED")
    return {
      subject: `Cancelled: ${row.event_title}`,
      text: `Hi ${row.recipient_name},\n\n${row.event_title} has been cancelled. Please do not travel to the event.\n\nSontu`,
    };
  if (row.kind === "EVENT_CHANGE")
    return {
      subject: `Important update: ${row.event_title}`,
      text: `Hi ${row.recipient_name},\n\n${row.event_title} has changed.\n\nCurrent time: ${schedule}\nLocation: ${row.venue_label || "To be confirmed"}\n\nPlease check the event page and reconfirm if Sontu asks you to. This message does not treat delivery as your response.\n\nSontu`,
    };
  return {
    subject: `You're going to ${row.event_title}`,
    text: `Hi ${row.recipient_name},\n\nYour guest RSVP is recorded for ${row.event_title}.\n\nWhen: ${schedule}\nWhere: ${row.venue_label || "To be confirmed"}\n\nWe use this email for your reservation and essential event updates, not marketing. Keep this message for your records.\n\nSontu`,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const authorization = request.headers.get("Authorization");
  const eventId = (await request.json().catch(() => null))?.event_id;
  if (!authorization || typeof eventId !== "string")
    return json({ error: "INVALID_INPUT" }, 400);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const requester = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
  });
  const approved = await requester.rpc("sontu_request_event_delivery", {
    event_id: eventId,
  });
  if (approved.error || approved.data?.status !== "ready")
    return json({ error: "UNAUTHORIZED" }, 403);
  const admin = createClient(url, service);
  const claimed = await admin.rpc("sontu_claim_event_email_outbox", {
    event_id: eventId,
    max_rows: 25,
  });
  if (claimed.error) return json({ error: "QUEUE_UNAVAILABLE" }, 503);
  const rows = (claimed.data ?? []) as QueueRow[];
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("SONTU_EMAIL_FROM");
  if (!resendKey || !sender) {
    await Promise.all(
      rows.map((row) =>
        admin.rpc("sontu_complete_event_email_outbox", {
          outbox_id: row.outbox_id,
          outcome: "CONFIGURATION_UNAVAILABLE",
          provider_message_id: null,
          error_message: "Application email sender is not configured.",
        }),
      ),
    );
    return json({
      status: "configuration_unavailable",
      processed: rows.length,
    });
  }
  const outcomes = await Promise.all(
    rows.map(async (row) => {
      const content = message(row);
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
            subject: content.subject,
            text: content.text,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            typeof result?.message === "string"
              ? result.message
              : `Resend returned ${response.status}`,
          );
        await admin.rpc("sontu_complete_event_email_outbox", {
          outbox_id: row.outbox_id,
          outcome: "SENT",
          provider_message_id: result?.id ?? null,
          error_message: null,
        });
        return "sent";
      } catch (error) {
        await admin.rpc("sontu_complete_event_email_outbox", {
          outbox_id: row.outbox_id,
          outcome: "FAILED_RETRYABLE",
          provider_message_id: null,
          error_message:
            error instanceof Error ? error.message : "Delivery request failed.",
        });
        return "failed";
      }
    }),
  );
  return json({
    status: "ready",
    processed: rows.length,
    sent: outcomes.filter((x) => x === "sent").length,
    failed: outcomes.filter((x) => x === "failed").length,
  });
});
