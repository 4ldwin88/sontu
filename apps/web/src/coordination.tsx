import { ChevronLeft } from "lucide-react";
import { instantForWall, wallTime } from "../../../packages/domain/draft";
import { useAccount } from "./account-state";
import { ScheduleEditor } from "./schedule-editor";
import { clientUuid } from "./ids";
/* oxlint-disable react/set-state-in-effect -- Effects initiate asynchronous reads from the external backend. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ImagePlus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button, StatusBadge, TextField } from "../../../packages/ui-web";
import { FocusedWorkspaceShell, WidePortalShell, Modal } from "./shells";
import {
  createParticipantToken,
  checkInParticipant,
  checkInCredential,
  checkInRead,
  changeEventCover,
  closeEvent,
  startEvent,
  eventOperationsCommand,
  eventOperationsRead,
  eventDeliveryRead,
  eventCoverUrl,
  eventMediaBucket,
  dispatchEventEmail,
  sendInvitationEmail,
  eventOwner,
  organizationDetail,
  assignOperationItem,
  hostCommand,
  hostRead,
  rpc,
  resultsRead,
  supabase,
  teamCommand,
  teamRead,
} from "../../../packages/data/sontu";
import type {
  EventDeliverySummary,
  OrganizationMember,
} from "../../../packages/data/sontu";
import { trackBeta } from "../../../packages/data/telemetry";
import {
  canAttemptCheckIn,
  checkInAdmissionLabel,
  duplicateEventDraftInput,
  errorMessages,
  participantExportCsv,
  providerOutcome,
  settlement,
} from "../../../packages/domain/coordination";
import type {
  HostProjection,
  CommandResult,
  EventOperationsProjection,
  CheckInProjection,
  EventResultsProjection,
  EventVersion,
  TeamMember,
  TeamProjection,
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
const date = (value: string | null, zone = "America/Toronto") =>
  value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value))
    : "Schedule not set";
const label = (s: string) =>
  s === "todo"
    ? "To Do"
    : s
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (x) => x.toUpperCase());

const workspaceGroups = [
  { label: "Overview", sections: ["overview"] },
  {
    label: "People",
    sections: [
      "participants",
      "rsvp",
      "seating",
      "accessibility",
      "accommodations",
      "team",
      "check-in",
    ],
  },
  { label: "Plan", sections: ["todo", "resources"] },
  {
    label: "Communications",
    sections: ["questions", "discussion", "assistant"],
  },
  { label: "Insights", sections: ["analytics", "results", "history"] },
] as const;

const workspaceSections = workspaceGroups.flatMap((group) => group.sections);

const versionFingerprint = (version: EventVersion) =>
  JSON.stringify({
    title: version.title,
    description: version.description,
    starts_at: version.starts_at,
    ends_at: version.ends_at,
    timezone: version.timezone,
    venue_label: version.venue_label,
    cover_key: version.cover_key ?? null,
    capacity: version.capacity ?? null,
    materiality_class: version.materiality_class,
  });

function groupedEventVersions(versions: EventVersion[]) {
  return versions.reduce<
    Array<{ version: EventVersion; first: number; last: number; count: number }>
  >((groups, version) => {
    const previous = groups[groups.length - 1];
    if (
      previous &&
      versionFingerprint(previous.version) === versionFingerprint(version)
    ) {
      previous.first = Math.min(previous.first, version.version_number);
      previous.last = Math.max(previous.last, version.version_number);
      previous.count += 1;
      return groups;
    }
    groups.push({
      version,
      first: version.version_number,
      last: version.version_number,
      count: 1,
    });
    return groups;
  }, []);
}

const auditLabel = (kind: string) => {
  const normalized = kind.toLowerCase();
  if (normalized === "join_public_event") return "Participant joined event";
  if (normalized === "join_guest_event") return "Guest joined event";
  if (normalized === "withdraw_public_event")
    return "Participant left event";
  if (normalized === "withdraw_guest_event") return "Guest left event";
  return label(kind);
};
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
  const account = useAccount(),
    location = useLocation();
  if (account.checking)
    return (
      <p role="status" className="panel">
        Checking your session…
      </p>
    );
  if (!account.session)
    return (
      <Navigate
        to={
          "/sign-in?next=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  if (!account.profile)
    return (
      <Navigate
        to={
          "/account/setup?next=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  return <>{children}</>;
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
    [error, setError] = useState("");
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
          <span className="eyebrow">Hosting</span>
          <h1>Bring people together.</h1>
          <Link className="button primary" to="/create">
            Create Event
          </Link>
          <p className="muted">
            A working event, with a clear view of what changes and who needs to
            respond.
          </p>
        </div>
        <Button
          variant="quiet"
          onClick={() => {
            trackBeta("sign_out_attempted", "hosting", {
              source: "host_list",
            });
            void supabase.auth.signOut().then(({ error }) =>
              trackBeta(error ? "sign_out_failed" : "sign_out_succeeded", "hosting", {
                source: "host_list",
              }),
            );
          }}
        >
          Sign out
        </Button>
      </header>
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
              <img src={eventCoverUrl(e.cover_key ?? "food")} alt="" />
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
type HostRsvpQuestion = {
  id?: string;
  prompt: string;
  type: "SINGLE_SELECT" | "SHORT_TEXT";
  required: boolean;
  per_attendee: boolean;
  options: string[];
};
function RsvpFormManager({ eventId }: { eventId: string }) {
  const [questions, setQuestions] = useState<HostRsvpQuestion[]>([]);
  const [responses, setResponses] = useState<
    {
      participant_id: string;
      invitee_name: string;
      attendee_name: string | null;
      question: string;
      answer: string;
      updated_at: string;
    }[]
  >([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const result = await rpc<{ status: string; questions: HostRsvpQuestion[] }>(
      "sontu_rsvp_form",
      { action: "READ", event_id: eventId },
    );
    if (result.status === "ready") setQuestions(result.questions ?? []);
    const summary = await rpc<{ status: string; responses?: typeof responses }>(
      "sontu_rsvp_response_summary",
      { event_id: eventId },
    );
    if (summary.status === "ready") setResponses(summary.responses ?? []);
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = (index: number, patch: Partial<HostRsvpQuestion>) =>
    setQuestions((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  const updateChoice = (
    questionIndex: number,
    choiceIndex: number,
    value: string,
  ) =>
    setQuestions((rows) =>
      rows.map((row, i) =>
        i === questionIndex
          ? {
              ...row,
              options: row.options.map((option, j) =>
                j === choiceIndex ? value : option,
              ),
            }
          : row,
      ),
    );
  const addChoice = (questionIndex: number) =>
    setQuestions((rows) =>
      rows.map((row, i) =>
        i === questionIndex && row.options.length < 12
          ? { ...row, options: [...row.options, ""] }
          : row,
      ),
    );
  const removeChoice = (questionIndex: number, choiceIndex: number) =>
    setQuestions((rows) =>
      rows.map((row, i) =>
        i === questionIndex
          ? {
              ...row,
              options:
                row.options.length > 2
                  ? row.options.filter((_, j) => j !== choiceIndex)
                  : row.options.map((option, j) =>
                      j === choiceIndex ? "" : option,
                    ),
            }
          : row,
      ),
    );
  const save = async () => {
    setBusy(true);
    setMessage("");
    trackBeta("rsvp_form_save_attempted", "hosting", {
      question_count: questions.length,
      choice_question_count: questions.filter((q) => q.type === "SINGLE_SELECT")
        .length,
    });
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_rsvp_form",
        {
          action: "CONFIGURE",
          event_id: eventId,
          operation_id: clientUuid(),
          payload: {
            questions: questions.map(
              ({ prompt, type, required, per_attendee, options }) => ({
                prompt,
                type,
                required,
                per_attendee,
                options:
                  type === "SINGLE_SELECT" ? options.filter(Boolean) : [],
              }),
            ),
          },
        },
      );
      if (result.status !== "ready") throw new Error(result.error_code);
      trackBeta("rsvp_form_save_succeeded", "hosting", {
        question_count: questions.length,
      });
      setMessage("RSVP form saved.");
      await load();
    } catch {
      trackBeta("rsvp_form_save_failed", "hosting", {
        question_count: questions.length,
      });
      setMessage("Check the questions and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <span className="eyebrow">Planning details</span>
      <h2>RSVP form</h2>
      <p className="muted">
        Add only details you will use. Choice questions can apply once per named
        attendee, for example meal selection.
      </p>
      {questions.map((q, index) => (
        <fieldset key={q.id ?? index} className="host-rsvp-question">
          <legend>Question {index + 1}</legend>
          <TextField
            label="Question"
            value={q.prompt}
            maxLength={180}
            onChange={(e) => update(index, { prompt: e.target.value })}
          />
          <label>
            <span>Answer type</span>
            <select
              value={q.type}
              onChange={(e) =>
                update(index, {
                  type: e.target.value as HostRsvpQuestion["type"],
                  per_attendee:
                    e.target.value === "SHORT_TEXT" ? false : q.per_attendee,
                })
              }
            >
              <option value="SINGLE_SELECT">Choose one</option>
              <option value="SHORT_TEXT">Short answer</option>
            </select>
          </label>
          {q.type === "SINGLE_SELECT" && (
            <div className="rsvp-choice-editor">
              <span>Choices</span>
              {q.options.map((option, choiceIndex) => (
                <div className="rsvp-choice-row" key={choiceIndex}>
                  <TextField
                    label={`Choice ${choiceIndex + 1}`}
                    value={option}
                    maxLength={80}
                    onChange={(e) =>
                      updateChoice(index, choiceIndex, e.target.value)
                    }
                  />
                  <Button
                    variant="quiet"
                    onClick={() => removeChoice(index, choiceIndex)}
                    aria-label={`Remove choice ${choiceIndex + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {q.options.length < 12 && (
                <Button variant="secondary" onClick={() => addChoice(index)}>
                  Add choice
                </Button>
              )}
            </div>
          )}
          <label>
            <input
              type="checkbox"
              checked={q.required}
              onChange={(e) => update(index, { required: e.target.checked })}
            />{" "}
            Required
          </label>
          {q.type === "SINGLE_SELECT" && (
            <label>
              <input
                type="checkbox"
                checked={q.per_attendee}
                onChange={(e) =>
                  update(index, { per_attendee: e.target.checked })
                }
              />{" "}
              Ask each named attendee
            </label>
          )}
          <Button
            variant="quiet"
            onClick={() =>
              setQuestions((rows) => rows.filter((_, i) => i !== index))
            }
          >
            Remove question
          </Button>
        </fieldset>
      ))}
      {questions.length < 12 && (
        <Button
          variant="secondary"
          onClick={() =>
            setQuestions((rows) => [
              ...rows,
              {
                prompt: "",
                type: "SINGLE_SELECT",
                required: false,
                per_attendee: false,
                options: ["", ""],
              },
            ])
          }
        >
          Add question
        </Button>
      )}{" "}
      <Button disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save RSVP form"}
      </Button>
      {message && <p role="status">{message}</p>}
      {responses.length > 0 && (
        <>
          <h3>Submitted responses</h3>
          <div className="host-rsvp-responses">
            {responses.map((response) => (
              <p
                key={`${response.participant_id}:${response.attendee_name ?? "primary"}:${response.question}`}
              >
                <strong>
                  {response.attendee_name ?? response.invitee_name}
                </strong>{" "}
                · {response.question}: {response.answer}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
type SeatingTable = {
  id: string;
  label: string;
  capacity: number;
  assigned_count: number;
  assignments: {
    participant_id: string;
    attendee_name: string;
    invitee_name: string;
  }[];
};
function SeatingManager({
  eventId,
  participants,
  hostName,
}: {
  eventId: string;
  participants: HostProjection["participants"];
  hostName: string;
}) {
  const [tables, setTables] = useState<SeatingTable[]>([]),
    [label, setLabel] = useState(""),
    [capacity, setCapacity] = useState("8"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [selectedTable, setSelectedTable] = useState(""),
    [selectedParticipant, setSelectedParticipant] = useState(""),
    [attendeeName, setAttendeeName] = useState("");
  const load = useCallback(async () => {
    const result = await rpc<{ status: string; tables?: SeatingTable[] }>(
      "sontu_event_seating",
      { action: "READ", event_id: eventId },
    );
    if (result.status === "ready") setTables(result.tables ?? []);
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (input: Record<string, unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_event_seating",
        { event_id: eventId, ...input },
      );
      if (result.status !== "ready") throw new Error(result.error_code);
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message === "CAPACITY_FULL"
          ? "That table is full."
          : "The seating change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const confirmed = participants.filter(
    (p) => p.commitment_state === "CONFIRMED",
  );
  const assignable = [
    { id: eventId, display_name: `${hostName} (Host)` },
    ...confirmed,
  ];
  return (
    <section className="panel">
      <span className="eyebrow">Optional event logistics</span>
      <h2>Seating</h2>
      <p className="muted">
        Use simple table assignments when this event needs them. This is
        intentionally not a floorplan editor.
      </p>
      <form
        className="coord-auth"
        onSubmit={(e) => {
          e.preventDefault();
          void act({
            action: "UPSERT_TABLE",
            table_label: label,
            table_capacity: Number(capacity),
          }).then(() => {
            setLabel("");
          });
        }}
      >
        <TextField
          label="Table name"
          value={label}
          required
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
        />
        <TextField
          label="Seats"
          type="number"
          min="1"
          max="100"
          value={capacity}
          required
          onChange={(e) => setCapacity(e.target.value)}
        />
        <Button disabled={busy}>Add table</Button>
      </form>
      {tables.length > 0 && (
        <form
          className="coord-auth"
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              action: "ASSIGN",
              table_id: selectedTable,
              participant_id: selectedParticipant,
              attendee_name: attendeeName,
            }).then(() => setAttendeeName(""));
          }}
        >
          <label>
            <span>Table</span>
            <select
              required
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
            >
              <option value="">Choose table</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} · {table.assigned_count}/{table.capacity}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Attendee</span>
            <select
              required
              value={selectedParticipant}
              onChange={(e) => {
                setSelectedParticipant(e.target.value);
                const person = assignable.find((p) => p.id === e.target.value);
                setAttendeeName(
                  person?.id === eventId ? hostName : (person?.display_name ?? ""),
                );
              }}
            >
              <option value="">Choose attendee</option>
              {assignable.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Name at the table"
            value={attendeeName}
            required
            maxLength={100}
            onChange={(e) => setAttendeeName(e.target.value)}
          />
          <Button disabled={busy}>Assign seat</Button>
        </form>
      )}
      {tables.map((table) => (
        <div key={table.id} className="host-seating-table">
          <div>
            <h3>{table.label}</h3>
            <p className="small muted">
              {table.assigned_count} of {table.capacity} seats assigned
            </p>
          </div>
          <Button
            variant="quiet"
            disabled={busy}
            onClick={() =>
              void act({ action: "DELETE_TABLE", table_id: table.id })
            }
          >
            Remove table
          </Button>
          {table.assignments.map((assignment) => (
            <p key={`${assignment.participant_id}:${assignment.attendee_name}`}>
              <strong>{assignment.attendee_name}</strong>
              {assignment.attendee_name !== assignment.invitee_name &&
                ` · invited by ${assignment.invitee_name}`}{" "}
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "UNASSIGN",
                    participant_id: assignment.participant_id,
                    attendee_name: assignment.attendee_name,
                  })
                }
              >
                Remove
              </Button>
            </p>
          ))}
        </div>
      ))}
      {tables.length === 0 && (
        <p className="muted">
          No tables added. Most events will not need this.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

type OperationalAnalytics = {
  status: string;
  error_code?: string;
  lifecycle: string;
  capacity: number | null;
  rsvp: { confirmed: number; reserved_places: number; remaining_places: number | null; awaiting: number; declined_or_withdrawn: number };
  invitations: {
    created: number;
    accepted: number;
    declined: number;
    active_links: number;
  };
  delivery: { pending: number; sent: number; failed: number };
  admissions: { valid: number; used: number; invalid: number; pending: number };
  check_in: { checked_in: number };
};
type CredentialLifecycle = {
  status: string;
  counts: { active: number; revoked: number; expired: number };
};
function HostOperationalAnalytics({ eventId }: { eventId: string }) {
  const [data, setData] = useState<OperationalAnalytics | null>(null);
  const [credentials, setCredentials] = useState<CredentialLifecycle | null>(null);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const result = await rpc<OperationalAnalytics>(
        "sontu_host_operational_analytics",
        { event_id: eventId },
      );
      if (result.status !== "ready") throw new Error(result.error_code);
      if (request !== latestRequest.current) return;
      setData(result);
      setError("");
    } catch {
      if (request !== latestRequest.current) return;
      setError(
        "Operational analytics are unavailable. No estimates are shown.",
      );
    }
  }, [eventId]);
  const loadCredentials = useCallback(async () => {
    try {
      const result = await rpc<CredentialLifecycle>(
        "sontu_host_credential_lifecycle_projection",
        { event_id: eventId },
      );
      if (result.status === "ready") setCredentials(result);
    } catch {
      setCredentials(null);
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);
  if (error) return <Feedback message={error} onRetry={() => void load()} />;
  if (!data) return <p role="status">Loading operational analytics…</p>;
  const groups = [
    [
      "RSVP",
      [
        ["Confirmed", data.rsvp.confirmed],
        ["Reserved places", data.rsvp.reserved_places],
        ["Awaiting", data.rsvp.awaiting],
        ["Declined / withdrawn", data.rsvp.declined_or_withdrawn],
      ],
    ],
    [
      "Invitations",
      [
        ["Created", data.invitations.created],
        ["Accepted", data.invitations.accepted],
        ["Declined", data.invitations.declined],
        ["Active links", data.invitations.active_links],
      ],
    ],
    [
      "Delivery",
      [
        ["Sent", data.delivery.sent],
        ["Pending", data.delivery.pending],
        ["Failed", data.delivery.failed],
      ],
    ],
    [
      "Admissions & check-in",
      [
        ["Valid", data.admissions.valid],
        ["Used", data.admissions.used],
        ["Pending", data.admissions.pending],
        ["Invalid", data.admissions.invalid],
        ["Checked in", data.check_in.checked_in],
      ],
    ],
    ...(credentials
      ? [[
          "Credentials",
          [
            ["Active", credentials.counts.active],
            ["Revoked", credentials.counts.revoked],
            ["Expired", credentials.counts.expired],
          ],
        ] as const]
      : []),
  ] as const;
  return (
    <section className="panel" aria-labelledby="operational-analytics-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Live operational records</span>
          <h2 id="operational-analytics-heading">Analytics</h2>
          <p className="muted">
            Counts come directly from RSVPs, invitations, delivery records,
            admissions and check-ins. No estimated reach or fabricated
            conversion data.
          </p>
        </div>
        <Button variant="secondary" onClick={() => { void load(); void loadCredentials(); }}>
          Refresh
        </Button>
      </div>
      {data.capacity !== null && (
        <p>
          <strong>
            {data.rsvp.reserved_places} of {data.capacity}
          </strong>{" "}
          attendee places reserved
        </p>
      )}
      {groups.map(([title, items]) => (
        <section key={title} className="host-analytics-group">
          <h3>{title}</h3>
          <div className="host-stat-grid">
            {items.map(([name, value]) => (
              <div key={name}>
                <strong>{value}</strong>
                <span>{name}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function BoundedEventAssistant({ data }: { data: HostProjection }) {
  const [draft, setDraft] = useState("");
  const canDraft = !["CANCELLED", "COMPLETED"].includes(data.event.lifecycle);
  const confirmed = data.participants.filter(
    (p) => p.commitment_state === "CONFIRMED",
  ).length;
  const awaiting = data.participants.filter(
    (p) =>
      p.commitment_state === "NO_COMMITMENT" &&
      p.invitation_state === "CREATED" &&
      !p.link_revoked,
  ).length;
  const failedDelivery = data.communications
    .filter(
      (item) =>
        item.dispatch_state.includes("FAILED") ||
        item.dispatch_state === "CONFIGURATION_UNAVAILABLE",
    )
    .reduce((total, item) => total + item.count, 0);
  const flags = [
    failedDelivery > 0
      ? `${failedDelivery} message${failedDelivery === 1 ? "" : "s"} need delivery review.`
      : null,
    awaiting > 0
      ? `${awaiting} invitation${awaiting === 1 ? " is" : "s are"} still awaiting a response.`
      : null,
    data.event.lifecycle === "IN_PROGRESS" &&
    (data.admission_summary?.valid ?? 0) > 0
      ? `${data.admission_summary?.valid ?? 0} valid admission${data.admission_summary?.valid === 1 ? " remains" : "s remain"} available for check-in.`
      : null,
    data.event.lifecycle === "CANCELLED"
      ? "This event is cancelled. Do not send reminders or make access assumptions."
      : null,
    data.event.lifecycle === "COMPLETED"
      ? "This event is completed. Drafting is paused."
      : null,
  ].filter((item): item is string => !!item);
  const makeDraft = () => {
    if (!canDraft) return;
    setDraft(
      `Reminder: ${data.version.title}\n${date(data.version.starts_at, data.version.timezone)}\n${data.version.venue_label}\n\nYou’re receiving this because you’re connected to this event. Please review the event page for the latest details.`,
    );
  };
  return (
    <section className="panel" aria-labelledby="assistant-heading">
      <span className="eyebrow">Bounded assistance</span>
      <h2 id="assistant-heading">Event assistant</h2>
      <p className="muted">
        This workspace can draft, summarize and flag. It cannot publish, message
        guests, charge, refund, change access, or settle obligations.
      </p>
      <section>
        <h3>Summary</h3>
        <p>
          {confirmed} confirmed · {awaiting} awaiting response ·{" "}
          {data.admission_summary?.used ?? 0} checked in
        </p>
      </section>
      <section>
        <h3>Flags</h3>
        {flags.length ? (
          <ul>
            {flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            No operational flags from the available records.
          </p>
        )}
      </section>
      <section>
        <h3>Draft</h3>
        <Button variant="secondary" onClick={makeDraft} disabled={!canDraft}>
          Draft event reminder
        </Button>
        {!canDraft && (
          <p className="small muted">
            Reminder drafting is unavailable after an event is cancelled or
            completed.
          </p>
        )}
        {draft && (
          <>
            <label className="field">
              <span>Editable draft</span>
              <textarea
                rows={7}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <p className="small muted">Nothing is sent automatically.</p>
          </>
        )}
      </section>
    </section>
  );
}
function AccommodationManager({ eventId }: { eventId: string }) {
  const { team } = useTeam(eventId);
  const [requests, setRequests] = useState<
      {
        id: string;
        participant_name: string;
        content: string;
        status: string;
        updated_at: string;
      }[]
    >([]),
    [staffIds, setStaffIds] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const result = await rpc<{
      status: string;
      requests?: typeof requests;
      staff_user_ids?: string[];
    }>("sontu_event_accommodations", { action: "READ", event_id: eventId });
    if (result.status === "ready") {
      setRequests(result.requests ?? []);
      setStaffIds(result.staff_user_ids ?? []);
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const acknowledge = async (id: string) => {
    try {
      const result = await rpc<{ status: string }>(
        "sontu_event_accommodations",
        { action: "ACKNOWLEDGE", event_id: eventId, request_id: id },
      );
      if (result.status === "ready") await load();
      else setMessage("The request could not be updated.");
    } catch {
      setMessage("The request could not be updated.");
    }
  };
  const setStaff = async (userId: string, grant: boolean) => {
    try {
      const result = await rpc<{ status: string }>(
        "sontu_event_accommodations",
        {
          action: grant ? "GRANT_STAFF" : "REVOKE_STAFF",
          event_id: eventId,
          staff_user_id: userId,
        },
      );
      if (result.status === "ready") await load();
      else setMessage("Staff access could not be updated.");
    } catch {
      setMessage("Staff access could not be updated.");
    }
  };
  return (
    <section className="panel">
      <span className="eyebrow">Private operational information</span>
      <h2>Accommodation requests</h2>
      <p className="muted">
        Only you and explicitly assigned event staff can view these requests.
        Content is automatically deleted 30 days after the event; do not copy it
        into general event notes.
      </p>
      {team?.members.length ? (
        <div className="host-rsvp-responses">
          <strong>Assigned staff</strong>
          <p className="small muted">
            Choose only teammates who need this information to support guests.
          </p>
          {team.members.map((member) => (
            <label className="check-row" key={member.id}>
              <input
                type="checkbox"
                checked={staffIds.includes(member.user_id)}
                onChange={(e) =>
                  void setStaff(member.user_id, e.target.checked)
                }
              />
              <span>
                {member.display_name} · {teamRoleLabel(member.role)}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="small muted">
          Add a teammate first if someone else needs access.
        </p>
      )}
      {requests.length ? (
        requests.map((request) => (
          <div className="host-rsvp-responses" key={request.id}>
            <strong>{request.participant_name}</strong>
            <p>{request.content}</p>
            <p className="small muted">{label(request.status)}</p>
            {request.status === "OPEN" && (
              <Button
                variant="secondary"
                onClick={() => void acknowledge(request.id)}
              >
                Mark acknowledged
              </Button>
            )}
          </div>
        ))
      ) : (
        <p className="muted">No active requests.</p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function AccessibilityManager({ eventId }: { eventId: string }) {
  const [info, setInfo] = useState({
      step_free_entry: false,
      accessible_washroom: false,
      seating_available: false,
      quiet_space_available: false,
      public_notes: "",
    }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await rpc<{ status: string; information?: typeof info }>(
      "sontu_event_accessibility",
      { action: "READ", event_id: eventId },
    );
    if (r.status === "ready" && r.information) setInfo(r.information);
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ status: string }>("sontu_event_accessibility", {
        action: "SAVE",
        event_id: eventId,
        payload: info,
      });
      setMessage(
        r.status === "ready"
          ? "Accessibility information saved."
          : "Could not save accessibility information.",
      );
    } catch {
      setMessage("Could not save accessibility information.");
    } finally {
      setBusy(false);
    }
  };
  const toggles: [keyof typeof info, string][] = [
    ["step_free_entry", "Step-free entry"],
    ["accessible_washroom", "Accessible washroom"],
    ["seating_available", "Seating available"],
    ["quiet_space_available", "Quiet space available"],
  ];
  return (
    <section className="panel">
      <span className="eyebrow">Event information</span>
      <h2>Accessibility</h2>
      <p className="muted">
        Share only confirmed venue or event arrangements. Guests can still send
        a private request when their needs are not covered here.
      </p>
      {toggles.map(([key, text]) => (
        <label className="check-row" key={key}>
          <input
            type="checkbox"
            checked={!!info[key]}
            onChange={(e) =>
              setInfo((current) => ({ ...current, [key]: e.target.checked }))
            }
          />
          <span>{text}</span>
        </label>
      ))}
      <label className="field">
        <span>
          Additional accessibility details{" "}
          <small className="muted">Optional</small>
        </span>
        <textarea
          maxLength={1000}
          rows={4}
          value={info.public_notes}
          onChange={(e) =>
            setInfo((current) => ({ ...current, public_notes: e.target.value }))
          }
          placeholder="For example: entry route, parking, or a contact point for arrival support."
        />
      </label>
      <Button disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save accessibility information"}
      </Button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function CoreHost() {
  const { eventId } = useParams();
  return (
    <FocusedWorkspaceShell title="Host Workspace" back="/events?view=Hosting">
      <SessionGate>
        <HostContent key={eventId} id={eventId!} />
      </SessionGate>
    </FocusedWorkspaceShell>
  );
}
function HostContent({ id }: { id: string }) {
  const covers = ["food", "sunset", "music", "market", "yoga", "sailing"];
  const account = useAccount();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const requestedSection = new URLSearchParams(routeLocation.search).get("section");
  const initialSection =
    requestedSection &&
    workspaceSections.includes(
      requestedSection as (typeof workspaceSections)[number],
    )
      ? requestedSection
      : "overview";
  const [editSource, setEditSource] = useState<HostProjection | null>(null);
  const [data, setData] = useState<HostProjection | null>(null),
    [delivery, setDelivery] = useState<EventDeliverySummary[]>([]),
    [deliveryRecipients, setDeliveryRecipients] = useState<
      { name: string; kind: string; state: string }[]
    >([]),
    [deliveryBusy, setDeliveryBusy] = useState(false),
    [participationAccess, setParticipationAccess] = useState<
      "ANYONE" | "SONTU_USERS_ONLY" | null
    >(null),
    [eventVisibility, setEventVisibility] = useState<
      "PUBLIC" | "UNLISTED" | "PRIVATE" | null
    >(null),
    [participationBusy, setParticipationBusy] = useState(false),
    [section, setSection] = useState(initialSection),
    [guestQuery, setGuestQuery] = useState(""),
    [guestFilter, setGuestFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(() =>
      recover<Action>(id) ? interrupted : "",
    ),
    [unknown, setUnknown] = useState(() => !!recover<Action>(id)),
    [success, setSuccess] = useState(""),
    [modal, setModal] = useState<string | null>(null),
    [copyMessage, setCopyMessage] = useState(""),
    [inviteName, setInviteName] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [reason, setReason] = useState(""),
    [time, setTime] = useState(""),
    [description, setDescription] = useState(""),
    [link, setLink] = useState<{
      name: string;
      url: string;
      email?: string;
      token: string;
    } | null>(null),
    [inviteEmailBusy, setInviteEmailBusy] = useState(false),
    [coverUploadBusy, setCoverUploadBusy] = useState(false),
    [joinInfo, setJoinInfo] = useState(""),
    [joinInfoBusy, setJoinInfoBusy] = useState(false),
    [duplicateBusy, setDuplicateBusy] = useState(false);
  const pending = useRef<Action | null>(recover<Action>(id));
  const downloadParticipants = () => {
    if (!data) return;
    const csv = participantExportCsv(data.participants, { includeEmail: true });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle =
      data.version.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "event";
    link.href = url;
    link.download = `${safeTitle}-participants.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSuccess("Participant export downloaded.");
  };
  const duplicateEvent = async () => {
    if (!data || duplicateBusy) return;
    setDuplicateBusy(true);
    setError("");
    setSuccess("");
    try {
      const created = await hostCommand(
        "create_draft",
        null,
        null,
        { timezone: data.version.timezone || "UTC" },
        clientUuid(),
      );
      if (created.status !== "ready" || !created.event_id) {
        setError(
          errorMessages[created.error_code ?? ""] ??
            "The duplicate draft could not be created.",
        );
        return;
      }
      const saved = await hostCommand(
        "save_draft",
        created.event_id,
        created.current_version ?? 1,
        duplicateEventDraftInput(data.version),
        clientUuid(),
      );
      if (saved.status !== "ready") {
        setError(
          errorMessages[saved.error_code ?? ""] ??
            "The duplicate draft was created, but its copied details could not be saved.",
        );
        return;
      }
      navigate(`/create/${created.event_id}`, { replace: false });
    } catch {
      setError(
        "The duplicate draft outcome could not be confirmed. Refresh your drafts before trying again.",
      );
    } finally {
      setDuplicateBusy(false);
    }
  };
  const uploadEventCover = async (file: File | null) => {
    if (!file || !account.session || !data || coverUploadBusy) return;
    setError("");
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPG, PNG, GIF, or WebP image under 5 MB.");
      return;
    }
    setCoverUploadBusy(true);
    try {
      const ext = (
        file.name.split(".").pop() ||
        file.type.split("/").pop() ||
        "jpg"
      )
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 8);
      const path = `${account.session.user.id}/${id}/cover-${clientUuid()}.${ext || "jpg"}`;
      const { error } = await supabase.storage.from(eventMediaBucket).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      await run({
        cmd: "change_cover",
        input: { cover_key: `upload:${path}` },
        version: data.event.current_version_number,
        op: clientUuid(),
      });
    } catch {
      setError("The cover image could not be uploaded. Try a different image.");
    } finally {
      setCoverUploadBusy(false);
    }
  };
  const load = useCallback(async () => {
    try {
      const [
        r,
        deliveryResult,
        recipientResult,
        participationResult,
        visibilityResult,
        joinInfoResult,
      ] = await Promise.all([
        hostRead(id),
        eventDeliveryRead(id).catch(() => null),
        rpc<{
          status: string;
          recipients?: { name: string; kind: string; state: string }[];
        }>("sontu_event_delivery_recipients", { event_id: id }).catch(
          () => null,
        ),
        rpc<{
          status: string;
          participation_access?: "ANYONE" | "SONTU_USERS_ONLY";
        }>("sontu_event_participation_access", {
          action: "read",
          event_id: id,
          value: null,
        }).catch(() => null),
        rpc<{ status: string; visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE" }>(
          "sontu_event_visibility",
          { action: "read", event_id: id, value: null },
        ).catch(() => null),
        rpc<{
          status: string;
          protected_join_info?: string | null;
        }>("sontu_event_join_info", {
          action: "read",
          event_id: id,
          value: null,
          operation_id: null,
          manage_token: null,
        }).catch(() => null),
      ]);
      if (r.status === "ready" && r.data) {
        setData(r.data);
        if (deliveryResult?.status === "ready")
          setDelivery(deliveryResult.summary ?? []);
        if (recipientResult?.status === "ready")
          setDeliveryRecipients(recipientResult.recipients ?? []);
        if (
          participationResult?.status === "ready" &&
          participationResult.participation_access
        )
          setParticipationAccess(participationResult.participation_access);
        if (visibilityResult?.status === "ready" && visibilityResult.visibility)
          setEventVisibility(visibilityResult.visibility);
        if (joinInfoResult?.status === "ready")
          setJoinInfo(joinInfoResult.protected_join_info ?? "");
        if (!pending.current) setError("");
      } else
        setError(
          errorMessages[r.error_code ?? ""] ?? "This event is unavailable.",
        );
    } catch {
      setError("Unable to refresh event status. Please try again.");
    }
  }, [id, setError]);
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
    if (action.cmd === "issue_link" || action.cmd === "revoke_link") {
      trackBeta(
        action.cmd === "issue_link"
          ? "host_link_issue_attempted"
          : "host_link_revoke_attempted",
        "hosting",
        {
          event_id: id,
          participant_id:
            typeof action.input.participant_id === "string"
              ? action.input.participant_id
              : null,
        },
      );
    }
    try {
      const r =
        action.cmd === "change_cover"
          ? await changeEventCover(
              id,
              action.version,
              String(action.input.cover_key),
              action.op,
            )
          : await hostCommand(
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
        if (action.cmd === "issue_link" || action.cmd === "revoke_link") {
          trackBeta(
            action.cmd === "issue_link"
              ? "host_link_issue_succeeded"
              : "host_link_revoke_succeeded",
            "hosting",
            {
              event_id: id,
              participant_id:
                typeof action.input.participant_id === "string"
                  ? action.input.participant_id
                  : null,
            },
          );
        }
        setModal(null);
        const successMessage =
          action.cmd === "issue_link"
            ? "Private response link issued. Share the new link with this guest."
            : action.cmd === "revoke_link"
              ? "Private response link revoked. This does not remove the RSVP."
              : "Saved. Event status updated.";
        setSuccess(
          successMessage,
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
            email:
              action.cmd === "invite_participant"
                ? String(action.input.email)
                : data?.participants.find(
                    (p) => p.id === action.input.participant_id,
                  )?.invitation_email,
            token: r.token,
            url:
              location.origin +
              location.pathname +
              (data?.event.event_kind === "SIMPLE"
                ? "#/invite/"
                : "#/respond/") +
              r.token,
          });
        }
      } else {
        if (action.cmd === "issue_link" || action.cmd === "revoke_link") {
          trackBeta(
            action.cmd === "issue_link"
              ? "host_link_issue_failed"
              : "host_link_revoke_failed",
            "hosting",
            {
              event_id: id,
              participant_id:
                typeof action.input.participant_id === "string"
                  ? action.input.participant_id
                  : null,
              error_code: r.error_code ?? null,
            },
          );
        }
        setError(
          errorMessages[r.error_code ?? ""] ??
            "The action could not be completed.",
        );
        if (r.error_code === "STALE_CONFLICT") {
          await load();
          setError(
            "This event changed while you were editing. Close this form and reopen it to review the latest details.",
          );
        }
      }
    } catch {
      if (action.cmd === "issue_link" || action.cmd === "revoke_link") {
        trackBeta(
          action.cmd === "issue_link"
            ? "host_link_issue_failed"
            : "host_link_revoke_failed",
          "hosting",
          {
            event_id: id,
            participant_id:
              typeof action.input.participant_id === "string"
                ? action.input.participant_id
                : null,
            error_code: "UNKNOWN_CONNECTION_STATE",
          },
        );
      }
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
        op: clientUuid(),
      });
  };
  async function removeParticipantRsvp(participant: {
    id: string;
    display_name: string;
  }) {
    if (busy) return;
    trackBeta("host_rsvp_remove_attempted", "hosting", {
      event_id: id,
      participant_id: participant.id,
    });
    if (
      !window.confirm(
        `Remove ${participant.display_name}'s RSVP? They will no longer be counted as going.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_host_participant_rsvp",
        {
          event_id: id,
          participant_id: participant.id,
          action: "REJECT",
          operation_id: clientUuid(),
        },
      );
      if (result.status !== "ready") {
        setError(
          errorMessages[result.error_code ?? ""] ??
            "The RSVP could not be removed.",
        );
        trackBeta("host_rsvp_remove_failed", "hosting", {
          event_id: id,
          participant_id: participant.id,
          error_code: result.error_code ?? null,
        });
        return;
      }
      trackBeta("host_rsvp_remove_succeeded", "hosting", {
        event_id: id,
        participant_id: participant.id,
      });
      setSuccess("RSVP removed.");
      await load();
    } catch {
      setError("The RSVP could not be removed.");
      trackBeta("host_rsvp_remove_failed", "hosting", {
        event_id: id,
        participant_id: participant.id,
        step: "transport",
      });
    } finally {
      setBusy(false);
    }
  }
  const updateParticipationAccess = async (
    value: "ANYONE" | "SONTU_USERS_ONLY",
  ) => {
    if (participationBusy || value === participationAccess) return;
    setParticipationBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await rpc<{
        status: string;
        error_code?: string;
        participation_access?: "ANYONE" | "SONTU_USERS_ONLY";
      }>("sontu_event_participation_access", {
        action: "write",
        event_id: id,
        value,
      });
      if (result.status !== "ready") {
        setError(
          errorMessages[result.error_code ?? ""] ??
            "The RSVP access setting could not be changed.",
        );
        return;
      }
      setParticipationAccess(result.participation_access ?? value);
      setSuccess(
        value === "ANYONE"
          ? "Guest RSVP is now available to anyone on the public event page."
          : "Future RSVPs now require a Sontu account. Existing RSVPs are unchanged.",
      );
    } catch {
      setError(
        "The RSVP access outcome could not be confirmed. Refresh before trying again.",
      );
    } finally {
      setParticipationBusy(false);
    }
  };
  const beginEvent = async () => {
    if (
      busy ||
      !data ||
      !window.confirm(
        "Start this event now? Check-in will open and new RSVPs will close.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await startEvent(id);
      if (result.status !== "ready") {
        setError(
          errorMessages[result.error_code ?? ""] ??
            "The event could not be started.",
        );
        return;
      }
      setSuccess("Event started. Check-in is now open and RSVPs are closed.");
      await load();
    } catch {
      setError(
        "The start result could not be confirmed. Refresh before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const open = (kind: string) => {
    setError("");
    setSuccess("");
    setEditSource(data);
    setReason("");
    setModal(kind);
    if (data) {
      setDescription(data.version.description);
      setTime(wallTime(data.version.starts_at, data.version.timezone));
    }
  };
  const nav = (
    <div className="workspace-navigation">
      <nav className="workspace-nav" aria-label="Event workspace categories">
        {workspaceGroups.map((group) => {
          const active = group.sections.some((item) => item === section);
          return (
            <button
              key={group.label}
              aria-current={active ? "page" : undefined}
              onClick={() => setSection(group.sections[0])}
            >
              {group.label}
            </button>
          );
        })}
      </nav>
      <nav className="workspace-subnav" aria-label="Current workspace tools">
        {workspaceGroups
          .find((group) => group.sections.some((item) => item === section))
          ?.sections.map((item) => (
            <button
              key={item}
              aria-current={section === item ? "page" : undefined}
              onClick={() => setSection(item)}
            >
              {label(item)}
            </button>
          ))}
      </nav>
    </div>
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
  const hostName =
    account.profile?.display_name || account.profile?.first_name || "You";
  const hostGoing =
    data.event.event_kind === "SIMPLE" && data.event.lifecycle === "PUBLISHED";
  const isSelf = (p: { invitation_email?: string }) =>
    data.event.event_kind === "SIMPLE" &&
    !!p.invitation_email &&
    p.invitation_email.toLowerCase() ===
      account.session?.user.email?.toLowerCase();
  const showHost =
    data.event.event_kind === "SIMPLE" &&
    (guestFilter === "all" || (guestFilter === "attending" && hostGoing)) &&
    `${hostName} host`.toLowerCase().includes(guestQuery.trim().toLowerCase());
  const visibleGuests = data.participants.filter((p) => {
    if (isSelf(p)) return false;
    const matches = `${p.display_name} ${p.invitation_email ?? ""}`
      .toLowerCase()
      .includes(guestQuery.trim().toLowerCase());
    return (
      matches &&
      (guestFilter === "all" ||
        (guestFilter === "attending" && p.commitment_state === "CONFIRMED") ||
        (guestFilter === "pending" &&
          p.invitation_state === "CREATED" &&
          p.commitment_state === "NO_COMMITMENT" &&
          !p.link_revoked) ||
        (guestFilter === "declined" &&
          (p.invitation_state === "DECLINED" ||
            p.commitment_state === "RELEASED_DECLINED")))
    );
  });
  const disabled = busy || unknown;
  const sendQueuedEmail = async () => {
    if (deliveryBusy) return;
    setDeliveryBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await dispatchEventEmail(id);
      setSuccess(
        result.status === "configuration_unavailable"
          ? `Email is not configured yet. ${result.processed} queued message${result.processed === 1 ? "" : "s"} remains visible as not sent.`
          : result.processed === 0
            ? "No queued event emails need delivery."
            : `${result.sent ?? 0} event email${result.sent === 1 ? "" : "s"} sent${result.failed ? `; ${result.failed} needs a retry.` : "."}`,
      );
      await load();
    } catch {
      setError(
        "The delivery request could not be confirmed. Refresh to see the authoritative delivery state.",
      );
    } finally {
      setDeliveryBusy(false);
    }
  };
  const saveJoinInfo = async () => {
    if (joinInfoBusy) return;
    setJoinInfoBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_event_join_info",
        {
          action: "write",
          event_id: id,
          value: joinInfo,
          operation_id: clientUuid(),
          manage_token: null,
        },
      );
      if (result.status !== "ready") {
        setError(
          errorMessages[result.error_code ?? ""] ??
            "Protected join details could not be saved.",
        );
        return;
      }
      setSuccess("Protected join details saved.");
    } catch {
      setError(
        "Protected join details could not be confirmed. Refresh and try again.",
      );
    } finally {
      setJoinInfoBusy(false);
    }
  };
  return (
    <main
      id="main"
      tabIndex={-1}
      className={`host-main ${data.event.event_kind === "SIMPLE" ? "simple-host" : ""}`}
    >
      <WidePortalShell nav={nav}>
        <header
          className={`workspace-event coord-hero${data.version.cover_key === "none" ? " no-cover" : ""}`}
        >
          {data.version.cover_key !== "none" && (
            <img
              src={eventCoverUrl(data.version.cover_key ?? "food")}
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
          <div className="host-header-actions">
            {data.event.event_kind === "SIMPLE" && (
              <Link className="button secondary" to={`/my-events/${id}`}>
                View event
              </Link>
            )}
            {data.event.event_kind === "SIMPLE" && (
              <Button
                disabled={disabled || duplicateBusy}
                variant="secondary"
                onClick={() => void duplicateEvent()}
              >
                {duplicateBusy ? "Copying..." : "Duplicate"}
              </Button>
            )}
            {data.event.event_kind === "SIMPLE" &&
              data.event.lifecycle !== "CANCELLED" && (
                <Button
                  disabled={disabled}
                  variant="secondary"
                  onClick={() => setModal("change_cover")}
                >
                  <ImagePlus size={18} /> Change picture
                </Button>
              )}
            <button
              type="button"
              className="icon-button host-refresh"
              aria-label="Refresh status"
              title="Refresh status"
              onClick={() => void load()}
            >
              <RefreshCw size={20} />
            </button>
          </div>
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
            {data.event.event_kind === "SIMPLE" && (
              <>
                <section
                  className="host-status-strip"
                  aria-label="Event status"
                >
                  <CalendarDays size={24} />
                  <div>
                    <span className="small muted">Event status</span>
                    <strong>
                      {unknown
                        ? "Update unconfirmed"
                        : data.event.lifecycle === "CANCELLED"
                          ? "Cancelled"
                          : data.suggestion?.suggestion_state === "SUGGESTED" ||
                              (c && aggregate.unresolved > 0)
                            ? "Needs your attention"
                            : label(data.event.lifecycle)}
                    </strong>
                  </div>
                </section>
                {data.event.lifecycle === "PUBLISHED" &&
                  (eventVisibility === "PUBLIC" ||
                    eventVisibility === "UNLISTED") &&
                  participationAccess && (
                    <section className="panel host-rsvp-access">
                      <div className="section-heading">
                        <div>
                          <h2>Public RSVP access</h2>
                          <p className="small muted">
                            This controls future RSVPs. It does not change or
                            remove people already going.
                          </p>
                        </div>
                        <StatusBadge tone="info">
                          {participationAccess === "ANYONE"
                            ? "Guests allowed"
                            : "Accounts required"}
                        </StatusBadge>
                      </div>
                      <div className="coord-actions">
                        <Button
                          disabled={disabled || participationBusy}
                          variant={
                            participationAccess === "ANYONE"
                              ? "secondary"
                              : "primary"
                          }
                          onClick={() =>
                            void updateParticipationAccess("ANYONE")
                          }
                        >
                          Anyone can RSVP
                        </Button>
                        <Button
                          disabled={disabled || participationBusy}
                          variant={
                            participationAccess === "SONTU_USERS_ONLY"
                              ? "secondary"
                              : "quiet"
                          }
                          onClick={() =>
                            void updateParticipationAccess("SONTU_USERS_ONLY")
                          }
                        >
                          Sontu users only
                        </Button>
                      </div>
                    </section>
                  )}
                {data.event.lifecycle === "PUBLISHED" && (
                  <section className="panel host-rsvp-access">
                    <div className="section-heading">
                      <div>
                        <h2>Ready to begin?</h2>
                        <p className="small muted">
                          Starting opens check-in and closes all new RSVPs. You
                          can complete the event after operations are
                          reconciled.
                        </p>
                      </div>
                      <Button
                        disabled={disabled}
                        onClick={() => void beginEvent()}
                      >
                        Start event
                      </Button>
                    </div>
                  </section>
                )}
                <section
                  className="host-guest-summary"
                  aria-label="Guest summary"
                >
                  <div className="section-heading">
                    <h2>Key stats</h2>
                    <button
                      className="text-action"
                      onClick={() => setSection("participants")}
                    >
                      Manage guests
                    </button>
                  </div>
                  <div className="host-stat-grid">
                    <div>
                      <CheckCircle2 />
                      <strong>
                        {data.participants.filter(
                          (p) =>
                            p.commitment_state === "CONFIRMED" && !isSelf(p),
                        ).length + (hostGoing ? 1 : 0)}
                      </strong>
                      <span>Going</span>
                    </div>
                    <div>
                      <Clock3 />
                      <strong>
                        {
                          data.participants.filter(
                            (p) =>
                              p.invitation_state === "CREATED" &&
                              p.commitment_state === "NO_COMMITMENT" &&
                              !p.link_revoked,
                          ).length
                        }
                      </strong>
                      <span>Awaiting response</span>
                    </div>
                    <div>
                      <ArrowRight />
                      <strong>
                        {
                          data.participants.filter(
                            (p) =>
                              p.invitation_state === "DECLINED" ||
                              p.commitment_state === "RELEASED_DECLINED",
                          ).length
                        }
                      </strong>
                      <span>Declined / withdrawn</span>
                    </div>
                  </div>
                </section>
                {data.event.lifecycle !== "DRAFT" && (
                  <section className="panel host-join-info">
                    <div className="section-heading compact">
                      <div>
                        <span className="eyebrow">Protected access</span>
                        <h2>Join details</h2>
                      </div>
                      <Button
                        disabled={joinInfoBusy}
                        onClick={() => void saveJoinInfo()}
                      >
                        {joinInfoBusy ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <label className="field">
                      Private online access
                      <textarea
                        maxLength={1000}
                        rows={4}
                        value={joinInfo}
                        onChange={(e) => setJoinInfo(e.target.value)}
                        placeholder="Meeting link, passcode, dial-in, or arrival instructions"
                      />
                    </label>
                    <p className="small muted">
                      Visible only to the host and confirmed participants with access.
                    </p>
                  </section>
                )}
                <section className="host-next" aria-label="Next up">
                  <h2>Next up</h2>
                  <button
                    className="host-next-action"
                    onClick={() => setSection("participants")}
                  >
                    <span className="host-action-icon">
                      <ArrowRight />
                    </span>
                    <span>
                      <strong>
                        {data.participants.length
                          ? "Review your guest list"
                          : "Bring people together"}
                      </strong>
                      <small>
                        {data.participants.length
                          ? "See responses and manage invitations"
                          : "Create a private invitation link"}
                      </small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                </section>
              </>
            )}
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
                          onClick={() =>
                            open(
                              data.event.event_kind === "SIMPLE"
                                ? "change_schedule"
                                : "change_time",
                            )
                          }
                        >
                          {data.event.event_kind === "SIMPLE"
                            ? "Edit schedule & location"
                            : "Change start time"}
                        </Button>
                        <Button
                          disabled={disabled}
                          variant="quiet"
                          onClick={() => open("cosmetic_edit")}
                        >
                          Edit description
                        </Button>
                        <Button
                          disabled={disabled}
                          variant="quiet"
                          onClick={() => setModal("change_cover")}
                        >
                          <ImagePlus size={18} /> Change picture
                        </Button>
                      </>
                    )
                  )}
                </div>
              </section>
              {(data.event.event_kind !== "SIMPLE" || c || data.suggestion) && (
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
                          Reopened for changed event details. Earlier responses
                          remain in history.
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
                        Event details changed. Require affected participants to
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
                      evidence that participants confirmed the changed details.
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
              )}
            </div>
            {data.event.event_kind === "SIMPLE" && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Participant communications</span>
                    <h2>Event email delivery</h2>
                    <p className="muted">
                      RSVP confirmations, material changes and cancellations are
                      queued separately from participation. Sending an email
                      does not count as a response.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={deliveryBusy || disabled}
                    onClick={() => void sendQueuedEmail()}
                  >
                    {deliveryBusy ? "Sending…" : "Send queued emails"}
                  </Button>
                </div>
                {delivery.length ? (
                  <div className="tags" aria-label="Email delivery status">
                    {delivery.map((item) => (
                      <StatusBadge
                        key={`${item.kind}-${item.state}`}
                        tone={
                          item.state === "SENT"
                            ? "success"
                            : item.state.includes("FAILED") ||
                                item.state === "CONFIGURATION_UNAVAILABLE"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {item.count} {label(item.kind).toLowerCase()} ·{" "}
                        {label(item.state).toLowerCase()}
                      </StatusBadge>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No event emails are queued.</p>
                )}
                {deliveryRecipients.length > 0 && (
                  <details>
                    <summary>Recipient delivery details</summary>
                    {deliveryRecipients.map((item) => (
                      <p key={`${item.name}-${item.kind}`} className="small">
                        {item.name} · {label(item.kind).toLowerCase()} ·{" "}
                        {label(item.state).toLowerCase()}
                      </p>
                    ))}
                  </details>
                )}
                <p className="small muted">
                  Guest RSVP emails confirm the reservation details. A private
                  guest-management link is included so a guest can revisit the
                  event or cancel their RSVP until guest access expires after
                  the event.
                </p>
              </section>
            )}
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
                              evidence_id: clientUuid(),
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
            {data.event.event_kind !== "SIMPLE" && (
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
            )}
            {data.event.lifecycle === "PUBLISHED" && (
              <Button
                variant="quiet"
                className="cancel-event-action"
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
              <Button
                type="button"
                variant="secondary"
                disabled={disabled || data.participants.length === 0}
                onClick={downloadParticipants}
              >
                <Download size={18} /> Export CSV
              </Button>
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
            <div className="guest-controls">
              <TextField
                label="Search guests"
                type="search"
                value={guestQuery}
                onChange={(e) => setGuestQuery(e.target.value)}
              />
              <label>
                <span id="guest-status-label">Guest status</span>
                <select
                  aria-labelledby="guest-status-label"
                  value={guestFilter}
                  onChange={(e) => setGuestFilter(e.target.value)}
                >
                  <option value="all">All guests</option>
                  <option value="attending">Going</option>
                  <option value="pending">Awaiting response</option>
                  <option value="declined">Declined or withdrawn</option>
                </select>
              </label>
            </div>
            {!data.participants.length && (
              <p>
                No guests yet. Your guest list will appear here when invitations
                are added.
              </p>
            )}
            <p className="small muted" role="status">
              {visibleGuests.length + (showHost ? 1 : 0)}{" "}
              {visibleGuests.length + (showHost ? 1 : 0) === 1
                ? "person"
                : "people"}{" "}
              shown
            </p>
            <ul className="coord-participants">
              {showHost && (
                <li aria-label="Event host">
                  <div>
                    <strong>{hostName}</strong> <StatusBadge>Host</StatusBadge>
                    <p>{hostGoing ? "Going" : label(data.event.lifecycle)}</p>
                  </div>
                </li>
              )}
              <TeamGoing eventId={id} query={guestQuery} filter={guestFilter} />
              {visibleGuests.map((p) => (
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
                    {p.admission_status && (
                      <p className="small">
                        Admission:{" "}
                        <StatusBadge
                          tone={
                            p.admission_status === "VALID"
                              ? "info"
                              : p.admission_status === "USED"
                                ? "success"
                                : "neutral"
                          }
                        >
                          {label(p.admission_status)}
                        </StatusBadge>
                      </p>
                    )}
                    {p.invitation_email && (
                      <label className="small muted">
                        Guest places
                        <select
                          value={p.plus_one_allowance ?? 0}
                          disabled={
                            disabled || p.commitment_state !== "CONFIRMED"
                          }
                          onChange={async (event) => {
                            setError("");
                            try {
                              const result = await rpc<{
                                status: string;
                                error_code?: string;
                              }>("sontu_rsvp_party_allowance", {
                                event_id: id,
                                participant_id: p.id,
                                allowance: Number(event.target.value),
                              });
                              if (result.status !== "ready")
                                throw new Error(result.error_code);
                              await load();
                            } catch {
                              setError(
                                "The guest-place allowance could not be updated.",
                              );
                            }
                          }}
                        >
                          {[0, 1, 2, 3, 4].map((count) => (
                            <option key={count} value={count}>
                              {count}
                            </option>
                          ))}
                        </select>
                        {p.commitment_state !== "CONFIRMED" &&
                          " · available after RSVP"}
                      </label>
                    )}
                  </div>
                  <div className="coord-actions">
                    {p.commitment_state === "CONFIRMED" && (
                      <Button
                        variant="quiet"
                        disabled={disabled || busy}
                        onClick={() => void removeParticipantRsvp(p)}
                      >
                        Remove from Going
                        <span className="sr-only"> for {p.display_name}</span>
                      </Button>
                    )}
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
                      {p.link_revoked
                        ? "Reissue private link"
                        : "Issue private link"}
                      <span className="sr-only"> for {p.display_name}</span>
                    </Button>
                    <Button
                      variant="quiet"
                      disabled={disabled}
                      onClick={() =>
                        act("revoke_link", { participant_id: p.id })
                      }
                    >
                      Revoke private link
                      <span className="sr-only">
                        {" "}
                        link for {p.display_name}
                      </span>
                    </Button>
                  </div>
                  {p.commitment_state === "CONFIRMED" && (
                    <p className="muted">
                      Revoking a private link blocks link access only. Use
                      Remove from Going to change attendance.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {section === "rsvp" && data.event.event_kind === "SIMPLE" && (
          <RsvpFormManager eventId={id} />
        )}
        {section === "analytics" && <HostOperationalAnalytics eventId={id} />}
        {section === "assistant" && <BoundedEventAssistant data={data} />}
        {section === "seating" && data.event.event_kind === "SIMPLE" && (
          <SeatingManager
            eventId={id}
            participants={data.participants}
            hostName={hostName}
          />
        )}
        {section === "accessibility" && data.event.event_kind === "SIMPLE" && (
          <AccessibilityManager eventId={id} />
        )}
        {section === "accommodations" && data.event.event_kind === "SIMPLE" && (
          <AccommodationManager eventId={id} />
        )}
        {section === "history" && (
          <>
            <section className="panel">
              <h2>Event versions</h2>
              <ol className="coord-history">
                {groupedEventVersions(data.versions).map((group) => {
                  const v = group.version;
                  return <li key={v.id}>
                    <strong>
                      {group.count > 1
                        ? `Versions ${group.first}-${group.last}`
                        : `Version ${v.version_number}`} · {label(v.materiality_class)}
                    </strong>
                    {group.count > 1 && (
                      <p className="small muted">
                        {group.count} identical saved revisions collapsed
                      </p>
                    )}
                    <p>
                      {date(v.starts_at, v.timezone)} —{" "}
                      {date(v.ends_at, v.timezone)}
                    </p>
                    <p>{v.venue_label}</p>
                    <p className="muted">{v.description}</p>
                  </li>;
                })}
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
                    <strong>{auditLabel(a.audit_kind)}</strong>
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
        {section === "todo" && <EventOperations eventId={id} kind="todo" />}
        {section === "resources" && (
          <EventOperations eventId={id} kind="resources" />
        )}
        {section === "team" && <TeamPanel eventId={id} />}
        {section === "questions" && <AskHostInbox eventId={id} />}
        {section === "discussion" && <DiscussionManagement eventId={id} />}
        {section === "check-in" && <CheckInPanel eventId={id} />}
        {section === "results" && <EventResults eventId={id} onClosed={load} />}
        {modal === "change_schedule" && editSource && (
          <ScheduleEditor
            version={editSource.version}
            affected={
              editSource.participants.filter(
                (p) => p.commitment_state === "CONFIRMED",
              ).length
            }
            busy={busy}
            blocked={unknown}
            feedback={
              error && (
                <Feedback
                  message={error}
                  unknown={unknown}
                  onRetry={() =>
                    unknown && pending.current
                      ? void run(pending.current)
                      : void load()
                  }
                />
              )
            }
            onClose={() => setModal(null)}
            onSave={(input) => {
              if (!pending.current)
                void run({
                  cmd: "change_schedule",
                  input,
                  version: editSource.event.current_version_number,
                  op: clientUuid(),
                });
            }}
          />
        )}
        {modal === "change_cover" && (
          <Modal
            title="Choose your picture"
            onClose={() => !busy && setModal(null)}
          >
            <label className="picture-upload-placeholder">
              <Upload size={20} />
              <span>
                <strong>{coverUploadBusy ? "Uploading..." : "Upload a photo"}</strong>
                <small>JPG, PNG, GIF or WebP. Max 5 MB.</small>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                disabled={busy || unknown || coverUploadBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  void uploadEventCover(file);
                }}
              />
            </label>
            <fieldset
              className="cover-options stock-cover-options host-cover-options"
              disabled={busy || unknown}
            >
              <legend>Choose a stock photo</legend>
              {covers.map((cover) => (
                <button
                  type="button"
                  key={cover}
                  className={data.version.cover_key === cover ? "selected" : ""}
                  aria-pressed={data.version.cover_key === cover}
                  onClick={() =>
                    void run({
                      cmd: "change_cover",
                      input: { cover_key: cover },
                      version: data.event.current_version_number,
                      op: clientUuid(),
                    })
                  }
                >
                  <img src={eventCoverUrl(cover)} alt="" />
                  <span>{cover[0].toUpperCase() + cover.slice(1)}</span>
                </button>
              ))}
            </fieldset>
          </Modal>
        )}
        {modal && modal !== "change_schedule" && modal !== "change_cover" && (
          <Modal title={label(modal)} onClose={() => !busy && setModal(null)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input: Record<string, unknown> = { confirmed: true };
                if (modal === "change_time") {
                  const instant = instantForWall(time, data.version.timezone);
                  if (
                    !instant ||
                    Date.parse(instant) >= Date.parse(data.version.ends_at)
                  ) {
                    setError(
                      "Choose an unambiguous start time before the event ends. Daylight-saving gaps and repeated times cannot be saved.",
                    );
                    return;
                  }
                  input.starts_at = instant;
                }
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
                    Event: {data.version.title}. Current time:{" "}
                    {date(data.version.starts_at, data.version.timezone)}.
                  </p>
                  <p className="small muted">
                    Event timezone: {data.version.timezone}. The event keeps
                    this timezone when you travel.
                  </p>
                  <TextField
                    label="New start time (event time zone)"
                    type="datetime-local"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                  <p>
                    Review the new time:{" "}
                    {instantForWall(time, data.version.timezone)
                      ? date(
                          instantForWall(time, data.version.timezone)!,
                          data.version.timezone,
                        )
                      : "Enter a valid time"}{" "}
                    ({data.version.timezone}). Existing commitments may need
                    reconfirmation.{" "}
                    {
                      data.participants.filter(
                        (p) => p.commitment_state === "CONFIRMED",
                      ).length
                    }{" "}
                    committed guests may be affected. After saving, review the
                    queued delivery status before relying on an email.
                  </p>
                </>
              ) : modal === "cancel" ? (
                <section>
                  <h3>{data.version.title}</h3>
                  <p>
                    {date(data.version.starts_at, data.version.timezone)} ·{" "}
                    {data.version.venue_label}
                  </p>
                  <p>
                    {
                      data.participants.filter(
                        (p) => p.commitment_state === "CONFIRMED",
                      ).length
                    }{" "}
                    guests currently committed. Cancellation stops new
                    participation; existing responses and unresolved obligations
                    remain in history.
                  </p>
                  <p>
                    Cancellation emails are queued separately. Confirm the
                    delivery status after cancelling; a queued email is not
                    proof that it was delivered or read.
                  </p>
                </section>
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
                          "Require each affected participant to reconfirm or release their commitment for these event details?",
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
                <Button
                  type="submit"
                  className={modal === "cancel" ? "danger-action" : undefined}
                  disabled={disabled}
                >
                  {busy
                    ? "Saving…"
                    : data.event.event_kind === "SIMPLE"
                      ? modal === "cancel"
                        ? "Cancel event"
                        : modal === "change_time"
                          ? "Save new start time"
                          : modal === "cosmetic_edit"
                            ? "Save description"
                            : "Confirm"
                      : "Confirm"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                  aria-label="Go back"
                  className="back-chevron"
                >
                  <ChevronLeft size={26} strokeWidth={2.5} />
                </Button>
              </div>
            </form>
          </Modal>
        )}
        {link && (
          <Modal
            title={`${link.name} response link`}
            onClose={() => {
              setLink(null);
              setCopyMessage("");
            }}
          >
            <p>
              {data.event.event_kind === "SIMPLE"
                ? "The named recipient must verify their email before viewing or responding. Forwarding this link does not grant another person access. Share it directly with the invitee; no email has been sent."
                : `This link authorizes only ${link.name}’s response. Creating another link replaces the previous one.`}
            </p>
            {data.event.event_kind !== "SIMPLE" && (
              <a
                className="button primary"
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                Open participant response
              </a>
            )}
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopyMessage("Link copied. No email has been sent.");
                } catch {
                  setCopyMessage(
                    "Could not copy automatically. Select and copy the link below.",
                  );
                }
              }}
            >
              Copy invitation link
            </Button>
            {data.event.event_kind === "SIMPLE" && link.email && (
              <Button
                variant="secondary"
                disabled={inviteEmailBusy}
                onClick={() =>
                  void (async () => {
                    setInviteEmailBusy(true);
                    try {
                      const result = await sendInvitationEmail({
                        event_id: id,
                        recipient_email: link.email!,
                        token: link.token,
                        invitation_url: link.url,
                      });
                      setCopyMessage(
                        result.status === "ready"
                          ? `Invitation emailed to ${link.email}.`
                          : result.status === "configuration_unavailable"
                            ? "Email sender is not configured yet. Your private link is still available."
                            : "The email could not be delivered yet. Your private link is still available.",
                      );
                      await load();
                    } catch {
                      setCopyMessage(
                        "The email outcome could not be confirmed. Your private link is still available.",
                      );
                    } finally {
                      setInviteEmailBusy(false);
                    }
                  })()
                }
              >
                Email invitation
              </Button>
            )}
            {copyMessage && <p role="status">{copyMessage}</p>}
            <TextField
              label="Private response link"
              readOnly
              value={link.url}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setLink(null);
                setCopyMessage("");
              }}
            >
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
function EventResults({
  eventId,
  onClosed,
}: {
  eventId: string;
  onClosed: () => Promise<void>;
}) {
  const [data, setData] = useState<EventResultsProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await resultsRead(eventId);
      if (r.status !== "ready") throw new Error();
      setData(r);
      setError("");
    } catch {
      setError("Unable to load the event closeout status.");
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const blockers = data
    ? data.summary.open_todos +
      data.summary.needed_resources +
      data.summary.unresolved_obligations
    : 0;
  const finish = async () => {
    if (
      !data ||
      busy ||
      blockers > 0 ||
      !confirm(
        "Complete this event and freeze its operational results? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await closeEvent(eventId);
      if (r.status !== "ready") {
        const messages: Record<string, string> = {
          EVENT_NOT_STARTED:
            "Start the event before completing it so attendance can be reconciled.",
          UNRESOLVED_OBLIGATIONS:
            "Resolve or explicitly disposition every open obligation first.",
          OPEN_TODOS: "Complete the remaining event tasks first.",
          NEEDED_RESOURCES: "Resolve the remaining needed resources first.",
        };
        setError(
          messages[r.error_code ?? ""] ?? "The event could not be completed.",
        );
        return;
      }
      setSuccess(
        "Event completed. Its operational results are now preserved in history.",
      );
      await Promise.all([load(), onClosed()]);
    } catch {
      setError(
        "The completion result is unknown. Refresh before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="panel event-operations"
      aria-labelledby="results-heading"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Operational outcome</span>
          <h2 id="results-heading">Results &amp; Closeout</h2>
          <p className="muted">
            Reconcile the event before completing it. Unverified attendance
            remains unknown—not quietly rewritten as a no-show.
          </p>
        </div>
        {data && <StatusBadge>{label(data.lifecycle)}</StatusBadge>}
      </div>
      {error && <Feedback message={error} onRetry={() => void load()} />}{" "}
      {success && (
        <p className="coord-success" role="status">
          {success}
        </p>
      )}{" "}
      {!data && !error && <p role="status">Loading results…</p>}
      {data && (
        <>
          <div className="metric-grid">
            <article>
              <strong>{data.summary.confirmed}</strong>
              <span>Confirmed</span>
            </article>
            <article>
              <strong>{data.summary.admitted}</strong>
              <span>Admitted</span>
            </article>
            <article>
              <strong>{data.summary.attendance_unknown}</strong>
              <span>Attendance unknown</span>
            </article>
            <article>
              <strong>{data.summary.declined_or_withdrawn}</strong>
              <span>Declined or withdrawn</span>
            </article>
          </div>
          <h3>Closeout checks</h3>
          {data.lifecycle === "PUBLISHED" && (
            <p className="coord-feedback">
              Start the event before closeout. Check-in and attendance must be
              available before results can be completed.
            </p>
          )}
          <ul className="coord-history">
            <li>
              <strong>
                {data.summary.unresolved_obligations === 0
                  ? "Ready"
                  : "Blocked"}{" "}
                · Obligations
              </strong>
              <p>{data.summary.unresolved_obligations} unresolved</p>
            </li>
            <li>
              <strong>
                {data.summary.open_todos === 0 ? "Ready" : "Blocked"} · To Do
              </strong>
              <p>{data.summary.open_todos} open</p>
            </li>
            <li>
              <strong>
                {data.summary.needed_resources === 0 ? "Ready" : "Blocked"} ·
                Resources
              </strong>
              <p>{data.summary.needed_resources} still needed</p>
            </li>
          </ul>
          {data.closeout ? (
            <div className="coord-feedback">
              <strong>Completed {date(data.closeout.closed_at)}</strong>
              <p>
                Snapshot preserved: {data.closeout.admitted} admitted;{" "}
                {data.closeout.attendance_unknown} attendance unknown.
              </p>
            </div>
          ) : (
            <Button
              disabled={
                busy ||
                blockers > 0 ||
                data.lifecycle !== "IN_PROGRESS"
              }
              onClick={() => void finish()}
            >
              {busy ? "Completing…" : "Complete event"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
export function CheckInWorkspace() {
  const { eventId } = useParams();
  return (
    <FocusedWorkspaceShell title="Event Check-in" back="/events?view=Hosting">
      <SessionGate>
        <main id="main" tabIndex={-1} className="coord-entry">
          <CheckInPanel eventId={eventId!} />
        </main>
      </SessionGate>
    </FocusedWorkspaceShell>
  );
}
function CheckInPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<CheckInProjection | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ kind: string; name: string } | null>(
    null,
  );
  const load = useCallback(async () => {
    try {
      const r = await checkInRead(eventId);
      if (r.status !== "ready") throw new Error();
      setData(r);
      setError("");
    } catch {
      setError(
        "Unable to verify check-in access or attendee status. Try again before admitting anyone.",
      );
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const admit = async (id: string, name: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await checkInParticipant(eventId, id);
      setResult({ kind: r.result ?? "UNABLE_TO_VERIFY", name });
      await load();
    } catch {
      setResult({ kind: "UNABLE_TO_VERIFY", name });
    } finally {
      setBusy(false);
    }
  };
  const admitCredential = async (value: string) => {
    if (busy || !value.trim()) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const r = await checkInCredential(eventId, value.trim());
      setResult({ kind: r.result ?? "UNABLE_TO_VERIFY", name: "Credential" });
      await load();
    } catch { setResult({ kind: "UNABLE_TO_VERIFY", name: "Credential" }); }
    finally { setBusy(false); }
  };
  const message =
    result &&
    (
      {
        ADMITTED: `Admitted — ${result.name} is checked in.`,
        ALREADY_USED: `Already used — ${result.name} was previously checked in.`,
        WRONG_EVENT: `Wrong event — do not admit ${result.name}.`,
        INVALID: `Invalid — ${result.name} is not eligible for admission.`,
        UNABLE_TO_VERIFY: `Unable to verify ${result.name}. Do not assume admission.`,
      } as Record<string, string>
    )[result.kind];
  const visible =
    data?.participants.filter((p) =>
      p.display_name.toLowerCase().includes(query.trim().toLowerCase()),
    ) ?? [];
  return (
    <section
      className="panel event-operations"
      aria-labelledby="check-in-heading"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Admission operations</span>
          <h2 id="check-in-heading">Check-in</h2>
          <p className="muted">
            Search the attendee list, verify the result, then admit. Every
            attempt is audited.
          </p>
        </div>
        {data && (
          <StatusBadge>
            {data.counts.admitted} / {data.counts.eligible} admitted
          </StatusBadge>
        )}
      </div>
      {data?.event.lifecycle !== "IN_PROGRESS" && (
        <div className="coord-feedback">
          <strong>Check-in is not open yet.</strong>
          <p>The host must start the event before anyone can be admitted.</p>
        </div>
      )}
      {message && (
        <div className="coord-feedback" role="alert">
          <strong>{message}</strong>
        </div>
      )}
      {error && <Feedback message={error} onRetry={() => void load()} />}
      <TextField
        label="Find attendee"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name"
      />
      <form onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); void admitCredential(String(form.get("credential") ?? "")); }}>
        <TextField label="Credential reference" name="credential" placeholder="Paste or scan credential ID" />
        <Button type="submit" variant="secondary" disabled={busy || data?.event.lifecycle !== "IN_PROGRESS"}>Verify credential</Button>
      </form>
      {!data && !error && (
        <p role="status">Loading current admission status…</p>
      )}
      {data && visible.length === 0 && (
        <div className="operation-empty">
          <strong>No matching attendees.</strong>
          <p>Check the spelling or confirm that the invitation was accepted.</p>
        </div>
      )}
      <ul className="operation-list">
        {visible.map((p) => (
          <li key={p.id}>
            <div>
              <strong>{p.display_name}</strong>
              <span>
                {p.checked_in_at
                  ? `Checked in ${new Date(p.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : checkInAdmissionLabel(p.admission_status, p.checked_in_at)}
              </span>
            </div>
            <Button
              variant={p.checked_in_at ? "quiet" : "secondary"}
              disabled={
                busy ||
                !canAttemptCheckIn(
                  data?.event.lifecycle ?? "",
                  p.admission_status,
                )
              }
              onClick={() => void admit(p.id, p.display_name)}
            >
              {p.checked_in_at ? "Verify again" : "Check in"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
const teamRoleLabel = (role: TeamMember["role"]) =>
  ({
    CO_HOST: "Co-host",
    EVENT_MANAGER: "Event manager",
    CHECK_IN_STAFF: "Check-in staff",
    VOLUNTEER: "Volunteer",
    PHOTOGRAPHER: "Photographer",
  })[role];
function useTeam(eventId: string) {
  const [team, setTeam] = useState<TeamProjection | null>(null);
  const reload = useCallback(
    async () => setTeam(await teamRead(eventId)),
    [eventId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { team, reload };
}
function TeamGoing({
  eventId,
  query,
  filter,
}: {
  eventId: string;
  query: string;
  filter: string;
}) {
  const { team } = useTeam(eventId);
  if (filter !== "all" && filter !== "attending") return null;
  return (
    <>
      {team?.members
        .filter(
          (m) =>
            m.attends_event &&
            `${m.display_name} ${m.email}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )
        .map((m) => (
          <li key={`team-${m.id}`}>
            <div>
              <strong>{m.display_name}</strong>
              {m.public_visibility !== "HIDDEN" && (
                <>
                  {" "}
                  <StatusBadge>
                    {m.public_visibility === "PUBLIC_ROLE"
                      ? teamRoleLabel(m.role)
                      : "Event team"}
                  </StatusBadge>
                </>
              )}
              <p>Going</p>
            </div>
          </li>
        ))}
    </>
  );
}
function TeamPanel({ eventId }: { eventId: string }) {
  const { team, reload } = useTeam(eventId);
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationMembers, setOrganizationMembers] = useState<
    OrganizationMember[]
  >([]);
  const [role, setRole] = useState<TeamMember["role"]>("VOLUNTEER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    eventOwner(eventId)
      .then(async (owner) => {
        if (
          owner.status !== "ready" ||
          owner.owner_kind !== "ORGANIZATION" ||
          !owner.organization_id
        )
          return;
        const detail = await organizationDetail(owner.organization_id);
        if (detail.status === "ready") {
          setOrganizationName(
            detail.organization?.display_name ??
              owner.owner_name ??
              "Organization",
          );
          setOrganizationMembers(detail.members ?? []);
        }
      })
      .catch(() => setError("Could not load the organization directory."));
  }, [eventId]);
  const run = async (
    cmd: string,
    id: string | null,
    input: Record<string, unknown>,
  ) => {
    setBusy(true);
    setError("");
    try {
      const r = await teamCommand(cmd, eventId, id, input);
      if (r.status !== "ready")
        setError(
          errorMessages[r.error_code ?? ""] ??
            (r.error_code === "ACCOUNT_NOT_FOUND"
              ? "No Sontu account uses that email yet."
              : "That team change could not be saved."),
        );
      else {
        setEmail("");
        await reload();
      }
    } catch {
      setError("The team change is unconfirmed. Refresh before trying again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel event-operations" aria-labelledby="team-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Event-scoped</span>
          <h2 id="team-heading">Team &amp; Roles</h2>
          <p className="muted">
            Give existing Sontu accounts only the access they need. Attendance
            and public role display are separate.
          </p>
        </div>
      </div>
      {error && <Feedback message={error} onRetry={() => void reload()} />}
      <form
        className="operation-add"
        onSubmit={(e) => {
          e.preventDefault();
          void run("add_member", null, {
            email,
            role,
            attends_event: true,
            public_visibility: "EVENT_TEAM",
          });
        }}
      >
        {organizationMembers.length > 0 && (
          <label>
            <span>{organizationName} member</span>
            <select value={email} onChange={(e) => setEmail(e.target.value)}>
              <option value="">Choose a teammate</option>
              {organizationMembers
                .filter(
                  (member) =>
                    !team?.members.some(
                      (existing) => existing.user_id === member.user_id,
                    ),
                )
                .map((member) => (
                  <option key={member.user_id} value={member.email}>
                    {member.display_name} · {member.role.toLowerCase()}
                  </option>
                ))}
            </select>
          </label>
        )}
        <TextField
          label={
            organizationMembers.length
              ? "Or enter member email"
              : "Teammate email"
          }
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label>
          <span>Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TeamMember["role"])}
          >
            {(
              [
                "CO_HOST",
                "EVENT_MANAGER",
                "CHECK_IN_STAFF",
                "VOLUNTEER",
                "PHOTOGRAPHER",
              ] as const
            ).map((r) => (
              <option value={r} key={r}>
                {teamRoleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy}>{busy ? "Saving…" : "Add teammate"}</Button>
      </form>
      {!team && <p role="status">Loading team…</p>}
      {team?.members.length === 0 && (
        <div className="operation-empty">
          <strong>No teammates yet.</strong>
          <p>Add someone only when this event needs shared operation.</p>
        </div>
      )}
      <ul className="operation-list">
        {team?.members.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.display_name}</strong>
              <span>{m.email}</span>
              <div className="coord-actions">
                <label>
                  <span className="sr-only">Role for {m.display_name}</span>
                  <select
                    value={m.role}
                    onChange={(e) =>
                      void run("update_member", m.id, { role: e.target.value })
                    }
                  >
                    {(
                      [
                        "CO_HOST",
                        "EVENT_MANAGER",
                        "CHECK_IN_STAFF",
                        "VOLUNTEER",
                        "PHOTOGRAPHER",
                      ] as const
                    ).map((r) => (
                      <option value={r} key={r}>
                        {teamRoleLabel(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={m.attends_event}
                    onChange={(e) =>
                      void run("update_member", m.id, {
                        attends_event: e.target.checked,
                      })
                    }
                  />{" "}
                  Going
                </label>
                <label>
                  <span className="sr-only">
                    Public role visibility for {m.display_name}
                  </span>
                  <select
                    value={m.public_visibility}
                    onChange={(e) =>
                      void run("update_member", m.id, {
                        public_visibility: e.target.value,
                      })
                    }
                  >
                    <option value="EVENT_TEAM">Show Event team</option>
                    <option value="PUBLIC_ROLE">Show exact role</option>
                    <option value="HIDDEN">Hide role badge</option>
                  </select>
                </label>
              </div>
            </div>
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => {
                if (confirm(`Remove ${m.display_name} from this event team?`))
                  void run("remove_member", m.id, {});
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
type HostQuestion = {
  id: string;
  question: string;
  response: string | null;
  state: "OPEN" | "ANSWERED" | "CLOSED";
  created_at: string;
};
function AskHostInbox({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<HostQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await rpc<{
        status: string;
        error_code?: string;
        items?: HostQuestion[];
      }>("sontu_event_host_questions", {
        action: "read",
        event_id: eventId,
        question_id: null,
        body: null,
      });
      if (result.status === "ready") setItems(result.items ?? []);
      else setError("Questions are unavailable for this event.");
    } catch {
      setError("Could not load participant questions.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const respond = async (item: HostQuestion, action: "answer" | "close") => {
    const body = drafts[item.id]?.trim() ?? "";
    if ((action === "answer" && !body) || busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_event_host_questions",
        {
          action,
          event_id: eventId,
          question_id: item.id,
          body: action === "answer" ? body : null,
        },
      );
      if (result.status === "ready") {
        setDrafts((current) => ({ ...current, [item.id]: "" }));
        await load();
      } else setError("That question could not be updated.");
    } catch {
      setError("That update is unconfirmed. Please retry.");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <section
      className="panel event-operations ask-host-inbox"
      aria-labelledby="questions-heading"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Private participant messages</span>
          <h2 id="questions-heading">Participant questions</h2>
          <p className="muted">
            Confirmed Sontu participants can contact you privately about this
            event.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
      {error && (
        <p className="coord-feedback" role="status">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading questions…</p>
      ) : !items.length ? (
        <p className="muted">No participant questions yet.</p>
      ) : (
        <ul className="ask-host-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="section-heading">
                <strong>Participant question</strong>
                <StatusBadge
                  tone={item.state === "ANSWERED" ? "info" : "neutral"}
                >
                  {label(item.state)}
                </StatusBadge>
              </div>
              <p>{item.question}</p>
              {item.response ? (
                <p className="ask-host-response">
                  <strong>Your response:</strong> {item.response}
                </p>
              ) : item.state === "OPEN" ? (
                <div className="ask-host-actions">
                  <label className="field">
                    <span>Response</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={drafts[item.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="Write a private response"
                    />
                  </label>
                  <div className="inline-actions">
                    <Button
                      disabled={
                        busyId === item.id || !(drafts[item.id] ?? "").trim()
                      }
                      onClick={() => void respond(item, "answer")}
                    >
                      Send response
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busyId === item.id}
                      onClick={() => void respond(item, "close")}
                    >
                      Close question
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function DiscussionManagement({ eventId }: { eventId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<
    {
      id: string;
      body: string;
      author_name: string;
      state: "VISIBLE" | "HIDDEN";
      created_at: string;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await rpc<{
        status: string;
        enabled?: boolean;
        items?: typeof items;
      }>("sontu_event_discussion", {
        action: "read",
        event_id: eventId,
        post_id: null,
        body: null,
        enabled: null,
      });
      if (result.status !== "ready") throw new Error();
      setEnabled(!!result.enabled);
      setItems(result.items ?? []);
      setError("");
    } catch {
      setError("Could not load discussion settings.");
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (
    action: "configure" | "hide",
    post_id: string | null = null,
    value = !enabled,
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await rpc<{ status: string }>("sontu_event_discussion", {
        action,
        event_id: eventId,
        post_id,
        body: null,
        enabled: action === "configure" ? value : null,
      });
      if (result.status !== "ready") throw new Error();
      await load();
    } catch {
      setError("That discussion update could not be confirmed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="panel event-operations"
      aria-labelledby="discussion-heading"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Event-scoped conversation</span>
          <h2 id="discussion-heading">Discussion</h2>
          <p className="muted">
            Participants can talk only inside this event. This never creates
            direct messaging.
          </p>
        </div>
        <Button
          variant={enabled ? "secondary" : "primary"}
          disabled={busy}
          onClick={() => void act("configure")}
        >
          {enabled ? "Close discussion" : "Open discussion"}
        </Button>
      </div>
      {error && (
        <p className="coord-feedback" role="status">
          {error}
        </p>
      )}
      {!enabled && (
        <p className="muted">Discussion is currently closed to participants.</p>
      )}
      {items.length ? (
          <ul className="ask-host-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="section-heading">
                  <strong>{item.author_name}</strong>
                  <StatusBadge
                    tone={item.state === "HIDDEN" ? "warning" : "info"}
                  >
                    {label(item.state)}
                  </StatusBadge>
                </div>
                <p>{item.body}</p>
                {item.state === "VISIBLE" && (
                  <Button
                    variant="quiet"
                    disabled={busy}
                    onClick={() => void act("hide", item.id)}
                  >
                    Hide post
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No posts yet.</p>
        )}
    </section>
  );
}
function EventOperations({
  eventId,
  kind,
}: {
  eventId: string;
  kind: "todo" | "resources";
}) {
  const [data, setData] = useState<EventOperationsProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const { team } = useTeam(eventId);
  const load = useCallback(async () => {
    try {
      const next = await eventOperationsRead(eventId);
      if (next.status !== "ready") throw new Error();
      setData(next);
      setError("");
    } catch {
      setError("Unable to load event operations. Please retry.");
    }
  }, [eventId]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (
    cmd: string,
    itemId: string | null,
    input: Record<string, unknown>,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await eventOperationsCommand(cmd, eventId, itemId, input);
      if (result.status !== "ready") {
        setError(
          errorMessages[result.error_code ?? ""] ??
            "That update could not be saved.",
        );
        return;
      }
      setTitle("");
      setQuantity("1");
      setNote("");
      await load();
    } catch {
      setError("The result is unconfirmed. Refresh before trying again.");
    } finally {
      setBusy(false);
    }
  };
  const items = kind === "todo" ? (data?.todos ?? []) : (data?.resources ?? []);
  return (
    <section
      className="panel event-operations"
      aria-labelledby={`${kind}-heading`}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Event-scoped</span>
          <h2 id={`${kind}-heading`}>
            {kind === "todo" ? "To Do" : "Resources"}
          </h2>
          <p className="muted">
            {kind === "todo"
              ? "Keep the immediate event work visible."
              : "Track only what this event needs and whether it is ready."}
          </p>
        </div>
      </div>
      {error && <Feedback message={error} onRetry={() => void load()} />}
      {!data && !error && <p role="status">Loading…</p>}
      <form
        className="operation-add"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            kind === "todo" ? "add_todo" : "add_resource",
            null,
            kind === "todo"
              ? { title }
              : { label: title, quantity: Number(quantity), note },
          );
        }}
      >
        <TextField
          label={kind === "todo" ? "Task" : "Resource"}
          value={title}
          maxLength={120}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        {kind === "resources" && (
          <>
            <TextField
              label="Quantity"
              type="number"
              value={quantity}
              min="1"
              max="100000"
              required
              onChange={(e) => setQuantity(e.target.value)}
            />
            <TextField
              label="Note"
              value={note}
              maxLength={240}
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
        <Button disabled={busy}>
          {busy ? "Saving…" : kind === "todo" ? "Add task" : "Add resource"}
        </Button>
      </form>
      {data && items.length === 0 && (
        <div className="operation-empty">
          <strong>Nothing here yet.</strong>
          <p>Add only what helps this event happen.</p>
        </div>
      )}
      <ul className="operation-list">
        {kind === "todo"
          ? data?.todos.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.state === "DONE" ? "Completed" : "Open"}</span>
                  <select
                    aria-label={`Assign ${item.title}`}
                    value={item.assignee_team_member_id ?? ""}
                    onChange={async (e) => {
                      setBusy(true);
                      await assignOperationItem(
                        "todo",
                        eventId,
                        item.id,
                        e.target.value || null,
                      );
                      await load();
                      setBusy(false);
                    }}
                  >
                    <option value="">Unassigned</option>
                    {team?.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run("set_todo_state", item.id, {
                      state: item.state === "DONE" ? "OPEN" : "DONE",
                    })
                  }
                >
                  {item.state === "DONE" ? "Reopen" : "Complete"}
                </Button>
              </li>
            ))
          : data?.resources.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    {item.label} · {item.quantity}
                  </strong>
                  <span>
                    {item.state === "READY" ? "Ready" : "Needed"}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                  <select
                    aria-label={`Assign ${item.label}`}
                    value={item.assignee_team_member_id ?? ""}
                    onChange={async (e) => {
                      setBusy(true);
                      await assignOperationItem(
                        "resource",
                        eventId,
                        item.id,
                        e.target.value || null,
                      );
                      await load();
                      setBusy(false);
                    }}
                  >
                    <option value="">Unassigned</option>
                    {team?.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run("set_resource_state", item.id, {
                      state: item.state === "READY" ? "NEEDED" : "READY",
                    })
                  }
                >
                  {item.state === "READY" ? "Mark needed" : "Mark ready"}
                </Button>
              </li>
            ))}
      </ul>
    </section>
  );
}

export function EventOperationsWorkspace() {
  const { eventId } = useParams();
  if (!eventId) return <Navigate to="/events" replace />;
  return <main className="coordination-page"><div className="coord-actions"><Link className="text-action" to={`/my-events/${eventId}`}>Back to event</Link><Link className="button secondary" to={`/core/events/${eventId}/check-in`}>Check-in</Link></div><EventOperations eventId={eventId} kind="todo" /><EventOperations eventId={eventId} kind="resources" /></main>;
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
      operation_id: clientUuid(),
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
          <p>Ends {date(data.event.ends_at, data.event.timezone)}</p>
          <p className="muted">
            {data.event.venue_label} · {data.event.timezone}
          </p>
          <section className="panel">
            <h2>Hello, {data.participant?.display_name}.</h2>
            {data.event.lifecycle === "CANCELLED" ? (
              <p>This event has been cancelled. No response is requested.</p>
            ) : data.participant?.actionable ? (
              <>
                <p>The event details have changed. Can you still make it?</p>
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
                    ? "You have reconfirmed for these event details."
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

export function CoreSignOut({
  onBack,
  onSignedOut,
}: {
  onBack: () => void;
  onSignedOut: () => void;
}) {
  const [active, setActive] = useState<boolean | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setActive(!!data.session));
  }, []);
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <button
        onClick={onBack}
        className="icon-button back-chevron"
        aria-label="Back to Profile"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <h1>Sign Out</h1>
      {active === null ? (
        <p role="status">Checking your session…</p>
      ) : active ? (
        <>
          <p>
            Sign out of Sontu on this device? Your events and participation will
            remain saved.
          </p>
          <Button
            onClick={async () => {
              trackBeta("sign_out_attempted", "account", {
                source: "settings",
              });
              const { error } = await supabase.auth.signOut();
              if (error) {
                trackBeta("sign_out_failed", "account", {
                  source: "settings",
                });
                setError("Unable to sign out. Please retry.");
              } else {
                trackBeta("sign_out_succeeded", "account", {
                  source: "settings",
                });
                onSignedOut();
              }
            }}
          >
            Sign out
          </Button>
        </>
      ) : (
        <p>No account is signed in.</p>
      )}
      {error && <Feedback message={error} />}
    </main>
  );
}
