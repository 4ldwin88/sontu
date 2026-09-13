/* oxlint-disable react/only-export-components, react/set-state-in-effect, react-hooks/exhaustive-deps -- Context shares typed accessors; effects reconcile external Auth and invalidate stale async profile reads. */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { rpc, supabase } from "../../../packages/data/sontu";
export type AccountProfile = {
  user_id: string;
  first_name: string;
  display_name: string;
  handle: string;
  handle_provisional: boolean;
  handle_changed_at: string | null;
  revision: number;
};
export type ProfileResult = {
  status: string;
  profile?: AccountProfile;
  error_code?: string;
};
export const profileRequest = (
  action = "read",
  input: Record<string, unknown> = {},
) => rpc<ProfileResult>("sontu_account_profile", { action, input });
const Context = createContext<{
  session: Session | null;
  checking: boolean;
  profile: AccountProfile | null;
  profileError: string;
  reload: () => void;
}>({
  session: null,
  checking: true,
  profile: null,
  profileError: "",
  reload: () => {},
});
export const useAccount = () => useContext(Context);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [checking, setChecking] = useState(true),
    [profile, setProfile] = useState<AccountProfile | null>(null),
    [profileError, setError] = useState(""),
    [epoch, setEpoch] = useState(0);
  const generation = useRef(0);
  const activeUser = useRef<string | null>(null);
  const userId = session?.user.id;
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      const id = s?.user.id ?? null;
      setSession(s);
      if (id !== activeUser.current) {
        activeUser.current = id;
        generation.current++;
        setProfile(null);
        setError("");
        setChecking(!!s);
        setEpoch((n) => n + 1);
      } else if (!s) setChecking(false);
      // SIGNED_IN also fires on tab focus. Same-user refresh must not
      // unmount a host workspace, discard a draft, or close its dialogs.
    });
    return () => {
      generation.current++;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const g = generation.current;
    setChecking(true);
    profileRequest()
      .then((r) => {
        if (live && g === generation.current) {
          if (r.status === "ready") setProfile(r.profile!);
          else if (r.status !== "empty")
            setError("Your profile could not be loaded.");
        }
      })
      .catch(() => {
        if (live && g === generation.current)
          setError("Your profile could not be loaded.");
      })
      .finally(() => {
        if (live && g === generation.current) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [userId, epoch]);
  return (
    <Context.Provider
      value={{
        session,
        checking,
        profile,
        profileError,
        reload: () => setEpoch((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
