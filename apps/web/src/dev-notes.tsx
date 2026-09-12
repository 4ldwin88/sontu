/* oxlint-disable react/set-state-in-effect -- Observe the current native top layer for the beta feedback control. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "../../../packages/ui-web";
import { supabase } from "../../../packages/data/sontu";
import { useAccount } from "./account-state";
import { Modal } from "./shells";

function category(path: string) {
  if (/^\/(core|host)/.test(path)) return "hosting";
  if (/^\/(invite|respond)/.test(path)) return "invitation";
  if (/^\/(sign-|account)/.test(path)) return "account";
  return (
    ["home", "discover", "events", "feed", "profile"].find(
      (s) => path === "/" + s || path.startsWith("/" + s + "/"),
    ) ?? "other"
  );
}
type Note = { id: string; body: string; screen: string; created_at?: string };
export function DevNotes() {
  const account = useAccount();
  return (
    <Notes
      key={account.session?.user.id ?? "signed-out"}
      signedIn={!!account.session}
    />
  );
}
function Notes({ signedIn }: { signedIn: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false),
    [body, setBody] = useState(""),
    [screen, setScreen] = useState("other");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [unknown, setUnknown] = useState(false);
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
    if (!signedIn) return;
    const { data, error } = await supabase
      .from("sontu_dev_notes")
      .select("id,body,screen,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error)
      setMessage("Saved notes could not be loaded. Your draft is still here.");
    else setNotes(data ?? []);
  }
  async function save() {
    if (!signedIn || busy || !body.trim()) return;
    pending.current ??= { id: crypto.randomUUID(), body: body.trim(), screen };
    const note = pending.current;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from("sontu_dev_notes").insert(note);
      if (error && error.code !== "23505") throw error;
      const result = await supabase
        .from("sontu_dev_notes")
        .select("id,body,screen")
        .eq("id", note.id)
        .single();
      if (
        result.error ||
        result.data?.body !== note.body ||
        result.data?.screen !== note.screen
      )
        throw new Error("Unconfirmed");
      pending.current = null;
      setUnknown(false);
      setBody("");
      await load();
      setMessage("Note saved for development review.");
    } catch {
      setUnknown(true);
      setMessage("Saving is unconfirmed. Retry the same note safely.");
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
          onClick={() => {
            setOpen(true);
            if (!pending.current) setScreen(category(location.pathname));
            setMessage("");
            void load();
          }}
        >
          <Plus size={25} />
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
              Screen: {screen}. Only your note and this screen category are
              saved. No screen recording or automatic activity tracking.
            </p>
            <label className="dev-note-field">
              What should we fix or improve?
              <textarea
                required
                maxLength={4000}
                rows={5}
                value={body}
                disabled={busy || unknown}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            {!signedIn && (
              <p>
                Sign in to save notes to Sontu. You can copy this note to share
                in chat while signed out.
              </p>
            )}
            {message && <p role="status">{message}</p>}
            <div className="coord-actions">
              <Button
                type="submit"
                disabled={!signedIn || busy || !body.trim()}
              >
                {busy ? "Saving…" : unknown ? "Retry same note" : "Save note"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!body.trim()}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(body);
                    setMessage("Note copied.");
                  } catch {
                    setMessage(
                      "Could not copy. Select and copy the note text manually.",
                    );
                  }
                }}
              >
                Copy note
              </Button>
            </div>
          </form>
          {signedIn && (
            <section className="dev-note-history">
              <h3>Your recent notes</h3>
              {notes.length ? (
                <ul>
                  {notes.map((n) => (
                    <li key={n.id}>
                      <small>{n.screen}</small>
                      <p>{n.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No saved notes loaded.</p>
              )}
            </section>
          )}
        </Modal>
      )}
    </>
  );
}
