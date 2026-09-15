import {
  Building2,
  CakeSlice,
  CalendarDays,
  ChevronLeft,
  GraduationCap,
  Handshake,
  Heart,
  ImagePlus,
  Leaf,
  MapPin,
  PartyPopper,
  Search,
  Trophy,
  Upload,
  UserRound,
  Users,
  UtensilsCrossed,
} from "lucide-react";
/* oxlint-disable react/set-state-in-effect -- Loading drafts from the backend is an external synchronization. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button, TextField, StatusBadge } from "../../../packages/ui-web";
import { FocusedWorkspaceShell, Modal } from "./shells";
import { SessionGate } from "./coordination";
import {
  eventOwner,
  hostCommand,
  hostRead,
  organizationOverview,
  rpc,
} from "../../../packages/data/sontu";
import type { OrganizationContext } from "../../../packages/data/sontu";
import { errorMessages } from "../../../packages/domain/coordination";
import {
  emptyDraft,
  deviceTimezone,
  wallTime,
  instantForWall,
  draftBlockers,
} from "../../../packages/domain/draft";
import type { DraftFields } from "../../../packages/domain/draft";

type Request = {
  cmd: string;
  event: string | null;
  version: number;
  input: Record<string, unknown>;
  op: string;
  next: number;
  returnAfter?: boolean;
  publishAfter?: boolean;
};
const key = (id: string) => `sontu-draft-request:${id}`;
function readPending(id: string): Request | null {
  try {
    return JSON.parse(sessionStorage.getItem(key(id)) ?? "null");
  } catch {
    return null;
  }
}
function keep(id: string, value: Request | null) {
  try {
    if (value) sessionStorage.setItem(key(id), JSON.stringify(value));
    else sessionStorage.removeItem(key(id));
  } catch {
    /* Same-page retries still work. */
  }
}
const covers = ["food", "sunset", "music", "market", "yoga", "sailing"];
function suggestedCover(category: string) {
  const value = category.toLowerCase();
  if (/dinner|birthday|party|wedding|shower|holiday/.test(value)) return "food";
  if (/concert|performance|festival/.test(value)) return "music";
  if (/wellness|yoga|fitness|retreat/.test(value)) return "yoga";
  if (/sports|running|soccer|basketball|tournament/.test(value))
    return "sailing";
  if (/community|fundraiser|networking|market/.test(value)) return "market";
  return "sunset";
}
function withDefaultTimes(draft: DraftFields): DraftFields {
  if (draft.starts_at && draft.ends_at) return draft;
  const start = new Date((Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000);
  const startIso = draft.starts_at || start.toISOString();
  const startMs = Date.parse(startIso);
  return {
    ...draft,
    starts_at: startIso,
    ends_at:
      draft.ends_at ||
      new Date(
        (Number.isFinite(startMs) ? startMs : start.getTime()) + 3_600_000,
      ).toISOString(),
  };
}
const formats = [
  {
    value: "in-person",
    label: "In person",
    note: "Everyone meets at one place.",
  },
  { value: "online", label: "Online", note: "Everyone joins remotely." },
  {
    value: "hybrid",
    label: "Hybrid",
    note: "People can join in person or online.",
  },
] as const;
const categories = [
  "Birthday",
  "Dinner",
  "Wedding",
  "Party",
  "Sports",
  "Wellness",
  "Class or workshop",
  "Networking",
  "Community gathering",
  "Conference",
  "Concert or performance",
  "Festival",
  "Fundraiser",
  "Meetup",
  "Retreat",
  "Ceremony",
  "Yoga",
  "Fitness class",
  "Running event",
  "Soccer",
  "Basketball",
  "Tournament",
  "Lecture",
  "Seminar",
  "Webinar",
  "Training",
  "Reunion",
  "Baby shower",
  "Graduation",
  "Holiday gathering",
  "Volunteer event",
  "Other",
];
const commonTypes = categories.slice(0, 8);
const commonTypeIcons = [
  CakeSlice,
  UtensilsCrossed,
  Heart,
  PartyPopper,
  Trophy,
  Leaf,
  GraduationCap,
  Handshake,
];
const intentKey = (id: string) => `sontu-event-intent:${id}`;
function keepIntent(id: string, format: string, category: string) {
  try {
    localStorage.setItem(intentKey(id), JSON.stringify({ format, category }));
  } catch {
    /* The route still carries the intent when storage is unavailable. */
  }
}
function readIntent(id: string | undefined) {
  if (!id) return null;
  try {
    return JSON.parse(localStorage.getItem(intentKey(id)) ?? "null") as {
      format?: string;
      category?: string;
    } | null;
  } catch {
    return null;
  }
}
function safeReturn(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/events?view=Hosting";
}
export function Creation() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const remembered = readIntent(eventId);
  const returnTo = safeReturn(params.get("return"));
  const requestedFormat = params.get("format") ?? remembered?.format;
  const format = formats.some((item) => item.value === requestedFormat)
    ? requestedFormat!
    : "in-person";
  const requestedCategory = params.get("category") ?? remembered?.category;
  const category = categories.includes(requestedCategory ?? "")
    ? requestedCategory!
    : "Birthday";
  return (
    <FocusedWorkspaceShell
      title={eventId ? "Your event draft" : "Create Event"}
      back={returnTo}
    >
      <main id="main" tabIndex={-1} className="coord-entry">
        <SessionGate>
          {eventId ? (
            <DraftEditor
              key={eventId}
              id={eventId}
              format={format}
              category={category}
              returnTo={returnTo}
            />
          ) : (
            <CreateEntry returnTo={returnTo} />
          )}
        </SessionGate>
      </main>
    </FocusedWorkspaceShell>
  );
}
function CreateEntry({ returnTo }: { returnTo: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const requestedOrganization = params.get("organization");
  const [format, setFormat] = useState("in-person");
  const [category, setCategory] = useState("");
  const [more, setMore] = useState(false);
  const [typeQuery, setTypeQuery] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationContext[]>([]);
  const [owner, setOwner] = useState(requestedOrganization ?? "PERSONAL");
  const pending = useRef<Request | null>(readPending("new"));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      readPending("new")
        ? "Draft creation is unconfirmed. Retry to recover it."
        : "",
    ),
    [drafts, setDrafts] = useState<
      { id: string; title: string; lifecycle: string; event_kind: string }[]
    >([]);
  useEffect(() => {
    Promise.all([
      rpc<{ events: typeof drafts }>("sontu_host_projection", {
        event_id: null,
      }),
      organizationOverview(),
    ])
      .then(([r, context]) => {
        setDrafts(
          r.events.filter(
            (e) => e.lifecycle === "DRAFT" && e.event_kind === "SIMPLE",
          ),
        );
        if (context.status === "ready") {
          const eligible = (context.organizations ?? []).filter(
            (item) =>
              (item.role === "OWNER" || item.role === "ADMIN") &&
              item.lifecycle !== "SETUP_INCOMPLETE" &&
              item.lifecycle !== "RETIRED",
          );
          setOrganizations(eligible);
          if (
            requestedOrganization &&
            !eligible.some((item) => item.id === requestedOrganization)
          )
            setOwner("PERSONAL");
        }
      })
      .catch(() =>
        setError(
          "Could not load existing drafts. Refresh before starting another.",
        ),
      );
  }, [requestedOrganization]);
  async function create() {
    if (busy) return;
    setBusy(true);
    const req = pending.current ?? {
      cmd: "create_draft",
      event: null,
      version: 1,
      input: { timezone: deviceTimezone(), owner },
      op: crypto.randomUUID(),
      next: 0,
    };
    pending.current = req;
    keep("new", req);
    try {
      const r = await hostCommand(req.cmd, null, 1, req.input, req.op);
      if (r.status === "ready" && r.event_id) {
        const requestedOwner = String(req.input.owner ?? "PERSONAL");
        const ownership = await eventOwner(
          r.event_id,
          requestedOwner === "PERSONAL" ? "PERSONAL" : "ORGANIZATION",
          requestedOwner === "PERSONAL" ? null : requestedOwner,
        );
        if (ownership.status !== "ready")
          throw new Error(ownership.error_code ?? "OWNER_SAVE_FAILED");
        const intent = await rpc<{ status: string; error_code?: string }>(
          "sontu_set_event_intent",
          {
            event_id: r.event_id,
            event_category: category,
            event_format: format,
          },
        );
        if (intent.status !== "ready") {
          throw new Error(intent.error_code ?? "INTENT_SAVE_FAILED");
        }
        keepIntent(r.event_id, format, category);
        keep("new", null);
        pending.current = null;
        const query = new URLSearchParams({
          format,
          category,
          return: returnTo,
        });
        navigate(`/create/${r.event_id}?${query}`, { replace: true });
      } else {
        keep("new", null);
        pending.current = null;
        setError(
          errorMessages[r.error_code ?? ""] ?? "Could not create draft.",
        );
      }
    } catch {
      setError("Draft creation is unconfirmed. Retry uses the same request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="eyebrow">Event intent</span>
      <h1>What are you creating?</h1>
      <p>
        Choose the closest fit. We’ll adapt the setup, and your draft stays
        private until you deliberately publish it.
      </p>
      {drafts.length > 0 && (
        <section className="panel">
          <h2>Pick up where you left off</h2>
          {drafts.map((d) => (
            <p key={d.id}>
              <Link
                className="text-action"
                to={`/create/${d.id}?return=${encodeURIComponent(returnTo)}`}
              >
                {d.title || "Untitled event"}
              </Link>
            </p>
          ))}
        </section>
      )}
      <section className="panel event-intent-panel">
        <fieldset className="event-owner-options">
          <legend>Who owns this event?</legend>
          <div className="event-owner-select">
            {owner === "PERSONAL" ? (
              <UserRound size={20} />
            ) : (
              <Building2 size={20} />
            )}
            <select
              aria-label="Event owner"
              value={owner}
              onChange={(event) => {
                if (event.target.value === "CREATE_ORGANIZATION") {
                  navigate(
                    `/organizations/new?return=${encodeURIComponent(location.pathname + location.search)}`,
                  );
                  return;
                }
                setOwner(event.target.value);
              }}
            >
              <option value="PERSONAL">Personal</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.display_name}
                </option>
              ))}
              <option value="CREATE_ORGANIZATION">
                ＋ Create an organization
              </option>
            </select>
          </div>
          <p className="small muted">
            {owner === "PERSONAL"
              ? "Owned by your personal Sontu account."
              : "Owned by the selected organization and preserved beyond membership changes."}
          </p>
        </fieldset>
        <fieldset className="event-type-options">
          <legend>Choose an event type</legend>
          {commonTypes.map((item, index) => {
            const Icon = commonTypeIcons[index];
            return (
              <button
                type="button"
                key={item}
                className={`event-type type-${index % 4}${category === item ? " selected" : ""}`}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                <Icon size={22} aria-hidden="true" />
                <span>{item}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`event-type type-more${more ? " selected" : ""}`}
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            <Search size={22} aria-hidden="true" />
            <span>More</span>
          </button>
        </fieldset>
        {more && (
          <div className="event-type-search">
            <TextField
              label="Search event types"
              value={typeQuery}
              onChange={(e) => setTypeQuery(e.target.value)}
              autoFocus
            />
            <div
              className="event-type-results"
              aria-label="Matching event types"
            >
              {categories
                .filter((item) =>
                  item.toLowerCase().includes(typeQuery.trim().toLowerCase()),
                )
                .map((item) => (
                  <button
                    type="button"
                    key={item}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
            </div>
          </div>
        )}
        <fieldset className="event-format-options">
          <legend>How will people take part?</legend>
          {formats.map((item) => (
            <label
              key={item.value}
              className={format === item.value ? "selected" : ""}
            >
              <input
                type="radio"
                name="event-format"
                value={item.value}
                checked={format === item.value}
                onChange={() => setFormat(item.value)}
              />
              <strong>{item.label}</strong>
              <span className="sr-only">{item.note}</span>
            </label>
          ))}
        </fieldset>
        <div className="coord-actions">
          <Button variant="secondary" onClick={() => navigate(returnTo)}>
            Cancel
          </Button>
          <Button disabled={busy || !category} onClick={() => void create()}>
            {busy
              ? "Creating draft…"
              : error
                ? "Retry draft creation"
                : "Continue to event details"}
          </Button>
        </div>
      </section>
      {error && <p role="alert">{error}</p>}
      <Link
        to={returnTo}
        className="icon-button back-chevron"
        aria-label="Back to Hosting"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </Link>
    </>
  );
}
function DraftEditor({
  id,
  format,
  category,
  returnTo,
}: {
  id: string;
  format: string;
  category: string;
  returnTo: string;
}) {
  const navigate = useNavigate();
  const pending = useRef<Request | null>(readPending(id));
  const [form, setForm] = useState<DraftFields>(emptyDraft),
    [version, setVersion] = useState(1),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [unknown, setUnknown] = useState(() => !!readPending(id)),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(false),
    [visibility, setVisibility] = useState<"PUBLIC" | "UNLISTED" | "PRIVATE">("PRIVATE"),
    [participationAccess, setParticipationAccess] = useState<
      "ANYONE" | "SONTU_USERS_ONLY"
    >("ANYONE"),
    [pictureOpen, setPictureOpen] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false);
  const [ownerName, setOwnerName] = useState("Personal");
  const deleteOperation = useRef<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, access, participation, ownership] = await Promise.all([
        hostRead(id),
        rpc<{ status: string; visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE" }>(
          "sontu_event_visibility",
          { action: "read", event_id: id, value: null },
        ),
        rpc<{
          status: string;
          participation_access?: "ANYONE" | "SONTU_USERS_ONLY";
        }>("sontu_event_participation_access", {
          action: "read",
          event_id: id,
          value: null,
        }),
        eventOwner(id),
      ]);
      if (r.status !== "ready" || !r.data) {
        setError("This draft is unavailable or you do not have access.");
        return;
      }
      const d = r.data;
      if (d.event.lifecycle !== "DRAFT") {
        navigate(`/core/events/${id}/host`, { replace: true });
        return;
      }
      if (d.event.event_kind !== "SIMPLE") {
        setError("This event is not editable in the creation flow. Open it through Hosting.");
        return;
      }
      const v = d.version;
      const loadedForm = {
        title: v.title,
        description: v.description,
        starts_at: v.starts_at ?? "",
        ends_at: v.ends_at ?? "",
        timezone: v.timezone,
        venue_label: v.venue_label,
        cover_key:
          v.cover_key && v.cover_key !== "none"
            ? v.cover_key
            : suggestedCover(category),
        capacity: v.capacity?.toString() ?? "",
      };
      const defaultedForm = withDefaultTimes(loadedForm);
      setForm(defaultedForm);
      setVersion(d.event.current_version_number);
      if (access.status === "ready" && access.visibility)
        setVisibility(access.visibility);
      if (
        participation.status === "ready" &&
        participation.participation_access
      )
        setParticipationAccess(participation.participation_access);
      if (ownership.status === "ready" && ownership.owner_name)
        setOwnerName(ownership.owner_name);
      const addedDefaults =
        !loadedForm.starts_at ||
        !loadedForm.ends_at ||
        !v.cover_key ||
        v.cover_key === "none";
      setDirty(addedDefaults);
      setSaved(!addedDefaults);
      if (pending.current)
        setError(
          "A previous save is unconfirmed. Retry the same request before editing.",
        );
      else setError("");
    } catch {
      setError("Could not load this draft. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [category, id, navigate]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty || unknown) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, unknown]);
  function update(k: keyof DraftFields, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setSaved(false);
  }
  async function run(req: Request) {
    if (busy) return;
    setBusy(true);
    setError("");
    pending.current = req;
    keep(id, req);
    try {
      const r = await hostCommand(req.cmd, id, req.version, req.input, req.op);
      setUnknown(false);
      if (r.status !== "ready") {
        pending.current = null;
        keep(id, null);
        setError(
          errorMessages[r.error_code ?? ""] ??
            "Could not save. Your entered details are still here.",
        );
        return;
      }
      setVersion(r.current_version ?? version);
      if (req.cmd === "publish") {
        pending.current = null;
        keep(id, null);
        navigate(`/core/events/${id}/host`, { replace: true });
        return;
      }
      const access = await rpc<{ status: string; error_code?: string }>(
        "sontu_event_visibility",
        { action: "write", event_id: id, value: visibility },
      );
      if (access.status !== "ready") {
        setUnknown(true);
        setError(
          errorMessages[access.error_code ?? ""] ??
            "Event details saved, but visibility could not be confirmed. Please retry.",
        );
        return;
      }
      const participation = await rpc<{ status: string; error_code?: string }>(
        "sontu_event_participation_access",
        { action: "write", event_id: id, value: participationAccess },
      );
      if (participation.status !== "ready") {
        setUnknown(true);
        setError(
          errorMessages[participation.error_code ?? ""] ??
            "Event details saved, but the RSVP setting could not be confirmed. Please retry.",
        );
        return;
      }
      setForm(req.input as unknown as DraftFields);
      setDirty(false);
      setSaved(true);
      if (req.publishAfter) {
        const publishRequest: Request = {
          cmd: "publish",
          event: id,
          version: r.current_version ?? version,
          input: { confirmed: true },
          op: crypto.randomUUID(),
          next: 0,
        };
        pending.current = publishRequest;
        keep(id, publishRequest);
        const published = await hostCommand(
          publishRequest.cmd,
          id,
          publishRequest.version,
          publishRequest.input,
          publishRequest.op,
        );
        if (published.status !== "ready") {
          setUnknown(true);
          setError(
            errorMessages[published.error_code ?? ""] ??
              "Draft saved, but publishing could not be confirmed. Retry publishing.",
          );
          return;
        }
        pending.current = null;
        keep(id, null);
        navigate(`/core/events/${id}/host`, { replace: true });
        return;
      }
      pending.current = null;
      keep(id, null);
      if (req.returnAfter) {
        navigate(returnTo, { replace: true });
        return;
      }
    } catch {
      setUnknown(true);
      setError(
        "The save outcome is unconfirmed. Retry this same request to recover the result.",
      );
    } finally {
      setBusy(false);
    }
  }
  function save(returnAfter = false, validate = true) {
    if (
      validate &&
      !document
        .querySelector<HTMLFormElement>(".creation-form")
        ?.reportValidity()
    )
      return;
    void run({
      cmd: "save_draft",
      event: id,
      version,
      input: { ...form },
      op: crypto.randomUUID(),
      next: 0,
      returnAfter,
    });
  }
  async function deleteDraft() {
    if (busy) return;
    setBusy(true);
    setError("");
    deleteOperation.current ??= crypto.randomUUID();
    try {
      const result = await rpc<{
        status: string;
        error_code?: string;
        deleted?: boolean;
      }>("sontu_delete_event_draft", {
        event_id: id,
        operation_id: deleteOperation.current,
      });
      if (result.status !== "ready" || !result.deleted) {
        setError(
          result.error_code === "DRAFT_HAS_ACTIVITY"
            ? "This draft already has coordination activity and cannot be deleted."
            : "This draft could not be deleted. It may no longer exist.",
        );
        setDeleteOpen(false);
        return;
      }
      navigate(returnTo, { replace: true });
    } catch {
      setError(
        "Deletion is unconfirmed. Retry Delete draft to safely check the same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  const blocked = busy || unknown;
  const blockers = draftBlockers(form);
  if (loading) return <p role="status">Loading your draft…</p>;
  return (
    <>
      <header className="section-heading">
        <div>
          <span className="eyebrow">
            {ownerName} event · {category} · {format.replace("-", " ")}
          </span>
          <h1>{form.title || "Something good starts here."}</h1>
        </div>
        <StatusBadge>
          {busy
            ? "Saving…"
            : unknown
              ? "Save unconfirmed"
              : saved && !dirty
                ? "Saved"
                : "Unsaved changes"}
        </StatusBadge>
      </header>
      <section
        className="creation-intent-summary"
        aria-label="Selected event setup"
      >
        <div>
          <span>Event type</span>
          <strong>{category}</strong>
        </div>
        <div>
          <span>Participation format</span>
          <strong>
            {format === "in-person"
              ? "In person"
              : format[0].toUpperCase() + format.slice(1)}
          </strong>
        </div>
      </section>
      {error && (
        <div className="coord-feedback" role="alert">
          <p>{error}</p>
          {unknown ? (
            <Button
              disabled={busy}
              onClick={() => pending.current && void run(pending.current)}
            >
              Retry same save
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void load()}>
              Reload saved draft
            </Button>
          )}
        </div>
      )}
      <form
        className="panel creation-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <fieldset disabled={blocked}>
          <section
            className="creation-section"
            aria-labelledby="basics-heading"
          >
            <h2 id="basics-heading">Event details</h2>
            <TextField
              label="Event title"
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
            <label className="field">
              Description <span className="small muted">Optional</span>
              <textarea
                maxLength={2000}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={4}
              />
            </label>
            <section
              className="picture-field"
              aria-labelledby="event-picture-label"
            >
              <div>
                <strong id="event-picture-label">Event picture</strong>
                <p className="small muted">Optional</p>
              </div>
              {form.cover_key !== "none" && (
                <img src={`images/${form.cover_key}.jpg`} alt="" />
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPictureOpen(true)}
              >
                <ImagePlus size={18} />
                Choose your picture
              </Button>
            </section>
          </section>

          <section
            className="creation-section"
            aria-labelledby="schedule-heading"
          >
            <h2 id="schedule-heading">When &amp; where</h2>
            <p className="small muted">
              Date and time use your device’s detected local timezone.
            </p>
            <div className="creation-time-grid">
              {(["starts_at", "ends_at"] as const).map((k) => (
                <TextField
                  key={`${k}:${form.timezone}`}
                  label={
                    k === "starts_at"
                      ? "Start date and time"
                      : "End date and time"
                  }
                  type="datetime-local"
                  required
                  value={wallTime(form[k], form.timezone)}
                  onChange={(e) => {
                    e.target.setCustomValidity("");
                    if (!e.target.value) {
                      update(k, "");
                      return;
                    }
                    const iso = instantForWall(e.target.value, form.timezone);
                    if (iso) {
                      update(k, iso);
                      if (
                        k === "starts_at" &&
                        (!form.ends_at ||
                          Date.parse(form.ends_at) <= Date.parse(iso))
                      ) {
                        update(
                          "ends_at",
                          new Date(Date.parse(iso) + 3_600_000).toISOString(),
                        );
                      }
                      setError("");
                    } else {
                      e.target.setCustomValidity(
                        "Choose an unambiguous local time.",
                      );
                      setError(
                        "This local time is missing or repeated during a clock change. Choose an unambiguous time.",
                      );
                    }
                  }}
                />
              ))}
            </div>
            <TextField
              label={
                format === "online"
                  ? "Online access details"
                  : format === "hybrid"
                    ? "Venue or access summary"
                    : "Location"
              }
              required
              maxLength={300}
              value={form.venue_label}
              onChange={(e) => update("venue_label", e.target.value)}
            />
            <TextField
              label="Participation limit (optional)"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => update("capacity", e.target.value)}
            />
            <p className="small muted">
              Leave this blank if the event does not need a participation limit.
            </p>
          </section>

          <section
            className="creation-section"
            aria-labelledby="access-heading"
          >
            <h2 id="access-heading">Who can see this event?</h2>
            <p className="small muted">
              Visibility controls who can view the event. Joining rules can be
              configured separately.
            </p>
            <fieldset className="visibility-options">
              <legend>Event visibility</legend>
              <label className={visibility === "PUBLIC" ? "selected" : ""}>
                <input
                  type="radio"
                  name="visibility"
                  value="PUBLIC"
                  checked={visibility === "PUBLIC"}
                  onChange={() => {
                    setVisibility("PUBLIC");
                    setDirty(true);
                    setSaved(false);
                  }}
                />
                <span>
                  <strong>Public</strong>
                  <small>
                    Anyone can view the event without a Sontu account. It may
                    appear in Discover.
                  </small>
                </span>
              </label>
              <label className={visibility === "PRIVATE" ? "selected" : ""}>
                <input
                  type="radio"
                  name="visibility"
                  value="PRIVATE"
                  checked={visibility === "PRIVATE"}
                  onChange={() => {
                    setVisibility("PRIVATE");
                    setDirty(true);
                    setSaved(false);
                  }}
                />
                <span>
                  <strong>Private</strong>
                  <small>
                    Only the host, authorized team and invited people can view
                    it.
                  </small>
                </span>
              </label>
              <label className={visibility === "UNLISTED" ? "selected" : ""}>
                <input
                  type="radio"
                  name="visibility"
                  value="UNLISTED"
                  checked={visibility === "UNLISTED"}
                  onChange={() => {
                    setVisibility("UNLISTED");
                    setDirty(true);
                    setSaved(false);
                  }}
                />
                <span>
                  <strong>Unlisted</strong>
                  <small>
                    Anyone with the event link can view it, but it will not
                    appear in Discover.
                  </small>
                </span>
              </label>
            </fieldset>
            {(visibility === "PUBLIC" || visibility === "UNLISTED") && (
              <fieldset className="visibility-options participation-access-options">
                <legend>Who can RSVP?</legend>
                <label
                  className={participationAccess === "ANYONE" ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="participation-access"
                    checked={participationAccess === "ANYONE"}
                    onChange={() => {
                      setParticipationAccess("ANYONE");
                      setDirty(true);
                      setSaved(false);
                    }}
                  />
                  <span>
                    <strong>Anyone</strong>
                    <small>
                      People can RSVP as a guest with their name and email, or
                      use a Sontu account.
                    </small>
                  </span>
                </label>
                <label
                  className={
                    participationAccess === "SONTU_USERS_ONLY" ? "selected" : ""
                  }
                >
                  <input
                    type="radio"
                    name="participation-access"
                    checked={participationAccess === "SONTU_USERS_ONLY"}
                    onChange={() => {
                      setParticipationAccess("SONTU_USERS_ONLY");
                      setDirty(true);
                      setSaved(false);
                    }}
                  />
                  <span>
                    <strong>Sontu members only</strong>
                    <small>
                      Everyone can view the event, but people must sign in or
                      create an account to RSVP.
                    </small>
                  </span>
                </label>
              </fieldset>
            )}
          </section>

          {blockers.length > 0 && (
            <div className="creation-blockers" role="status">
              <h3>Before you publish</h3>
              <ul>
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="coord-actions creation-actions">
            <Button
              type="button"
              variant="quiet"
              onClick={() => navigate(returnTo)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => save(true, false)}
            >
              Save draft
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
            >
              Preview
            </Button>
            <Button
              type="button"
              disabled={blockers.length > 0 || blocked}
              onClick={() =>
                void run(
                  dirty || !saved
                    ? {
                        cmd: "save_draft",
                        event: id,
                        version,
                        input: { ...form },
                        op: crypto.randomUUID(),
                        next: 0,
                        publishAfter: true,
                      }
                    : {
                        cmd: "publish",
                        event: id,
                        version,
                        input: { confirmed: true },
                        op: crypto.randomUUID(),
                        next: 0,
                      },
                )
              }
            >
              Publish event
            </Button>
          </div>
        </fieldset>
      </form>
      <p className="small muted">
        {dirty
          ? "Publish will save your changes first."
          : "Your saved draft is available in Hosting."}
      </p>
      <button
        type="button"
        className="delete-draft-action"
        disabled={busy}
        onClick={() => setDeleteOpen(true)}
      >
        Delete draft
      </button>
      {pictureOpen && (
        <Modal
          title="Choose your picture"
          onClose={() => setPictureOpen(false)}
        >
          <button type="button" className="picture-upload-placeholder" disabled>
            <Upload size={20} />
            <span>
              <strong>Upload a photo</strong>
              <small>Coming soon</small>
            </span>
          </button>
          <fieldset className="cover-options stock-cover-options">
            <legend>Choose a stock photo</legend>
            {covers.map((c) => (
              <label key={c} className={form.cover_key === c ? "selected" : ""}>
                <input
                  type="radio"
                  name="cover"
                  value={c}
                  checked={form.cover_key === c}
                  onChange={() => {
                    update("cover_key", c);
                    setPictureOpen(false);
                  }}
                />
                <img src={`images/${c}.jpg`} alt="" />
                <span>{c[0].toUpperCase() + c.slice(1)}</span>
              </label>
            ))}
          </fieldset>
        </Modal>
      )}
      {previewOpen && (
        <Modal title="Event preview" onClose={() => setPreviewOpen(false)}>
          <article className="creation-event-preview">
            <div className="preview-cover">
              {form.cover_key !== "none" ? (
                <img src={`images/${form.cover_key}.jpg`} alt="" />
              ) : (
                <div className="image-fallback">
                  Choose a picture to add a cover
                </div>
              )}
              <span className="tag">{category}</span>
            </div>
            <div className="preview-body">
              <div className="tags">
                <StatusBadge tone="info">
                  {visibility === "PUBLIC" ? "Public event" : visibility === "UNLISTED" ? "Unlisted event" : "Private event"}
                </StatusBadge>
                {(visibility === "PUBLIC" || visibility === "UNLISTED") && (
                  <StatusBadge>
                    {participationAccess === "ANYONE"
                      ? "Guest RSVP allowed"
                      : "Sontu users only"}
                  </StatusBadge>
                )}
                <span className="tag">
                  {format === "in-person" ? "In person" : format}
                </span>
              </div>
              <h1>{form.title || "Untitled event"}</h1>
              <div className="event-host-row">
                <span className="avatar hub-avatar">Y</span>
                <div>
                  <span className="small muted">Hosted by</span>
                  <strong>You</strong>
                </div>
                <StatusBadge>Host</StatusBadge>
              </div>
              <div className="preview-details">
                <div className="detail">
                  <CalendarDays />
                  <div>
                    <strong>
                      {wallTime(form.starts_at, form.timezone).replace(
                        "T",
                        " · ",
                      ) || "Date needed"}
                    </strong>
                    <p>
                      Ends{" "}
                      {wallTime(form.ends_at, form.timezone).replace(
                        "T",
                        " · ",
                      ) || "time needed"}
                    </p>
                  </div>
                </div>
                <div className="detail">
                  <MapPin />
                  <div>
                    <strong>{form.venue_label || "Location needed"}</strong>
                    <p>
                      {format === "online" ? "Online event" : "Event location"}
                    </p>
                  </div>
                </div>
                <div className="detail">
                  <Users />
                  <div>
                    <strong>1 going</strong>
                    <p>
                      {form.capacity
                        ? `${Math.max(0, Number(form.capacity) - 1)} places remaining`
                        : "No participation limit"}
                    </p>
                  </div>
                </div>
              </div>
              <section className="hub-about">
                <h2>About this event</h2>
                <p>
                  {form.description ||
                    "The host hasn’t added a description yet."}
                </p>
              </section>
            </div>
          </article>
        </Modal>
      )}
      {deleteOpen && (
        <Modal
          title="Delete this draft?"
          onClose={() => !busy && setDeleteOpen(false)}
        >
          <p>
            This permanently removes the draft and its saved details. This
            cannot be undone.
          </p>
          <div className="coord-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setDeleteOpen(false)}
            >
              Keep draft
            </Button>
            <Button
              type="button"
              className="danger-action"
              disabled={busy}
              onClick={() => void deleteDraft()}
            >
              {busy ? "Deleting…" : "Delete draft"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
