import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { initialState, type State } from "@/services/data";
import { loadWorkspace } from "@/services/workspace";
import { restoreTokens, signIn, signOut } from "@/services/api";
type ContextValue = {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  ready: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<State>;
  login: (id: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  mutate: (action: () => Promise<unknown>) => Promise<State>;
};
const Context = createContext<ContextValue | null>(null);
export function MonaqeshProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = async () => {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await loadWorkspace();
      if (version === generation.current) setState(next);
      return next;
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Unable to load workspace.");
      throw e;
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  const logout = async () => {
    await signOut();
    generation.current++;
    setState(initialState());
    setError("");
    setLoading(false);
  };
  const login = async (id: string, password: string) => {
    await signIn(id, password);
    await refresh();
  };
  const mutate = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      await refresh().catch(() => {});
      throw e;
    }
    return refresh();
  };
  useEffect(() => {
    const signedOut = () => {
      generation.current++;
      setState(initialState());
      setError("Your session ended. Please sign in again.");
      setLoading(false);
    };
    window.addEventListener("monaqesh-signed-out", signedOut);
    if (restoreTokens())
      refresh()
        .catch(() => {})
        .finally(() => setReady(true));
    else setReady(true);
    return () => window.removeEventListener("monaqesh-signed-out", signedOut);
  }, []);
  return (
    <Context.Provider
      value={{ state, setState, ready, loading, error, refresh, login, logout, mutate }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMonaqesh() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Monaqesh provider missing");
  return ctx;
}
