import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Settings,
  Shield,
  CircleHelp,
  Info,
  LogOut,
} from "lucide-react";
import { Button, TextField, TextAction } from "../../../packages/ui-web";
import { Modal } from "./shells";
import type { ProfileProjection } from "../../../packages/test-fixtures/profile";
const destinations = [
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
  profile: ProfileProjection;
}) {
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
export function ProfilePage({
  profile,
  onChange,
  editInitially,
}: {
  profile: ProfileProjection;
  onChange: (p: ProfileProjection) => void;
  editInitially: boolean;
}) {
  const [editing, setEditing] = useState(editInitially);
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState(false);
  return (
    <main id="main" tabIndex={-1} className="settings-page lightweight-profile">
      <Link className="back-link" to="/home">
        <ArrowLeft size={18} />
        Back to Home
      </Link>
      <div className="profile-identity">
        <span
          className="avatar profile-avatar"
          aria-label="Profile avatar placeholder"
        >
          {profile.displayName[0]}
        </span>
        <div>
          <h1>{profile.displayName}</h1>
          <p className="muted">@{profile.username}</p>
        </div>
      </div>
      <p className="profile-bio">{profile.bio}</p>
      <Button
        variant="secondary"
        onClick={() => {
          setName(profile.displayName);
          setBio(profile.bio);
          setEditing(true);
        }}
      >
        Edit Profile
      </Button>
      <section className="panel">
        <h2>Connections</h2>
        <p>People you know and meet through events.</p>
        <TextAction to="/connections">View Connections</TextAction>
      </section>
      <p className="small muted profile-preview-note">
        Sample identity. No verified host or event trust evidence is available
        in this preview.
      </p>
      {editing && (
        <Modal title="Edit Profile" onClose={() => setEditing(false)}>
          <p>
            Try a display name and short bio. Changes apply only to this preview
            session.
          </p>
          <TextField
            label="Display name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            error={error && !name.trim() ? "Enter a display name." : undefined}
          />
          <TextField
            label="Bio (optional)"
            value={bio}
            maxLength={160}
            onChange={(e) => setBio(e.target.value)}
          />
          <p className="small muted">
            @{profile.username} · Avatar and username editing are not activated.
          </p>
          <Button
            onClick={() => {
              setError(true);
              if (name.trim()) {
                onChange({
                  ...profile,
                  displayName: name.trim(),
                  bio: bio.trim(),
                });
                setEditing(false);
              }
            }}
          >
            Apply to preview
          </Button>
        </Modal>
      )}
    </main>
  );
}
const pages: Record<string, { title: string; intro: string; body: string }> = {
  connections: {
    title: "Connections",
    intro: "People and relationships around shared experiences.",
    body: "No Connections are loaded in this preview. Connection requests and relationship types are not activated yet.",
  },
  privacy: {
    title: "Privacy & Safety",
    intro: "Your boundaries, in one place.",
    body: "Profile discoverability, privacy and event-safety controls will live here. They are not connected to an account in this preview; no privacy settings or safety reports are being submitted.",
  },
  help: {
    title: "Help & Support",
    intro: "Find your way around Sontu.",
    body: "Use Events for Upcoming, Invited, Interested and Hosting. Open an event to see its details, or enter its Host Workspace if you host it. Support requests are not activated in this preview.",
  },
  about: {
    title: "About Sontu",
    intro: "Living life, together.",
    body: "Sontu brings event discovery, participation and contextual hosting into one experience. This coded design foundation uses sample events and local projections.",
  },
  "sign-out": {
    title: "Sign Out",
    intro: "No account is signed in.",
    body: "This prototype uses a sample identity. Authentication and account sign-out are not activated, so no session has been ended.",
  },
};
export function ProfileUtilityPage({ kind }: { kind: string }) {
  const p = pages[kind];
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <Link className="back-link" to="/profile">
        <ArrowLeft size={18} />
        Back to Profile
      </Link>
      <h1>{p.title}</h1>
      <p className="muted">{p.intro}</p>
      <section className="panel">
        <p>{p.body}</p>
        {kind === "connections" && (
          <TextAction to="/discover">Explore events</TextAction>
        )}
      </section>
    </main>
  );
}
