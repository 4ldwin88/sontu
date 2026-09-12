/* oxlint-disable react/set-state-in-effect, react/only-export-components -- Auth and server projections are external state; this module shares its projection hook with Events. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  TextField,
  StatusBadge,
  EventImage,
} from "../../../packages/ui-web";
import { rpc, supabase } from "../../../packages/data/sontu";
import { errorMessages } from "../../../packages/domain/coordination";
import { SessionGate } from "./coordination";
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
}
export const when = (value: string | null, zone: string) =>
  value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value))
    : "Date to be decided";
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
    if (!signed) return;
    setLoading(true);
    setError("");
    rpc<{ status: string; events?: MyEvent[] }>("sontu_my_events", {})
      .then((r) => {
        if (live) {
          if (r.status === "ready") setItems(r.events ?? []);
          else setError("Your events are unavailable.");
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
  if (
    e.lifecycle !== "PUBLISHED" ||
    (e.ends_at && Date.parse(e.ends_at) <= now)
  )
    return "History & cancelled";
  if (e.starts_at && Date.parse(e.starts_at) <= now) return "In progress";
  return "Published & upcoming";
}
export function HostingCollection({ items }: { items: MyEvent[] }) {
  return (
    <>
      {[
        "Drafts",
        "Published & upcoming",
        "In progress",
        "History & cancelled",
      ].map((group) => {
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
  view: _view,
}: {
  event: MyEvent;
  view: string;
}) {
  const to =
    e.hosting && e.lifecycle === "DRAFT"
      ? `/create/${e.id}`
      : `/my-events/${e.id}`;
  return (
    <div className="event-list-row">
      <article className="event-card compact-square">
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
            <StatusBadge>
              {e.lifecycle === "CANCELLED"
                ? "Cancelled"
                : e.hosting
                  ? "Hosting"
                  : e.commitment_state === "CONFIRMED"
                    ? "Going"
                    : "Invited"}
            </StatusBadge>
            <h3>{e.title || "Untitled event"}</h3>
            <span className="event-date">{when(e.starts_at, e.timezone)}</span>
            <p className="muted">{e.venue_label}</p>
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
export function EmailVerification({ onVerified }: { onVerified: () => void }) {
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
          Email verification is not available yet. The host needs to finish the
          email-delivery setup before new guests can verify their invitations.
        </p>
        <p>Your event details remain protected.</p>
        <Link className="text-action" to="/core">
          Already have a test login?
        </Link>
      </section>
    );
  return (
    <section className="panel coord-auth">
      <h1>Verify your invitation</h1>
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
      if (r.status === "ready") await load();
      else
        setError(
          errorMessages[r.error_code ?? ""] ??
            "This response is unavailable. Refresh to review the current event.",
        );
    } catch {
      setUnknown(true);
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
                <p>The time changed. Can you still make it?</p>
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
  const state = useMyEvents();
  const event = state.items.find((e) => e.id === eventId);
  return (
    <main id="main" tabIndex={-1} className="coord-response">
      <SessionGate>
        {state.loading ? (
          <p role="status">Loading event…</p>
        ) : state.error ? (
          <div role="alert">
            <p>{state.error}</p>
            <Button onClick={state.reload}>Retry</Button>
          </div>
        ) : event?.hosting ? (
          <>
            <span className="eyebrow">Your event</span>
            {event.cover_key !== "none" && (
              <img
                className="coord-response-image"
                src={`images/${event.cover_key}.jpg`}
                alt=""
              />
            )}
            <h1>{event.title || "Untitled event"}</h1>
            <div className="coord-actions">
              <StatusBadge tone="info">You’re hosting</StatusBadge>
              <StatusBadge>
                {event.lifecycle === "CANCELLED"
                  ? "Cancelled"
                  : event.lifecycle === "DRAFT"
                    ? "Draft"
                    : hostingGroup(event) === "History & cancelled"
                      ? "Ended"
                      : "Published"}
              </StatusBadge>
            </div>
            {event.lifecycle === "CANCELLED" && (
              <p className="coord-feedback" role="status">
                This event is cancelled. New participation is unavailable.
              </p>
            )}
            <section className="panel">
              <h2>When & where</h2>
              <p>{when(event.starts_at, event.timezone)}</p>
              {event.ends_at && (
                <p>Ends {when(event.ends_at, event.timezone)}</p>
              )}
              <p className="small muted">{event.timezone}</p>
              <p>{event.venue_label || "Location to be decided"}</p>
            </section>
            <section className="panel">
              <h2>About this event</h2>
              <p className="event-description">
                {event.description || "No description yet."}
              </p>
            </section>
            <p>
              <Link
                className="button primary"
                to={
                  event.lifecycle === "DRAFT"
                    ? `/create/${event.id}`
                    : `/core/events/${event.id}/host`
                }
              >
                {event.lifecycle === "DRAFT" ? "Resume draft" : "Manage event"}
              </Link>
            </p>
            {event.commitment_state && <InvitationContent eventId={event.id} />}
          </>
        ) : (
          <InvitationContent eventId={eventId} />
        )}
      </SessionGate>
    </main>
  );
}
