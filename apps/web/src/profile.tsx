import {
  clearDiagnostics,
  diagnosticEntries,
} from "../../../packages/data/diagnostics";
import { rpc } from "../../../packages/data/sontu";
import { profileAvatarUrl, useAccount } from "./account-state";
import { type ReactNode, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
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
  CalendarDays,
  QrCode,
  UserRound,
  UserCheck,
  UserPlus,
  Link as LinkIcon,
  Mail,
  Phone,
  MapPin,
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
  const avatarSrc = profileAvatarUrl(account.profile?.avatar_path);
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
        <span className="avatar profile-avatar" aria-label="Profile avatar">
          {avatarSrc ? <img src={avatarSrc} alt="" /> : profile.displayName[0]}
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
    title: "Relationships",
    intro: "People, follows, connections, and private groups.",
    body: "Follow and connection are separate. Following helps you find people again; connections are mutual; groups and Close are private to you.",
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

type Connection = { id: string; status: "PENDING" | "ACCEPTED"; direction: "INCOMING" | "OUTGOING"; user_id: string; display_name: string; handle: string; is_close?: boolean };
type ConnectionRequest = { id: string; requester_user_id: string; display_name: string; handle: string; created_at: string };
type ConnectionContext = { id: string; name: string; members: Array<{ user_id: string; display_name: string; handle: string }> };
type FollowPerson = { user_id: string; display_name: string; handle: string };
type RelationshipSection = "people" | "followers" | "following" | "requests" | "groups";
export function ConnectionsPage({ onBack }: { onBack: () => void }) {
  const account = useAccount();
  const [connections, setConnections] = useState<Connection[]>([]),
    [requests, setRequests] = useState<ConnectionRequest[]>([]),
    [contexts, setContexts] = useState<ConnectionContext[]>([]),
    [followers, setFollowers] = useState<FollowPerson[]>([]),
    [following, setFollowing] = useState<FollowPerson[]>([]),
    [handle, setHandle] = useState(""),
    [contextName, setContextName] = useState(""),
    [contextSearch, setContextSearch] = useState<Record<string, string>>({}),
    [section, setSection] = useState<RelationshipSection>("people"),
    [message, setMessage] = useState("");
  const readConnections = async () =>
    rpc<{
      status: string;
      connections?: Connection[];
      requests?: ConnectionRequest[];
      contexts?: ConnectionContext[];
      followers?: FollowPerson[];
      following?: FollowPerson[];
    }>("sontu_connections", { action: "read", input: {} });
  useEffect(() => {
    if (!account.session) return;
    let cancelled = false;
    void readConnections()
      .then((result) => {
        if (cancelled || result.status !== "ready") return;
        setConnections(result.connections ?? []);
        setRequests(result.requests ?? []);
        setContexts(result.contexts ?? []);
        setFollowers(result.followers ?? []);
        setFollowing(result.following ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessage("Connections could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [account.session]);
  const load = async () => {
    const result = await readConnections();
    if (result.status === "ready") {
      setConnections(result.connections ?? []);
      setRequests(result.requests ?? []);
      setContexts(result.contexts ?? []);
      setFollowers(result.followers ?? []);
      setFollowing(result.following ?? []);
    }
  };
  if (!account.session) return <Navigate to="/sign-in?next=%2Fconnections" replace />;
  const normalizeHandleInput = (value: string) => value.trim().replace(/^@/, "");
  const run = async (action: string, input: Record<string, string>) => {
    setMessage("");
    const result = await rpc<{ status: string; error_code?: string }>("sontu_connections", { action, input });
    if (result.status !== "ready") { setMessage(result.error_code === "MEMBER_NOT_FOUND" ? "No Sontu member was found with that handle." : "That change could not be completed."); return; }
    setHandle(""); setContextName(""); await load();
  };
  const accepted = connections.filter((connection) => connection.status === "ACCEPTED");
  const maintainContext = async (
    action: "rename" | "delete",
    context: ConnectionContext,
  ) => {
    const name =
      action === "rename"
        ? window.prompt("Group name", context.name)?.trim()
        : null;
    if (action === "rename" && !name) return;
    if (
      action === "delete" &&
      !window.confirm(`Delete ${context.name}? This only removes the private group.`)
    )
      return;
    setMessage("");
    const result = await rpc<{ status: string }>(
      "sontu_connection_context_maintenance",
      {
        action,
        input: { context_id: context.id, ...(name ? { name } : {}) },
      },
    );
    if (result.status !== "ready") {
      setMessage("That group change could not be completed.");
      return;
    }
    await load();
  };
  const followingHandles = new Set(following.map((person) => person.handle));
  const followAction = (person: FollowPerson | Connection) =>
    run(followingHandles.has(person.handle) ? "unfollow" : "follow", {
      handle: person.handle,
    });
  return (
    <main id="main" tabIndex={-1} className="settings-page relationship-hub">
      <button
        onClick={onBack}
        className="icon-button back-chevron"
        aria-label="Back to Profile"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <section className="relationship-hero">
        <span className="eyebrow">Relationships</span>
        <h1>People around your events.</h1>
        <p>
          Follow people, manage mutual connections, and keep private groups for your own planning.
        </p>
        <div className="relationship-summary" aria-label="Relationship summary">
          <span><strong>{accepted.length}</strong> Connections</span>
          <span><strong>{followers.length}</strong> Followers</span>
          <span><strong>{following.length}</strong> Following</span>
        </div>
      </section>
      <section className="relationship-search-card">
        <div>
          <span className="eyebrow">Find someone</span>
          <p>Use a Sontu handle to follow them or ask to connect.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run("request", { handle: normalizeHandleInput(handle) });
          }}
        >
          <TextField
            label="Handle"
            name="handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="member_handle"
          />
          <div className="relationship-search-actions">
            <Button type="submit">Connect</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void run("follow", { handle: normalizeHandleInput(handle) })}
            >
              Follow
            </Button>
          </div>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <div className="relationship-tabs" role="tablist" aria-label="Relationship sections">
        {[
          ["people", `Connections (${accepted.length})`],
          ["followers", `Followers (${followers.length})`],
          ["following", `Following (${following.length})`],
          ["requests", `Requests (${requests.length})`],
          ["groups", `Groups (${contexts.length})`],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={section === value}
            className={section === value ? "selected" : ""}
            onClick={() => setSection(value as RelationshipSection)}
          >
            {label}
          </button>
        ))}
      </div>
      {section === "requests" && <section className="panel relationship-section">
        <h2>Requests</h2>
        {requests.length ? (
          requests.map((request) => (
            <div key={request.id} className="relationship-row">
              <span className="avatar">{request.display_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{request.display_name}</strong>
                <small>@{request.handle}</small>
              </div>
              <div className="coord-actions">
                <Button onClick={() => void run("accept", { connection_id: request.id })}>
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void run("deny", { connection_id: request.id })}
                >
                  Deny
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="relationship-empty">
            <Users size={28} />
            <strong>No connection requests</strong>
            <p className="muted">When someone asks to connect, you can accept or deny it here.</p>
          </div>
        )}
      </section>}
      {section === "people" && <section className="panel relationship-section">
        <h2>Connections</h2>
        {accepted.length ? (
          accepted.map((connection) => (
            <div key={connection.id} className="relationship-row">
              <span className="avatar">{connection.display_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <MiniProfileLauncher handle={connection.handle} className="participant-profile-link">
                  {connection.display_name}
                </MiniProfileLauncher>
                <small>
                  @{connection.handle}
                  {connection.status === "PENDING"
                    ? " · pending"
                    : connection.is_close
                      ? " · Close"
                      : ""}
                </small>
              </div>
              <div className="coord-actions">
                  <Button
                    variant={followingHandles.has(connection.handle) ? "quiet" : "secondary"}
                    onClick={() => void followAction(connection)}
                  >
                    {followingHandles.has(connection.handle) ? "Following" : "Follow"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void run("set_close", {
                        connection_id: connection.id,
                        is_close: String(!connection.is_close),
                      })
                    }
                  >
                    {connection.is_close ? "Unmark Close" : "Mark Close"}
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => void run("remove", { connection_id: connection.id })}
                  >
                    Remove
                  </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="relationship-empty">
            <Users size={28} />
            <strong>Find your people</strong>
            <p className="muted">Search by handle to follow someone or ask to connect.</p>
          </div>
        )}
      </section>}
      {section === "followers" && <section className="panel relationship-section">
        <h2>Followers</h2>
        {followers.length ? (
          followers.map((person) => (
            <div key={person.user_id} className="relationship-row">
              <span className="avatar">{person.display_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <MiniProfileLauncher handle={person.handle} className="participant-profile-link">
                  {person.display_name}
                </MiniProfileLauncher>
                <small>@{person.handle}</small>
              </div>
              <Button
                variant={followingHandles.has(person.handle) ? "quiet" : "secondary"}
                onClick={() => void followAction(person)}
              >
                {followingHandles.has(person.handle) ? "Following" : "Follow back"}
              </Button>
            </div>
          ))
        ) : (
          <div className="relationship-empty">
            <Users size={28} />
            <strong>No followers yet</strong>
            <p className="muted">People who follow your public updates will appear here.</p>
          </div>
        )}
      </section>}
      {section === "following" && <section className="panel relationship-section">
        <h2>Following</h2>
        {following.length ? (
          following.map((person) => (
            <div key={person.user_id} className="relationship-row">
              <span className="avatar">{person.display_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <MiniProfileLauncher handle={person.handle} className="participant-profile-link">
                  {person.display_name}
                </MiniProfileLauncher>
                <small>@{person.handle}</small>
              </div>
              <Button variant="quiet" onClick={() => void followAction(person)}>
                Unfollow
              </Button>
            </div>
          ))
        ) : (
          <div className="relationship-empty">
            <UserPlus size={28} />
            <strong>Follow people you want to hear from</strong>
            <p className="muted">Following does not reveal private profile fields.</p>
          </div>
        )}
      </section>}
      {section === "groups" && <section className="panel relationship-section">
        <h2>Private groups</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run("create_context", { name: contextName });
          }}
        >
          <TextField
            label="New context"
            name="context"
            value={contextName}
            onChange={(event) => setContextName(event.target.value)}
            placeholder="Book club, collaborators, close circle"
          />
          <Button type="submit">Create group</Button>
        </form>
        {contexts.length ? contexts.map((context) => (
          <div key={context.id} className="relationship-row">
            <span className="avatar">{context.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{context.name}</strong>
              <small>
                {context.members.length} {context.members.length === 1 ? "person" : "people"} · private to you
              </small>
            </div>
            <div className="group-member-search">
              <TextField
                label={`Find a connection for ${context.name}`}
                type="search"
                value={contextSearch[context.id] ?? ""}
                onChange={(event) =>
                  setContextSearch((current) => ({
                    ...current,
                    [context.id]: event.target.value,
                  }))
                }
                placeholder="Search accepted connections"
              />
              {(contextSearch[context.id] ?? "").trim() && (
                <div className="group-member-results">
                  {accepted
                    .filter(
                      (connection) =>
                        !context.members.some(
                          (member) => member.user_id === connection.user_id,
                        ) &&
                        `${connection.display_name} ${connection.handle}`
                          .toLowerCase()
                          .includes(
                            (contextSearch[context.id] ?? "")
                              .trim()
                              .toLowerCase(),
                          ),
                    )
                    .slice(0, 6)
                    .map((connection) => (
                      <button
                        type="button"
                        key={connection.user_id}
                        onClick={() => {
                          setContextSearch((current) => ({
                            ...current,
                            [context.id]: "",
                          }));
                          void run("add_member", {
                            context_id: context.id,
                            user_id: connection.user_id,
                          });
                        }}
                      >
                        <span>
                          <strong>{connection.display_name}</strong>
                          <small>@{connection.handle}</small>
                        </span>
                        <UserPlus size={17} />
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="coord-actions">
              <Button variant="secondary" onClick={() => void maintainContext("rename", context)}>
                Rename
              </Button>
              <Button variant="quiet" onClick={() => void maintainContext("delete", context)}>
                Delete
              </Button>
            </div>
            {context.members.map((member) => (
              <Button
                key={member.user_id}
                variant="quiet"
                onClick={() =>
                  void run("remove_member", {
                    context_id: context.id,
                    user_id: member.user_id,
                  })
                }
              >
                Remove {member.display_name}
              </Button>
            ))}
          </div>
        )) : (
          <div className="relationship-empty">
            <Users size={28} />
            <strong>Create private groups</strong>
            <p className="muted">Groups are private and only organize your own connections.</p>
          </div>
        )}
      </section>}
    </main>
  );
}

type PublicProfileHubResult = {
  status: "ready" | "not_found" | "error";
  viewer?: {
    owner: boolean;
    close: boolean;
    following?: boolean;
    connection_status?: ProfileConnectionStatus;
  };
  profile?: {
    display_name: string;
    handle: string;
    avatar_path?: string;
    fields?: {
      bio?: string;
      email?: string;
      phone?: string;
      location?: string;
      interests?: string[];
      link?: { label: string; url: string };
    };
    counts?: { followers?: number; following?: number };
    activity?: Array<{
      id: string;
      relationship: "host";
      title: string;
      starts_at: string | null;
      timezone: string;
      venue_label: string;
      cover_key: string;
      category: string;
      format: string;
      lifecycle: string;
    }>;
  };
};
type ProfileConnectionStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "connected";
type PublicProfileHubState = {
  handle: string;
  result: PublicProfileHubResult;
};

function ProfileFollowControl({
  handle,
  owner,
  initialFollowing,
}: {
  handle: string;
  owner?: boolean;
  initialFollowing?: boolean;
}) {
  const account = useAccount();
  const [following, setFollowing] = useState(Boolean(initialFollowing));
  const [message, setMessage] = useState("");
  if (!account.session || owner || account.profile?.handle === handle) return null;
  return (
    <>
      <Button
        variant={following ? "secondary" : "primary"}
        onClick={async () => {
          setMessage("");
          const response = await rpc<{ status: string; following?: boolean }>(
            "sontu_connections",
            {
              action: following ? "unfollow" : "follow",
              input: { handle },
            },
          );
          if (response.status === "ready") {
            setFollowing(Boolean(response.following));
          } else {
            setMessage("That follow change could not be saved.");
          }
        }}
      >
        {following ? (
          <>
            <UserCheck size={18} />
            <span>Following</span>
          </>
        ) : (
          <>
            <UserPlus size={18} />
            <span>Follow</span>
          </>
        )}
      </Button>
      {message && <p role="status">{message}</p>}
    </>
  );
}

function ProfileConnectControl({
  handle,
  owner,
  initialStatus,
}: {
  handle: string;
  owner?: boolean;
  initialStatus?: ProfileConnectionStatus;
}) {
  const account = useAccount();
  const [status, setStatus] = useState<ProfileConnectionStatus>(
    initialStatus ?? "none",
  );
  const [message, setMessage] = useState("");
  if (!account.session || owner || account.profile?.handle === handle) return null;
  if (status === "connected") {
    return <p className="profile-viewer-note">Connected</p>;
  }
  if (status === "pending_sent") {
    return <p className="profile-viewer-note">Connection request sent</p>;
  }
  if (status === "pending_received") {
    return (
      <Link to="/connections" className="profile-hub-secondary-action">
        Accept or deny request
      </Link>
    );
  }
  return (
    <>
      <Button
        onClick={async () => {
          setMessage("");
          const response = await rpc<{
            status: string;
            error_code?: string;
            connection_status?: string;
          }>("sontu_connections", { action: "request", input: { handle } });
          if (response.status === "ready") {
            setStatus(
              response.connection_status === "ACCEPTED"
                ? "connected"
                : "pending_sent",
            );
            setMessage(
              response.connection_status === "ACCEPTED"
                ? "You are already connected."
                : "Connection request sent. They can accept or deny it from Notifications or Connections.",
            );
          } else {
            setMessage("That request could not be sent.");
          }
        }}
      >
        Connect
      </Button>
      {message && <p role="status">{message}</p>}
    </>
  );
}

function ProfileHubContent({
  result,
  compact = false,
}: {
  result: PublicProfileHubResult;
  compact?: boolean;
}) {
  const account = useAccount();
  const [tab, setTab] = useState<"about" | "events" | "relationship">(
    "about",
  );
  if (result.status !== "ready" || !result.profile) return null;
  const following = Boolean(result.viewer?.following);
  const connectionStatus = result.viewer?.connection_status ?? "none";
  const activity = result.profile.activity ?? [];
  const avatarSrc = profileAvatarUrl(result.profile.avatar_path);
  const formatEventDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(value))
      : "Date pending";
  return (
    <section className={compact ? "profile-hub-card mini" : "profile-hub-card"}>
      <div className="profile-hub-cover" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="profile-hub-avatar" aria-hidden="true">
        {avatarSrc ? <img src={avatarSrc} alt="" /> : <UserRound />}
      </div>
      <div className="profile-hub-intro">
        <span className="eyebrow">Sontu profile</span>
        <h1>{result.profile.display_name}</h1>
        <p>@{result.profile.handle}</p>
        {result.viewer?.close && <p className="profile-viewer-note">Close view</p>}
      </div>
      {result.profile.counts && (
        <div className="profile-hub-stats" aria-label="Profile relationship counts">
          <span>
            <strong>{result.profile.counts.followers ?? 0}</strong>
            Followers
          </span>
          <span>
            <strong>{result.profile.counts.following ?? 0}</strong>
            Following
          </span>
        </div>
      )}
      {!compact && (
        <div className="profile-hub-tabs" role="tablist" aria-label="Profile sections">
          {[
            ["about", "About"],
            ["events", "Events"],
            ["relationship", "Relationship"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "selected" : ""}
              onClick={() => setTab(value as "about" | "events" | "relationship")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {(compact || tab === "about") && (
        <div className="profile-hub-panel">
          {result.profile.fields?.bio && (
            <p className="profile-hub-bio">{result.profile.fields.bio}</p>
          )}
          {result.profile.fields?.email && (
            <a className="profile-hub-link" href={`mailto:${result.profile.fields.email}`}>
              <Mail size={18} />
              <span>{result.profile.fields.email}</span>
            </a>
          )}
          {result.profile.fields?.phone && (
            <a className="profile-hub-link" href={`tel:${result.profile.fields.phone}`}>
              <Phone size={18} />
              <span>{result.profile.fields.phone}</span>
            </a>
          )}
          {result.profile.fields?.location && (
            <p className="profile-hub-link">
              <MapPin size={18} />
              <span>{result.profile.fields.location}</span>
            </p>
          )}
          {result.profile.fields?.link && (
            <a
              className="profile-hub-link"
              href={result.profile.fields.link.url}
              target="_blank"
              rel="noreferrer"
            >
              <LinkIcon size={18} />
              <span>{result.profile.fields.link.label}</span>
            </a>
          )}
          {result.profile.fields?.interests?.length ? (
            <div className="profile-hub-interests" aria-label="Interests">
              {result.profile.fields.interests.map((interest) => (
                <span key={interest}>{interest}</span>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {!compact && tab === "events" && (
        <div className="profile-hub-panel">
          {activity.length ? (
            <div className="profile-event-list">
              {activity.map((item) => (
                <Link
                  key={item.id}
                  to={`/event/${item.id}`}
                  className="profile-event-card"
                >
                  <span className="profile-event-cover" aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      Hosting · {formatEventDate(item.starts_at)} · {item.venue_label}
                    </small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="profile-hub-empty">
              <CalendarDays size={18} />
              <span>Public hosted events will appear here when this member publishes them.</span>
            </div>
          )}
        </div>
      )}
      {!compact && tab === "relationship" && (
        <div className="profile-hub-panel">
          <div className="profile-relationship-state">
            <span>
              <strong>{following ? "Following" : "Not following"}</strong>
              <small>Following helps you find this member again. It does not reveal private details.</small>
            </span>
            <span>
              <strong>
                {connectionStatus === "connected"
                  ? "Connected"
                  : connectionStatus === "pending_sent"
                    ? "Request sent"
                    : connectionStatus === "pending_received"
                      ? "Request received"
                      : "Not connected"}
              </strong>
              <small>Connections are mutual. Following and Close are separate private choices.</small>
            </span>
          </div>
        </div>
      )}
      <div className="profile-hub-actions">
        <ProfileFollowControl
          key={`${result.profile.handle}:follow:${String(result.viewer?.following)}`}
          handle={result.profile.handle}
          owner={result.viewer?.owner}
          initialFollowing={result.viewer?.following}
        />
        <ProfileConnectControl
          key={`${result.profile.handle}:${result.viewer?.connection_status ?? "none"}`}
          handle={result.profile.handle}
          owner={result.viewer?.owner}
          initialStatus={result.viewer?.connection_status}
        />
        {compact && (
          <Link to={`/p/${result.profile.handle}`}>
            <UserRound size={18} />
            <span>View full profile</span>
          </Link>
        )}
        {!compact && !account.session && (
          <>
            <Link to="/home">
              <CalendarDays size={18} />
              <span>Open Sontu</span>
            </Link>
            <Link to="/sign-up">
              <QrCode size={18} />
              <span>Create account</span>
            </Link>
          </>
        )}
        {!compact && account.session && (
          <Link to="/connections">
            <Users size={18} />
            <span>Connections</span>
          </Link>
        )}
      </div>
    </section>
  );
}

export function MiniProfileSheet({
  handle,
  onClose,
}: {
  handle: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<PublicProfileHubResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    void rpc<PublicProfileHubResult>("sontu_public_profile_hub", { handle })
      .then((response) => {
        if (!cancelled) setState(response);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return (
    <div className="mini-profile-scrim" role="presentation" onClick={onClose}>
      <aside
        className="mini-profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Profile preview"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button mini-profile-close"
          aria-label="Close profile preview"
          onClick={onClose}
        >
          <ChevronLeft size={22} />
        </button>
        {state ? (
          state.status === "ready" ? (
            <ProfileHubContent result={state} compact />
          ) : (
            <div className="profile-hub-empty">
              <UserRound size={18} />
              <span>This profile is not available.</span>
            </div>
          )
        ) : (
          <p role="status">Loading profile...</p>
        )}
      </aside>
    </div>
  );
}

export function MiniProfileLauncher({
  handle,
  children,
  className,
}: {
  handle: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open && <MiniProfileSheet handle={handle} onClose={() => setOpen(false)} />}
    </>
  );
}

export function PublicProfileHub() {
  const { handle: pathHandle, profileHandle } = useParams();
  const handle = profileHandle?.startsWith("@")
    ? profileHandle.slice(1)
    : (pathHandle ?? "");
  const [state, setState] = useState<PublicProfileHubState | null>(null);
  useEffect(() => {
    let cancelled = false;
    void rpc<PublicProfileHubResult>("sontu_public_profile_hub", { handle })
      .then((response) => {
        if (!cancelled) setState({ handle, result: response });
      })
      .catch(() => {
        if (!cancelled) setState({ handle, result: { status: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  const result = state?.handle === handle ? state.result : null;
  if (!result)
    return (
      <main id="main" tabIndex={-1} className="public-profile-hub">
        <p role="status">Loading profile…</p>
      </main>
    );
  if (result.status !== "ready" || !result.profile)
    return (
      <main id="main" tabIndex={-1} className="public-profile-hub">
        <Link
          to="/home"
          className="icon-button back-chevron"
          aria-label="Back to Sontu"
        >
          <ChevronLeft size={26} strokeWidth={2.5} />
        </Link>
      <section className="profile-hub-card">
        <div className="state-symbol">
          <UserRound />
        </div>
          <h1>Profile unavailable</h1>
          <p className="muted">
            This Sontu profile could not be found or is not available here.
          </p>
          <Link to="/home" className="text-action">
            Open Sontu
          </Link>
        </section>
      </main>
    );
  return (
    <main id="main" tabIndex={-1} className="public-profile-hub">
      <Link
        to="/home"
        className="icon-button back-chevron"
        aria-label="Back to Sontu"
      >
          <ChevronLeft size={26} strokeWidth={2.5} />
      </Link>
      <ProfileHubContent result={result} />
    </main>
  );
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




