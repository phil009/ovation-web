"use client";

import { db } from "@/lib/db";
import { bareApi, call, REQUEST_TIMEOUT_MS } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import {
  SessionManager,
  type BroadcastMessage,
  type RefreshOutcome,
  type SessionChannel,
  type SessionEnvironment,
  type SessionStore,
} from "./session";

const store: SessionStore = {
  async get() {
    const row = await db().session.get("current");
    if (!row) return undefined;
    const { refreshToken, issuedAt, user, refreshSentAt } = row;
    return { refreshToken, issuedAt, user, refreshSentAt };
  },
  async put(record) {
    await db().session.put({ id: "current", ...record });
  },
  async clear() {
    await db().session.clear();
  },
};

const transport = {
  async refresh(refreshToken: string): Promise<RefreshOutcome> {
    try {
      // A short timeout, so retries fit inside the backend's 2-minute replay window.
      const tokens = await call(
        (signal) => bareApi.POST("/api/auth/refresh", { body: { refreshToken }, signal }),
        { timeoutMs: REQUEST_TIMEOUT_MS },
      );
      return { kind: "ok", tokens };
    } catch (error) {
      if (isApiError(error) && error.status === 401) return { kind: "unauthorized" };
      // Status 0 means no answer (network error or timeout): the server may have rotated.
      return {
        kind: "unavailable",
        status: isApiError(error) && error.status > 0 ? error.status : undefined,
      };
    }
  },
  async logout(refreshToken: string) {
    await call((signal) => bareApi.POST("/api/auth/logout", { body: { refreshToken }, signal }), {
      timeoutMs: 10_000,
    }).catch(() => undefined);
  },
};

function broadcastChannel(): SessionChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  const channel = new BroadcastChannel("ovation-session");
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const handler = (event: MessageEvent<BroadcastMessage>) => listener(event.data);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
  };
}

const environment: SessionEnvironment = {
  isVisible: () => document.visibilityState === "visible",
  isOnline: () => navigator.onLine,
  onWake(listener) {
    const onVisibility = () => {
      if (document.visibilityState === "visible") listener();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", listener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", listener);
    };
  },
};

let instance: SessionManager | null = null;

/** Inert manager for server rendering: always "loading", never touches browser APIs. */
let serverInstance: SessionManager | null = null;

/** The browser's single session manager. */
export function getSession(): SessionManager {
  if (typeof window === "undefined") {
    serverInstance ??= new SessionManager({ store, transport });
    return serverInstance;
  }
  instance ??= new SessionManager({ store, transport, channel: broadcastChannel(), environment });
  return instance;
}
