import {
  AccountPortal,
  MinimumProfile,
  AccountEntryGate,
  RealProfile,
} from "./account";
import { useAccount } from "./account-state";
import { DevNotes } from "./dev-notes";
import { OrganizationSetupPage, OrganizationsPage } from "./organizations";
import {
  Invitation,
  ConnectedEventHub,
  PublicEventHub,
  useMyEvents,
  forView,
  SimpleEventCard,
  HostingCollection,
} from "./invitations";
import { Creation } from "./creation";
import {
  CoreEntry,
  CoreHost,
  CheckInWorkspace,
  EventOperationsWorkspace,
  ParticipantResponse,
  CoreSignOut,
} from "./coordination";
import { rpc } from "../../../packages/data/sontu";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ChevronLeft,
  ArrowRight,
  CalendarDays,
  List,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { eventViews } from "../../../packages/application/projections";
import { screenFromPath, trackBeta } from "../../../packages/data/telemetry";
import {
  Button,
  Chip,
  EmptyState,
  SearchField,
  StatusBadge,
  SystemState,
  Tabs,
  TextAction,
} from "../../../packages/ui-web";
import {
  AppShell,
  Modal,
  RouteFocus,
  UtilityDrawer,
} from "./shells";
import {
  ProfileDrawerContent,
  HelpSupportPage,
  PrivacyRequestsPage,
  ProfileUtilityPage,
} from "./profile";
const mainProps = { id: "main", tabIndex: -1 };
function SectionHeading({
  title,
  to,
  action = "See all",
}: {
  title: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {to && <TextAction to={to}>{action}</TextAction>}
    </div>
  );
}
function Home() {
  const real = useMyEvents();
  const featured = real.items
    .filter((event) => event.lifecycle === "PUBLISHED")
    .slice(0, 3);
  const upcoming = forView(real.items, "Upcoming").slice(0, 2);
  const hosted = forView(real.items, "Hosting").find(
    (event) => event.lifecycle === "PUBLISHED",
  );
  return (
    <main {...mainProps}>
      <div className="home-layout">
        <div>
          <div className="home-welcome">
            <img className="event-image" src="images/sunset.jpg" alt="" />
            <div className="welcome-copy">
              <h1>
                More
                <br />
                together.
              </h1>
              <p>
                Find events, meet people,
                <br />
                explore your world.
              </p>
              <Link className="welcome-search" to="/discover">
                <MapPin size={20} />
                Search events and experiences
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
          <nav className="home-shortcuts" aria-label="Explore Sontu">
            <Link to="/discover?mode=nearby">
              <span>
                <MapPin />
              </span>
              Events near you
            </Link>
            <Link to="/discover">
              <span>
                <List />
              </span>
              Explore events
            </Link>
            <Link to="/events">
              <span>
                <CalendarDays />
              </span>
              Your plans
            </Link>
            <Link to="/events?view=Interested">
              <span>
                <Users />
              </span>
              Interested
            </Link>
          </nav>
          <section>
            <SectionHeading title="Featured for you" to="/discover" />
            {real.loading ? (
              <p role="status">Loading events…</p>
            ) : featured.length ? (
              <div className="editorial-grid">
                {featured.map((event) => (
                  <SimpleEventCard
                    key={event.id}
                    event={event}
                    view="Upcoming"
                  />
                ))}
              </div>
            ) : (
              <p className="muted">No featured events are available yet.</p>
            )}
          </section>
        </div>
        <aside className="home-aside">
          <section className="panel">
            <SectionHeading title="Your upcoming events" to="/events" />
            {upcoming.length ? (
              upcoming.map((event) => (
                <SimpleEventCard key={event.id} event={event} view="Upcoming" />
              ))
            ) : (
              <p className="muted">No upcoming events yet.</p>
            )}
          </section>
          {hosted && (
            <section className="panel soft">
              <span className="eyebrow">You’re bringing people together</span>
              <h2>{hosted.title}</h2>
              <p>Your hosted event</p>
              <TextAction to={`/core/events/${hosted.id}/host`}>
                Open Host Workspace
              </TextAction>
            </section>
          )}
          <div className="quiet-note">
            <Users size={22} />
            <p>The best plans often start with good company.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
function Discover() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const real = useMyEvents();
  const nearby = params.get("mode") === "nearby";
  const matching = real.items.filter(
    (event) =>
      event.lifecycle === "PUBLISHED" &&
      `${event.title} ${event.venue_label}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main {...mainProps}>
      <div className="discover-tools">
        <SearchField value={query} onChange={setQuery} />
        <div className="view-toggle" aria-label="Discovery view">
          <Chip selected={!nearby} onClick={() => setParams({})}>
            <List size={16} />
            Explore
          </Chip>
          <Chip selected={nearby} onClick={() => setParams({ mode: "nearby" })}>
            <MapPin size={16} />
            Nearby
          </Chip>
        </div>
      </div>
      {nearby ? (
        <div className="nearby-intro panel">
          <MapPin size={25} />
          <div>
            <h1>Good things, close by.</h1>
            <p>Location-aware discovery is not active in this beta yet.</p>
          </div>
          <span className="tag">Coming later</span>
        </div>
      ) : null}
      <section>
        <SectionHeading
          title={
            nearby
              ? "Around you"
              : query
                ? "Matching events"
                : "Discover events"
          }
        />
        {real.loading && !query ? (
          <p role="status">Loading events…</p>
        ) : matching.length ? (
          <div className={nearby ? "nearby-list" : "discover-grid"}>
            {matching.map((event) => (
              <div key={event.id}>
                <SimpleEventCard event={event} view="Upcoming" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            <p>No real discoverable events are available yet.</p>
            {query && (
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear search
              </Button>
            )}
          </EmptyState>
        )}
      </section>
    </main>
  );
}
function Events() {
  const account = useAccount();
  const real = useMyEvents();
  const [params, setParams] = useSearchParams();
  const current = params.get("view") ?? "Upcoming";
  const view = eventViews.includes(current as (typeof eventViews)[number])
    ? current
    : "Upcoming";
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const [authGate, setAuthGate] = useState(false);
  const createPath = `/create?return=${encodeURIComponent(returnTo)}`;
  const count = real.signed ? forView(real.items, view).length : 0;
  const pendingInvites = real.signed
    ? real.items.filter(
        (event) =>
          event.invitation_state === "CREATED" &&
          event.commitment_state === "NO_COMMITMENT",
      ).length
    : 0;
  return (
    <main {...mainProps} className="events-page">
      <div className="events-view-toolbar">
        <Tabs
          items={eventViews}
          value={view}
          onChange={(v) => setParams({ view: v })}
          label="Your event relationships"
          renderItem={(item) =>
            item === "Invited" && pendingInvites > 0 ? (
              <span className="event-tab-label">
                Invited
                <span
                  className="event-tab-badge"
                  aria-label={`${pendingInvites} pending invitations`}
                >
                  {pendingInvites > 99 ? "99+" : pendingInvites}
                </span>
              </span>
            ) : (
              item
            )
          }
        />
        <button
          type="button"
          className="events-create-action"
          aria-label="Create Event"
          onClick={() =>
            account.session ? navigate(createPath) : setAuthGate(true)
          }
        >
          <Plus size={17} />
          <span>
            Create
            <br />
            Event
          </span>
        </button>
      </div>
      <div className="section-heading">
        <div>
          <h1>
            {view === "Hosting"
              ? "Your hosted events"
              : view === "Invited"
                ? "Your invitations"
                : view === "Interested"
                  ? "Interested events"
                  : "Your upcoming events"}
          </h1>
          <p className="muted">
            {view === "Hosting"
              ? "The experiences you’re creating."
              : view === "Invited"
                ? "Your invitations, all in one place."
                : view === "Interested"
                  ? "Experiences you’d like to come back to."
                  : "Your confirmed plans, in date order."}
          </p>
        </div>
        <span className="count">
          {count} {count === 1 ? "event" : "events"}
        </span>
      </div>
      <div className="events-layout">
        <div
          className={`events-list ${view === "Hosting" ? "hosting-events" : "event-card-grid"}`}
        >
          {real.signed ? (
            real.loading ? (
              <p role="status">Loading your events…</p>
            ) : real.error ? (
              <div role="alert">
                <p>{real.error}</p>
                <Button onClick={real.reload}>Retry</Button>
              </div>
            ) : forView(real.items, view).length ? (
              view === "Hosting" ? (
                <HostingCollection items={forView(real.items, view)} />
              ) : (
                forView(real.items, view).map((e) => (
                  <SimpleEventCard key={e.id} event={e} view={view} />
                ))
              )
            ) : (
              <p>No {view.toLowerCase()} events yet.</p>
            )
          ) : (
            <p>Sign in to see events connected to your account.</p>
          )}
        </div>
        <aside className="panel events-aside">
          {view === "Hosting" ? (
            <>
              <span className="large-icon">
                <CalendarDays />
              </span>
              <h2>Something good starts with you.</h2>

              <p>
                A few people. A shared idea. One place to bring it together.
              </p>
              <p className="small muted">
                Create a personal event or resume a saved draft.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">Leave room for discovery</span>
              <h2>What will you do next?</h2>
              <p>
                Find an experience that fits your mood, your day, or your
                favourite people.
              </p>
              <TextAction to="/discover">Explore experiences</TextAction>
            </>
          )}
        </aside>
      </div>
      {authGate && (
        <Modal
          title="Sign in to create your event"
          onClose={() => setAuthGate(false)}
        >
          <p>Create and manage your event with a Sontu account.</p>
          <div className="creation-auth-options">
            <Button variant="secondary" disabled>
              Continue with Google
            </Button>
            <Button variant="secondary" disabled>
              Continue with Apple
            </Button>
            <Button
              onClick={() =>
                navigate(`/sign-up?next=${encodeURIComponent(createPath)}`)
              }
            >
              Continue with email
            </Button>
          </div>
          <p className="account-switch">
            Already have an account?{" "}
            <Link to={`/sign-in?next=${encodeURIComponent(createPath)}`}>
              Sign in
            </Link>
          </p>
          <Button variant="quiet" onClick={() => setAuthGate(false)}>
            Cancel
          </Button>
        </Modal>
      )}
    </main>
  );
}
function Feed() {
  return (
    <main {...mainProps}>
      <div className="intro-line">
        <div>
          <span className="eyebrow">From your events</span>
          <h1>A little closer to what’s happening.</h1>
        </div>
      </div>
      <EmptyState>
        <p>Real event updates will appear here when hosts publish them.</p>
      </EmptyState>
    </main>
  );
}
function EventRouteRedirect({ host = false }: { host?: boolean }) {
  const { eventId } = useParams();
  return (
    <Navigate
      to={
        eventId
          ? host
            ? `/core/events/${eventId}/host`
            : `/my-events/${eventId}`
          : "/events"
      }
      replace
    />
  );
}
function Settings({
  mode,
  setMode,
  accent,
  setAccent,
  embedded = false,
  onBack,
}: {
  embedded?: boolean;
  onBack: () => void;
  mode: string;
  setMode: (s: string) => void;
  accent: string;
  setAccent: (s: string) => void;
}) {
  const account = useAccount();
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const setEventEmail = async (enabled: boolean) => {
    if (!account.profile || emailBusy) return;
    setEmailBusy(true);
    setEmailError("");
    try {
      const result = await rpc<{ status: string }>("sontu_account_profile", {
        action: "update",
        input: {
          first_name: account.profile.first_name,
          display_name: account.profile.display_name,
          handle: account.profile.handle,
          revision: account.profile.revision,
          event_email_enabled: enabled,
        },
      });
      if (result.status !== "ready") throw new Error();
      account.reload();
    } catch {
      setEmailError("Your email preference could not be confirmed. Try again.");
    } finally {
      setEmailBusy(false);
    }
  };
  const Container = embedded ? "section" : "main";
  return (
    <Container {...(embedded ? {} : mainProps)} className="settings-page">
      {!embedded && (
        <button
          onClick={onBack}
          className="icon-button back-chevron"
          aria-label="Back to Profile"
        >
          <ChevronLeft size={26} strokeWidth={2.5} />
        </button>
      )}
      <h1>Settings &amp; Preferences</h1>
      <p className="muted">How Sontu fits your day.</p>
      <section className="panel">
        <h2>Appearance</h2>
        <p>Choose how Sontu looks. Event status meanings stay the same.</p>
        <label className="field">
          Display mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field">
          Curated accent
          <select value={accent} onChange={(e) => setAccent(e.target.value)}>
            <option value="ocean">Classic Ocean</option>
            <option value="navy">Ocean Navy</option>
          </select>
        </label>
      </section>
      <section className="panel">
        <h2>Personalize your experience</h2>
        <p>
          Choose whether Sontu sends event email to this account. Security and
          mandatory accountless-guest messages are not affected.
        </p>
        {account.profile ? (
          <label className="field">
            <span>Event email</span>
            <select
              value={
                account.profile.event_email_enabled ? "enabled" : "disabled"
              }
              disabled={emailBusy}
              onChange={(e) => void setEventEmail(e.target.value === "enabled")}
            >
              <option value="enabled">Send event email</option>
              <option value="disabled">Don’t send event email</option>
            </select>
          </label>
        ) : (
          <p className="muted">Sign in to manage account email.</p>
        )}
        {emailError && (
          <p className="coord-feedback" role="status">
            {emailError}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Accessibility &amp; Language</h2>
        <p>
          Sontu follows your device’s reduced-motion preference and supports
          browser text scaling. Account language preferences are not activated.
        </p>
      </section>
    </Container>
  );
}
function Notifications({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "section" : "main";
  const real = useMyEvents();
  const [responding, setResponding] = useState<string | null>(null);
  const [responseError, setResponseError] = useState("");
  const [replies, setReplies] = useState<
    {
      id: string;
      event_id: string;
      event_title: string;
      response: string;
      answered_at: string;
    }[]
  >([]);
  const loadReplies = async () => {
    try {
      const result = await rpc<{ status: string; items?: typeof replies }>(
        "sontu_event_question_notifications",
        { action: "read", question_id: null },
      );
      if (result.status === "ready") setReplies(result.items ?? []);
    } catch {
      /* Optional notification source. */
    }
  };
  useEffect(() => {
    if (!real.signed) return;
    void rpc<{ status: string; items?: typeof replies }>(
      "sontu_event_question_notifications",
      { action: "read", question_id: null },
    )
      .then((result) => {
        if (result.status === "ready") setReplies(result.items ?? []);
      })
      .catch(() => {
        /* Optional notification source. */
      });
  }, [real.signed]);
  const markReplySeen = async (id: string) => {
    try {
      await rpc("sontu_event_question_notifications", {
        action: "mark_seen",
        question_id: id,
      });
      await loadReplies();
    } catch {
      setResponseError("That reply could not be marked read.");
    }
  };
  async function respond(
    eventId: string,
    decision: "ACCEPT_INVITE" | "DECLINE_INVITE",
  ) {
    if (responding) return;
    setResponding(`${eventId}:${decision}`);
    setResponseError("");
    try {
      const hub = await rpc<{
        status: string;
        event?: { current_version: number };
      }>("sontu_event_hub", { event_id: eventId });
      if (hub.status !== "ready" || !hub.event)
        throw new Error("The invitation is no longer available.");
      const result = await rpc<{ status: string; error_code?: string }>(
        "sontu_simple_access",
        {
          event_id: eventId,
          decision,
          expected_version: hub.event.current_version,
          operation_id: crypto.randomUUID(),
        },
      );
      if (result.status !== "ready")
        throw new Error(
          "This invitation changed. Open it to review the latest details.",
        );
      real.reload();
    } catch (error) {
      setResponseError(
        error instanceof Error
          ? error.message
          : "Your response could not be confirmed. Try again.",
      );
    } finally {
      setResponding(null);
    }
  }
  const invitations = real.items.filter(
    (event) =>
      event.invitation_state === "CREATED" &&
      event.commitment_state === "NO_COMMITMENT",
  );
  const updates = real.items.filter(
    (event) =>
      !event.hosting &&
      event.commitment_state === "CONFIRMED" &&
      (event.reconfirmation_required ||
        event.lifecycle === "CANCELLED" ||
        event.lifecycle === "COMPLETED"),
  );
  return (
    <Container {...(embedded ? {} : mainProps)} className="settings-page">
      <h1>Event updates</h1>
      <p className="muted">From your events and invitations.</p>
      {!real.signed ? (
        <div className="empty-state panel">
          <h2>Sign in to see updates</h2>
          <p>
            Your invitations and event updates are attached to your Sontu
            account.
          </p>
          <Link className="button primary" to="/sign-in">
            Sign in
          </Link>
        </div>
      ) : invitations.length || updates.length || replies.length ? (
        <>
          {replies.map((reply) => (
            <div className="notification-card" key={`reply-${reply.id}`}>
              <div className="panel">
                <StatusBadge tone="info">Host reply</StatusBadge>
                <h2>{reply.event_title}</h2>
                <p>{reply.response}</p>
                <div className="coord-actions">
                  <Link
                    className="text-action"
                    to={`/events/${reply.event_id}`}
                  >
                    Open event
                  </Link>
                  <Button
                    variant="quiet"
                    onClick={() => void markReplySeen(reply.id)}
                  >
                    Mark read
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {updates.map((event) => (
            <Link
              className="notification-card"
              to={`/events/${event.id}`}
              key={`update-${event.id}`}
            >
              <div className="panel">
                <StatusBadge
                  tone={
                    event.lifecycle === "CANCELLED"
                      ? "error"
                      : event.lifecycle === "COMPLETED"
                        ? "success"
                        : "warning"
                  }
                >
                  {event.lifecycle === "CANCELLED"
                    ? "Cancelled"
                    : event.lifecycle === "COMPLETED"
                      ? "Completed"
                      : "Action needed"}
                </StatusBadge>
                <h2>
                  {event.lifecycle === "CANCELLED"
                    ? `${event.title} was cancelled`
                    : event.lifecycle === "COMPLETED"
                      ? `${event.title} has ended`
                      : `${event.title} has changed`}
                </h2>
                <p>
                  {event.lifecycle === "CANCELLED"
                    ? "Open the event for the latest information."
                    : event.lifecycle === "COMPLETED"
                      ? "Open the event to revisit its details and outcomes."
                      : "Review the new details and reconfirm if you can still attend."}
                </p>
              </div>
            </Link>
          ))}
          {invitations.map((event) => (
            <div className="notification-card" key={event.id}>
              <div className="panel">
                <StatusBadge tone="info">Invitation</StatusBadge>
                <h2>You’re invited to {event.title}</h2>
                <p>Respond now, or review the event details first.</p>
                <div className="coord-actions">
                  <Button
                    disabled={!!responding}
                    onClick={() => void respond(event.id, "ACCEPT_INVITE")}
                  >
                    {responding === `${event.id}:ACCEPT_INVITE`
                      ? "Saving…"
                      : "Going"}
                  </Button>
                  <Button
                    disabled={!!responding}
                    variant="secondary"
                    onClick={() => void respond(event.id, "DECLINE_INVITE")}
                  >
                    {responding === `${event.id}:DECLINE_INVITE`
                      ? "Saving…"
                      : "Can’t go"}
                  </Button>
                  <Link className="text-action" to={`/events/${event.id}`}>
                    View details
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {responseError && <p role="alert">{responseError}</p>}
        </>
      ) : (
        <div className="empty-state panel">
          <h2>You’re all caught up</h2>
          <p>New invitations will appear here.</p>
        </div>
      )}
    </Container>
  );
}
export default function App() {
  const account = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const profileOrigin = useRef("/home");
  const openDrawer = (panel: "profile" | "notifications") => {
    if (
      panel === "profile" &&
      /^\/(home|discover|events|feed)(\/|$)/.test(location.pathname)
    ) {
      profileOrigin.current = location.pathname + location.search;
    }
    setDrawer(panel);
  };
  const backToProfile = () => {
    navigate(profileOrigin.current);
    setDrawer("profile");
  };
  const profile = account.profile
    ? {
        displayName: account.profile.display_name || account.profile.first_name,
        username: account.profile.handle,
      }
    : { displayName: "Sontu member", username: "member" };
  const [drawer, setDrawer] = useState<"profile" | "notifications" | null>(
    null,
  );
  const [mode, setMode] = useState(
    () => localStorage.getItem("sontu-mode") ?? "system",
  );
  const [accent, setAccent] = useState(
    () => localStorage.getItem("sontu-accent") ?? "ocean",
  );
  useEffect(() => {
    trackBeta("route_view", screenFromPath(location.pathname), {
      route: screenFromPath(location.pathname),
    });
  }, [location.pathname]);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        mode === "system" ? (mq.matches ? "dark" : "light") : mode;
      document.documentElement.dataset.accent = accent;
    };
    apply();
    mq.addEventListener("change", apply);
    localStorage.setItem("sontu-mode", mode);
    localStorage.setItem("sontu-accent", accent);
    return () => mq.removeEventListener("change", apply);
  }, [mode, accent]);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.querySelector<HTMLElement>("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <RouteFocus />
      <DevNotes />
      <Routes>
        <Route path="/sign-in" element={<AccountPortal key="signin" />} />
        <Route path="/sign-up" element={<AccountPortal key="signup" />} />
        <Route path="/account/setup" element={<MinimumProfile />} />
        <Route
          element={
            <AccountEntryGate>
              <AppShell onOpen={openDrawer} />
            </AccountEntryGate>
          }
        >
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/events" element={<Events />} />
          <Route path="/feed" element={<Feed />} />
          <Route
            path="/events/:eventId"
            element={<EventRouteRedirect />}
          />
          <Route
            path="/settings"
            element={
              <Settings
                onBack={backToProfile}
                mode={mode}
                setMode={setMode}
                accent={accent}
                setAccent={setAccent}
              />
            }
          />
          <Route
            path="/profile"
            element={
              account.session ? (
                <RealProfile onBack={backToProfile} />
              ) : (
                <Navigate
                  to={
                    "/sign-in?next=" +
                    encodeURIComponent(location.pathname + location.search)
                  }
                  replace
                />
              )
            }
          />
          {["connections", "privacy", "help", "about", "sign-out"].map(
            (kind) => (
              <Route
                key={kind}
                path={`/${kind}`}
                element={
                  kind === "sign-out" ? (
                    <CoreSignOut
                      onBack={backToProfile}
                      onSignedOut={() => {
                        setDrawer(null);
                        navigate("/home", { replace: true });
                      }}
                    />
                  ) : kind === "privacy" && account.session ? (
                    <PrivacyRequestsPage onBack={backToProfile} />
                  ) : kind === "help" && account.session ? (
                    <HelpSupportPage onBack={backToProfile} />
                  ) : (
                    <ProfileUtilityPage kind={kind} onBack={backToProfile} />
                  )
                }
              />
            ),
          )}
          <Route path="/notifications" element={<Notifications />} />
          <Route
            path="/organizations"
            element={<OrganizationsPage onBack={backToProfile} />}
          />
          <Route
            path="/organizations/new"
            element={<OrganizationSetupPage />}
          />
          <Route
            path="*"
            element={
              <main {...mainProps}>
                <SystemState state={{ status: "unavailable" }}>
                  <Link
                    to="/home"
                    className="icon-button back-chevron"
                    aria-label="Back to Home"
                  >
                    <ChevronLeft size={26} strokeWidth={2.5} />
                  </Link>
                </SystemState>
              </main>
            }
          />
        </Route>
        <Route path="/invite/:token" element={<Invitation />} />
        <Route path="/event/:eventId" element={<PublicEventHub />} />
        <Route path="/my-events/:eventId" element={<ConnectedEventHub />} />
        <Route path="/create" element={<Creation />} />
        <Route path="/create/:eventId" element={<Creation />} />
        <Route path="/core" element={<CoreEntry />} />
        <Route path="/core/events/:eventId/host" element={<CoreHost />} />
        <Route
          path="/core/events/:eventId/check-in"
          element={<CheckInWorkspace />}
        />
        <Route
          path="/core/events/:eventId/operations"
          element={<EventOperationsWorkspace />}
        />
        <Route path="/respond/:token" element={<ParticipantResponse />} />
        <Route
          path="/events/:eventId/host"
          element={<EventRouteRedirect host />}
        />
        <Route
          path="/host/events/:eventId"
          element={<EventRouteRedirect host />}
        />
      </Routes>
      {drawer && (
        <UtilityDrawer
          side={drawer === "profile" ? "left" : "right"}
          title={drawer === "profile" ? "Profile" : "Notifications"}
          onClose={() => setDrawer(null)}
        >
          {drawer === "profile" ? (
            <ProfileDrawerContent
              profile={
                account.profile
                  ? {
                      ...profile,
                      displayName:
                        account.profile.display_name ||
                        account.profile.first_name,
                      username: account.profile.handle,
                    }
                  : profile
              }
            />
          ) : (
            <Notifications embedded />
          )}
        </UtilityDrawer>
      )}
    </>
  );
}
