import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  MapPin,
  Share2,
  Users,
} from "lucide-react";
/* oxlint-disable react/set-state-in-effect, react/only-export-components -- Auth and server projections are external state; this module shares its projection hook with Events. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import {
  Button,
  TextField,
  StatusBadge,
  EventImage,
} from "../../../packages/ui-web";
import { rpc, supabase } from "../../../packages/data/sontu";
import { trackBeta } from "../../../packages/data/telemetry";
import { errorMessages } from "../../../packages/domain/coordination";
import { SessionGate } from "./coordination";
import { Modal } from "./shells";
export interface MyEvent {
  id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string;
  timezone: string;
  venue_label: string;
  cover_key: string;
  lifecycle: string;
  hosting: boolean;
  commitment_state: string | null;
  invitation_state: string | null;
  category?: string | null;
  format?: string | null;
  visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
  participation_access?: "ANYONE" | "SONTU_USERS_ONLY";
  current_version?: number;
  going_count?: number;
  host_name?: string;
  host_handle?: string | null;
  capacity?: number | null;
  owner_kind?: "PERSONAL" | "ORGANIZATION";
  owner_name?: string;
  reconfirmation_required?: boolean;
}
export const when = (value: string | null, zone: string) =>
  value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value))
    : "Date to be decided";
type ParticipantNotice = {
  kind: "EVENT_CHANGE" | "GUEST_RSVP_CONFIRMATION" | "EVENT_CANCELLED";
  state: "PENDING" | "SENT" | "DELIVERED" | "RETRYING" | "UNAVAILABLE";
  dispatched_at: string | null;
};
type ParticipantAdmission = {
  status: string;
  can_enter?: boolean;
  credential_status?: string;
  credential_expires_at?: string | null;
  credential_reference?: string | null;
};
const noticeKind = (kind: ParticipantNotice["kind"]) =>
  kind === "GUEST_RSVP_CONFIRMATION"
    ? "RSVP confirmation"
    : kind === "EVENT_CANCELLED"
      ? "Event cancellation"
      : "Event update";
function ParticipantNotices({ notices }: { notices: ParticipantNotice[] }) {
  if (!notices.length) return null;
  return (
    <section className="hub-about">
      <h2>Event notices</h2>
      <p className="muted">
        This shows Sontu’s delivery attempt, not whether an email was opened.
      </p>
      <div className="ask-host-thread">
        {notices.map((notice, index) => (
          <article
            key={`${notice.kind}-${notice.dispatched_at ?? "pending"}-${index}`}
          >
            <p>
              <strong>{noticeKind(notice.kind)}</strong>
            </p>
            <p className="small">
              Delivery:{" "}
              <StatusBadge
                tone={
                  notice.state === "DELIVERED" || notice.state === "SENT"
                    ? "info"
                    : "neutral"
                }
              >
                {notice.state.toLowerCase()}
              </StatusBadge>
              {notice.dispatched_at &&
                ` · Sent ${new Date(notice.dispatched_at).toLocaleString()}`}
              {notice.state === "UNAVAILABLE" &&
                " · Keep this hub link; email delivery is currently unavailable."}
              {notice.state === "RETRYING" && " · Sontu will retry delivery."}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
function AdmissionCredential({
  admission,
}: {
  admission: ParticipantAdmission | null;
}) {
  if (!admission) return null;
  return (
    <div className="small" role="status">
      <p>
        Admission:{" "}
        <StatusBadge tone={admission.can_enter ? "info" : "neutral"}>
          {admission.status.toLowerCase().replaceAll("_", " ")}
        </StatusBadge>
        {admission.status === "VALID" && " · Ready for check-in"}
      </p>
      {admission.credential_status && (
        <p>
          Credential:{" "}
          <StatusBadge
            tone={admission.credential_status === "ACTIVE" ? "info" : "neutral"}
          >
            {admission.credential_status.toLowerCase().replaceAll("_", " ")}
          </StatusBadge>
          {admission.credential_expires_at &&
            ` · Expires ${new Date(admission.credential_expires_at).toLocaleString()}`}
        </p>
      )}
      {admission.credential_reference && (
        <div>
          <strong>Entry credential</strong>
          <p className="muted">
            Present this reference at check-in. The staff system verifies its
            live status.
          </p>
          <code>{admission.credential_reference}</code>
        </div>
      )}
    </div>
  );
}
const icalText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const icalTime = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
function downloadCalendar(
  event: Pick<
    MyEvent,
    "id" | "title" | "description" | "starts_at" | "ends_at" | "venue_label"
  >,
) {
  if (!event.starts_at) return;
  const end =
    event.ends_at ??
    new Date(Date.parse(event.starts_at) + 60 * 60 * 1000).toISOString();
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sontu//Event//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@sontu.cc`,
    `DTSTAMP:${icalTime(new Date().toISOString())}`,
    `DTSTART:${icalTime(event.starts_at)}`,
    `DTEND:${icalTime(end)}`,
    `SUMMARY:${icalText(event.title)}`,
    `DESCRIPTION:${icalText(event.description ?? "")}`,
    `LOCATION:${icalText(event.venue_label ?? "")}`,
    `URL:${window.location.href}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const href = URL.createObjectURL(
    new Blob([content], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = `${
    event.title
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "sontu-event"
  }.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
export function useMyEvents() {
  const [signed, setSigned] = useState(false),
    [items, setItems] = useState<MyEvent[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setItems([]);
      setSigned(!!s);
      setEpoch((n) => n + 1);
    });
    supabase.auth.getSession().then(({ data }) => setSigned(!!data.session));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      rpc<{ status: string; events?: MyEvent[] }>("sontu_public_events", {
        event_id: null,
      }),
      signed
        ? rpc<{ status: string; events?: MyEvent[] }>("sontu_my_events", {})
        : Promise.resolve({ status: "ready", events: [] }),
    ])
      .then(([publicResult, mine]) => {
        if (live) {
          if (publicResult.status === "ready" && mine.status === "ready") {
            const merged = new Map(
              (publicResult.events ?? []).map((event) => [event.id, event]),
            );
            for (const event of mine.events ?? []) merged.set(event.id, event);
            setItems([...merged.values()]);
          } else setError("Your events are unavailable.");
        }
      })
      .catch(() => {
        if (live) setError("Could not load your events.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [signed, epoch]);
  return {
    signed,
    items,
    error,
    loading,
    reload: () => setEpoch((n) => n + 1),
  };
}
export function forView(items: MyEvent[], view: string) {
  return items.filter((e) =>
    view === "Hosting"
      ? e.hosting
      : view === "Upcoming"
        ? e.lifecycle === "PUBLISHED" &&
          (!e.ends_at || Date.parse(e.ends_at) > Date.now()) &&
          (e.hosting || e.commitment_state === "CONFIRMED")
        : view === "Invited"
          ? e.commitment_state === "NO_COMMITMENT" &&
            e.invitation_state !== "DECLINED"
          : false,
  );
}
export function hostingGroup(e: MyEvent, now = Date.now()): string {
  if (e.lifecycle === "DRAFT") return "Drafts";
  if (e.lifecycle === "IN_PROGRESS") return "In progress";
  if (
    e.lifecycle !== "PUBLISHED" ||
    (e.ends_at && Date.parse(e.ends_at) <= now)
  )
    return "History";
  if (e.starts_at && Date.parse(e.starts_at) <= now) return "In progress";
  return "Upcoming";
}
export function HostingCollection({ items }: { items: MyEvent[] }) {
  return (
    <>
      {["In progress", "Upcoming", "Drafts", "History"].map((group) => {
        const events = items.filter((e) => hostingGroup(e) === group);
        return events.length ? (
          <section className="hosting-group" key={group} aria-label={group}>
            <h2>
              {group} <span className="small muted">({events.length})</span>
            </h2>
            {events.map((event) => (
              <SimpleEventCard key={event.id} event={event} view="Hosting" />
            ))}
          </section>
        ) : null;
      })}
    </>
  );
}
export function SimpleEventCard({
  event: e,
  view,
}: {
  event: MyEvent;
  view: string;
}) {
  let remembered: { category?: string; format?: string } | null = null;
  try {
    remembered = JSON.parse(
      localStorage.getItem(`sontu-event-intent:${e.id}`) ?? "null",
    );
  } catch {
    /* Cards still render when device storage is unavailable. */
  }
  const eventType = e.category ?? remembered?.category ?? "Event";
  const relationship = e.hosting
    ? "Hosting"
    : view === "Interested"
      ? "Interested"
      : e.commitment_state === "CONFIRMED"
        ? "Going"
        : "Invited";
  const to = eventCardHref(e, eventType, remembered?.format);
  return (
    <div className="event-list-row">
      <article className="event-card compact-square real-event-card">
        <Link className="event-card-link" to={to}>
          {e.cover_key !== "none" ? (
            <EventImage image={{ src: `images/${e.cover_key}.jpg`, alt: "" }} />
          ) : (
            <div
              className="image-fallback"
              role="img"
              aria-label="No cover image"
            >
              No cover
            </div>
          )}
          <div className="event-card-copy">
            <h3>{e.title || "Untitled event"}</h3>
            <span className="event-date">{when(e.starts_at, e.timezone)}</span>
            {e.venue_label && (
              <p className="location">
                <MapPin size={14} />
                <span>{e.venue_label}</span>
              </p>
            )}
            <div className="tags">
              <span className="tag event-type-tag">{eventType}</span>
              <StatusBadge tone={relationship === "Going" ? "info" : "neutral"}>
                {relationship}
              </StatusBadge>
              {e.hosting && e.owner_name && (
                <StatusBadge>{e.owner_name}</StatusBadge>
              )}
              {e.lifecycle === "DRAFT" && <StatusBadge>Draft</StatusBadge>}
              {e.lifecycle === "CANCELLED" && (
                <StatusBadge tone="error">Cancelled</StatusBadge>
              )}
              {e.lifecycle === "IN_PROGRESS" && (
                <StatusBadge tone="info">In progress</StatusBadge>
              )}
              {e.lifecycle === "COMPLETED" && (
                <StatusBadge>Completed</StatusBadge>
              )}
            </div>
          </div>
        </Link>
      </article>
      {e.hosting && (
        <Link
          className="text-action"
          to={
            e.lifecycle === "DRAFT"
              ? `/create/${e.id}`
              : `/core/events/${e.id}/host`
          }
        >
          {e.lifecycle === "DRAFT" ? "Resume draft" : "Manage event"}
        </Link>
      )}
    </div>
  );
}

