"use client";

import { useEffect, useState } from "react";

/**
 * The current time, updated every `intervalMs`. Components read time through this, not
 * Date.now() during render, so rendering stays pure and time-based UI (an Undo window, a
 * "waited more than a day" warning) still changes on its own.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
