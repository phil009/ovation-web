"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-browser";
import { strings } from "@/lib/strings";

const WARN_BEFORE_MS = 24 * 60 * 60 * 1000;

/**
 * Warns before the session can no longer be renewed. Every refresh rotates the token, so this
 * only shows after days without a successful refresh (offline for close to 7 days).
 */
export function SessionExpiryWarning() {
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    const check = async () => {
      const expiresAt = await getSession().refreshTokenExpiresAt();
      setWarn(expiresAt !== null && expiresAt - Date.now() < WARN_BEFORE_MS);
    };
    void check();
    const timer = setInterval(() => void check(), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div role="status" aria-live="polite">
      {warn ? (
        <p className="bg-accent px-4 py-2 text-center font-semibold text-on-accent">
          {strings.session.endingSoon}
        </p>
      ) : null}
    </div>
  );
}