export function eventCardHref(
  event: MyEvent,
  eventType = event.category ?? "Event",
  rememberedFormat?: string,
) {
  if (event.hosting && event.lifecycle === "DRAFT") {
    return `/create/${event.id}?${new URLSearchParams({
      format: event.format ?? rememberedFormat ?? "in-person",
      category: eventType,
    })}`;
  }
  if (event.hosting || event.commitment_state || event.invitation_state) {
    return `/my-events/${event.id}`;
  }
  return `/event/${event.id}`;
}
export function EmailVerification({ onVerified }: { onVerified: () => void }) {
  const location = useLocation();
  const accountNext = encodeURIComponent(location.pathname + location.search);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (import.meta.env.VITE_INVITATION_VERIFICATION_ENABLED !== "true")
    return (
      <section className="panel">
        <h1>Private invitation</h1>
        <p>
          Use the email address the host invited. Sign in with an existing
          verified account, or create an account and confirm your email. Email
          delivery may be limited during the beta.
        </p>
        <p>Your event details remain protected.</p>
        <Link className="button primary" to={"/sign-in?next=" + accountNext}>
          Sign in
        </Link>
        <Link className="button secondary" to={"/sign-up?next=" + accountNext}>
          Create account
        </Link>
      </section>
    );
  return (
    <section className="panel coord-auth">
      <h1>Verify your invitation</h1>
      <Link className="text-action" to={"/sign-in?next=" + accountNext}>
        Sign in with your account
      </Link>
      <p>
        Use the email address the host invited. No password or profile setup is
        needed.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            if (!sent) {
              const r = await supabase.auth.signInWithOtp({
                email: email.trim(),
                options: { shouldCreateUser: true },
              });
              if (r.error) throw r.error;
              setSent(true);
            } else {
              const r = await supabase.auth.verifyOtp({
                email: email.trim(),
                token: code.trim(),
                type: "email",
              });
              if (r.error) throw r.error;
              onVerified();
            }
          } catch {
            setError(
              sent
                ? "That code could not be verified. Check the code or request another."
                : "Email could not be requested. Please wait and retry; delivery may be unavailable.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Invited email"
          type="email"
          autoComplete="email"
          required
          readOnly={sent}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {sent && (
          <>
            <p role="status">Check your inbox for a verification code.</p>
            <TextField
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy}>
          {busy ? "Please wait…" : sent ? "Verify email" : "Email me a code"}
        </Button>
        {sent && (
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setCode("");
              setError("");
            }}
          >
            Change email or request another code
          </Button>
        )}
      </form>
    </section>
  );
}
interface InvitationView {
  status: string;
  error_code?: string;
  event?: {
    id: string;
    title: string;
    description: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    venue_label: string;
    cover_key: string;
    lifecycle: string;
    current_version: number;
    full: boolean;
    responses_open: boolean;
  };
  participant?: {
    display_name: string;
    commitment_state: string;
    invitation_state: string;
    response: string | null;
    reconfirmation_required: boolean;
  };
}
interface ResponseRequest {
  decision: string;
  expected_version: number;
  operation_id: string;
}
type RsvpQuestion = {
  id: string;
  prompt: string;
  type: "SINGLE_SELECT" | "SHORT_TEXT";
  required: boolean;
  per_attendee: boolean;
  options: string[];
};
type RsvpFormData = {
  status: string;
  error_code?: string;
  plus_one_allowance: number;
  questions: RsvpQuestion[];
  answers: {
    question_id: string;
    attendee_name: string | null;
    answer: string;
  }[];
};
function StructuredRsvp({
  eventId,
  token,
  primaryName,
}: {
  eventId: string;
  token?: string;
  primaryName: string;
}) {
  const [form, setForm] = useState<RsvpFormData | null>(null);
  const [attendees, setAttendees] = useState<
    { name: string; answers: Record<string, string> }[]
  >([{ name: primaryName, answers: {} }]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    const data = await rpc<RsvpFormData>("sontu_rsvp_form", {
      action: "READ",
      event_id: eventId,
      token,
    });
    if (data.status !== "ready") throw new Error(data.error_code);
    setForm(data);
    const primary: Record<string, string> = {};
    const byAttendee = new Map<string, Record<string, string>>();
    for (const answer of data.answers ?? []) {
      if (answer.attendee_name) {
        const row = byAttendee.get(answer.attendee_name) ?? {};
        row[answer.question_id] = answer.answer;
        byAttendee.set(answer.attendee_name, row);
      } else primary[answer.question_id] = answer.answer;
    }
    setAttendees([
      { name: primaryName, answers: primary },
      ...[...byAttendee.entries()].map(([name, answers]) => ({
        name,
        answers,
      })),
    ]);
  }, [eventId, primaryName, token]);
  useEffect(() => {
    void load().catch(() => setError("Could not load RSVP details."));
  }, [load]);
  if (!token || !form?.questions.length) return null;
  const update = (index: number, questionId: string, value: string) =>
    setAttendees((rows) =>
      rows.map((row, i) =>
        i === index
          ? { ...row, answers: { ...row.answers, [questionId]: value } }
          : row,
      ),
    );
  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_rsvp_form",
        {
          action: "SAVE",
          event_id: eventId,
          token,
          payload: { attendees },
          operation_id: crypto.randomUUID(),
        },
      );
      if (result.status !== "ready") throw new Error(result.error_code);
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "RSVP_INCOMPLETE"
          ? "Please complete each required RSVP detail."
          : "Your RSVP details could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel structured-rsvp">
      <h2>RSVP details</h2>
      <p className="muted">These details help your host plan the event.</p>
      {attendees.map((attendee, index) => (
        <fieldset key={index}>
          <legend>{index === 0 ? "You" : `Guest ${index}`}</legend>
          {index > 0 && (
            <TextField
              label="Guest name"
              required
              value={attendee.name}
              onChange={(e) =>
                setAttendees((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, name: e.target.value } : r,
                  ),
                )
              }
            />
          )}
          {form.questions
            .filter((q) => index === 0 || q.per_attendee)
            .map((q) => (
              <label key={q.id} className="rsvp-question">
                <span>
                  {q.prompt}
                  {q.required && " *"}
                </span>
                {q.type === "SINGLE_SELECT" ? (
                  <select
                    required={q.required}
                    value={attendee.answers[q.id] ?? ""}
                    onChange={(e) => update(index, q.id, e.target.value)}
                  >
                    <option value="">Select one</option>
                    {q.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required={q.required}
                    maxLength={300}
                    value={attendee.answers[q.id] ?? ""}
                    onChange={(e) => update(index, q.id, e.target.value)}
                  />
                )}
              </label>
            ))}
        </fieldset>
      ))}
      {attendees.length < 1 + form.plus_one_allowance && (
        <Button
          variant="secondary"
          onClick={() =>
            setAttendees((rows) => [...rows, { name: "", answers: {} }])
          }
        >
          Add a guest
        </Button>
      )}
      {attendees.length > 1 && (
        <Button
          variant="quiet"
          onClick={() => setAttendees((rows) => rows.slice(0, -1))}
        >
          Remove last guest
        </Button>
      )}
      <div className="coord-actions">
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save RSVP details"}
        </Button>
        {saved && <span role="status">Saved</span>}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function SeatingAssignment({
  eventId,
  token,
}: {
  eventId: string;
  token?: string;
}) {
  const [assignments, setAssignments] = useState<
    { attendee_name: string; table_label: string }[]
  >([]);
  useEffect(() => {
    if (!token) return;
    void rpc<{
      status: string;
      assignments?: { attendee_name: string; table_label: string }[];
    }>("sontu_participant_seating", { event_id: eventId, token })
      .then((result) => {
        if (result.status === "ready") setAssignments(result.assignments ?? []);
      })
      .catch(() => undefined);
  }, [eventId, token]);
  if (!assignments.length) return null;
  return (
    <section className="panel">
      <h2>Your seating</h2>
      {assignments.map((assignment) => (
        <p key={`${assignment.attendee_name}:${assignment.table_label}`}>
          <strong>{assignment.attendee_name}</strong> · {assignment.table_label}
        </p>
      ))}
    </section>
  );
}
function AccommodationRequest({
  eventId,
  token,
}: {
  eventId: string;
  token?: string;
}) {
  const [content, setContent] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    const result = await rpc<{
      status: string;
      request?: { content: string | null; status: string } | null;
    }>("sontu_participant_accommodation", {
      action: "READ",
      event_id: eventId,
      token,
    });
    if (result.status === "ready" && result.request) {
      setContent(result.request.content ?? "");
      setStatus(result.request.status);
    }
  }, [eventId, token]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!token) return null;
  const save = async (action: "SAVE" | "WITHDRAW") => {
    setBusy(true);
    trackBeta("accommodation_request_attempted", "invitation", {
      action: action.toLowerCase(),
      has_content: action === "SAVE" ? Boolean(content.trim()) : null,
    });
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_participant_accommodation",
        {
          action,
          event_id: eventId,
          token,
          content: action === "SAVE" ? content : null,
        },
      );
      setStatus(
        result.status === "ready"
          ? action === "SAVE"
            ? "Saved"
            : "Withdrawn"
          : "Unable to save",
      );
      trackBeta(
        result.status === "ready"
          ? "accommodation_request_succeeded"
          : "accommodation_request_failed",
        "invitation",
        { action: action.toLowerCase(), error_code: result.error_code ?? null },
      );
      if (result.status === "ready" && action === "WITHDRAW") setContent("");
    } catch {
      trackBeta("accommodation_request_failed", "invitation", {
        action: action.toLowerCase(),
        step: "transport",
      });
      setStatus("Unable to save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <h2>Accessibility or accommodation request</h2>
      <p className="muted">
        Optional. Share only what your host needs to plan for you. This is
        visible only to the host and staff they explicitly assign, and is
        deleted 30 days after the event.
      </p>
      <label className="rsvp-question">
        <span>Your request</span>
        <textarea
          maxLength={1000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="For example: wheelchair-accessible seating or dietary accommodation."
        />
      </label>
      <div className="coord-actions">
        <Button
          disabled={busy || !content.trim()}
          onClick={() => void save("SAVE")}
        >
          {busy ? "Saving…" : "Save request"}
        </Button>
        {content && (
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() => void save("WITHDRAW")}
          >
            Withdraw request
          </Button>
        )}
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
function AccessibilityInformation({
  eventId,
  token,
}: {
  eventId: string;
  token?: string;
}) {
  const [info, setInfo] = useState<{
    step_free_entry: boolean;
    accessible_washroom: boolean;
    seating_available: boolean;
    quiet_space_available: boolean;
    public_notes: string;
  } | null>(null);
  useEffect(() => {
    void rpc<{ status: string; information?: typeof info }>(
      "sontu_event_accessibility",
      { action: "READ", event_id: eventId, token: token ?? null },
    )
      .then((r) => {
        if (r.status === "ready" && r.information) setInfo(r.information);
      })
      .catch(() => undefined);
  }, [eventId, token]);
  if (
    !info ||
    (!info.step_free_entry &&
      !info.accessible_washroom &&
      !info.seating_available &&
      !info.quiet_space_available &&
      !info.public_notes)
  )
    return null;
  return (
    <section className="panel">
      <h2>Accessibility</h2>
      <div className="tags">
        {info.step_free_entry && <StatusBadge>Step-free entry</StatusBadge>}
        {info.accessible_washroom && (
          <StatusBadge>Accessible washroom</StatusBadge>
        )}
        {info.seating_available && <StatusBadge>Seating available</StatusBadge>}
        {info.quiet_space_available && <StatusBadge>Quiet space</StatusBadge>}
      </div>
      {info.public_notes && <p>{info.public_notes}</p>}
      <p className="small muted">
        Need something else? Send the host a private accommodation request after
        you RSVP.
      </p>
    </section>
  );
}
function savedRequest(key: string): ResponseRequest | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
export function Invitation() {
  const { token, eventId } = useParams();
  return (
    <main id="main" tabIndex={-1} className="coord-response">
      <InvitationContent
        key={token ?? eventId}
        token={token}
        eventId={eventId}
      />
    </main>
  );
}
function InvitationContent({
  token,
  eventId,
}: {
  token?: string;
  eventId?: string;
}) {
  const recoveryKey = "sontu-invitation-request:" + (token ?? eventId);
  const pending = useRef<ResponseRequest | null>(savedRequest(recoveryKey));
  const [view, setView] = useState<InvitationView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(() => !!savedRequest(recoveryKey)),
    [epoch, setEpoch] = useState(0);
  const readSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    setView(null);
    try {
      const r = await rpc<InvitationView>("sontu_simple_access", {
        token: token ?? null,
        event_id: eventId ?? null,
      });
      if (sequence === readSequence.current) setView(r);
    } catch {
      if (sequence === readSequence.current)
        setError("Unable to load the invitation. Please retry.");
    }
  }, [token, eventId]);
  useEffect(() => {
    void load();
  }, [load, epoch]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      readSequence.current++;
      setView(null);
      setEpoch((n) => n + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function respond(decision: string) {
    if (busy || !view?.event) return;
    setBusy(true);
    setError("");
    trackBeta("public_event_response_attempted", "invitation", {
      action: decision.toLowerCase(),
    });
    pending.current ??= {
      decision,
      expected_version: view.event.current_version,
      operation_id: crypto.randomUUID(),
    };
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify(pending.current));
    } catch {
      /* Same-page recovery remains possible. */
    }
    try {
      const r = await rpc<{ status: string; error_code?: string }>(
        "sontu_simple_access",
        { token: token ?? null, event_id: eventId ?? null, ...pending.current },
      );
      pending.current = null;
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {}
      setUnknown(false);
      if (r.status === "ready") {
        trackBeta("public_event_response_succeeded", "invitation", {
          action: decision.toLowerCase(),
        });
        await load();
      } else {
        trackBeta("public_event_response_failed", "invitation", {
          action: decision.toLowerCase(),
          error_code: r.error_code ?? null,
        });
        setError(
          errorMessages[r.error_code ?? ""] ??
            "This response is unavailable. Refresh to review the current event.",
        );
      }
    } catch {
      setUnknown(true);
      trackBeta("public_event_response_failed", "invitation", {
        action: decision.toLowerCase(),
        step: "transport",
      });
      setError("Your response is unconfirmed. Retry the same request.");
    } finally {
      setBusy(false);
    }
  }
  if (view?.error_code === "VERIFY_EMAIL")
    return <EmailVerification onVerified={() => setEpoch((n) => n + 1)} />;
  if (view && view.status !== "ready")
    return (
      <section className="panel">
        <h1>Invitation unavailable</h1>
        <p>
          This invitation may be expired, revoked, or intended for another email
          address. No protected event details are shown.
        </p>
        <Button onClick={() => void supabase.auth.signOut()}>
          Use another email
        </Button>
      </section>
    );
  const e = view?.event,
    p = view?.participant;
  return (
    <>
      <span className="eyebrow">Sontu · Your invitation</span>
      {!view && !error && <p role="status">Loading invitation…</p>}
      {error && <p role="alert">{error}</p>}
      {unknown && (
        <div className="coord-feedback">
          <p>A previous response is unconfirmed.</p>
          <Button
            disabled={busy || !e}
            onClick={() =>
              pending.current && void respond(pending.current.decision)
            }
          >
            Retry same response
          </Button>
        </div>
      )}
      {e && p && (
        <>
          {e.cover_key !== "none" && (
            <img
              className="coord-response-image"
              src={`images/${e.cover_key}.jpg`}
              alt=""
            />
          )}
          <h1>{e.title}</h1>
          <p>{when(e.starts_at, e.timezone)}</p>
          <p>Ends {when(e.ends_at, e.timezone)}</p>
          <p>
            {e.venue_label} · {e.timezone}
          </p>
          <p>{e.description}</p>
          <section className="panel">
            <h2>Hello, {p.display_name}.</h2>
            {e.lifecycle === "CANCELLED" ? (
              <p>This event is cancelled.</p>
            ) : !e.responses_open ? (
              <p>Responses are closed for this event.</p>
            ) : p.reconfirmation_required ? (
              <>
                <p>The event details changed. Can you still make it?</p>
                <div className="coord-actions">
                  <Button
                    disabled={busy || unknown}
                    onClick={() => void respond("RECONFIRMED")}
                  >
                    I can still make it
                  </Button>
                  <Button
                    disabled={busy || unknown}
                    variant="secondary"
                    onClick={() => void respond("RELEASED_DECLINED")}
                  >
                    I can’t make it
                  </Button>
                </div>
              </>
            ) : p.commitment_state === "CONFIRMED" ? (
              <>
                <p role="status">You’re going.</p>
                <Button
                  disabled={busy || unknown}
                  variant="secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Withdraw your participation? This releases your place.",
                      )
                    )
                      void respond("WITHDRAW");
                  }}
                >
                  Withdraw participation
                </Button>
              </>
            ) : p.commitment_state === "RELEASED_DECLINED" ? (
              <p>Your withdrawal is recorded.</p>
            ) : (
              <>
                <p>
                  {p.invitation_state === "DECLINED"
                    ? "You declined this invitation."
                    : "Would you like to join?"}
                </p>
                {e.full && (
                  <p role="status">
                    This event is full. No place is reserved by this invitation.
                  </p>
                )}
                <div className="coord-actions">
                  <Button
                    disabled={busy || unknown || e.full}
                    onClick={() => void respond("ACCEPT_INVITE")}
                  >
                    Accept invitation
                  </Button>
                  <Button
                    disabled={busy || unknown}
                    variant="secondary"
                    onClick={() => void respond("DECLINE_INVITE")}
                  >
                    Decline invitation
                  </Button>
                </div>
              </>
            )}
          </section>
          {p.commitment_state === "CONFIRMED" && (
            <StructuredRsvp
              eventId={e.id}
              token={token}
              primaryName={p.display_name}
            />
          )}
          {p.commitment_state === "CONFIRMED" && (
            <SeatingAssignment eventId={e.id} token={token} />
          )}
          <AccessibilityInformation eventId={e.id} token={token} />
          {p.commitment_state === "CONFIRMED" && (
            <AccommodationRequest eventId={e.id} token={token} />
          )}
          <div className="coord-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setError("");
                void load();
              }}
            >
              Refresh event
            </Button>
            <Link className="text-action" to="/events">
              Your Events
            </Link>
          </div>
        </>
      )}
    </>
  );
}
export function ConnectedEventHub() {
  const { eventId } = useParams();
  const [hub, setHub] = useState<{
    status: string;
    error_code?: string;
    event?: MyEvent & { capacity?: number | null; current_version: number };
    viewer?: {
      hosting: boolean;
      display_name?: string;
      commitment_state?: string;
      invitation_state?: string;
    };
    host?: { display_name: string; handle?: string | null };
    going?: { display_name: string; badge: string | null }[];
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [questionBusy, setQuestionBusy] = useState(false);
  const [discussion, setDiscussion] = useState<
    { id: string; body: string; author_name: string; created_at: string }[]
  >([]);
  const [discussionEnabled, setDiscussionEnabled] = useState(false);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [questions, setQuestions] = useState<
    {
      id: string;
      question: string;
      response: string | null;
      state: "OPEN" | "ANSWERED" | "CLOSED";
    }[]
  >([]);
  const [admission, setAdmission] = useState<ParticipantAdmission | null>(null);
  const [notices, setNotices] = useState<ParticipantNotice[]>([]);
  const [teamAction, setTeamAction] = useState<{
    action: "FULL_HOST" | "OPERATIONS" | "CHECK_IN";
    role?: string;
  } | null>(null);
  const load = useCallback(async () => {
    if (!eventId) return;
    setError("");
    try {
      setHub(await rpc("sontu_event_hub", { event_id: eventId }));
    } catch {
      setError("Could not load this event.");
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!eventId || !hub?.viewer?.hosting) {
      setTeamAction(null);
      return;
    }
    void rpc<{
      status: string;
      action?: "FULL_HOST" | "OPERATIONS" | "CHECK_IN";
      role?: string;
    }>("sontu_event_team_hub_action", { event_id: eventId })
      .then((result) =>
        setTeamAction(
          result.status === "ready" && result.action
            ? { action: result.action, role: result.role }
            : null,
        ),
      )
      .catch(() => setTeamAction(null));
  }, [eventId, hub?.viewer?.hosting]);
  const loadQuestions = useCallback(async () => {
    if (!eventId) return;
    try {
      const result = await rpc<{
        status: string;
        items?: {
          id: string;
          question: string;
          response: string | null;
          state: "OPEN" | "ANSWERED" | "CLOSED";
        }[];
      }>("sontu_event_host_questions", {
        action: "read",
        event_id: eventId,
        question_id: null,
        body: null,
      });
      if (result.status === "ready") setQuestions(result.items ?? []);
    } catch {
      // The event itself remains usable when the optional inbox cannot refresh.
    }
  }, [eventId]);
  useEffect(() => {
    if (hub?.viewer?.hosting || hub?.viewer?.commitment_state !== "CONFIRMED") {
      setQuestions([]);
      return;
    }
    void loadQuestions();
  }, [hub?.viewer?.commitment_state, hub?.viewer?.hosting, loadQuestions]);
  useEffect(() => {
    if (
      !eventId ||
      hub?.viewer?.hosting ||
      hub?.viewer?.commitment_state !== "CONFIRMED"
    ) {
      setAdmission(null);
      return;
    }
    void rpc<{ status: string; admission?: typeof admission }>(
      "sontu_participant_admission_projection",
      { event_id: eventId, manage_token: null },
    )
      .then((result) =>
        setAdmission(
          result.status === "ready" ? (result.admission ?? null) : null,
        ),
      )
      .catch(() => setAdmission(null));
  }, [eventId, hub?.viewer?.commitment_state, hub?.viewer?.hosting]);
  useEffect(() => {
    if (
      !eventId ||
      hub?.viewer?.hosting ||
      hub?.viewer?.commitment_state !== "CONFIRMED"
    ) {
      setNotices([]);
      return;
    }
    void rpc<{ status: string; notices?: ParticipantNotice[] }>(
      "sontu_participant_communication_history",
      { event_id: eventId, manage_token: null },
    )
      .then((result) =>
        setNotices(result.status === "ready" ? (result.notices ?? []) : []),
      )
      .catch(() => setNotices([]));
  }, [eventId, hub?.viewer?.commitment_state, hub?.viewer?.hosting]);
  const loadDiscussion = useCallback(async () => {
    if (!eventId) return;
    try {
      const result = await rpc<{
        status: string;
        enabled?: boolean;
        items?: {
          id: string;
          body: string;
          author_name: string;
          created_at: string;
        }[];
      }>("sontu_event_discussion", {
        action: "read",
        event_id: eventId,
        post_id: null,
        body: null,
        enabled: null,
      });
      if (result.status === "ready") {
        setDiscussionEnabled(!!result.enabled);
        setDiscussion(result.items ?? []);
      }
    } catch {
      setDiscussionEnabled(false);
      setDiscussion([]);
    }
  }, [eventId]);
  useEffect(() => {
    if (hub?.viewer?.hosting || hub?.viewer?.commitment_state === "CONFIRMED")
      void loadDiscussion();
  }, [hub?.viewer?.commitment_state, hub?.viewer?.hosting, loadDiscussion]);
  async function postDiscussion() {
    if (!event || !discussionDraft.trim() || questionBusy) return;
    setQuestionBusy(true);
    try {
      const result = await rpc<{ status: string }>("sontu_event_discussion", {
        action: "post",
        event_id: event.id,
        post_id: null,
        body: discussionDraft,
        enabled: null,
      });
      if (result.status === "ready") {
        setDiscussionDraft("");
        await loadDiscussion();
      }
    } finally {
      setQuestionBusy(false);
    }
  }
  async function respond(decision: string) {
    if (!hub?.event || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_simple_access",
        {
          event_id: hub.event.id,
          decision,
          expected_version: hub.event.current_version,
          operation_id: crypto.randomUUID(),
        },
      );
      if (result.status === "ready") await load();
      else
        setError(
          errorMessages[result.error_code ?? ""] ??
            "This response is unavailable.",
        );
    } catch {
      setError("Your response is unconfirmed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const event = hub?.event,
    viewer = hub?.viewer,
    going = hub?.going ?? [];
  async function share() {
    const data = {
      title: event?.title ?? "Sontu event",
      url: window.location.href,
    };
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(data.url);
      setError("Event link copied.");
    }
  }
  async function askHost() {
    if (!event || !question.trim() || questionBusy) return;
    setQuestionBusy(true);
    setError("");
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_event_host_questions",
        {
          action: "ask",
          event_id: event.id,
          question_id: null,
          body: question,
        },
      );
      if (result.status === "ready") {
        setQuestion("");
        setError("Your question was sent to the host.");
        await loadQuestions();
      } else {
        setError(
          errorMessages[result.error_code ?? ""] ??
            "Your question could not be sent.",
        );
      }
    } catch {
      setError("Your question is unconfirmed. Please retry.");
    } finally {
      setQuestionBusy(false);
    }
  }
  return (
    <main id="main" tabIndex={-1} className="connected-hub">
      <SessionGate>
        {!hub && !error ? (
          <p role="status">Loading event…</p>
        ) : error && !event ? (
          <div role="alert">
            <p>{error}</p>
            <Button onClick={() => void load()}>Retry</Button>
          </div>
        ) : hub?.status !== "ready" || !event || !viewer ? (
          <section className="panel">
            <h1>Event unavailable</h1>
            <p>This event is not available to this account.</p>
          </section>
        ) : (
          <>
            <div className="hub-cover">
              {event.cover_key !== "none" ? (
                <img src={`images/${event.cover_key}.jpg`} alt="" />
              ) : (
                <div className="image-fallback">No cover</div>
              )}
              <Link
                to={viewer.hosting ? "/events?view=Hosting" : "/events"}
                className="icon-button hub-back"
                aria-label="Back to Events"
              >
                <ChevronLeft size={25} />
              </Link>
              <button
                className="icon-button hub-share"
                aria-label="Share event"
                onClick={() => void share()}
              >
                <Share2 size={20} />
              </button>
              <span className="tag hub-category">
                {event.category ?? "Event"}
              </span>
            </div>
            <div className="event-hub-layout">
              <div className="event-hub-main">
                <div className="tags">
                  <StatusBadge tone="info">
                    {viewer.hosting
                      ? "You’re hosting"
                      : viewer.commitment_state === "CONFIRMED"
                        ? "You’re going"
                        : viewer.invitation_state === "CREATED"
                          ? "You’re invited"
                          : "Not going"}
                  </StatusBadge>
                  {teamAction?.role && (
                    <StatusBadge>
                      {teamAction.role
                        .replaceAll("_", " ")
                        .toLowerCase()
                        .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())}
                    </StatusBadge>
                  )}
                  <StatusBadge>
                    {event.lifecycle === "CANCELLED"
                      ? "Cancelled"
                      : event.lifecycle === "DRAFT"
                        ? "Draft"
                        : event.lifecycle === "IN_PROGRESS"
                          ? "In progress"
                          : event.lifecycle === "COMPLETED"
                            ? "Completed"
                            : "Published"}
                  </StatusBadge>
                  {event.format && (
                    <span className="tag">
                      {event.format === "in-person"
                        ? "In person"
                        : event.format}
                    </span>
                  )}
                </div>
                <h1>{event.title || "Untitled event"}</h1>
                <div className="event-host-row">
                  <span className="avatar hub-avatar">
                    {(hub.host?.display_name ?? "H").slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <span className="small muted">Hosted by</span>
                    {hub.host?.handle ? (
                      <Link to={`/p/${hub.host.handle}`} className="host-profile-link">
                        {hub.host.display_name ?? "Event host"}
                      </Link>
                    ) : (
                      <strong>{hub.host?.display_name ?? "Event host"}</strong>
                    )}
                  </div>
                  <StatusBadge>Host</StatusBadge>
                </div>
                {event.lifecycle === "CANCELLED" && (
                  <p className="coord-feedback" role="status">
                    This event is cancelled. New participation is unavailable.
                  </p>
                )}
                {event.lifecycle === "IN_PROGRESS" && (
                  <p className="coord-feedback" role="status">
                    This event is in progress. New participation is closed.
                  </p>
                )}
                <section className="hub-about">
                  <h2>About this event</h2>
                  <p className="event-description">
                    {event.description ||
                      "The host hasn’t added a description yet."}
                  </p>
                </section>
                {!viewer.hosting && viewer.commitment_state === "CONFIRMED" && (
                  <ParticipantNotices notices={notices} />
                )}
                {discussionEnabled &&
                  (viewer.hosting ||
                    viewer.commitment_state === "CONFIRMED") && (
                    <section className="hub-about ask-host">
                      <h2>Event discussion</h2>
                      <p className="muted">
                        A shared, event-only conversation for confirmed
                        participants.
                      </p>
                      {discussion.map((post) => (
                        <article key={post.id} className="ask-host-thread">
                          <p>
                            <strong>{post.author_name}</strong> ·{" "}
                            {new Date(post.created_at).toLocaleString()}
                          </p>
                          <p>{post.body}</p>
                        </article>
                      ))}
                      {!viewer.hosting && event.lifecycle !== "COMPLETED" && (
                        <>
                          <label className="field">
                            <span>Add to the discussion</span>
                            <textarea
                              rows={3}
                              maxLength={1000}
                              value={discussionDraft}
                              onChange={(e) =>
                                setDiscussionDraft(e.target.value)
                              }
                            />
                          </label>
                          <Button
                            disabled={questionBusy || !discussionDraft.trim()}
                            onClick={() => void postDiscussion()}
                          >
                            Post
                          </Button>
                        </>
                      )}
                    </section>
                  )}
                <section className="hub-going">
                  <div className="section-heading">
                    <div>
                      <h2>Going</h2>
                      <p className="muted">
                        {going.length}{" "}
                        {going.length === 1 ? "person" : "people"}
                      </p>
                    </div>
                  </div>
                  {going.length ? (
                    <ul>
                      {going.map((person, index) => (
                        <li key={`${person.display_name}-${index}`}>
                          <span className="avatar">
                            {person.display_name.slice(0, 1).toUpperCase()}
                          </span>
                          <span>{person.display_name}</span>
                          {person.badge && (
                            <StatusBadge
                              tone={
                                person.badge === "Host" ? "info" : "neutral"
                              }
                            >
                              {person.badge}
                            </StatusBadge>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No confirmed participants yet.</p>
                  )}
                </section>
                {!viewer.hosting &&
                  viewer.commitment_state === "CONFIRMED" &&
                  event.lifecycle === "PUBLISHED" && (
                    <section className="hub-about ask-host">
                      <h2>Contact the host</h2>
                      <p className="muted">
                        Send a private event question directly to the host. This
                        is not a group chat or an automated answer.
                      </p>
                      <label className="field">
                        <span>Your question</span>
                        <textarea
                          value={question}
                          maxLength={1000}
                          rows={3}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="What would you like to know?"
                        />
                      </label>
                      <Button
                        disabled={questionBusy || !question.trim()}
                        onClick={() => void askHost()}
                      >
                        Send question
                      </Button>
                      {questions.length > 0 && (
                        <div className="ask-host-thread" aria-live="polite">
                          <h3>Your messages</h3>
                          {questions.map((item) => (
                            <article key={item.id}>
                              <p>
                                <strong>You:</strong> {item.question}
                              </p>
                              {item.response ? (
                                <p>
                                  <strong>Host:</strong> {item.response}
                                </p>
                              ) : item.state === "CLOSED" ? (
                                <p className="muted">
                                  This question was closed.
                                </p>
                              ) : (
                                <p className="muted">
                                  Waiting for the host’s response.
                                </p>
                              )}
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
              </div>
              <aside className="panel event-hub-details">
                <div className="detail">
                  <CalendarDays />
                  <div>
                    <strong>{when(event.starts_at, event.timezone)}</strong>
                    {event.ends_at && (
                      <p>Ends {when(event.ends_at, event.timezone)}</p>
                    )}
                  </div>
                </div>
                <div className="detail">
                  <MapPin />
                  <div>
                    <strong>
                      {event.venue_label || "Location to be decided"}
                    </strong>
                    <p>
                      {event.format === "online"
                        ? "Online event"
                        : "Event location"}
                    </p>
                  </div>
                </div>
                <div className="detail">
                  <Users />
                  <div>
                    <strong>{going.length} going</strong>
                    {event.capacity && (
                      <p>
                        {event.capacity - going.length > 0
                          ? `${event.capacity - going.length} places remaining`
                          : "Event is full"}
                      </p>
                    )}
                  </div>
                </div>
                {event.starts_at && (
                  <Button
                    variant="secondary"
                    onClick={() => downloadCalendar(event)}
                  >
                    <CalendarPlus size={17} /> Add to calendar
                  </Button>
                )}
                <Link
                  className="text-action"
                  to={`/help?event=${encodeURIComponent(event.id)}`}
                >
                  Report a problem with this event
                </Link>
                {error && (
                  <p role="status" className="small">
                    {error}
                  </p>
                )}
                {viewer.hosting ? (
                  <Link
                    className="button primary"
                    to={
                      teamAction?.action === "OPERATIONS"
                        ? `/core/events/${event.id}/operations`
                        : teamAction?.action === "CHECK_IN"
                          ? `/core/events/${event.id}/check-in`
                          : event.lifecycle === "DRAFT"
                            ? `/create/${event.id}`
                            : `/core/events/${event.id}/host`
                    }
                  >
                    {teamAction?.action === "OPERATIONS"
                      ? "Open operations"
                      : teamAction?.action === "CHECK_IN"
                        ? "Open check-in"
                        : event.lifecycle === "DRAFT"
                          ? "Resume draft"
                          : "Manage event"}
                  </Link>
                ) : event.lifecycle !== "PUBLISHED" ? (
                  <StatusBadge>Responses closed</StatusBadge>
                ) : viewer.commitment_state === "CONFIRMED" ? (
                  <>
                    <div className="hub-confirmed">You’re going!</div>
                    <AdmissionCredential admission={admission} />
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() =>
                        window.confirm(
                          "Leave this event and release your place?",
                        ) && void respond("WITHDRAW")
                      }
                    >
                      Leave event
                    </Button>
                  </>
                ) : (
                  <div className="hub-rsvp">
                    <Button
                      disabled={
                        busy ||
                        (!!event.capacity && going.length >= event.capacity)
                      }
                      onClick={() => void respond("ACCEPT_INVITE")}
                    >
                      Going
                    </Button>
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => void respond("DECLINE_INVITE")}
                    >
                      Can’t go
                    </Button>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </SessionGate>
    </main>
  );
}

export function PublicEventHub() {
  const { eventId } = useParams();
  const location = useLocation();
  const guestKey = `sontu-guest-rsvp:${eventId}`;
  const storedGuest = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(guestKey) ?? "null") as {
        display_name: string;
        email: string;
        manage_token: string;
      } | null;
    } catch {
      return null;
    }
  }, [guestKey]);
  const storedParticipation = useMemo(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem(`sontu-public-participation:${eventId}`) ??
          "null",
      ) as {
        action: "JOIN" | "WITHDRAW";
        expected_version: number;
        operation_id: string;
      } | null;
    } catch {
      return null;
    }
  }, [eventId]);
  const [event, setEvent] = useState<MyEvent | null>(null),
    [loading, setLoading] = useState(true),
    [signedIn, setSignedIn] = useState(false),
    [participation, setParticipation] = useState<{
      status: string;
      commitment_state?: string | null;
      current_version: number;
      going_count: number;
      participant_count: number;
      capacity?: number | null;
      full: boolean;
      responses_open: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [joinOpen, setJoinOpen] = useState<"choice" | "guest" | "recovery" | null>(
      null,
    ),
    [guestCredential, setGuestCredential] = useState(storedGuest),
    [guestName, setGuestName] = useState(storedGuest?.display_name ?? ""),
    [guestEmail, setGuestEmail] = useState(storedGuest?.email ?? ""),
    [recoveryEmail, setRecoveryEmail] = useState(storedGuest?.email ?? ""),
    [guestParticipation, setGuestParticipation] = useState<{
      commitment_state?: string | null;
      display_name?: string | null;
      current_version?: number;
    } | null>(null),
    [guestNotices, setGuestNotices] = useState<ParticipantNotice[]>([]),
    [guestAdmission, setGuestAdmission] = useState<ParticipantAdmission | null>(
      null,
    ),
    [unknown, setUnknown] = useState(!!storedParticipation),
    [error, setError] = useState(
      storedParticipation
        ? "A previous response was interrupted. Retry the same response to recover it safely."
        : "",
    ),
    [pending, setPending] = useState<{
      action: "JOIN" | "WITHDRAW";
      expected_version: number;
      operation_id: string;
    } | null>(storedParticipation);
  const pendingKey = `sontu-public-participation:${eventId}`;
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("guest");
    if (!eventId || !token || !/^[0-9a-f-]{36}$/i.test(token)) return;
    const credential = {
      display_name: storedGuest?.display_name ?? "",
      email: storedGuest?.email ?? "",
      manage_token: token,
    };
    try {
      localStorage.setItem(guestKey, JSON.stringify(credential));
    } catch {
      /* this tab can still use the emailed credential */
    }
    setGuestCredential(credential);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}#${location.pathname}`,
    );
  }, [eventId, guestKey, location.pathname, location.search, storedGuest]);
  const guestCall = useCallback(
    async (
      action: "READ" | "JOIN" | "WITHDRAW",
      credential: { display_name: string; email: string; manage_token: string },
      operationId: string | null = null,
    ) => {
      if (!eventId) return null;
      if (action === "READ")
        return rpc<{
          status: string;
          error_code?: string;
          commitment_state?: string | null;
          display_name?: string;
          current_version?: number;
        }>("sontu_guest_hub_access", {
          event_id: eventId,
          manage_token: credential.manage_token,
        });
      return rpc<{
        status: string;
        error_code?: string;
        commitment_state?: string | null;
        display_name?: string;
        current_version?: number;
      }>("sontu_guest_event_participation", {
        event_id: eventId,
        action,
        guest_name: action === "JOIN" ? credential.display_name : null,
        guest_email: action === "JOIN" ? credential.email : null,
        expected_version:
          guestParticipation?.current_version ?? event?.current_version ?? null,
        operation_id: operationId,
        manage_token: credential.manage_token,
      });
    },
    [event?.current_version, eventId, guestParticipation?.current_version],
  );
  const loadParticipation = useCallback(async () => {
    if (!eventId) return;
    const result = await rpc<typeof participation>(
      "sontu_public_event_participation",
      {
        event_id: eventId,
        action: "READ",
        expected_version: null,
        operation_id: null,
      },
    );
    if (result?.status === "ready") setParticipation(result);
  }, [eventId]);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSignedIn(!!data.session);
      if (data.session)
        void loadParticipation().catch(() =>
          setError("Could not load your participation status."),
        );
    });
    rpc<{ status: string; events?: MyEvent[] }>("sontu_public_events", {
      event_id: eventId,
    })
      .then((result) => {
        if (!live) return;
        const found = result.events?.[0];
        if (result.status === "ready" && found) setEvent(found);
        else setError("This event is private or unavailable.");
      })
      .catch(() => live && setError("This event could not be loaded."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [eventId, loadParticipation]);
  useEffect(() => {
    if (!signedIn && guestCredential) {
      void guestCall("READ", guestCredential)
        .then((result) => {
          if (result?.status === "ready") setGuestParticipation(result);
          else if (result?.error_code === "GUEST_ACCESS_EXPIRED")
            setError(
              "This guest RSVP link has expired. The public event page may still be available.",
            );
        })
        .catch(() => undefined);
    }
  }, [guestCall, guestCredential, signedIn]);
  useEffect(() => {
    if (
      signedIn ||
      !eventId ||
      !guestCredential ||
      guestParticipation?.commitment_state !== "CONFIRMED"
    ) {
      setGuestNotices([]);
      return;
    }
    void rpc<{ status: string; notices?: ParticipantNotice[] }>(
      "sontu_participant_communication_history",
      { event_id: eventId, manage_token: guestCredential.manage_token },
    )
      .then((result) =>
        setGuestNotices(
          result.status === "ready" ? (result.notices ?? []) : [],
        ),
      )
      .catch(() => setGuestNotices([]));
  }, [
    eventId,
    guestCredential,
    guestParticipation?.commitment_state,
    signedIn,
  ]);
  useEffect(() => {
    if (
      signedIn ||
      !eventId ||
      !guestCredential ||
      guestParticipation?.commitment_state !== "CONFIRMED"
    ) {
      setGuestAdmission(null);
      return;
    }
    void rpc<{ status: string; admission?: ParticipantAdmission }>(
      "sontu_participant_admission_projection",
      { event_id: eventId, manage_token: guestCredential.manage_token },
    )
      .then((result) =>
        setGuestAdmission(
          result.status === "ready" ? (result.admission ?? null) : null,
        ),
      )
      .catch(() => setGuestAdmission(null));
  }, [
    eventId,
    guestCredential,
    guestParticipation?.commitment_state,
    signedIn,
  ]);
  async function respond(request: {
    action: "JOIN" | "WITHDRAW";
    expected_version: number;
    operation_id: string;
  }) {
    if (!eventId || busy) return;
    setBusy(true);
    setError("");
    setUnknown(false);
    setPending(request);
    trackBeta("public_event_response_attempted", "invitation", {
      action: request.action.toLowerCase(),
    });
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(request));
    } catch {
      /* same-page retry still works */
    }
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_public_event_participation",
        {
          event_id: eventId,
          ...request,
        },
      );
      if (result.status !== "ready") {
        setPending(null);
        try {
          sessionStorage.removeItem(pendingKey);
        } catch {
          /* no-op */
        }
        setError(
          errorMessages[result.error_code ?? ""] ??
            "This response is no longer available.",
        );
        trackBeta("public_event_response_failed", "invitation", {
          action: request.action.toLowerCase(),
          error_code: result.error_code ?? null,
        });
        await loadParticipation();
        return;
      }
      trackBeta("public_event_response_succeeded", "invitation", {
        action: request.action.toLowerCase(),
      });
      setPending(null);
      try {
        sessionStorage.removeItem(pendingKey);
      } catch {
        /* no-op */
      }
      await loadParticipation();
    } catch {
      setUnknown(true);
      trackBeta("public_event_response_failed", "invitation", {
        action: request.action.toLowerCase(),
        step: "transport",
      });
      setError(
        "Your response is unconfirmed. Retry the same request before trying anything else.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function respondAsGuest(action: "JOIN" | "WITHDRAW") {
    if (busy || !event) return;
    const credential =
      action === "JOIN"
        ? {
            display_name: guestName.trim(),
            email: guestEmail.trim().toLowerCase(),
            manage_token: guestCredential?.manage_token ?? crypto.randomUUID(),
          }
        : guestCredential;
    if (!credential) return;
    if (action === "JOIN" && (!credential.display_name || !credential.email)) {
      setError("Enter your name and email to RSVP as a guest.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await guestCall(action, credential, crypto.randomUUID());
      if (!result || result.status !== "ready") {
        setError(
          errorMessages[result?.error_code ?? ""] ??
            "This RSVP is no longer available.",
        );
        return;
      }
      if (action === "JOIN") {
        localStorage.setItem(guestKey, JSON.stringify(credential));
        setGuestCredential(credential);
        const guestHubUrl = `${window.location.origin}${window.location.pathname}#/event/${event.id}?guest=${credential.manage_token}`;
        void supabase.functions
          .invoke("guest-rsvp-email", {
            body: {
              event_id: event.id,
              manage_token: credential.manage_token,
              guest_hub_url: guestHubUrl,
            },
          })
          .then(({ data, error }) => {
            if (error || data?.status === "failed")
              setError(
                "Your RSVP is saved, but the confirmation email could not be sent yet. Keep this page open and try again shortly.",
              );
          })
          .catch(() =>
            setError(
              "Your RSVP is saved, but the confirmation email could not be sent yet. Keep this page open and try again shortly.",
            ),
          );
        setEvent((current) =>
          current
            ? {
                ...current,
                going_count:
                  (current.going_count ?? 1) +
                  (guestParticipation?.commitment_state === "CONFIRMED"
                    ? 0
                    : 1),
              }
            : current,
        );
      } else {
        setEvent((current) =>
          current
            ? {
                ...current,
                going_count: Math.max(1, (current.going_count ?? 1) - 1),
              }
            : current,
        );
      }
      setGuestParticipation(result);
      setJoinOpen(null);
    } catch {
      setError(
        "Your RSVP outcome is unconfirmed. Refresh this page before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestGuestRecovery() {
    if (!eventId || !recoveryEmail.trim()) {
      setError("Enter the email address used for your guest RSVP.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await supabase.functions.invoke("guest-hub-recovery", {
        body: { event_id: eventId, email: recoveryEmail.trim().toLowerCase() },
      });
      setJoinOpen(null);
      setError(
        "If that email has an active guest RSVP, a private link is on its way.",
      );
    } catch {
      // Keep the response neutral so this page does not reveal who is going.
      setJoinOpen(null);
      setError(
        "If that email has an active guest RSVP, a private link is on its way.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="connected-hub">
        <p role="status">Loading event…</p>
      </main>
    );
  if (!event)
    return (
      <main id="main" className="connected-hub">
        <section className="panel">
          <h1>Event unavailable</h1>
          <p>{error}</p>
          <Link className="button secondary" to="/discover">
            Explore events
          </Link>
        </section>
      </main>
    );
  return (
    <main id="main" tabIndex={-1} className="connected-hub public-event-hub">
      <div className="hub-cover">
        {event.cover_key !== "none" ? (
          <img src={`images/${event.cover_key}.jpg`} alt="" />
        ) : (
          <div className="image-fallback">No cover</div>
        )}
        <Link
          to="/discover"
          className="icon-button hub-back"
          aria-label="Back to Discover"
        >
          <ChevronLeft size={25} />
        </Link>
        <button
          className="icon-button hub-share"
          aria-label="Share event"
          onClick={() =>
            void (navigator.share
              ? navigator.share({
                  title: event.title,
                  url: window.location.href,
                })
              : navigator.clipboard.writeText(window.location.href))
          }
        >
          <Share2 size={20} />
        </button>
        <span className="tag hub-category">{event.category ?? "Event"}</span>
      </div>
      <div className="event-hub-layout">
        <div className="event-hub-main">
          <div className="tags">
            <StatusBadge tone="info">Public event</StatusBadge>
            <StatusBadge>
              {event.lifecycle === "CANCELLED"
                ? "Cancelled"
                : event.lifecycle === "COMPLETED"
                  ? "Ended"
                  : event.lifecycle === "IN_PROGRESS"
                    ? "In progress"
                    : "Published"}
            </StatusBadge>
            <StatusBadge>
              {event.participation_access === "ANYONE"
                ? "Guest RSVP allowed"
                : "Sontu users only"}
            </StatusBadge>
            {event.format && (
              <span className="tag">
                {event.format === "in-person" ? "In person" : event.format}
              </span>
            )}
          </div>
          <h1>{event.title}</h1>
          <div className="event-host-row">
            <span className="avatar hub-avatar">
              {(event.host_name ?? "H").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <span className="small muted">Hosted by</span>
              {event.host_handle ? (
                <Link to={`/p/${event.host_handle}`} className="host-profile-link">
                  {event.host_name ?? "Event host"}
                </Link>
              ) : (
                <strong>{event.host_name ?? "Event host"}</strong>
              )}
            </div>
            <StatusBadge>Host</StatusBadge>
          </div>
          <section className="hub-about">
            <h2>About this event</h2>
            <p className="event-description">
              {event.description || "The host hasn’t added a description yet."}
            </p>
          </section>
          {!signedIn &&
            guestParticipation?.commitment_state === "CONFIRMED" && (
              <ParticipantNotices notices={guestNotices} />
            )}
          <AccessibilityInformation eventId={event.id} />
        </div>
        <aside className="panel event-hub-details">
          <div className="detail">
            <CalendarDays />
            <div>
              <strong>{when(event.starts_at, event.timezone)}</strong>
              {event.ends_at && (
                <p>Ends {when(event.ends_at, event.timezone)}</p>
              )}
            </div>
          </div>
          <div className="detail">
            <MapPin />
            <div>
              <strong>{event.venue_label}</strong>
              <p>
                {event.format === "online" ? "Online event" : "Event location"}
              </p>
            </div>
          </div>
          <div className="detail">
            <Users />
            <div>
              <strong>
                {participation?.going_count ?? event.going_count ?? 1} going
              </strong>
              {event.capacity && (
                <p>
                  {participation?.full
                    ? "Event is full"
                    : `${Math.max(0, event.capacity - (participation?.participant_count ?? Math.max(0, (event.going_count ?? 1) - 1)))} participant places remaining`}
                </p>
              )}
            </div>
          </div>
          {event.starts_at && (
            <Button variant="secondary" onClick={() => downloadCalendar(event)}>
              <CalendarPlus size={17} /> Add to calendar
            </Button>
          )}
          {error && (
            <p role="alert" className="small">
              {error}
            </p>
          )}
          {unknown && pending && (
            <Button disabled={busy} onClick={() => void respond(pending)}>
              Retry same response
            </Button>
          )}
          {event.lifecycle === "PUBLISHED" &&
            !unknown &&
            (!signedIn ? (
              guestParticipation?.commitment_state === "CONFIRMED" ? (
                <div className="public-rsvp-state">
                  <div className="hub-confirmed">
                    You’re going as {guestParticipation.display_name}!
                  </div>
                  <AdmissionCredential admission={guestAdmission} />
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() =>
                      window.confirm(
                        "Leave this event and release your place?",
                      ) && void respondAsGuest("WITHDRAW")
                    }
                  >
                    Leave event
                  </Button>
                </div>
              ) : event.participation_access === "ANYONE" ? (
                <div className="public-rsvp-state">
                  <Button
                    disabled={
                      busy ||
                      (!!event.capacity &&
                        (event.going_count ?? 1) - 1 >= event.capacity)
                    }
                    onClick={() => setJoinOpen("choice")}
                  >
                    {event.capacity &&
                    (event.going_count ?? 1) - 1 >= event.capacity
                      ? "Event is full"
                      : "Going"}
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => setJoinOpen("recovery")}
                  >
                    Email my guest RSVP link
                  </Button>
                </div>
              ) : (
                <Link
                  className="button primary"
                  to={`/sign-in?next=${encodeURIComponent(`/event/${event.id}`)}`}
                >
                  Sign in or create account to join
                </Link>
              )
            ) : participation?.commitment_state === "CONFIRMED" ? (
              <div className="public-rsvp-state">
                <div className="hub-confirmed">You’re going!</div>
                <Link className="button primary" to={`/my-events/${event.id}`}>
                  View in My Events
                </Link>
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() =>
                    window.confirm(
                      "Leave this event and release your place?",
                    ) &&
                    void respond({
                      action: "WITHDRAW",
                      expected_version: participation.current_version,
                      operation_id: crypto.randomUUID(),
                    })
                  }
                >
                  Leave event
                </Button>
              </div>
            ) : participation && participation.responses_open ? (
              <Button
                disabled={busy || participation.full}
                onClick={() =>
                  void respond({
                    action: "JOIN",
                    expected_version: participation.current_version,
                    operation_id: crypto.randomUUID(),
                  })
                }
              >
                {participation.full
                  ? "Event is full"
                  : busy
                    ? "Joining…"
                    : "Going"}
              </Button>
            ) : participation ? (
              <StatusBadge>Responses closed</StatusBadge>
            ) : (
              <p role="status" className="small muted">
                Loading participation…
              </p>
            ))}
        </aside>
      </div>
      {joinOpen && (
        <Modal
          title={
            joinOpen === "choice"
              ? "Join this event"
              : joinOpen === "guest"
                ? "RSVP as a guest"
                : "Find your guest RSVP"
          }
          onClose={() => !busy && setJoinOpen(null)}
        >
          {joinOpen === "choice" ? (
            <div className="guest-rsvp-choice">
              <p>
                Reserve your place as a guest, or use a Sontu account to keep
                this event in My Events.
              </p>
              <Button onClick={() => setJoinOpen("guest")}>
                RSVP as a guest
              </Button>
              <Link
                className="button secondary"
                to={`/sign-in?next=${encodeURIComponent(`/event/${event.id}`)}`}
              >
                Sign in or create account
              </Link>
              <Button variant="quiet" onClick={() => setJoinOpen(null)}>
                Cancel
              </Button>
            </div>
          ) : joinOpen === "recovery" ? (
            <form
              className="guest-rsvp-form"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void requestGuestRecovery();
              }}
            >
              <p>
                Enter the email address you used when you RSVP’d. For privacy,
                Sontu will show the same confirmation either way.
              </p>
              <TextField
                label="Email address"
                type="email"
                required
                maxLength={254}
                value={recoveryEmail}
                onChange={(changeEvent) =>
                  setRecoveryEmail(changeEvent.target.value)
                }
              />
              <div className="coord-actions">
                <Button disabled={busy} type="submit">
                  Email my link
                </Button>
                <Button
                  disabled={busy}
                  variant="quiet"
                  type="button"
                  onClick={() => setJoinOpen(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form
              className="guest-rsvp-form"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void respondAsGuest("JOIN");
              }}
            >
              <TextField
                label="Your name"
                required
                maxLength={120}
                value={guestName}
                onChange={(changeEvent) =>
                  setGuestName(changeEvent.target.value)
                }
              />
              <TextField
                label="Email address"
                type="email"
                required
                maxLength={254}
                value={guestEmail}
                onChange={(changeEvent) =>
                  setGuestEmail(changeEvent.target.value)
                }
              />
              <div className="guest-email-reason">
                <strong>Why we require an email</strong>
                <p>
                  It helps Sontu keep one reservation per person, lets you
                  manage or claim your RSVP, and gives the host a way to send
                  essential event changes. It will not subscribe you to
                  marketing.
                </p>
              </div>
              {error && (
                <p role="alert" className="small">
                  {error}
                </p>
              )}
              <div className="coord-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setJoinOpen("choice")}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !guestName.trim() || !guestEmail.trim()}
                >
                  {busy ? "Reserving…" : "Confirm RSVP"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}
