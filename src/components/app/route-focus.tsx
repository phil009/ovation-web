"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Give up if the page has no h1 by then. */
const WAIT_MS = 5_000;

/**
 * After client-side navigation, move focus to the page's h1 so keyboard and screen reader
 * users start at the new content. Next's route announcer only reads the title; it does not
 * move focus. Not done on the first load (the browser starts at the top already).
 *
 * Pages may show a skeleton first, so this waits for the h1 to appear, and never takes focus
 * from something the user has focused in the meantime.
 */
export function RouteFocus() {
  const pathname = usePathname();
  // The previous path (StrictMode runs effects twice, so a boolean "first" flag is not enough).
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === null || from === pathname) return;
    const startedWith = document.activeElement;

    const tryFocus = (): boolean => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return false;
      const active = document.activeElement;
      const userMoved = active !== startedWith && active !== document.body && active !== null;
      if (!userMoved) {
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus();
      }
      return true;
    };

    let observer: MutationObserver | null = null;
    const frame = requestAnimationFrame(() => {
      if (tryFocus()) return;
      observer = new MutationObserver(() => {
        if (tryFocus()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    const timeout = setTimeout(() => observer?.disconnect(), WAIT_MS);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
