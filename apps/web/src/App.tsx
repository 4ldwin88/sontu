import {
  Invitation,
  ConnectedEventHub,
  useMyEvents,
  forView,
  SimpleEventCard,
} from "./invitations";
import { Creation } from "./creation";
import {
  CoreEntry,
  CoreHost,
  ParticipantResponse,
  CoreSignOut,
} from "./coordination";
import { initialProfile } from "../../../packages/test-fixtures/profile";
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
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  List,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import type {
  EventProjection,
  Module,
  ViewState,
} from "../../../packages/application/projections";
import {
  eventViews,
  eventsForView,
  hostProjection,
} from "../../../packages/application/projections";
import {
  eventById,
  events,
  feed,
} from "../../../packages/test-fixtures/events";
import {
  AttentionItem,
  Button,
  Chip,
  EmptyState,
  EventCard,
  EventImage,
  OperationalItem,
  SearchField,
  StatusBadge,
  SystemState,
  Tabs,
  TextAction,
  TrustBadge,
} from "../../../packages/ui-web";
import {
  AppShell,
  FocusedWorkspaceShell,
  Modal,
  RouteFocus,
  WidePortalShell,
  UtilityDrawer,
} from "./shells";
import {
  ProfileDrawerContent,
  ProfilePage,
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
  return (
    <main {...mainProps}>
      <div className="home-layout">
        <div>
          <div className="home-welcome">
            <EventImage event={events[0]} priority />
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
            <div className="editorial-grid">
              {[events[3], events[2], events[4]].map((e) => (
                <EventCard key={e.identity.id} event={e} />
              ))}
            </div>
          </section>
        </div>
        <aside className="home-aside">
          <section className="panel">
            <SectionHeading title="Your upcoming events" to="/events" />
            <EventCard event={events[1]} variant="compact-square" />
            <EventCard event={events[2]} variant="compact-square" />
          </section>
          <section className="panel soft">
            <span className="eyebrow">You’re bringing people together</span>
            <h2>Tonight’s Sunset Social</h2>
            <p>24 participants · Your hosted event</p>
            <AttentionItem {...events[0].attention!} />
            <TextAction to="/events/sunset-social/host">
              Open Host Workspace
            </TextAction>
          </section>
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
  const [category, setCategory] = useState("All");
  const nearby = params.get("mode") === "nearby";
  const categories = ["All", "Music", "Food & Drink", "Outdoors", "Wellness"];
  const matching = events
    .filter(
      (e) =>
        (category === "All" || e.presentation.category === category) &&
        `${e.identity.title} ${e.presentation.location}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      nearby ? a.presentation.distanceKm - b.presentation.distanceKm : 0,
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
      <div className="filter-row">
        {categories.map((c) => (
          <Chip
            key={c}
            selected={c === category}
            onClick={() => setCategory(c)}
          >
            {c}
          </Chip>
        ))}
      </div>
      {nearby ? (
        <div className="nearby-intro panel">
          <MapPin size={25} />
          <div>
            <h1>Good things, close by.</h1>
            <p>Nha Trang · Sample distances from the city centre</p>
          </div>
          <span className="tag">Manual area</span>
        </div>
      ) : !query && category === "All" ? (
        <div className="discover-feature">
          <EventImage event={events[0]} priority />
          <div>
            <span className="eyebrow">Stay curious</span>
            <h1>
              Unforgettable
              <br />
              experiences await.
            </h1>
            <p>
              Explore the coast. Find your people.
              <br />
              Make a little space for something new.
            </p>
            <Link className="button image-button" to="/events/sunset-social">
              Explore Sunset Social
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      ) : null}
      <section>
        <SectionHeading
          title={
            nearby
              ? "Around you"
              : query
                ? "Matching experiences"
                : "Worth getting out for"
          }
        />
        {matching.length ? (
          <div className={nearby ? "nearby-list" : "discover-grid"}>
            {matching.map((e) => (
              <div key={e.identity.id}>
                <EventCard
                  event={e}
                  variant={nearby ? "compact-square" : "editorial"}
                />
                {nearby && (
                  <span className="distance">
                    {e.presentation.distanceKm} km · sample distance
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
            >
              Clear filters
            </Button>
          </EmptyState>
        )}
      </section>
    </main>
  );
}
function Events() {
  const real = useMyEvents();
  const [params, setParams] = useSearchParams();
  const current = params.get("view") ?? "Upcoming";
  const view = eventViews.includes(current as (typeof eventViews)[number])
    ? current
    : "Upcoming";
  const navigate = useNavigate();
  const collection = eventsForView(events, view);
  return (
    <main {...mainProps} className="events-page">
      <Tabs
        items={eventViews}
        value={view}
        onChange={(v) => setParams({ view: v })}
        label="Your event relationships"
      />
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
          {real.signed ? forView(real.items, view).length : collection.length}{" "}
          events
        </span>
      </div>
      <div className="events-layout">
        <div className="events-list">
          {real.signed ? (
            real.loading ? (
              <p role="status">Loading your events…</p>
            ) : real.error ? (
              <div role="alert">
                <p>{real.error}</p>
                <Button onClick={real.reload}>Retry</Button>
              </div>
            ) : forView(real.items, view).length ? (
              forView(real.items, view).map((e) => (
                <SimpleEventCard key={e.id} event={e} view={view} />
              ))
            ) : (
              <p>No {view.toLowerCase()} events yet.</p>
            )
          ) : collection.length ? (
            collection.map((e) => (
              <div className="event-list-row" key={e.identity.id}>
                <EventCard event={e} variant="compact-square" />
                {view === "Hosting" && (
                  <TextAction to={`/events/${e.identity.id}/host`}>
                    Manage event
                  </TextAction>
                )}
              </div>
            ))
          ) : (
            <EmptyState />
          )}
        </div>
        <aside className="panel events-aside">
          {view === "Hosting" ? (
            <>
              <span className="large-icon">
                <CalendarDays />
              </span>
              <h2>Something good starts with you.</h2>
              <TextAction to="/core">Open working host events</TextAction>
              <p>
                A few people. A shared idea. One place to bring it together.
              </p>
              <Button onClick={() => navigate("/create")}>
                <Plus size={18} />
                Create Event
              </Button>
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
    </main>
  );
}
function Feed() {
  return (
    <main {...mainProps} className="feed-layout">
      <div>
        <div className="intro-line">
          <div>
            <span className="eyebrow">From the events around you</span>
            <h1>A little closer to what’s happening.</h1>
          </div>
        </div>
        {feed.map((item) => {
          const event = eventById(item.eventId)!;
          return (
            <article className="feed-item" key={item.id}>
              <Link className="feed-event" to={`/events/${event.identity.id}`}>
                <EventImage event={event} />
                <div>
                  <strong>{event.identity.title}</strong>
                  <span>
                    {item.kind} · {item.time}
                  </span>
                </div>
                <ArrowRight size={18} />
              </Link>
              {item.image && (
                <Link
                  to={`/events/${event.identity.id}`}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <EventImage event={event} className="feed-media" />
                </Link>
              )}
              <div className="feed-copy">
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <TextAction to={`/events/${event.identity.id}`}>
                  View event
                </TextAction>
              </div>
            </article>
          );
        })}
      </div>
      <aside className="panel feed-aside">
        <span className="eyebrow">Keep exploring</span>
        <h2>Make it a shared experience.</h2>
        <EventCard event={events[3]} />
        <p>Updates and stories here always belong to an event.</p>
      </aside>
    </main>
  );
}
function EventHub() {
  const { eventId } = useParams();
  const event = eventById(eventId);
  const [notice, setNotice] = useState(false);
  if (!event || !event.access.canView)
    return (
      <main {...mainProps}>
        <SystemState state={{ status: event ? "denied" : "unavailable" }}>
          <TextAction to="/events">Back to Events</TextAction>
        </SystemState>
      </main>
    );
  const p = event.presentation;
  return (
    <main {...mainProps} className="hub">
      <Link className="back-link" to="/events">
        <ArrowLeft size={18} />
        Back to Events
      </Link>
      <div className="hub-image">
        <EventImage event={event} priority />
        <span className="image-label">{p.category}</span>
      </div>
      <div className="hub-layout">
        <div>
          <div className="tags">
            <StatusBadge tone="info">
              {event.context.relationship === "host"
                ? "You’re hosting"
                : event.context.relationship === "going"
                  ? "You’re going"
                  : event.context.relationship === "invited"
                    ? "You’re invited"
                    : "Explore this event"}
            </StatusBadge>
            <StatusBadge>
              {event.identity.lifecycle === "cancelled"
                ? "Cancelled"
                : "Published"}
            </StatusBadge>
          </div>
          <h1>{event.identity.title}</h1>
          <div className="host-byline">
            <span className="avatar small-avatar">C</span>
            <div>
              <span className="muted">Hosted by</span>
              <strong>{p.hostName}</strong>
            </div>
            <TrustBadge verified={p.hostVerified} />
          </div>
          {event.attention && event.context.relationship === "host" && (
            <AttentionItem {...event.attention} />
          )}
          <section>
            <h2>A good time, together.</h2>
            <p className="description">{p.description}</p>
          </section>
          <section className="panel">
            <h2>What to expect</h2>
            <p>
              Easy conversation, a relaxed pace, and a shared experience. These
              are sample event details for reviewing Sontu’s design.
            </p>
            <div className="tags">
              {p.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </section>
        </div>
        <aside className="panel event-details">
          <div className="detail">
            <CalendarDays />
            <div>
              <strong>{p.date}, 2026</strong>
              <p>{p.time} (GMT+7)</p>
            </div>
          </div>
          <div className="detail">
            <MapPin />
            <div>
              <strong>{p.location}</strong>
              <p>Vietnam</p>
            </div>
          </div>
          <div className="detail">
            <Users />
            <div>
              <strong>
                {event.operations?.participants ??
                  event.participation?.people ??
                  "Small group"}
                {event.operations || event.participation ? " people" : ""}
              </strong>
              <p>
                {event.context.relationship === "invited"
                  ? "Invitation received"
                  : "A shared experience"}
              </p>
            </div>
          </div>
          {event.access.canManage ? (
            <Link
              className="button primary"
              to={`/events/${event.identity.id}/host`}
            >
              Open Host Workspace
              <ArrowRight size={18} />
            </Link>
          ) : event.context.relationship === "going" ? (
            <StatusBadge tone="info">
              Your place is confirmed in this sample
            </StatusBadge>
          ) : (
            <Button onClick={() => setNotice(true)}>
              {event.context.relationship === "invited"
                ? "Review invitation"
                : "View participation options"}
            </Button>
          )}
          <p className="small muted">
            Sample event · no real booking or admission
          </p>
        </aside>
      </div>
      {notice && (
        <Modal title="Participation preview" onClose={() => setNotice(false)}>
          <SystemState
            state={{
              status: "pending_unknown",
              message:
                "Participation is not activated in this design checkpoint. No reservation or commitment has been made.",
            }}
          />
        </Modal>
      )}
    </main>
  );
}
const moduleLabels: Record<Module, string> = {
  overview: "Overview",
  team: "Team & Roles",
  todo: "To Do",
  resources: "Resources",
};
function HostWorkspace() {
  const { eventId, module } = useParams();
  const state = hostProjection(eventById(eventId));
  const [params, setParams] = useSearchParams();
  const active = (module ?? params.get("module") ?? "overview") as Module;
  const event = state.status === "ready" ? state.data : null;
  const nav = event ? (
    <nav className="workspace-nav" aria-label="Event workspace modules">
      {event.access.modules.map((m) => (
        <button
          key={m}
          aria-current={active === m ? "page" : undefined}
          onClick={() => setParams({ module: m })}
        >
          {moduleLabels[m]}
        </button>
      ))}
    </nav>
  ) : null;
  const body = (
    <>
      <header className="workspace-event">
        <EventImage event={event!} />
        <div>
          <span className="eyebrow">Your event workspace</span>
          <h1>{event?.identity.title}</h1>
          <p>
            {event?.presentation.date} · {event?.presentation.time} · Nha Trang
          </p>
          <StatusBadge>Published · sample event</StatusBadge>
        </div>
        <Link className="button secondary" to={`/events/${eventId}`}>
          View event page
          <ArrowRight size={16} />
        </Link>
      </header>
      <div className="compact-workspace-nav">{nav}</div>
      {event && !event.access.modules.includes(active) ? (
        <SystemState state={{ status: "denied" }} />
      ) : event ? (
        <HostModule event={event} active={active} />
      ) : null}
    </>
  );
  if (!event)
    return (
      <FocusedWorkspaceShell title="Host Workspace" back={`/events/${eventId}`}>
        <main {...mainProps}>
          <SystemState
            state={state as Exclude<ViewState<never>, { status: "ready" }>}
          />
        </main>
      </FocusedWorkspaceShell>
    );
  return (
    <FocusedWorkspaceShell title="Host Workspace" back={`/events/${eventId}`}>
      <main {...mainProps} className="host-main">
        <WidePortalShell nav={nav}>{body}</WidePortalShell>
      </main>
    </FocusedWorkspaceShell>
  );
}
function HostModule({
  event,
  active,
}: {
  event: EventProjection;
  active: Module;
}) {
  const o = event.operations!;
  return (
    <div className="module-content">
      <SectionHeading title={moduleLabels[active]} />
      {active === "overview" ? (
        <>
          <AttentionItem {...event.attention!} />
          <div className="metrics">
            <div>
              <Users />
              <strong>{o.participants}</strong>
              <span>Participants</span>
            </div>
            <div>
              <Users />
              <strong>{o.team.length}</strong>
              <span>Team members</span>
            </div>
            <div>
              <Clock3 />
              <strong>
                {o.todo.filter((i) => i.tone === "warning").length}
              </strong>
              <span>Needs confirmation</span>
            </div>
          </div>
          <div className="operations-grid">
            <section className="panel">
              <h2>Next up</h2>
              {o.todo.map((i) => (
                <OperationalItem key={i.id} item={i} />
              ))}
            </section>
            <section className="panel">
              <h2>Resources</h2>
              {o.resources.map((i) => (
                <OperationalItem key={i.id} item={i} />
              ))}
            </section>
          </div>
          <div className="workspace-note">
            <StatusBadge tone="info">Presentation only</StatusBadge>
            <p>
              Participant counts, team assignments, and resource statuses are
              deterministic samples. Admission and consequential actions are not
              activated.
            </p>
          </div>
        </>
      ) : active === "team" ? (
        <>
          <p className="muted">The people helping bring this event together.</p>
          <div className="team-table">
            <table>
              <caption className="sr-only">
                Event team and assignment status
              </caption>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Event role</th>
                  <th>Assignment status</th>
                </tr>
              </thead>
              <tbody>
                {o.team.map((p) => (
                  <tr key={p.name}>
                    <td>
                      <span className="avatar small-avatar">{p.name[0]}</span>
                      {p.name}
                    </td>
                    <td>{p.role}</td>
                    <td>
                      <StatusBadge
                        tone={p.status === "Pending" ? "warning" : "success"}
                      >
                        {p.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="team-cards">
            {o.team.map((p) => (
              <OperationalItem
                key={p.name}
                item={{
                  id: p.name,
                  title: p.name,
                  detail: p.role,
                  status: p.status,
                  tone: p.status === "Pending" ? "warning" : "success",
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <section className="panel">
          <p className="muted">
            {active === "todo"
              ? "Lightweight coordination for this event."
              : "Equipment and materials needed for this event."}
          </p>
          {o[active].map((i) => (
            <OperationalItem key={i.id} item={i} />
          ))}
        </section>
      )}
    </div>
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
  const Container = embedded ? "section" : "main";
  return (
    <Container {...(embedded ? {} : mainProps)} className="settings-page">
      {!embedded && (
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to Profile
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
          Behavioral presentation preferences, interests, location and
          notification preferences belong here. Account-level editing is not
          activated in this fixture preview.
        </p>
      </section>
      <section className="panel">
        <h2>Accessibility &amp; Language</h2>
        <p>
          Sontu follows your device’s reduced-motion preference and supports
          browser text scaling. Account language preferences are not activated.
        </p>
      </section>
      <section className="panel">
        <h2>Review the design foundation</h2>
        <p>
          Explore representative loading, empty, error, denied, unavailable and
          unresolved states.
        </p>
        <TextAction to="/preview/states">Open state gallery</TextAction>
      </section>
    </Container>
  );
}
function StateGallery() {
  const [state, setState] = useState("loading");
  const states = [
    "loading",
    "ready",
    "empty",
    "error",
    "denied",
    "unavailable",
    "pending_unknown",
  ];
  return (
    <main {...mainProps}>
      <Link className="back-link" to="/settings">
        <ArrowLeft size={18} />
        Back to appearance
      </Link>
      <h1>System state gallery</h1>
      <p className="muted">
        Deterministic presentation samples. No real operation is performed.
      </p>
      <label className="field">
        Preview state
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {state === "ready" ? (
        <div className="panel">
          <StatusBadge tone="info">Sample data loaded</StatusBadge>
          <EventCard event={events[0]} variant="compact-square" />
        </div>
      ) : (
        <SystemState
          state={{
            status: state as Exclude<ViewState<never>["status"], "ready">,
          }}
          onRetry={
            state === "loading" || state === "error"
              ? () => setState("ready")
              : undefined
          }
        >
          <TextAction to="/events">Back to Events</TextAction>
        </SystemState>
      )}
    </main>
  );
}
function Notifications({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "section" : "main";
  return (
    <Container {...(embedded ? {} : mainProps)} className="settings-page">
      <h1>Event updates</h1>
      <p className="muted">From your events and invitations.</p>
      <Link className="notification-card" to="/events/sunset-social">
        <AttentionItem {...events[0].attention!} />
      </Link>
      <Link className="notification-card" to="/events/shared-table">
        <div className="panel">
          <StatusBadge tone="info">Invitation</StatusBadge>
          <h2>You’re invited to The shared table</h2>
          <p>Open the event to see the sample invitation.</p>
        </div>
      </Link>
    </Container>
  );
}
export default function App() {
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
  const [profile, setProfile] = useState(initialProfile);
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
      <Routes>
        <Route element={<AppShell onOpen={openDrawer} />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/events" element={<Events />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/events/:eventId" element={<EventHub />} />
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
              <ProfilePage
                key={location.key}
                onBack={backToProfile}
                profile={profile}
                onChange={setProfile}
                editInitially={
                  new URLSearchParams(location.search).get("edit") === "1"
                }
              />
            }
          />
          {["connections", "privacy", "help", "about", "sign-out"].map(
            (kind) => (
              <Route
                key={kind}
                path={`/${kind}`}
                element={
                  kind === "sign-out" ? (
                    <CoreSignOut onBack={backToProfile} />
                  ) : (
                    <ProfileUtilityPage kind={kind} onBack={backToProfile} />
                  )
                }
              />
            ),
          )}
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/preview/states" element={<StateGallery />} />
          <Route
            path="*"
            element={
              <main {...mainProps}>
                <SystemState state={{ status: "unavailable" }}>
                  <TextAction to="/home">Back to Home</TextAction>
                </SystemState>
              </main>
            }
          />
        </Route>
        <Route path="/invite/:token" element={<Invitation />} />
        <Route path="/my-events/:eventId" element={<ConnectedEventHub />} />
        <Route path="/create" element={<Creation />} />
        <Route path="/create/:eventId" element={<Creation />} />
        <Route path="/core" element={<CoreEntry />} />
        <Route path="/core/events/:eventId/host" element={<CoreHost />} />
        <Route path="/respond/:token" element={<ParticipantResponse />} />
        <Route path="/events/:eventId/host" element={<HostWorkspace />} />
        <Route path="/host/events/:eventId" element={<HostWorkspace />} />
      </Routes>
      {drawer && (
        <UtilityDrawer
          side={drawer === "profile" ? "left" : "right"}
          title={drawer === "profile" ? "Profile" : "Notifications"}
          onClose={() => setDrawer(null)}
        >
          {drawer === "profile" ? (
            <ProfileDrawerContent profile={profile} />
          ) : (
            <Notifications embedded />
          )}
        </UtilityDrawer>
      )}
    </>
  );
}
