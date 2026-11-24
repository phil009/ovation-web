"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, call, COLD_START_TIMEOUT_MS } from "@/lib/api/client";
import { strings } from "@/lib/strings";
import { Notice } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

type HealthState = "checking" | "ok" | "unreachable";

const HealthContext = createContext<{ state: HealthState; slow: boolean; retry: () => void }>({
  state: "checking",
  slow: false,
  retry: () => undefined,
});

/** Only show the waking message if the first check takes longer than this. */
const SLOW_AFTER_MS = 1_500;

/**
 * Pings GET /api/health once at app start. Staging sleeps after 15 idle minutes and the first
 * request can take about a minute, so the app shows a calm "waking" status instead of an error.
 */
export function HealthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HealthState>("checking");
  const [slow, setSlow] = useState(false);
  const attempt = useRef(0);

  const check = useCallback(async () => {
    const id = ++attempt.current;
    setState("checking");
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    try {
      await call((signal) => api.GET("/api/health", { signal }), {
        timeoutMs: COLD_START_TIMEOUT_MS,
      });
      if (id === attempt.current) setState("ok");
    } catch {
      if (id === attempt.current) setState("unreachable");
    } finally {
      clearTimeout(slowTimer);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the one-off health check
    void check();
    const onOnline = () => void check();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [check]);

  return (
    <HealthContext.Provider value={{ state, slow, retry: () => void check() }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  return useContext(HealthContext);
}

/** Polite status shown while the server wakes up or cannot be reached. */
export function ColdStartStatus() {
  const { state, slow, retry } = useHealth();
  const visible = (state === "checking" && slow) || state === "unreachable";

  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {visible ? (
        <Notice tone={state === "unreachable" ? "warning" : "info"}>
          {state === "unreachable" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1">{strings.coldStart.unreachable}</p>
              <Button variant="secondary" onClick={retry}>
                {strings.coldStart.retry}
              </Button>
            </div>
          ) : (
            <p>{strings.coldStart.waking}</p>
          )}
        </Notice>
      ) : null}
    </div>
  );
}
