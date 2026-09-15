import { useId, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  HelpCircle,
  LockKeyhole,
  MapPin,
  Search,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import type {
  EventProjection,
  Operation,
  Tone,
  ViewState,
} from "../application/projections";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return <button className={`button ${variant} ${className}`} {...props} />;
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-button" aria-label={label} {...props}>
      {children}
    </button>
  );
}
export function TextAction({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-action" to={to}>
      {children}
      <ArrowRight size={16} />
    </Link>
  );
}
export function Chip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return onClick ? (
    <button
      className={`chip ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  ) : (
    <span className="tag">{children}</span>
  );
}
export function Tabs({
  items,
  value,
  onChange,
  label,
  renderItem,
}: {
  items: readonly string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  renderItem?: (item: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, i) => (
        <button
          key={item}
          id={`${id}-${i}`}
          role="tab"
          aria-selected={value === item}
          tabIndex={value === item ? 0 : -1}
          onClick={() => onChange(item)}
          onKeyDown={(e) => {
            const next =
              e.key === "ArrowRight"
                ? (i + 1) % items.length
                : e.key === "ArrowLeft"
                  ? (i - 1 + items.length) % items.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? items.length - 1
                      : null;
            if (next !== null) {
              e.preventDefault();
              onChange(items[next]);
              document.getElementById(`${id}-${next}`)?.focus();
            }
          }}
        >
          {renderItem ? renderItem(item) : item}
        </button>
      ))}
    </div>
  );
}
export function TextField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <span className="field-error" id={`${id}-error`}>
          <AlertCircle size={16} />
          {error}
        </span>
      )}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  label = "Search events",
  placeholder = "Find your next experience",
}: {
  value: string;
  onChange: (s: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={20} />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`status ${tone}`}>
      {tone === "success" ? (
        <Check size={13} />
      ) : tone === "warning" ? (
        <Clock3 size={13} />
      ) : tone === "error" ? (
        <AlertCircle size={13} />
      ) : null}
      {children}
    </span>
  );
}
export function TrustBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="trust">
      <ShieldCheck size={14} />
      Verified host
    </span>
  ) : null;
}
export function EventImage({
  event,
  image,
  className = "",
  priority = false,
}: {
  event?: EventProjection;
  image?: { src: string; alt: string };
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className={`image-fallback ${className}`}
      role="img"
      aria-label="Event image unavailable"
    >
      <CalendarDays />
      <span>Event image unavailable</span>
    </div>
  ) : (
    <img
      className={`event-image ${className}`}
      src={`${import.meta.env.BASE_URL}${image?.src ?? event?.presentation.image ?? ""}`}
      alt={image?.alt ?? event?.presentation.imageAlt ?? ""}
      loading={priority ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}
export function EventCard({
  event,
  variant = "editorial",
}: {
  event: EventProjection;
  variant?: "hero" | "editorial" | "compact-square" | "operational";
}) {
  const p = event.presentation;
  return (
    <article className={`event-card ${variant}`}>
      <Link className="event-card-link" to={`/events/${event.identity.id}`}>
        <EventImage event={event} priority={variant === "hero"} />
        <div className="event-card-copy">
          {variant === "hero" && (
            <span className="eyebrow">An evening worth sharing</span>
          )}
          <h3>{event.identity.title}</h3>
          <span className="event-date">
            {p.date} · {p.time.split("–")[0]}
          </span>
          <p className="location">
            <MapPin size={14} />
            {p.location}
          </p>
          {variant === "hero" ? (
            <span className="hero-action">
              Explore the event <ArrowRight size={18} />
            </span>
          ) : (
            <div className="tags">
              <Chip>{p.category}</Chip>
              {event.context.relationship === "going" && (
                <StatusBadge tone="info">Going</StatusBadge>
              )}
              {event.context.relationship === "host" && (
                <StatusBadge>Hosting</StatusBadge>
              )}
            </div>
          )}
        </div>
        {variant === "compact-square" && (
          <ArrowRight className="card-chevron" size={18} />
        )}
      </Link>
    </article>
  );
}
export function AttentionItem({
  title,
  detail,
  tone = "warning",
}: {
  title: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <div className={`attention ${tone}`}>
      <AlertCircle size={21} />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
export function OperationalItem({ item }: { item: Operation }) {
  return (
    <div className="operational-item">
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
    </div>
  );
}
const stateCopy = {
  loading: ["Loading event details", "Retrieving the latest available view."],
  empty: [
    "Nothing here yet",
    "Your next shared experience could be just around the corner.",
  ],
  error: [
    "We couldn’t load this view",
    "Please try again. Nothing has been submitted or changed.",
  ],
  denied: [
    "This workspace isn’t available to you",
    "Host access is required to view these event operations.",
  ],
  unavailable: [
    "This event isn’t available",
    "The link may be out of date, or the event may no longer be available.",
  ],
  pending_unknown: [
    "Still awaiting confirmation",
    "The outcome is unresolved. Don’t treat this as confirmed.",
  ],
} as const;
export function SystemState({
  state,
  onRetry,
  children,
}: {
  state: Exclude<ViewState<never>, { status: "ready" }>;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const [title, body] = stateCopy[state.status];
  const Icon =
    state.status === "denied"
      ? LockKeyhole
      : state.status === "error"
        ? Unplug
        : state.status === "pending_unknown"
          ? HelpCircle
          : CalendarDays;
  return (
    <section
      className={`system-state state-${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      <div className="state-symbol">
        <Icon size={32} />
      </div>
      <h2>{title}</h2>
      <p>{state.message ?? body}</p>
      {state.status === "loading" && (
        <div className="skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {onRetry && (
        <Button onClick={onRetry}>
          {state.status === "loading" ? "Show sample result" : "Try again"}
        </Button>
      )}
      {children}
    </section>
  );
}
export const LoadingState = ({ onRetry }: { onRetry?: () => void }) => (
  <SystemState state={{ status: "loading" }} onRetry={onRetry} />
);
export const EmptyState = ({ children }: { children?: ReactNode }) => (
  <SystemState state={{ status: "empty" }}>{children}</SystemState>
);
export const ErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <SystemState state={{ status: "error" }} onRetry={onRetry} />
);
export const DeniedState = () => <SystemState state={{ status: "denied" }} />;
export const UnavailableState = () => (
  <SystemState state={{ status: "unavailable" }} />
);
export const PendingUnknownState = () => (
  <SystemState state={{ status: "pending_unknown" }} />
);
