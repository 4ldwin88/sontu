/* oxlint-disable react/set-state-in-effect -- Observe the current native top layer for the beta feedback control. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "../../../packages/ui-web";
import { supabase } from "../../../packages/data/sontu";
import {
  betaSessionId,
  trackBeta,
  type TelemetryScreen,
} from "../../../packages/data/telemetry";
import { useAccount } from "./account-state";
import { Modal } from "./shells";
import { clientUuid } from "./ids";

const localNotesKey = "sontu.devNotes.v1";

function category(path: string) {
  if (/^\/(core|host)/.test(path)) return "hosting";
  if (/^\/(invite|respond)/.test(path)) return "invitation";
  if (/^\/(sign-|account)/.test(path)) return "account";
  if (/^\/(connections|profile|settings|privacy|help|about)(\/|$)/.test(path))
    return "profile";
  return (
    ["home", "discover", "events", "feed"].find(
      (s) => path === "/" + s || path.startsWith("/" + s + "/"),
    ) ?? "other"
  );
}

type Note = { id: string; body: string; screen: string; created_at?: string };

function noteTime(value?: string) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  const two = (part: number) => String(part).padStart(2, "0");
  return `${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function localNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(localNotesKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note): note is Note =>
        typeof note === "object" &&
        note !== null &&
        typeof note.id === "string" &&
        typeof note.body === "string" &&
        typeof note.screen === "string",
    );
  } catch {
    return [];
  }
}

function noteId() {
  return clientUuid();
}

function saveLocalNote(note: Note) {
  try {
    const notes = [note, ...localNotes().filter((item) => item.id !== note.id)].slice(0, 25);
    localStorage.setItem(localNotesKey, JSON.stringify(notes));
    return notes;
  } catch {
    return null;
  }
}

function mergeNotes(...groups: Note[][]) {
  const seen = new Set<string>();
  return groups
    .flat()
    .filter((note) => {
      if (seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    })
    .slice(0, 25);
}

export function DevNotes() {
  const account = useAccount();
  return (
    <Notes
      key={account.session?.user.id ?? "signed-out"}
      signedIn={!!account.session}
      userId={account.session?.user.id ?? null}
    />
  );
}

function Notes({ signedIn, userId }: { signedIn: boolean; userId: string | null }) {
  const location = useLocation();
  const [open, setOpen] = useState(false),
    [body, setBody] = useState(""),
    [screen, setScreen] = useState("other");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [unknown, setUnknown] = useState(false),
    [hasPendingSync, setHasPendingSync] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]),
    [target, setTarget] = useState<Element>(document.body);
  const pending = useRef<Note | null>(null);

  useEffect(() => {
    if (open) return;
    const update = () => {
      const dialogs = [...document.querySelectorAll("dialog[open]")];
      setTarget(dialogs.at(-1) ?? document.body);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
    });
    update();
    return () => observer.disconnect();
  }, [open]);

  async function load() {
    const deviceNotes = localNotes();
    setNotes(deviceNotes);
    if (!signedIn || !userId) return;
    const { data, error } = await supabase
      .from("sontu_dev_notes")
      .select("id,body,screen,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      setMessage("Cloud notes could not be loaded. Device notes are still here.");
      return;
    }
    setNotes((current) => mergeNotes(data ?? [], localNotes(), current));
  }

  async function copyNoteText() {
    if (!body.trim()) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(body);
      setMessage("Note copied.");
      return;
    } catch {
      const field = document.querySelector<HTMLTextAreaElement>("#dev-note-body");
      field?.focus();
      field?.select();
      try {
        if (document.execCommand("copy")) {
          setMessage("Note copied.");
          return;
        }
      } catch {
        /* Selection fallback below. */
      }
      setMessage("Copy is blocked by this browser. The note text is selected; use your device copy command.");
    }
  }

  async function save() {
    if ((!body.trim() && !pending.current) || busy) return;
    setMessage("Saving note...");
    let note: Note;
    try {
      if (!pending.current) {
        pending.current = {
          id: noteId(),
          body: body.trim(),
          screen,
          created_at: new Date().toISOString(),
        };
        setHasPendingSync(true);
      }
      note = pending.current;
    } catch {
      setUnknown(true);
      setMessage("This browser could not start the save. Copy the note here instead.");
      return;
    }
    const saved = saveLocalNote(note);
    if (!saved) {
      setUnknown(true);
      setMessage("This browser blocked device storage. Copy the note here instead.");
      return;
    }
    setNotes(saved);
    setBody("");
    setUnknown(false);
    trackBeta("dev_note_submit_succeeded", note.screen as TelemetryScreen);

    setBusy(true);
    setMessage(
      signedIn
        ? "Note saved on this device. Syncing to account..."
        : "Note saved on this device. Syncing to local prototype...",
    );
    try {
      const cloudPayload = signedIn
        ? { ...note, user_id: userId }
        : { ...note, user_id: null, session_id: betaSessionId() };
      const { error } = await supabase
        .from("sontu_dev_notes")
        .insert(cloudPayload);
      if (error && error.code !== "23505") throw error;
      let cloudNote = note;
      if (signedIn) {
        const result = await supabase
          .from("sontu_dev_notes")
          .select("id,body,screen")
          .eq("id", note.id)
          .maybeSingle();
        if (
          result.error ||
          result.data?.body !== note.body ||
          result.data?.screen !== note.screen
        )
          throw result.error ?? new Error("Unconfirmed");
        cloudNote = result.data
          ? { ...note, body: result.data.body, screen: result.data.screen }
          : note;
      }
      setNotes((current) => mergeNotes([cloudNote], current));
      pending.current = null;
      setHasPendingSync(false);
      setMessage(
        signedIn
          ? "Note saved on this device and synced to your account."
          : "Note saved on this device and synced to the local prototype.",
      );
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code)
          : "unconfirmed";
      setUnknown(true);
      setMessage(`Note saved on this device. Account sync is unconfirmed (${code}).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {createPortal(
        <button
          hidden={open}
          className="dev-notes-fab"
          type="button"
          aria-label="Add dev note"
          title="Add dev note"
          onKeyDown={(e) => {
            // React portal events follow the React tree, so the drawer's
            // synthetic Tab handler cannot receive this button's key event.
            if (e.key !== "Tab" || e.shiftKey || target.tagName !== "DIALOG")
              return;
            const first = [
              ...target.querySelectorAll<HTMLElement>(
                'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
              ),
            ].find((el) => el.getClientRects().length > 0);
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
          onClick={() => {
            setOpen(true);
            if (!pending.current) setScreen(category(location.pathname));
            setMessage("");
            void load();
          }}
        >
          <Plus size={18} />
          <span>Dev note</span>
        </button>,
        target,
      )}
      {open && (
        <Modal title="Dev notes" onClose={() => !busy && setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <p className="small muted">
              Screen: {screen}. Saves your note on this device first. Signed-in
              sessions also try to sync a copy to the local Sontu database.
            </p>
            <label className="dev-note-field">
              What should we fix or improve?
              <textarea
                required
                id="dev-note-body"
                maxLength={4000}
                rows={5}
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            {message && <p role="status">{message}</p>}
            <div className="coord-actions">
              <Button
                type="button"
                disabled={busy || (!body.trim() && !hasPendingSync)}
                onClick={() => void save()}
              >
                {busy ? "Syncing..." : unknown ? "Retry sync" : "Save note"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!body.trim()}
                onClick={() => void copyNoteText()}
              >
                Copy note
              </Button>
            </div>
          </form>
          <section className="dev-note-history">
            <h3>Recent notes on this device</h3>
            {notes.length ? (
              <ul>
                {notes.map((n) => (
                  <li key={n.id}>
                    <div className="dev-note-meta">
                      <small>{n.screen}</small>
                      <time dateTime={n.created_at}>{noteTime(n.created_at)}</time>
                    </div>
                    <p>{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No notes saved on this device yet.</p>
            )}
          </section>
        </Modal>
      )}
    </>
  );
}

