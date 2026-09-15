import {
  clearDiagnostics,
  diagnosticEntries,
} from "../../../packages/data/diagnostics";
import { rpc } from "../../../packages/data/sontu";
import { useAccount } from "./account-state";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ArrowRight,
  Users,
  Settings,
  Shield,
  CircleHelp,
  Info,
  LogOut,
  Building2,
} from "lucide-react";
import { Button, TextField } from "../../../packages/ui-web";
const destinations = [
  { label: "Organizations", path: "/organizations", icon: Building2 },
  { label: "Connections", path: "/connections", icon: Users },
  { label: "Settings & Preferences", path: "/settings", icon: Settings },
  { label: "Privacy & Safety", path: "/privacy", icon: Shield },
  { label: "Help & Support", path: "/help", icon: CircleHelp },
  { label: "About Sontu", path: "/about", icon: Info },
  { label: "Sign Out", path: "/sign-out", icon: LogOut },
];
export function ProfileDrawerContent({
  profile,
}: {
  profile: { displayName: string; username: string };
}) {
  const account = useAccount();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  if (!account.session)
    return (
      <section className="profile-menu">
        <h2>Make room for real life.</h2>
        <p>Sign in to your events or create your Sontu account.</p>
        <Link
          to={`/sign-in?next=${encodeURIComponent(returnTo)}`}
          className="account-menu-entry"
        >
          Sign in/Create Account
        </Link>
        <nav aria-label="Profile utilities">
          {destinations
            .filter((d) => !["/sign-out", "/connections"].includes(d.path))
            .map((d) => (
              <Link key={d.path} to={d.path}>
                {d.label}
              </Link>
            ))}
        </nav>
      </section>
    );
  return (
    <section className="profile-menu">
      <div className="profile-identity">
        <span
          className="avatar profile-avatar"
          aria-label="Profile avatar placeholder"
        >
          {profile.displayName[0]}
        </span>
        <div>
          <h2>{profile.displayName}</h2>
          <p className="muted">@{profile.username}</p>
        </div>
      </div>
      <div className="profile-entry-actions">
        <Link to="/profile">View Profile</Link>
        <Link to="/profile?edit=1">Edit Profile</Link>
      </div>
      <nav aria-label="Profile utilities">
        {destinations.map(({ label, path, icon: Icon }) => (
          <Link key={path} to={path}>
            <Icon size={21} />
            <span>{label}</span>
            <ArrowRight size={16} />
          </Link>
        ))}
      </nav>
    </section>
  );
}
const pages: Record<string, { title: string; intro: string; body: string }> = {
  connections: {
    title: "Connections",
    intro: "People and relationships around shared experiences.",
    body: "Connections will grow from shared events. Relationship requests and types are not available yet.",
  },
  privacy: {
    title: "Privacy & Safety",
    intro: "Your boundaries, in one place.",
    body: "Signed-in members can submit private data-access, correction, or account-closure requests here. Discoverability and additional safety controls are not available yet.",
  },
  help: {
    title: "Help & Support",
    intro: "Find your way around Sontu.",
    body: "Use Events for Upcoming, Invited, Interested and Hosting. Signed-in members can also submit a private support report from this area.",
  },
  about: {
    title: "About Sontu",
    intro: "Living life, together.",
    body: "Sontu brings event discovery, participation, admissions, and contextual hosting into one experience.",
  },
  "sign-out": {
    title: "Sign Out",
    intro: "End this account session on this device.",
    body: "Signing out ends this session and returns you to Sontu’s home screen.",
  },
};
export function ProfileUtilityPage({
  kind,
  onBack,
}: {
  kind: string;
  onBack: () => void;
}) {
  if (kind === "connections") return <ConnectionsPage onBack={onBack} />;
  const p = pages[kind];
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <button
        onClick={onBack}
        className="icon-button back-chevron"
        aria-label="Back to Profile"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <h1>{p.title}</h1>
      <p className="muted">{p.intro}</p>
      <section className="panel">
        <p>{p.body}</p>
        {kind === "help" && <DiagnosticPanel />}
      </section>
    </main>
  );
}

