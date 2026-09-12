import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Compass,
  Home,
  Newspaper,
  Search,
  X,
} from "lucide-react";
import { rootDestinations } from "../../../packages/application/projections";
import { IconButton } from "../../../packages/ui-web";
import navyWordmark from "../../../assets/brand/wordmark/sontu-wordmark-navy-transparent.png";
import whiteWordmark from "../../../assets/brand/wordmark/sontu-wordmark-white-transparent.png";
export function Wordmark() {
  return (
    <>
      <img className="wordmark wordmark-light" src={navyWordmark} alt="Sontu" />
      <img className="wordmark wordmark-dark" src={whiteWordmark} alt="Sontu" />
    </>
  );
}
const icons = [Home, Compass, CalendarDays, Newspaper];
export function RootBottomNav() {
  return (
    <nav className="root-nav" aria-label="Main navigation">
      {rootDestinations.map((item, i) => {
        const Icon = icons[i];
        return (
          <NavLink key={item.path} to={item.path}>
            <Icon size={22} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
export function TopUtilities({
  onOpen,
}: {
  onOpen: (panel: "profile" | "notifications") => void;
}) {
  return (
    <header className="top-utilities">
      <button
        className="avatar"
        onClick={() => onOpen("profile")}
        aria-label="Profile and appearance"
        aria-haspopup="dialog"
      >
        J
      </button>
      <Link className="brand-link" to="/home" aria-label="Sontu home">
        <Wordmark />
      </Link>
      <div className="top-actions">
        <Link
          className="icon-button"
          to="/discover?search=1"
          aria-label="Search events"
        >
          <Search size={21} />
        </Link>
        <button
          className="icon-button"
          onClick={() => onOpen("notifications")}
          aria-label="Notifications"
          aria-haspopup="dialog"
        >
          <Bell size={21} />
          <span className="notification-dot" />
        </button>
      </div>
    </header>
  );
}
export function AppShell({
  onOpen,
}: {
  onOpen: (panel: "profile" | "notifications") => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [hiddenOn, setHiddenOn] = useState<string | null>(null);
  const hidden = hiddenOn === location.key;
  const setHidden = useCallback(
    (value: boolean) => setHiddenOn(value ? location.key : null),
    [location.key],
  );
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipedUntil = useRef(0);
  useLayoutEffect(() => {
    gesture.current = null;
  }, [location.pathname]);
  useEffect(() => {
    let last = window.scrollY;
    let travel = 0;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      if (Math.sign(delta) !== Math.sign(travel)) travel = 0;
      travel += delta;
      if (y < 60) {
        setHidden(false);
        travel = 0;
      } else if (Math.abs(travel) > 18) {
        setHidden(travel > 0 && !document.querySelector("dialog[open]"));
        travel = 0;
      }
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.key, setHidden]);
  return (
    <div className={`app-shell ${hidden ? "chrome-hidden" : ""}`}>
      <div className="consumer-chrome" onFocusCapture={() => setHidden(false)}>
        <TopUtilities
          onOpen={(panel) => {
            setHidden(false);
            onOpen(panel);
          }}
        />
      </div>
      <div
        className="consumer-content"
        onTouchStart={(e) => {
          gesture.current = null;
          swipedUntil.current = 0;
          if (
            e.touches.length !== 1 ||
            !rootDestinations.some((r) => r.path === location.pathname)
          )
            return;
          const target = e.target as HTMLElement;
          if (
            target.closest(
              'button,input,select,textarea,[role="tablist"],[data-no-swipe]',
            )
          )
            return;
          for (
            let el: HTMLElement | null = target;
            el && el !== e.currentTarget;
            el = el.parentElement
          ) {
            if (
              el.scrollWidth > el.clientWidth + 1 &&
              /auto|scroll/.test(getComputedStyle(el).overflowX)
            )
              return;
          }
          const t = e.touches[0];
          if (t.clientX < 24 || t.clientX > innerWidth - 24) return;
          gesture.current = { x: t.clientX, y: t.clientY, time: Date.now() };
        }}
        onTouchCancel={() => {
          gesture.current = null;
        }}
        onTouchEnd={(e) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || e.changedTouches.length !== 1) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x,
            dy = t.clientY - start.y;
          if (
            Math.abs(dx) < 80 ||
            Math.abs(dy) > 50 ||
            Math.abs(dx) < Math.abs(dy) * 1.8 ||
            Date.now() - start.time > 700
          )
            return;
          const index = rootDestinations.findIndex(
            (r) => r.path === location.pathname,
          );
          const next = rootDestinations[index + (dx < 0 ? 1 : -1)];
          if (next) {
            swipedUntil.current = Date.now() + 350;
            navigate(next.path);
          }
        }}
        onClickCapture={(e) => {
          if (Date.now() < swipedUntil.current) {
            e.preventDefault();
            e.stopPropagation();
            swipedUntil.current = 0;
          }
        }}
      >
        <Outlet />
      </div>
      <div onFocusCapture={() => setHidden(false)}>
        <RootBottomNav />
      </div>
    </div>
  );
}
export function FocusedWorkspaceShell({
  children,
  title,
  back,
}: {
  children: ReactNode;
  title: string;
  back: string;
}) {
  return (
    <div className="focused-shell">
      <header className="focused-header">
        <Link to={back} className="icon-button" aria-label="Back to event">
          <ArrowLeft />
        </Link>
        <strong>{title}</strong>
        <Link
          to="/events?view=Hosting"
          className="icon-button"
          aria-label="Close workspace"
        >
          <X />
        </Link>
      </header>
      {children}
    </div>
  );
}
export function WidePortalShell({
  children,
  nav,
}: {
  children: ReactNode;
  nav: ReactNode;
}) {
  return (
    <div className="portal-layout">
      <aside className="portal-sidebar">
        <Wordmark />
        <p className="muted">Host Portal</p>
        <Link className="back-link" to="/events?view=Hosting">
          <ArrowLeft size={17} />
          Back to your events
        </Link>
        {nav}
        <span className="portal-footnote">Event-scoped workspace</span>
      </aside>
      <div className="portal-body">{children}</div>
    </div>
  );
}
export function RouteFocus() {
  const location = useLocation();
  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => {
      history.scrollRestoration = previous;
    };
  }, [location.pathname]);
  return null;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={onClose}>
      <div className="section-heading">
        <h2>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}

export function UtilityDrawer({
  side,
  title,
  onClose,
  children,
}: {
  side: "left" | "right";
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    ref.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`utility-drawer drawer-${side}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right) onClose();
        }
      }}
    >
      <div className="drawer-heading">
        <h2>{title}</h2>
        <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div
        className="drawer-content"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) onClose();
        }}
      >
        {children}
      </div>
    </dialog>
  );
}
