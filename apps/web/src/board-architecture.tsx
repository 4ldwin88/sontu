import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Compass,
  Megaphone,
  MessageSquareText,
  Sparkles,
  TicketCheck,
  Users,
} from "lucide-react";
import { trackBeta } from "../../../packages/data/telemetry";
import { Button, EmptyState, StatusBadge, TextAction } from "../../../packages/ui-web";
import { forView, SimpleEventCard, useMyEvents, when } from "./invitations";

const mainProps = { id: "board-main", tabIndex: -1 };

function useBoardRouteMarker(route: "home" | "feed" | null) {
  useEffect(() => {
    if (route) document.documentElement.dataset.boardRoute = route;
    else delete document.documentElement.dataset.boardRoute;
    return () => {
      delete document.documentElement.dataset.boardRoute;
    };
  }, [route]);
}

function BoardMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="board-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function BoardActionCard({
  to,
  icon,
  title,
  body,
  tone = "neutral",
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: "neutral" | "warm" | "cool" | "moss";
}) {
  return (
    <Link className={`board-action-card ${tone}`} to={to}>
      <span className="board-action-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
      <ArrowRight size={17} />
    </Link>
  );
}

export function BoardHome() {
  const real = useMyEvents();
  const upcoming = forView(real.items, "Upcoming");
  const invited = forView(real.items, "Invited");
  const interested = forView(real.items, "Interested");
  const hosted = forView(real.items, "Hosting");
  const nextEvent = upcoming[0] ?? invited[0] ?? hosted[0] ?? real.items.find((event) => event.lifecycle === "PUBLISHED");
  const activeHost = hosted.find((event) => event.lifecycle === "PUBLISHED");
  const attentionCount = invited.length + real.items.filter((event) => event.reconfirmation_required).length;

  useEffect(() => {
    trackBeta("ui_board_variant_viewed", "home", { board: "B", surface: "home" });
    trackBeta("home_priority_surface_viewed", "home", {
      has_next_event: Boolean(nextEvent),
      attention_count: attentionCount,
      hosted_count: hosted.length,
    });
  }, [attentionCount, hosted.length, nextEvent]);

  return (
    <main {...mainProps} className="board-home board-screen">
      <section className="board-hero-band" aria-labelledby="board-home-title">
        <div className="board-hero-copy">
          <span className="eyebrow">Home</span>
          <h1 id="board-home-title">What matters next.</h1>
          <p>
            Your next commitment, invitations, host work, and useful event context in one place.
          </p>
          <div className="board-hero-actions">
            <Link className="button primary" to={nextEvent ? `/events/${nextEvent.id}` : "/discover"}>
              {nextEvent ? "Open next event" : "Discover events"}
            </Link>
            <Link className="button secondary" to="/events">
              View all events
            </Link>
          </div>
        </div>
        <div className="board-now-card panel" aria-label="Current priority">
          <span className="board-card-kicker">Now</span>
          {real.loading ? (
            <p role="status">Loading your event context...</p>
          ) : nextEvent ? (
            <>
              <StatusBadge tone={nextEvent.hosting ? "info" : invited[0]?.id === nextEvent.id ? "warning" : "success"}>
                {nextEvent.hosting ? "Hosting" : invited[0]?.id === nextEvent.id ? "Invitation" : "Next event"}
              </StatusBadge>
              <h2>{nextEvent.title}</h2>
              <p>{when(nextEvent.starts_at, nextEvent.timezone)}</p>
              <TextAction to={`/events/${nextEvent.id}`}>Review event hub</TextAction>
            </>
          ) : (
            <>
              <h2>No active event yet</h2>
              <p>Discovery stays useful without pretending Sontu has marketplace density it does not have yet.</p>
              <TextAction to="/discover">Explore available events</TextAction>
            </>
          )}
        </div>
      </section>

      <section className="board-priority-grid" aria-label="Home priorities">
        <BoardActionCard
          to="/notifications"
          icon={<Bell size={20} />}
          title={`${attentionCount} need attention`}
          body="Invitations, changes, and host replies surface here before they become buried."
          tone="warm"
        />
        <BoardActionCard
          to="/events?view=Upcoming"
          icon={<TicketCheck size={20} />}
          title={`${upcoming.length} upcoming`}
          body="Confirmed plans stay separate from discovery and feed content."
          tone="cool"
        />
        <BoardActionCard
          to="/events?view=Hosting"
          icon={<Users size={20} />}
          title={`${hosted.length} hosted`}
          body="Hosting is contextual, not a permanent global account mode."
          tone="moss"
        />
      </section>

      <div className="board-two-column">
        <section className="board-panel-stack">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Action and relevance</span>
              <h2>Attached to you</h2>
            </div>
            <TextAction to="/events">Events hub</TextAction>
          </div>
          {upcoming.length || invited.length ? (
            <div className="board-event-stack">
              {[...invited, ...upcoming].slice(0, 3).map((event) => (
                <SimpleEventCard key={event.id} event={event} view={invited.includes(event) ? "Invited" : "Upcoming"} />
              ))}
            </div>
          ) : (
            <EmptyState>
              <p>Your registered, invited, and saved events will appear here when they exist.</p>
            </EmptyState>
          )}
        </section>

        <aside className="board-context-rail">
          <section className="panel board-soft-panel">
            <span className="eyebrow">Home shape</span>
            <h2>Mixed by default</h2>
            <p>
              Participant and host signals can rise or recede based on active relationships without forcing a role switch.
            </p>
            <div className="board-metrics-row">
              <BoardMetric label="saved" value={interested.length} />
              <BoardMetric label="hosted" value={hosted.length} />
            </div>
          </section>
          {activeHost && (
            <section className="panel board-host-context">
              <StatusBadge tone="info">Host context</StatusBadge>
              <h2>{activeHost.title}</h2>
              <p>Open the event workspace only when you need to operate the event.</p>
              <TextAction to={`/core/events/${activeHost.id}/host`}>Manage event</TextAction>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

export function BoardFeed() {
  const real = useMyEvents();
  const published = real.items.filter((event) => event.lifecycle === "PUBLISHED").slice(0, 4);
  const hosted = forView(real.items, "Hosting");

  useEffect(() => {
    trackBeta("ui_board_variant_viewed", "feed", { board: "B", surface: "feed" });
    trackBeta("event_feed_attention_item_viewed", "feed", {
      item_count: published.length,
      hosted_count: hosted.length,
    });
  }, [hosted.length, published.length]);

  return (
    <main {...mainProps} className="board-feed board-screen">
      <div className="board-feed-header">
        <div>
          <span className="eyebrow">Feed</span>
          <h1>Event-centered attention.</h1>
          <p>
            Updates, anticipation, recaps, and host-originated moments belong here. Personal posting does not.
          </p>
        </div>
        <Link className="button secondary" to="/discover">
          Discover events
        </Link>
      </div>
      <div className="board-feed-layout">
        <section className="board-feed-list" aria-label="Event updates">
          {published.length ? (
            published.map((event, index) => (
              <article className="board-feed-item" key={event.id}>
                <div className="board-feed-icon">
                  {index === 0 ? <Megaphone /> : index === 1 ? <CalendarClock /> : <MessageSquareText />}
                </div>
                <div>
                  <StatusBadge tone={event.hosting ? "info" : "neutral"}>
                    {event.hosting ? "Host update model" : "Event update model"}
                  </StatusBadge>
                  <h2>{event.title}</h2>
                  <p>
                    {event.hosting
                      ? "Model host-originated updates without turning Feed into a general social timeline."
                      : "Use Feed for event lifecycle attention before, during, and after the event."}
                  </p>
                  <TextAction to={`/events/${event.id}`}>Open event</TextAction>
                </div>
              </article>
            ))
          ) : (
            <EmptyState>
              <p>Real event updates will appear here when hosts publish them.</p>
            </EmptyState>
          )}
        </section>
        <aside className="board-feed-rail">
          <section className="panel board-soft-panel">
            <Sparkles size={24} />
            <h2>Not a personal timeline</h2>
            <p>
              Feed is scoped to the event world: host updates, venue/organizer context, event media, reminders, and recaps.
            </p>
          </section>
          <section className="panel">
            <Compass size={24} />
            <h2>Discovery stays separate</h2>
            <p>Exploration, search, filters, and low-supply states remain in Discover.</p>
            <TextAction to="/discover">Go to Discover</TextAction>
          </section>
        </aside>
      </div>
    </main>
  );
}

export function BoardArchitectureOverlay() {
  const location = useLocation();
  const route = location.pathname === "/home" ? "home" : location.pathname === "/feed" ? "feed" : null;
  useBoardRouteMarker(route);
  if (route === "home") return <BoardHome />;
  if (route === "feed") return <BoardFeed />;
  return null;
}