type Connection = { id: string; status: "PENDING" | "ACCEPTED"; direction: "INCOMING" | "OUTGOING"; user_id: string; display_name: string; handle: string };
type ConnectionContext = { id: string; name: string; members: Array<{ user_id: string; display_name: string; handle: string }> };
export function ConnectionsPage({ onBack }: { onBack: () => void }) {
  const account = useAccount();
  const [connections, setConnections] = useState<Connection[]>([]), [contexts, setContexts] = useState<ConnectionContext[]>([]), [handle, setHandle] = useState(""), [contextName, setContextName] = useState(""), [message, setMessage] = useState("");
  const readConnections = async () =>
    rpc<{ status: string; connections?: Connection[]; contexts?: ConnectionContext[] }>("sontu_connections", { action: "read", input: {} });
  useEffect(() => {
    if (!account.session) return;
    let cancelled = false;
    void readConnections()
      .then((result) => {
        if (cancelled || result.status !== "ready") return;
        setConnections(result.connections ?? []);
        setContexts(result.contexts ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessage("Connections could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [account.session]);
  const load = async () => {
    const result = await rpc<{ status: string; connections?: Connection[]; contexts?: ConnectionContext[] }>("sontu_connections", { action: "read", input: {} });
    if (result.status === "ready") { setConnections(result.connections ?? []); setContexts(result.contexts ?? []); }
  };
  if (!account.session) return <Navigate to="/sign-in?next=%2Fconnections" replace />;
  const run = async (action: string, input: Record<string, string>) => {
    setMessage("");
    const result = await rpc<{ status: string; error_code?: string }>("sontu_connections", { action, input });
    if (result.status !== "ready") { setMessage(result.error_code === "MEMBER_NOT_FOUND" ? "No Sontu member was found with that handle." : "That change could not be completed."); return; }
    setHandle(""); setContextName(""); await load();
  };
  const accepted = connections.filter((connection) => connection.status === "ACCEPTED");
  return <main id="main" tabIndex={-1} className="settings-page"><button onClick={onBack} className="icon-button back-chevron" aria-label="Back to Profile"><ChevronLeft size={26} strokeWidth={2.5} /></button><h1>Connections</h1><p className="muted">Choose people and private contexts for future invitations.</p><section className="panel"><form onSubmit={(event) => { event.preventDefault(); void run("request", { handle }); }}><TextField label="Connect by handle" name="handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="member_handle" /><Button type="submit">Send connection request</Button></form>{message && <p role="status">{message}</p>}</section><section className="panel"><h2>People</h2>{connections.length ? connections.map((connection) => <div key={connection.id} className="settings-row"><span>{connection.display_name} · @{connection.handle} {connection.status === "PENDING" ? "(pending)" : ""}</span>{connection.status === "PENDING" && connection.direction === "INCOMING" ? <Button onClick={() => void run("accept", { connection_id: connection.id })}>Accept</Button> : <Button variant="quiet" onClick={() => void run("remove", { connection_id: connection.id })}>Remove</Button>}</div>) : <p className="muted">No connections yet.</p>}</section><section className="panel"><h2>Private contexts</h2><form onSubmit={(event) => { event.preventDefault(); void run("create_context", { name: contextName }); }}><TextField label="New context" name="context" value={contextName} onChange={(event) => setContextName(event.target.value)} placeholder="RAJA, Family, Close friends" /><Button type="submit">Create context</Button></form>{contexts.map((context) => <div key={context.id} className="settings-row"><span>{context.name} · {context.members.length} people</span><select aria-label={`Add person to ${context.name}`} defaultValue="" onChange={(event) => { if (event.target.value) void run("add_member", { context_id: context.id, user_id: event.target.value }); }}><option value="">Add a connection</option>{accepted.filter((connection) => !context.members.some((member) => member.user_id === connection.user_id)).map((connection) => <option key={connection.user_id} value={connection.user_id}>{connection.display_name}</option>)}</select></div>)}</section></main>;
}

type PrivacyRequest = {
  id: string;
  request_kind: "ACCESS_EXPORT" | "CORRECTION" | "DELETE_OR_CLOSE";
  status: "RECEIVED" | "IN_REVIEW" | "COMPLETED" | "DECLINED";
  requested_at: string;
  resolved_at: string | null;
};
const privacyActions: Array<{
  kind: PrivacyRequest["request_kind"];
  title: string;
  body: string;
}> = [
  {
    kind: "ACCESS_EXPORT",
    title: "Request a copy of your data",
    body: "Request access or an export of data connected to your Sontu account.",
  },
  {
    kind: "CORRECTION",
    title: "Request a correction",
    body: "Use this when your profile edit cannot correct the relevant data.",
  },
  {
    kind: "DELETE_OR_CLOSE",
    title: "Request account closure",
    body: "Closure is reviewed because some event, organization, financial, fraud, or audit records may have separate retention duties.",
  },
];
export function HelpSupportPage({ onBack }: { onBack: () => void }) {
  const account = useAccount();
  const [params] = useSearchParams();
  const eventInstanceId = params.get("event");
  const [kind, setKind] = useState("PRODUCT_DEFECT"),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reports, setReports] = useState<
      Array<{ id: string; report_kind: string; status: string }>
    >([]);
  const load = () =>
    rpc<{
      status: string;
      reports?: Array<{ id: string; report_kind: string; status: string }>;
    }>("sontu_support_report", { action: "read", input: {} }).then(
      (r) => r.status === "ready" && setReports(r.reports ?? []),
    );
  useEffect(() => {
    if (account.session) void load();
  }, [account.session]);
  if (!account.session) return <Navigate to="/sign-in?next=%2Fhelp" replace />;
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <button
        onClick={onBack}
        className="icon-button back-chevron"
        aria-label="Back to Profile"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <h1>Help & Support</h1>
      {eventInstanceId && (
        <p className="small muted">
          This report is linked to the event you came from.
        </p>
      )}
      <p className="muted">
        Send a private report to Sontu. This is not an emergency service.
      </p>
      <section className="panel">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const r = await rpc<{ status: string }>("sontu_support_report", {
                action: "create",
                input: {
                  report_kind: kind,
                  body,
                  event_instance_id: eventInstanceId,
                },
              });
              if (r.status !== "ready") throw new Error();
              setBody("");
              setMessage("Your report was recorded for review.");
              await load();
            } catch {
              setMessage(
                "Your report could not be recorded. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Report type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="PRODUCT_DEFECT">Product defect</option>
              <option value="ACCOUNT_ACCESS">Account or access</option>
              <option value="EVENT_PARTICIPATION">
                Event or participation
              </option>
              <option value="PRIVACY_ACCESS">Privacy or access</option>
              <option value="FRAUD_IMPERSONATION">
                Fraud or impersonation
              </option>
              <option value="HARASSMENT_THREAT">Harassment or threat</option>
              <option value="SAFETY_CONCERN">Safety concern</option>
            </select>
          </label>
          <TextField
            label="What happened?"
            required
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="small muted">
            Do not include passwords, payment details, management links, or
            unnecessary sensitive information.
          </p>
          <Button disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
          {message && <p role="status">{message}</p>}
        </form>
        {reports.length > 0 && (
          <section className="subpanel">
            <h2>Your reports</h2>
            {reports.map((report) => (
              <p key={report.id} className="small">
                {report.report_kind.replaceAll("_", " ").toLowerCase()} ·{" "}
                {report.status.toLowerCase().replaceAll("_", " ")}
              </p>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
export function PrivacyRequestsPage({ onBack }: { onBack: () => void }) {
  const account = useAccount();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [busy, setBusy] = useState<PrivacyRequest["request_kind"] | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => {
    const result = await rpc<{ status: string; requests?: PrivacyRequest[] }>(
      "sontu_privacy_request",
      { action: "read", requested_kind: null },
    );
    if (result.status === "ready") setRequests(result.requests ?? []);
  };
  useEffect(() => {
    if (!account.session) return;
    void rpc<{ status: string; requests?: PrivacyRequest[] }>(
      "sontu_privacy_request",
      { action: "read", requested_kind: null },
    )
      .then((result) => {
        if (result.status === "ready") setRequests(result.requests ?? []);
      })
      .catch(() => setMessage("Your request history could not be loaded."));
  }, [account.session]);
  if (!account.session)
    return <Navigate to="/sign-in?next=%2Fprivacy" replace />;
  const submit = async (kind: PrivacyRequest["request_kind"]) => {
    setBusy(kind);
    setMessage("");
    try {
      const result = await rpc<{
        status: string;
        already_open?: boolean;
        request?: PrivacyRequest;
      }>("sontu_privacy_request", { action: "request", requested_kind: kind });
      if (result.status !== "ready") throw new Error("request not accepted");
      setMessage(
        result.already_open
          ? "That request is already open."
          : "Your request has been recorded for review.",
      );
      await load();
    } catch {
      setMessage("Your request could not be recorded. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <button
        onClick={onBack}
        className="icon-button back-chevron"
        aria-label="Back to Profile"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <h1>Privacy & Safety</h1>
      <p className="muted">
        Manage your information and make a privacy request.
      </p>
      <section className="panel">
        <h2>Privacy requests</h2>
        <p className="small muted">
          We use your signed-in session to associate this request with your
          account. Do not include sensitive details here.
        </p>
        <div className="stacked-actions">
          {privacyActions.map((action) => {
            const open = requests.find(
              (request) =>
                request.request_kind === action.kind &&
                ["RECEIVED", "IN_REVIEW"].includes(request.status),
            );
            return (
              <section key={action.kind} className="subpanel">
                <h3>{action.title}</h3>
                <p className="small muted">{action.body}</p>
                {open ? (
                  <p className="small">
                    Status:{" "}
                    {open.status === "IN_REVIEW" ? "In review" : "Received"}
                  </p>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => submit(action.kind)}
                  >
                    {busy === action.kind ? "Recording…" : "Make request"}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
        {message && <p role="status">{message}</p>}
      </section>
    </main>
  );
}

function DiagnosticPanel() {
  const [entries, setEntries] = useState(diagnosticEntries),
    [message, setMessage] = useState("");
  return (
    <section className="diagnostic-panel">
      <h2>Error diagnostics</h2>
      <p className="small muted">
        Recent errors from this tab only. No screen recording, passwords,
        invitation links, account identities or event details. Nothing is sent
        automatically.
      </p>
      <p>{entries.length} recent error records</p>
      <div className="coord-actions">
        <Button
          variant="secondary"
          onClick={async () => {
            const current = diagnosticEntries();
            setEntries(current);
            try {
              await navigator.clipboard.writeText(
                JSON.stringify({ app: "Sontu", diagnostics: current }, null, 2),
              );
              setMessage(
                "Diagnostics copied. Share them with your bug report.",
              );
            } catch {
              setMessage("Copy unavailable. You can select the report below.");
            }
          }}
        >
          Copy diagnostics
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            clearDiagnostics();
            setEntries([]);
            setMessage("Diagnostics cleared.");
          }}
        >
          Clear diagnostics
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      <details>
        <summary>View diagnostic report</summary>
        <pre className="diagnostic-report">
          {JSON.stringify(entries, null, 2)}
        </pre>
      </details>
    </section>
  );
}
