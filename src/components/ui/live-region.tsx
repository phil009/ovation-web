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

type Announce = (message: string, options?: { debounceMs?: number }) => void;

const AnnounceContext = createContext<Announce>(() => undefined);

/**
 * One polite live region for the whole app. Messages are debounced so rapid updates
 * (sync status, running totals) are read once, not on every change.
 */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback<Announce>((next, options) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Clear first so repeating the same message is announced again.
      setMessage("");
      requestAnimationFrame(() => setMessage(next));
    }, options?.debounceMs ?? 250);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}
