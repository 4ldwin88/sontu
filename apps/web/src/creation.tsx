/* oxlint-disable react/set-state-in-effect -- Loading drafts from the backend is an external synchronization. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, TextField, StatusBadge } from "../../../packages/ui-web";
import { FocusedWorkspaceShell } from "./shells";
import { SessionGate } from "./coordination";
import { hostCommand, hostRead, rpc } from "../../../packages/data/sontu";
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
const covers = ["none", "food", "sunset", "music", "market", "yoga", "sailing"];
export function Creation() {
  const { eventId } = useParams();
  return (
    <FocusedWorkspaceShell
      title={eventId ? "Your event draft" : "Create Event"}
      back="/core"
    >
      <main id="main" tabIndex={-1} className="coord-entry">
        <SessionGate>
          {eventId ? (
            <DraftEditor key={eventId} id={eventId} />
          ) : (
            <CreateEntry />
          )}
        </SessionGate>
      </main>
    </FocusedWorkspaceShell>
  );
}
function CreateEntry() {
  const navigate = useNavigate();
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
    rpc<{ events: typeof drafts }>("sontu_host_projection", { event_id: null })
      .then((r) =>
        setDrafts(
          r.events.filter(
            (e) => e.lifecycle === "DRAFT" && e.event_kind === "SIMPLE",
          ),
        ),
      )
      .catch(() =>
        setError(
          "Could not load existing drafts. Refresh before starting another.",
        ),
      );
  }, []);
  async function create() {
    if (busy) return;
    setBusy(true);
    const req = pending.current ?? {
      cmd: "create_draft",
      event: null,
      version: 1,
      input: { timezone: deviceTimezone() },
      op: crypto.randomUUID(),
      next: 0,
    };
    pending.current = req;
    keep("new", req);
    try {
      const r = await hostCommand(req.cmd, null, 1, req.input, req.op);
      if (r.status === "ready") {
        keep("new", null);
        pending.current = null;
        navigate(`/create/${r.event_id}`, { replace: true });
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
      <span className="eyebrow">Personal hosting</span>
      <h1>Make a little room for together.</h1>
      <p>
        Start with the essentials. Your draft stays private until you
        deliberately publish it.
      </p>
      {drafts.length > 0 && (
        <section className="panel">
          <h2>Pick up where you left off</h2>
          {drafts.map((d) => (
            <p key={d.id}>
              <Link className="text-action" to={`/create/${d.id}`}>
                {d.title || "Untitled event"}
              </Link>
            </p>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>A simple gathering</h2>
        <p>
          You are the owner. One date, one location, no payments or admission
          setup.
        </p>
        <Button disabled={busy} onClick={() => void create()}>
          {busy
            ? "Creating draft…"
            : error
              ? "Retry draft creation"
              : "Start a new draft"}
        </Button>
      </section>
      {error && <p role="alert">{error}</p>}
      <Link className="text-action" to="/core">
        Back to Hosting
      </Link>
    </>
  );
}
function DraftEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const pending = useRef<Request | null>(readPending(id));
  const [form, setForm] = useState<DraftFields>(emptyDraft),
    [version, setVersion] = useState(1),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [unknown, setUnknown] = useState(() => !!readPending(id)),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await hostRead(id);
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
        setError("This is a validation fixture. Open it through Hosting.");
        return;
      }
      const v = d.version;
      setForm({
        title: v.title,
        description: v.description,
        starts_at: v.starts_at ?? "",
        ends_at: v.ends_at ?? "",
        timezone: v.timezone,
        venue_label: v.venue_label,
        cover_key: v.cover_key ?? "none",
        capacity: v.capacity?.toString() ?? "",
      });
      setVersion(d.event.current_version_number);
      setDirty(false);
      setSaved(true);
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
  }, [id, navigate]);
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
      pending.current = null;
      keep(id, null);
      setUnknown(false);
      if (r.status !== "ready") {
        setError(
          errorMessages[r.error_code ?? ""] ??
            "Could not save. Your entered details are still here.",
        );
        return;
      }
      setVersion(r.current_version ?? version);
      if (req.cmd === "publish") {
        navigate(`/core/events/${id}/host`, { replace: true });
        return;
      }
      setForm(req.input as unknown as DraftFields);
      setDirty(false);
      setSaved(true);
      setStep(req.next);
    } catch {
      setUnknown(true);
      setError(
        "The save outcome is unconfirmed. Retry this same request to recover the result.",
      );
    } finally {
      setBusy(false);
    }
  }
  function save(next = step) {
    if (
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
      next,
    });
  }
  const blocked = busy || unknown;
  const blockers = draftBlockers(form);
  if (loading) return <p role="status">Loading your draft…</p>;
  return (
    <>
      <header className="section-heading">
        <div>
          <span className="eyebrow">Personal event · You are the owner</span>
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
      <ol className="creation-steps" aria-label="Creation progress">
        {["The idea", "When & where", "Review"].map((s, i) => (
          <li key={s} aria-current={step === i ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
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
          save(Math.min(2, step + 1));
        }}
      >
        <fieldset disabled={blocked}>
          {step === 0 && (
            <>
              <h2>The idea</h2>
              <TextField
                label="Event title"
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
              <fieldset className="cover-options">
                <legend>Cover image · optional</legend>
                {covers.map((c) => (
                  <label key={c}>
                    <input
                      type="radio"
                      name="cover"
                      value={c}
                      checked={form.cover_key === c}
                      onChange={() => update("cover_key", c)}
                    />
                    {c !== "none" && <img src={`images/${c}.jpg`} alt="" />}
                    <span>
                      {c === "none"
                        ? "No image"
                        : c[0].toUpperCase() + c.slice(1)}
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 1 && (
            <>
              <h2>When & where</h2>
              <label className="field">
                Event timezone
                <select
                  value={form.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                >
                  {Array.from(
                    new Set([
                      form.timezone,
                      ...Intl.supportedValuesOf("timeZone"),
                    ]),
                  ).map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              <p className="small muted">
                New events start in your device timezone. Times below use the
                saved event timezone. Changing it preserves the moment and
                updates its displayed local time.
              </p>
              {(["starts_at", "ends_at"] as const).map((k) => (
                <TextField
                  key={`${k}:${form.timezone}:${version}`}
                  label={
                    k === "starts_at"
                      ? "Start date and time"
                      : "End date and time"
                  }
                  type="datetime-local"
                  defaultValue={wallTime(form[k], form.timezone)}
                  onBlur={(e) => {
                    e.target.setCustomValidity("");
                    if (!e.target.value) {
                      update(k, "");
                      return;
                    }
                    const iso = instantForWall(e.target.value, form.timezone);
                    if (iso) {
                      update(k, iso);
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
              <TextField
                label="Location"
                maxLength={300}
                value={form.venue_label}
                onChange={(e) => update("venue_label", e.target.value)}
              />
              <TextField
                label="Participation limit · optional"
                type="number"
                min={1}
                max={10000}
                value={form.capacity}
                onChange={(e) => update("capacity", e.target.value)}
              />
              <p className="small muted">
                This limits confirmed participation when invitations are
                activated. It is not a physical safety capacity.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <h2>Review your event</h2>
              {form.cover_key !== "none" && (
                <img
                  className="creation-preview"
                  src={`images/${form.cover_key}.jpg`}
                  alt=""
                />
              )}
              <h3>{form.title || "Untitled event"}</h3>
              <p>{form.description}</p>
              <p>
                {wallTime(form.starts_at, form.timezone).replace("T", " · ")} —{" "}
                {wallTime(form.ends_at, form.timezone).replace("T", " · ")}
              </p>
              <p>
                {form.timezone} · {form.venue_label || "Location needed"}
              </p>
              <p>
                Owner: you · One occurrence ·{" "}
                {form.capacity
                  ? `${form.capacity} participant limit`
                  : "No participation limit set"}
              </p>
              <p>
                Publishing saves the event as active. It does not send
                invitations or make protected details publicly accessible.
              </p>
              {blockers.length > 0 && (
                <div role="status">
                  <h3>Before you publish</h3>
                  <ul>
                    {blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="coord-actions">
            {step > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => save(step - 1)}
              >
                Save & back
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => save()}>
              Save draft
            </Button>
            {step < 2 ? (
              <Button>Save & continue</Button>
            ) : (
              <Button
                type="button"
                disabled={blockers.length > 0 || dirty}
                onClick={() =>
                  void run({
                    cmd: "publish",
                    event: id,
                    version,
                    input: { confirmed: true },
                    op: crypto.randomUUID(),
                    next: 2,
                  })
                }
              >
                Publish event
              </Button>
            )}
          </div>
        </fieldset>
      </form>
      <p className="small muted">
        Save before leaving. Your saved draft is available in Hosting.
      </p>
    </>
  );
}
