import { useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  ChevronLeft,
  Check,
  Eye,
  EyeOff,
  Circle,
  UserRound,
  Globe2,
  Lock,
  ChevronDown,
  Users,
} from "lucide-react";
import { Button, TextField } from "../../../packages/ui-web";
import { supabase } from "../../../packages/data/sontu";
import {
  passwordChecks,
  safeAccountReturn,
} from "../../../packages/domain/password";
import { Wordmark } from "./shells";
import { profileRequest, useAccount } from "./account-state";

function AccountShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="account-shell">
      <aside className="account-world" aria-label="Shared experiences">
        <div>
          <Wordmark />
          <p>Living life, together.</p>
        </div>
        <h2>
          More moments.
          <br />
          More together.
        </h2>
        <p>
          Discover events. Meet people.
          <br />
          Make room for real life.
        </p>
      </aside>
      <section className="account-surface">
        <Link
          to="/home"
          className="icon-button back-chevron"
          aria-label="Back to Sontu"
        >
          <ChevronLeft size={26} strokeWidth={2.5} />
        </Link>
        <div className="account-form">
          <div className="account-wordmark">
            <Wordmark />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
export function AccountPortal() {
  const [params] = useSearchParams(),
    location = useLocation(),
    account = useAccount();
  const signup = location.pathname === "/sign-up";
  const next = safeAccountReturn(params.get("next"));
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submitted, setSubmitted] = useState(false);
  const checks = passwordChecks(password);
  // This owner-private beta uses an explicit testing notice, not invented production policies.
  const terms = import.meta.env.VITE_TERMS_URL,
    privacy = import.meta.env.VITE_PRIVACY_URL,
    policyVersion = import.meta.env.VITE_LEGAL_VERSION;
  const hasPolicies =
    /^https:\/\//.test(terms ?? "") &&
    /^https:\/\//.test(privacy ?? "") &&
    !!policyVersion;
  const registrationReady =
    import.meta.env.VITE_REGISTRATION_ENABLED !== "false";
  if (account.session)
    return (
      <Navigate
        to={"/account/setup?next=" + encodeURIComponent(next)}
        replace
      />
    );
  return (
    <AccountShell>
      <span className="eyebrow">
        {signup ? "Join Sontu" : "Your next experience awaits"}
      </span>
      <h1>{signup ? "Create your account" : "Welcome back."}</h1>
      <p className="muted">
        {signup
          ? "A few simple steps. More possibilities together."
          : "Sign in to your events, plans, and people."}
      </p>
      <div className="provider-options" aria-describedby="provider-note">
        <Button variant="secondary" disabled>
          Continue with Google
        </Button>
        <Button variant="secondary" disabled>
          Continue with Apple
        </Button>
      </div>
      <p id="provider-note" className="small muted">
        Google and Apple sign-in are coming later.
      </p>
      <div className="account-divider">
        <span>or continue with email</span>
      </div>
      {submitted ? (
        <section role="status" className="panel">
          <h2>Check your email</h2>
          <p>
            If registration can proceed, follow the confirmation email to verify
            your address. Delivery may be limited during the beta.
          </p>
          <p>You can then return here to sign in and finish your profile.</p>
          <Link
            to={"/sign-in?next=" + encodeURIComponent(next)}
            className="icon-button back-chevron"
            aria-label="Back to sign in"
          >
            <ChevronLeft size={26} strokeWidth={2.5} />
          </Link>
        </section>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (
              signup &&
              (!registrationReady || !accepted || checks.some((c) => !c.met))
            )
              return;
            setBusy(true);
            try {
              if (signup) {
                const { error } = await supabase.auth.signUp({
                  email: email.trim(),
                  password,
                  options: {
                    data: {
                      ...(hasPolicies
                        ? {
                            sontu_legal_version: policyVersion,
                            sontu_legal_accepted: true,
                          }
                        : {
                            sontu_beta_notice_version:
                              "private-testing-2026-09-12",
                            sontu_beta_notice_acknowledged: true,
                          }),
                    },
                  },
                });
                if (error)
                  setError(
                    error.code === "weak_password"
                      ? "Your password does not meet the required rules."
                      : error.code === "email_address_not_authorized"
                        ? "Supabase currently allows confirmation emails only to project-team addresses. Use your project email for this test."
                        : error.status === 429
                          ? "Too many email requests. Please wait before trying again."
                          : "Could not complete registration. Check your details or try again later.",
                  );
                else {
                  setPassword("");
                  setSubmitted(true);
                }
              } else {
                const { error } = await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error)
                  setError(
                    "Could not sign in. Check your email and password, and confirm your email if required.",
                  );
                else setPassword("");
              }
            } catch {
              setError(
                "We could not confirm the result. Try signing in before submitting again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="password-field">
            <TextField
              label="Password"
              type={show ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={signup ? "password-rules" : undefined}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {signup && (
            <>
              <ul id="password-rules" className="password-rules">
                {checks.map((c) => (
                  <li key={c.label} data-met={c.met}>
                    {c.met ? (
                      <Check size={16} aria-label="Met" />
                    ) : (
                      <Circle size={14} aria-label="Not met" />
                    )}
                    {c.label}
                  </li>
                ))}
              </ul>
              {registrationReady ? (
                <label className="legal-check">
                  <input
                    type="checkbox"
                    required
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  {hasPolicies ? (
                    <span>
                      I agree to the{" "}
                      <a href={terms} target="_blank" rel="noreferrer">
                        Terms of Service
                      </a>{" "}
                      and acknowledge the{" "}
                      <a href={privacy} target="_blank" rel="noreferrer">
                        Privacy Policy
                      </a>
                      .
                    </span>
                  ) : (
                    <span>
                      I understand this is a private test: Sontu stores my
                      account, profile and event data in its dedicated Supabase
                      project. Test data may be reset. I will use only my own
                      test accounts and avoid sensitive information.
                    </span>
                  )}
                </label>
              ) : (
                <p
                  id="registration-status"
                  className="account-notice"
                  role="status"
                >
                  Registration is temporarily paused. Existing accounts can
                  still sign in.
                </p>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <Button
            disabled={
              busy ||
              (signup &&
                (!registrationReady || !accepted || checks.some((c) => !c.met)))
            }
          >
            {busy
              ? "Please wait…"
              : signup
                ? registrationReady
                  ? "Create account"
                  : "Registration not yet available"
                : "Sign in"}
          </Button>
        </form>
      )}
      <p className="account-switch">
        {signup ? "Already have an account?" : "New to Sontu?"}{" "}
        <Link
          to={
            (signup ? "/sign-in" : "/sign-up") +
            "?next=" +
            encodeURIComponent(next)
          }
        >
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {!signup && (
        <p className="small muted">
          Password recovery by email is not available in this beta yet.
        </p>
      )}
    </AccountShell>
  );
}
export function MinimumProfile() {
  const a = useAccount(),
    [params] = useSearchParams(),
    [name, setName] = useState(""),
    [eventEmailEnabled, setEventEmailEnabled] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const next = safeAccountReturn(params.get("next"));
  if (a.checking)
    return (
      <AccountShell>
        <p role="status">Loading your account…</p>
      </AccountShell>
    );
  if (!a.session)
    return (
      <Navigate to={"/sign-in?next=" + encodeURIComponent(next)} replace />
    );
  if (a.profile) return <Navigate to={next} replace />;
  return (
    <AccountShell>
      <span className="eyebrow">Your profile · one small step</span>
      <h1>What should we call you?</h1>
      <p className="muted">
        Your first name helps people recognize you. We’ll create a unique
        @handle for you—you can change it later.
      </p>
      {a.profileError ? (
        <>
          <p role="alert">{a.profileError}</p>
          <Button onClick={a.reload}>Retry</Button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await profileRequest("create", {
                first_name: name.trim(),
                event_email_enabled: eventEmailEnabled,
              });
              if (r.status === "ready") a.reload();
              else setError("Enter a first name of up to 80 characters.");
            } catch {
              setError(
                "Could not confirm your profile. Retry safely to recover it.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="First name"
            autoComplete="given-name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="legal-check">
            <input type="checkbox" checked={eventEmailEnabled} onChange={(e) => setEventEmailEnabled(e.target.checked)} />
            <span><strong>Send me event emails</strong><small>Invitations and important updates for events you join. You can change this later. Guest RSVP emails are always required to manage a reservation.</small></span>
          </label>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Start exploring"}
          </Button>
        </form>
      )}
      <p className="small muted">
        Photo, interests and other personal details can wait. You can set them
        up later.
      </p>
      <Button variant="quiet" onClick={() => supabase.auth.signOut()}>
        Sign out and finish later
      </Button>
    </AccountShell>
  );
}
export function AccountEntryGate({ children }: { children: ReactNode }) {
  const a = useAccount(),
    l = useLocation();
  // Accountless invitation destinations remain separate from account setup.
  if (a.session && a.checking)
    return (
      <p role="status" className="panel">
        Loading your profile…
      </p>
    );
  if (a.session && !a.profile)
    return (
      <Navigate
        to={"/account/setup?next=" + encodeURIComponent(l.pathname + l.search)}
        replace
      />
    );
  return <>{children}</>;
}
export function RealProfile({ onBack }: { onBack: () => void }) {
  const a = useAccount(),
    p = a.profile;
  const [params] = useSearchParams();
  type Visibility = "GENERAL" | "CLOSE" | "ONLY_ME";
  const [editing, setEditing] = useState(params.get("edit") === "1"),
    [name, setName] = useState(p?.first_name ?? ""),
    [display, setDisplay] = useState(p?.display_name ?? ""),
    [handle, setHandle] = useState(p?.handle ?? ""),
    [eventEmailEnabled, setEventEmailEnabled] = useState(p?.event_email_enabled ?? true),
    [bio, setBio] = useState(p?.bio ?? ""),
    [bioVisibility, setBioVisibility] = useState<Visibility>(p?.bio_visibility ?? "GENERAL"),
    [linkLabel, setLinkLabel] = useState(p?.link_label ?? ""),
    [linkUrl, setLinkUrl] = useState(p?.link_url ?? ""),
    [linkVisibility, setLinkVisibility] = useState<Visibility>(p?.link_visibility ?? "GENERAL"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const normalizeProfileUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^https:\/\//i.test(trimmed)) return trimmed;
    if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
    return `https://${trimmed}`;
  };
  const visibilityOptions: Array<{
    value: Visibility;
    label: string;
    description: string;
    icon: typeof Globe2;
  }> = [
    {
      value: "GENERAL",
      label: "General",
      description: "Visible on your public profile.",
      icon: Globe2,
    },
    {
      value: "CLOSE",
      label: "Close",
      description: "Visible to people you mark as Close.",
      icon: Users,
    },
    {
      value: "ONLY_ME",
      label: "Only me",
      description: "Visible only to you.",
      icon: Lock,
    },
  ];
  const visibilityField = (
    label: string,
    value: Visibility,
    setValue: (value: Visibility) => void,
  ) => {
    const current = visibilityOptions.find((option) => option.value === value) ?? visibilityOptions[0];
    const CurrentIcon = current.icon;
    return (
      <details className="visibility-picker">
        <summary aria-label={`${label}: ${current.label}`} title={`${label}: ${current.description}`}>
          <CurrentIcon size={18} />
          <ChevronDown size={14} />
        </summary>
        <div className="visibility-menu" role="radiogroup" aria-label={label}>
          {visibilityOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value === option.value}
                className={value === option.value ? "selected" : ""}
                onClick={(event) => {
                  setValue(option.value);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                <Icon size={18} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      </details>
    );
  };
  const visibilityLabel = (value: Visibility) =>
    visibilityOptions.find((option) => option.value === value)?.label ??
    "General";
  if (!p) return <Navigate to="/account/setup" replace />;
  return (
    <main id="main" tabIndex={-1} className="settings-page lightweight-profile">
      <button
        onClick={onBack}
        className="icon-button back-chevron"
        aria-label="Back to Profile"
      >
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <div className="profile-identity">
        <span className="avatar profile-avatar">
          <UserRound />
        </span>
        <div>
          <h1>{p.display_name || p.first_name}</h1>
          <p>@{p.handle}</p>
        </div>
      </div>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await profileRequest("update", {
                first_name: name,
                display_name: display,
                handle,
                event_email_enabled: eventEmailEnabled,
                bio,
                bio_visibility: bioVisibility,
                link_label: linkLabel,
                link_url: normalizeProfileUrl(linkUrl),
                link_visibility: linkVisibility,
                revision: p.revision,
              });
              if (r.status === "ready") {
                a.reload();
                setEditing(false);
                onBack();
              } else
                setError(
                  (
                    {
                      HANDLE_COOLDOWN:
                        "You can change your handle again 30 days after your last change.",
                      HANDLE_UNAVAILABLE: "That handle is unavailable.",
                      INVALID_HANDLE:
                        "Use 3–30 lowercase letters, numbers, underscores or periods. Start with a letter or number; reserved names are unavailable.",
                      STALE_PROFILE:
                        "Your profile changed elsewhere. Reload before saving again.",
                      INVALID_PROFILE_FIELD:
                        "Keep your bio and link details short.",
                      INVALID_VISIBILITY:
                        "Choose General, Close, or Only me visibility.",
                      INVALID_LINK:
                        "Use a valid website link.",
                    } as Record<string, string>
                  )[r.error_code ?? ""] ?? "Check your name and try again.",
                );
            } catch {
              setError(
                "Save could not be confirmed. Reload your profile before trying again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField
            label="First name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="legal-check">
            <input type="checkbox" checked={eventEmailEnabled} onChange={(e) => setEventEmailEnabled(e.target.checked)} />
            <span><strong>Event emails</strong><small>Receive invitations and important event updates by email.</small></span>
          </label>
          <TextField
            label="Display name (optional)"
            maxLength={80}
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
          />
          <TextField
            label="Handle"
            required
            maxLength={30}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
          <div className="profile-edit-field">
            <TextField
              label="Bio"
              maxLength={240}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            {visibilityField("Bio visibility", bioVisibility, setBioVisibility)}
          </div>
          <div className="profile-edit-field">
            <TextField
              label="Link label"
              maxLength={80}
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
            />
            <TextField
              label="Link URL"
              type="text"
              maxLength={240}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="example.com"
            />
            {visibilityField("Link visibility", linkVisibility, setLinkVisibility)}
          </div>
          <p className="small muted">
            {p.handle_provisional
              ? "Your first handle choice is available immediately."
              : "You can change your handle once every 30 days."}{" "}
            Your event relationships stay attached to your account.
          </p>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy}>Save profile</Button>
          <Button
            variant="quiet"
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <section className="profile-owner-preview">
          <div className="profile-preview-grid">
            <div className="profile-field-preview">
              <span>Bio</span>
              <p>{p.bio || "No bio added yet."}</p>
              <small>{visibilityLabel(p.bio_visibility)}</small>
            </div>
            <div className="profile-field-preview">
              <span>Link</span>
              <p>{p.link_label || p.link_url || "No profile link added yet."}</p>
              <small>{visibilityLabel(p.link_visibility)}</small>
            </div>
          </div>
          <div className="profile-home-actions">
            <Link to={`/p/${p.handle}`} className="profile-hub-secondary-action">
              View public profile
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setName(p.first_name);
                setDisplay(p.display_name);
                setHandle(p.handle);
                setEventEmailEnabled(p.event_email_enabled);
                setBio(p.bio);
                setBioVisibility(p.bio_visibility);
                setLinkLabel(p.link_label);
                setLinkUrl(p.link_url);
                setLinkVisibility(p.link_visibility);
                setEditing(true);
              }}
            >
              Edit Profile
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
