/* oxlint-disable react/set-state-in-effect -- Effects initiate asynchronous reads from the external backend. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { Button, StatusBadge, TextField } from "../../../packages/ui-web";
import { FocusedWorkspaceShell, WidePortalShell, Modal } from "./shells";
import {
  createParticipantToken,
  hostCommand,
  hostRead,
  rpc,
  supabase,
} from "../../../packages/data/sontu";
import {
  errorMessages,
  providerOutcome,
  settlement,
} from "../../../packages/domain/coordination";
import type {
  HostProjection,
  CommandResult,
} from "../../../packages/domain/coordination";

// A pending request is recovery metadata, never authoritative event state.
function recover<T>(key: string): T | null {
  try {
    return JSON.parse(
      sessionStorage.getItem("sontu-request:" + key) ?? "null",
    ) as T | null;
  } catch {
    return null;
  }
}
function journal(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem("sontu-request:" + key);
    else sessionStorage.setItem("sontu-request:" + key, JSON.stringify(value));
  } catch {
    /* Same-page retries remain available when session storage is unavailable. */
  }
}
const interrupted =
  "A previous request was interrupted. Retry the same request to recover its authoritative outcome.";
const date = (value: string, zone = "America/Toronto") =>
  new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
const label = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());
function Feedback({
  message,
  unknown = false,
  onRetry,
}: {
  message: string;
  unknown?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="coord-feedback" role="alert">
      <strong>{unknown ? "Outcome not confirmed" : "Please review"}</strong>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {unknown ? "Retry same request" : "Refresh"}
        </Button>
      )}
    </div>
  );
}
export function SessionGate({ children }: { children: ReactNode }) {
  const [signed, setSigned] = useState<boolean | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSigned(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSigned(!!session),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  if (signed === null)
    return (
      <div className="panel" role="status">
        Checking your session…
      </div>
    );
  if (signed) return <>{children}</>;
  return (
    <section className="panel coord-auth">
      <span className="eyebrow">Your host workspace</span>
      <h1>Welcome back.</h1>
      <p>
        Sign in to manage your Core Validation events. The design preview
        remains available without signing in.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (error)
              setError("Could not sign in. Check your email and password.");
          } catch {
            setError("Unable to reach sign-in. Please retry.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Feedback message={error} />}
        <Button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
    </section>
  );
}
export function CoreEntry() {
  return (
    <FocusedWorkspaceShell title="Hosting" back="/events?view=Hosting">
      <main id="main" tabIndex={-1} className="coord-entry">
        <SessionGate>
          <CoreEvents />
        </SessionGate>
      </main>
    </FocusedWorkspaceShell>
  );
}
function CoreEvents() {
  const [items, setItems] = useState<
      {
        id: string;
        title: string;
        lifecycle: string;
        starts_at: string;
        timezone: string;
        cover_key: string;
        event_kind: string;
      }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const createOp = useRef<string | null>(recover<string>("create"));
  const load = useCallback(async () => {
    try {
      const r = await rpc<{ status: string; events: typeof items }>(
        "sontu_host_projection",
        { event_id: null },
      );
      setItems(r.events ?? []);
    } catch {
      setError("Could not load your events. Please refresh.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <header className="section-heading">
        <div>
          <span className="eyebrow">Core Validation</span>
          <h1>Bring people together.</h1>
          <Link className="button primary" to="/create">
            Create Event
          </Link>
          <p className="muted">
            A working event, with a clear view of what changes and who needs to
            respond.
          </p>
        </div>
        <Button variant="quiet" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
      </header>
      <section className="panel">
        <h2>Wednesday Community Dinner</h2>
        <p>
          Create a private test draft with twelve synthetic participants and one
          simulated provider. No invitations or messages are sent.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            createOp.current ??= crypto.randomUUID();
            journal("create", createOp.current);
            try {
              const r = await hostCommand(
                "create_fixture",
                null,
                1,
                {},
                createOp.current,
              );
              if (r.status === "ready") {
                createOp.current = null;
                journal("create", null);
                navigate(`/core/events/${r.event_id}/host`);
              } else
                setError(
                  errorMessages[r.error_code ?? ""] ??
                    "Could not create draft.",
                );
            } catch {
              setError(
                "Draft creation is unconfirmed. Retry uses the same request to avoid duplication.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating…" : "Create test event"}
        </Button>
      </section>
      {error && <Feedback message={error} onRetry={() => void load()} />}
      <div className="coord-event-list">
        {items.map((e) => (
          <Link
            key={e.id}
            className="panel coord-event-row"
            to={
              e.event_kind === "SIMPLE" && e.lifecycle === "DRAFT"
                ? `/create/${e.id}`
                : `/core/events/${e.id}/host`
            }
          >
            {e.cover_key !== "none" && (
              <img src={`images/${e.cover_key ?? "food"}.jpg`} alt="" />
            )}
            <div>
              <StatusBadge>{label(e.lifecycle)}</StatusBadge>
              <h2>{e.title || "Untitled event"}</h2>
              <p>
                {e.starts_at ? date(e.starts_at) : "Date to be decided"} ·
                Toronto
              </p>
            </div>
            <ArrowRight aria-hidden="true" />
          </Link>
        ))}
      </div>
    </>
  );
}
interface Action {
  cmd: string;
  input: Record<string, unknown>;
  op: string;
  version: number;
}
export function CoreHost() {
  const { eventId } = useParams();
  return (
    <FocusedWorkspaceShell title="Host Workspace" back="/core">
      <SessionGate>
        <HostContent key={eventId} id={eventId!} />
      </SessionGate>
    </FocusedWorkspaceShell>
  );
}
function HostContent({ id }: { id: string }) {
  const [data, setData] = useState<HostProjection | null>(null),
    [section, setSection] = useState("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(() =>
      recover<Action>(id) ? interrupted : "",
    ),
    [unknown, setUnknown] = useState(() => !!recover<Action>(id)),
    [success, setSuccess] = useState(""),
    [modal, setModal] = useState<string | null>(null),
    [inviteName, setInviteName] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [reason, setReason] = useState(""),
    [time, setTime] = useState(""),
    [description, setDescription] = useState(""),
    [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const pending = useRef<Action | null>(recover<Action>(id));
  const load = useCallback(async () => {
    try {
      const r = await hostRead(id);
      if (r.status === "ready" && r.data) {
        setData(r.data);
        if (!pending.current) setError("");
      } else
        setError(
          errorMessages[r.error_code ?? ""] ?? "This event is unavailable.",
        );
    } catch {
      setError("Unable to refresh event status. Please try again.");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (action: Action) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    pending.current = action;
    journal(id, action);
    try {
      const r = await hostCommand(
        action.cmd,
        id,
        action.version,
        action.input,
        action.op,
      );
      setUnknown(false);
      pending.current = null;
      journal(id, null);
      if (r.status === "ready") {
        setModal(null);
        setSuccess(
          action.cmd === "issue_link"
            ? "Response link ready."
            : "Saved. Event status updated.",
        );
        await load();
        if (r.token) {
          const name =
            data?.participants.find((p) => p.id === action.input.participant_id)
              ?.display_name ??
            inviteName ??
            "Participant";
          setLink({
            name,
            url:
              location.origin +
              location.pathname +
              (data?.event.event_kind === "SIMPLE"
                ? "#/invite/"
                : "#/respond/") +
              r.token,
          });
        }
      } else
        setError(
          errorMessages[r.error_code ?? ""] ??
            "The action could not be completed.",
        );
    } catch {
      setUnknown(true);
      setError(
        "The connection ended before an authoritative result arrived. Retry this same request; it will not create a duplicate change.",
      );
    } finally {
      setBusy(false);
    }
  };
  const act = (cmd: string, input: Record<string, unknown> = {}) => {
    if (data && !pending.current)
      void run({
        cmd,
        input,
        version: data.event.current_version_number,
        op: crypto.randomUUID(),
      });
  };
  const open = (kind: string) => {
    setReason("");
    setModal(kind);
    if (data) {
      setDescription(data.version.description);
      const start = new Date(data.version.starts_at);
      setTime(
        new Date(start.getTime() - start.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16),
      );
    }
  };
  const nav = (
    <nav className="workspace-nav" aria-label="Event workspace modules">
      {["overview", "participants", "history"].map((s) => (
        <button
          key={s}
          aria-current={section === s ? "page" : undefined}
          onClick={() => setSection(s)}
        >
          {label(s)}
        </button>
      ))}
    </nav>
  );
  if (!data)
    return (
      <main id="main" tabIndex={-1} className="coord-entry">
        {error ? (
          <Feedback message={error} onRetry={() => void load()} />
        ) : (
          <p role="status">Loading event…</p>
        )}
      </main>
    );
  const c = data.cases[0],
    responses = data.participants.flatMap((p) =>
      p.response ? [p.response] : [],
    ),
    aggregate = settlement(responses);
  const provider = providerOutcome(
    data.provider,
    data.provider &&
      data.versions.find(
        (v) => v.id === data.provider?.applicable_event_version_id,
      )!.version_number >=
        (data.versions.find((v) => v.materiality_class !== "COSMETIC")
          ?.version_number ?? 1)
      ? data.provider.applicable_event_version_id
      : data.version.id,
  );
  const disabled = busy || unknown;
  return (
    <main id="main" tabIndex={-1} className="host-main">
      <WidePortalShell nav={nav}>
        <header className="workspace-event coord-hero">
          {data.version.cover_key !== "none" && (
            <img
              src={`images/${data.version.cover_key ?? "food"}.jpg`}
              alt=""
            />
          )}
          <div>
            <span className="eyebrow">
              {data.event.event_kind === "SIMPLE"
                ? "Personal event · Host view"
                : "Community · Private test event"}
            </span>
            <h1>{data.version.title}</h1>
            <p>
              {date(data.version.starts_at, data.version.timezone)} ·{" "}
              {data.version.venue_label}
            </p>
            <StatusBadge>{label(data.event.lifecycle)}</StatusBadge>
            <span className="small muted">
              {" "}
              Version {data.event.current_version_number}
            </span>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw size={16} />
            Refresh status
          </Button>
        </header>
        <div className="compact-workspace-nav">{nav}</div>
        {error && (
          <Feedback
            message={error}
            unknown={unknown}
            onRetry={() =>
              unknown && pending.current
                ? void run(pending.current)
                : void load()
            }
          />
        )}
        {success && (
          <p role="status" className="coord-success">
            {success}
          </p>
        )}
        {data.event.lifecycle === "CANCELLED" && (
          <div className="coord-feedback">
            <strong>This event is cancelled.</strong>
            <p>
              Cancellation does not resolve outstanding participant obligations.
            </p>
          </div>
        )}
        {section === "overview" && (
          <>
            <div className="coord-summary">
              <section className="panel">
                <CalendarDays />
                <h2>Current event</h2>
                <p>{date(data.version.starts_at, data.version.timezone)}</p>
                <p className="small muted">
                  {data.version.timezone}
                  {data.version.capacity
                    ? ` · Participation limit ${data.version.capacity}`
                    : ""}
                </p>
                <p>{data.version.description}</p>
                <div className="coord-actions">
                  {data.event.lifecycle === "DRAFT" ? (
                    <Button disabled={disabled} onClick={() => open("publish")}>
                      Publish test event
                    </Button>
                  ) : (
                    data.event.lifecycle === "PUBLISHED" && (
                      <>
                        <Button
                          disabled={disabled}
                          onClick={() => open("change_time")}
                        >
                          Change start time
                        </Button>
                        <Button
                          disabled={disabled}
                          variant="quiet"
                          onClick={() => open("cosmetic_edit")}
                        >
                          Edit description
                        </Button>
                      </>
                    )
                  )}
                </div>
              </section>
              <section className="panel">
                <Clock3 />
                <h2>Participant responses</h2>
                {c ? (
                  <>
                    <strong className="coord-number">
                      {aggregate.terminal} / {aggregate.total}
                    </strong>
                    <p>
                      terminal responses · {aggregate.unresolved} awaiting
                      response
                    </p>
                    <StatusBadge
                      tone={
                        c.disposition === "RESOLVED" ? "success" : "warning"
                      }
                    >
                      {label(c.disposition)}
                    </StatusBadge>
                    {c.predecessor_case_id && (
                      <p className="small muted">
                        Reopened for a newer time. Earlier responses remain in
                        history.
                      </p>
                    )}
                    {c.reason && <p>{c.reason}</p>}
                  </>
                ) : (
                  <p>Reconfirmation has not been required.</p>
                )}
                {data.suggestion?.suggestion_state === "SUGGESTED" && (
                  <>
                    <p>
                      The time changed. Require affected participants to
                      reconfirm or release their commitment?
                    </p>
                    <div className="coord-actions">
                      <Button
                        disabled={disabled}
                        onClick={() => open("accept")}
                      >
                        Require reconfirmation
                      </Button>
                      <Button
                        disabled={disabled}
                        variant="secondary"
                        onClick={() => open("dismiss")}
                      >
                        Not required
                      </Button>
                    </div>
                  </>
                )}
                {data.suggestion?.suggestion_state === "DISMISSED" && (
                  <p>
                    Host chose not to require reconfirmation. This is not
                    evidence that participants confirmed the new time.
                  </p>
                )}
                {c &&
                  ["OPEN_UNRESOLVED", "PENDING_EXTERNAL"].includes(
                    c.disposition,
                  ) && (
                    <div className="coord-actions">
                      <Button
                        disabled={disabled}
                        variant="quiet"
                        onClick={() => open("waive")}
                      >
                        Waive requirement
                      </Button>
                      <Button
                        disabled={disabled}
                        variant="quiet"
                        onClick={() => open("exception")}
                      >
                        Record exception
                      </Button>
                    </div>
                  )}
              </section>
            </div>
            {data.event.event_kind !== "SIMPLE" && (
              <section className="panel coord-provider">
                <div>
                  <span className="eyebrow">External arrangement</span>
                  <h2>Venue service confirmation</h2>
                  <StatusBadge
                    tone={provider === "CONFIRMED" ? "success" : "warning"}
                  >
                    {label(provider)}
                  </StatusBadge>
                  <p>
                    {provider === "CONFIRMED"
                      ? "The simulated provider confirms the current time. No Sontu-managed case is needed."
                      : "Provider confirmation is unresolved. It does not become confirmed because the event was updated."}
                  </p>
                  <p className="small muted">
                    Simulated provider evidence ·{" "}
                    {data.provider
                      ? date(data.provider.authoritative_at)
                      : "No evidence received"}
                  </p>
                </div>
                <details>
                  <summary>Test provider and delivery outcomes</summary>
                  <p className="small muted">
                    These controls run simulated adapters. They send no external
                    messages.
                  </p>
                  <div className="coord-actions">
                    {["CONFIRMED", "UNKNOWN", "PENDING", "FAILED", "STALE"].map(
                      (s) => (
                        <Button
                          key={s}
                          variant="secondary"
                          disabled={disabled}
                          onClick={() =>
                            act("simulate_provider", {
                              provider_status: s,
                              evidence_id: crypto.randomUUID(),
                              authoritative_at: new Date().toISOString(),
                            })
                          }
                        >
                          {label(s)}
                        </Button>
                      ),
                    )}
                  </div>
                  <div className="coord-actions">
                    <Button
                      variant="secondary"
                      disabled={disabled}
                      onClick={() =>
                        act("simulate_delivery", {
                          delivery_status: "DELIVERED",
                        })
                      }
                    >
                      Simulate delivered messages
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={disabled}
                      onClick={() =>
                        act("simulate_delivery", { delivery_status: "FAILED" })
                      }
                    >
                      Simulate delivery failure
                    </Button>
                  </div>
                </details>
              </section>
            )}
            <section className="panel">
              <h2>Message delivery</h2>
              {data.communications.length ? (
                data.communications.map((s) => (
                  <p key={s.dispatch_state}>
                    {s.count} {label(s.dispatch_state).toLowerCase()} ·
                    simulated
                  </p>
                ))
              ) : (
                <p>No material-change messages queued.</p>
              )}
              <p className="muted">
                Delivered messages do not count as participant responses.
              </p>
            </section>
            {data.event.lifecycle === "PUBLISHED" && (
              <Button
                variant="quiet"
                disabled={disabled}
                onClick={() => open("cancel")}
              >
                Cancel event
              </Button>
            )}
          </>
        )}
        {section === "participants" && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>People coming together</h2>
                <p className="muted">
                  {data.event.event_kind === "SIMPLE"
                    ? "Named invitations require the recipient’s verified email. Creating a link does not send an email or confirm participation."
                    : "Twelve synthetic relationships. Response links are private and scoped to one person."}
                </p>
              </div>
            </div>
            {data.event.event_kind === "SIMPLE" &&
              data.event.lifecycle === "PUBLISHED" && (
                <form
                  className="coord-auth"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act("invite_participant", {
                      display_name: inviteName,
                      email: inviteEmail,
                      token: createParticipantToken(),
                    });
                  }}
                >
                  <TextField
                    label="Invitee name"
                    required
                    maxLength={80}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                  <TextField
                    label="Invitee email"
                    type="email"
                    required
                    maxLength={254}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <Button disabled={disabled}>Create invitation link</Button>
                </form>
              )}
            <ul className="coord-participants">
              {data.participants.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.display_name}</strong>
                    {p.invitation_email && (
                      <p className="small muted">
                        {p.invitation_email} ·{" "}
                        {p.invitation_state === "CREATED"
                          ? "Awaiting invitation response"
                          : label(p.invitation_state ?? "")}{" "}
                        {p.link_revoked ? " · Link revoked" : ""}
                      </p>
                    )}
                    <p>
                      {p.response
                        ? label(p.response)
                        : label(p.commitment_state)}
                    </p>
                  </div>
                  <div className="coord-actions">
                    <Button
                      variant="secondary"
                      disabled={disabled}
                      onClick={() =>
                        act("issue_link", {
                          participant_id: p.id,
                          token: createParticipantToken(),
                        })
                      }
                    >
                      Response link
                      <span className="sr-only"> for {p.display_name}</span>
                    </Button>
                    <Button
                      variant="quiet"
                      disabled={disabled}
                      onClick={() =>
                        act("revoke_link", { participant_id: p.id })
                      }
                    >
                      Revoke
                      <span className="sr-only">
                        {" "}
                        link for {p.display_name}
                      </span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {section === "history" && (
          <>
            <section className="panel">
              <h2>Event versions</h2>
              <ol className="coord-history">
                {data.versions.map((v) => (
                  <li key={v.id}>
                    <strong>
                      Version {v.version_number} · {label(v.materiality_class)}
                    </strong>
                    <p>{date(v.starts_at, v.timezone)}</p>
                    <p className="muted">{v.description}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section className="panel">
              <h2>Obligation history</h2>
              {data.cases.length ? (
                data.cases.map((x) => (
                  <p key={x.id}>
                    {label(x.disposition)}
                    {x.predecessor_case_id ? " · successor obligation" : ""}
                    {x.reason ? " · " + x.reason : ""}
                  </p>
                ))
              ) : (
                <p>No managed obligations.</p>
              )}
            </section>
            <section className="panel">
              <h2>Activity and evidence</h2>
              <ol className="coord-history">
                {data.audit.map((a) => (
                  <li key={a.id}>
                    <strong>{label(a.audit_kind)}</strong>
                    <p>{date(a.created_at)}</p>
                    {a.metadata.confirmed === true && (
                      <p className="small muted">
                        Explicit host confirmation recorded
                      </p>
                    )}
                    {a.metadata.is_simulated === true && (
                      <p className="small muted">Simulated adapter</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
        {modal && (
          <Modal title={label(modal)} onClose={() => !busy && setModal(null)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input: Record<string, unknown> = { confirmed: true };
                if (modal === "change_time")
                  input.starts_at = new Date(time).toISOString();
                if (modal === "cosmetic_edit") input.description = description;
                if (["waive", "exception"].includes(modal) && c) {
                  input.case_id = c.id;
                  input.row_version = c.row_version;
                }
                if (["waive", "exception", "dismiss"].includes(modal))
                  input.reason = reason;
                act(modal, input);
              }}
            >
              {modal === "change_time" ? (
                <>
                  <p>
                    Current time:{" "}
                    {date(data.version.starts_at, data.version.timezone)}.
                  </p>
                  <TextField
                    label="New start time (your time zone)"
                    type="datetime-local"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                  <p>
                    Review the new time:{" "}
                    {Number.isFinite(Date.parse(time))
                      ? date(
                          new Date(time).toISOString(),
                          data.version.timezone,
                        )
                      : "Enter a valid time"}{" "}
                    ({data.version.timezone}). Existing commitments may need
                    reconfirmation.
                  </p>
                </>
              ) : modal === "cosmetic_edit" ? (
                <>
                  <TextField
                    label="Description"
                    maxLength={2000}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <p>This description-only edit creates no new obligation.</p>
                </>
              ) : (
                <p>
                  {
                    (
                      {
                        accept:
                          "Require each affected participant to reconfirm or release their commitment for this time?",
                        dismiss:
                          "Record why reconfirmation is not needed. This does not confirm participant availability.",
                        waive:
                          "Waive this obligation without claiming the remaining participants responded?",
                        exception:
                          "Record an exception. This remains visibly different from successful settlement.",
                        cancel:
                          "Cancel this event? Existing unresolved obligations remain visible.",
                        publish:
                          "Publish this synthetic event for your controlled test? No external invitations will be sent.",
                      } as Record<string, string>
                    )[modal]
                  }
                </p>
              )}
              {["waive", "exception", "dismiss"].includes(modal) && (
                <TextField
                  label="Reason"
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
              {error && (
                <Feedback
                  message={error}
                  unknown={unknown}
                  onRetry={() =>
                    unknown && pending.current
                      ? void run(pending.current)
                      : void load()
                  }
                />
              )}
              <div className="coord-actions">
                <Button type="submit" disabled={disabled}>
                  {busy ? "Saving…" : "Confirm"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Go back
                </Button>
              </div>
            </form>
          </Modal>
        )}
        {link && (
          <Modal
            title={`${link.name} response link`}
            onClose={() => setLink(null)}
          >
            <p>
              {data.event.event_kind === "SIMPLE"
                ? "The named recipient must verify their email before viewing or responding. Forwarding this link does not grant another person access. Share it directly with the invitee; no email has been sent."
                : `This link authorizes only ${link.name}’s response. Creating another link replaces the previous one.`}
            </p>
            <a
              className="button primary"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              Open participant response
            </a>
            <TextField
              label="Private response link"
              readOnly
              value={link.url}
            />
            <Button variant="secondary" onClick={() => setLink(null)}>
              Done
            </Button>
          </Modal>
        )}
      </WidePortalShell>
    </main>
  );
}
interface ParticipantView {
  status: string;
  error_code?: string;
  event?: {
    title: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    venue_label: string;
    lifecycle: string;
    current_version: number;
  };
  participant?: {
    display_name: string;
    response: string | null;
    actionable: boolean;
  };
}
export function ParticipantResponse() {
  const { token } = useParams();
  const [data, setData] = useState<ParticipantView | null>(null),
    [error, setError] = useState(() => (recover(token!) ? interrupted : "")),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(() => !!recover(token!));
  const pending = useRef<{
    decision: string;
    expected_version: number;
    operation_id: string;
  } | null>(recover(token!));
  const load = useCallback(async () => {
    try {
      const r = await rpc<ParticipantView>("sontu_participant_access", {
        token,
      });
      setData(r);
      if (r.status === "ready" && !pending.current) setError("");
      if (r.status !== "ready")
        setError(
          errorMessages[r.error_code ?? ""] ?? "This response is unavailable.",
        );
    } catch {
      setError("Unable to load this response. Please retry.");
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  const submit = async (decision: string) => {
    if (!data?.event || busy) return;
    pending.current ??= {
      decision,
      expected_version: data.event.current_version,
      operation_id: crypto.randomUUID(),
    };
    journal(token!, pending.current);
    setBusy(true);
    setError("");
    try {
      const r = await rpc<CommandResult>("sontu_participant_access", {
        token,
        ...pending.current,
      });
      pending.current = null;
      journal(token!, null);
      setUnknown(false);
      if (r.status === "ready") await load();
      else
        setError(
          errorMessages[r.error_code ?? ""] ??
            "Could not record your response.",
        );
    } catch {
      setUnknown(true);
      setError(
        "Your response is not yet confirmed. Retry the same response safely.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main id="main" tabIndex={-1} className="coord-response">
      <span className="eyebrow">Sontu · Event response</span>
      {!data && !error && <p role="status">Loading your event…</p>}
      {error && (
        <Feedback
          message={error}
          unknown={unknown}
          onRetry={() =>
            unknown && pending.current
              ? void submit(pending.current.decision)
              : void load()
          }
        />
      )}
      {data?.event && (
        <>
          <img
            className="coord-response-image"
            src="images/food.jpg"
            alt="Food prepared for a shared dinner"
          />
          <h1>{data.event.title}</h1>
          <p>{date(data.event.starts_at, data.event.timezone)}</p>
          <p className="muted">
            {data.event.venue_label} · {data.event.timezone}
          </p>
          <section className="panel">
            <h2>Hello, {data.participant?.display_name}.</h2>
            {data.event.lifecycle === "CANCELLED" ? (
              <p>This event has been cancelled. No response is requested.</p>
            ) : data.participant?.actionable ? (
              <>
                <p>The event time has changed. Can you still make it?</p>
                <div className="coord-actions">
                  <Button
                    disabled={busy || unknown}
                    onClick={() => void submit("RECONFIRMED")}
                  >
                    I can still make it
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || unknown}
                    onClick={() => void submit("RELEASED_DECLINED")}
                  >
                    I can’t make it
                  </Button>
                </div>
              </>
            ) : data.participant?.response &&
              data.participant.response !== "AWAITING_RESPONSE" ? (
              <div role="status">
                <CheckCircle2 />
                <p>
                  {data.participant.response === "RECONFIRMED"
                    ? "You have reconfirmed for this time."
                    : "Your release has been recorded."}
                </p>
              </div>
            ) : (
              <p>No response is currently required from you.</p>
            )}
          </section>
          <p className="small muted">
            Controlled test · synthetic event. This link only permits your event
            response.
          </p>
        </>
      )}
    </main>
  );
}

export function CoreSignOut({ onBack }: { onBack: () => void }) {
  const [active, setActive] = useState<boolean | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setActive(!!data.session));
  }, []);
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <button className="back-link" onClick={onBack}>
        Back to Profile
      </button>
      <h1>Sign Out</h1>
      {active === null ? (
        <p role="status">Checking your session…</p>
      ) : active ? (
        <>
          <p>You are signed in to the host workspace.</p>
          <Button
            onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) setError("Unable to sign out. Please retry.");
              else setActive(false);
            }}
          >
            Sign out of host account
          </Button>
        </>
      ) : (
        <p>No account is signed in.</p>
      )}
      {error && <Feedback message={error} />}
    </main>
  );
}
