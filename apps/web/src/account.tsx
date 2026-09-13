import { useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ChevronLeft,
  Check,
  Eye,
  EyeOff,
  Circle,
  UserRound,
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
  // Accountless invitation and fixture review destinations remain separate.
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
  const navigate = useNavigate();
  const a = useAccount(),
    p = a.profile;
  const [params] = useSearchParams();
  const [editing, setEditing] = useState(params.get("edit") === "1"),
    [name, setName] = useState(p?.first_name ?? ""),
    [display, setDisplay] = useState(p?.display_name ?? ""),
    [handle, setHandle] = useState(p?.handle ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
                revision: p.revision,
              });
              if (r.status === "ready") {
                navigate("/profile", { replace: true });
                a.reload();
                setEditing(false);
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
        <Button
          variant="secondary"
          onClick={() => {
            setName(p.first_name);
            setDisplay(p.display_name);
            setHandle(p.handle);
            setEditing(true);
          }}
        >
          Edit Profile
        </Button>
      )}
    </main>
  );
}
