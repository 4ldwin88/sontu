import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
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
export function TopUtilities() {
  return (
    <header className="top-utilities">
      <Link
        className="avatar"
        to="/profile"
        aria-label="Profile and appearance"
      >
        J
      </Link>
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
        <Link
          className="icon-button"
          to="/notifications"
          aria-label="Notifications"
        >
          <Bell size={21} />
          <span className="notification-dot" />
        </Link>
      </div>
    </header>
  );
}
export function AppShell() {
  return (
    <div className="app-shell">
      <TopUtilities />
      <div className="consumer-content">
        <Outlet />
      </div>
      <RootBottomNav />
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
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("main")?.focus();
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
