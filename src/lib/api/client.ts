import type { Middleware } from "openapi-fetch";
import { createOvationClient } from "@/sdk";
import { env } from "@/lib/env";
import { ApiError, type ApiErrorBody, type ApiErrorKind } from "./errors";
import type { SessionManager } from "@/lib/auth/session";

/** Default per-request timeout. The first call after start gets longer (cold start). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const COLD_START_TIMEOUT_MS = 120_000;

/** Public auth endpoints: no token, and a 401 means bad credentials. */
const AUTH_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
];
/** A 401 here means "wrong current password", not an expired token. */
const NO_RETRY_PATHS = [...AUTH_PATHS, "/api/auth/password"];

function isAuthPath(url: string): boolean {
  return AUTH_PATHS.includes(new URL(url).pathname);
}

function noRetry(url: string): boolean {
  return NO_RETRY_PATHS.includes(new URL(url).pathname);
}

let session: SessionManager | null = null;
let onSessionEnded: (() => void) | null = null;

/** Wires the client to the session manager. Called once by the AuthProvider. */
export function connectSession(manager: SessionManager, onEnded: () => void): void {
  session = manager;
  onSessionEnded = onEnded;
}

/** Original requests, kept so a 401 can be retried once with a fresh token. */
const retryClones = new WeakMap<Request, Request>();
const RETRIED = "x-ovation-retried";

const authRetry: Middleware = {
  async onRequest({ request }) {
    if (!session || isAuthPath(request.url)) return request;
    // Refresh up front when the token is known to be stale, to save a round trip.
    if (!session.hasFreshAccessToken(5_000) && session.getSnapshot().status === "authenticated") {
      const token = await session.ensureAccessToken().catch(() => null);
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
    }
    // A body stream can be read once, so keep a copy for a possible retry.
    if (!request.headers.has(RETRIED) && !noRetry(request.url)) {
      retryClones.set(request, request.clone());
    }
    return request;
  },

  async onResponse({ request, response }) {
    if (response.status !== 401 || !session || noRetry(request.url)) return response;
    const original = retryClones.get(request);
    retryClones.delete(request);
    if (!original || request.headers.has(RETRIED)) return response;

    let token: string;
    try {
      token = await session.refresh();
    } catch (error) {
      if ((error as Error).name === "SessionEndedError") onSessionEnded?.();
      return response;
    }
    const retry = new Request(original, { headers: new Headers(original.headers) });
    retry.headers.set("Authorization", `Bearer ${token}`);
    retry.headers.set(RETRIED, "1");
    return fetch(retry);
  },
};

const client = createOvationClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  getAccessToken: () => session?.getAccessToken() ?? null,
});
client.use(authRetry);

/** The typed API client. Feature code imports this, never `fetch`. */
export const api = client;

/** A client with no auth middleware, for the session manager's refresh and logout calls. */
export const bareApi = createOvationClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  getAccessToken: () => null,
});

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

let firstCall = true;

/** Timeout signal for a request: patient for the first call (the server may be waking up). */
export function requestSignal(timeoutMs?: number): AbortSignal {
  const ms = timeoutMs ?? (firstCall ? COLD_START_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  firstCall = false;
  return AbortSignal.timeout(ms);
}

/**
 * Runs an SDK call and returns its data, or throws a typed ApiError.
 *
 *   const me = await call((signal) => api.GET("/api/auth/me", { signal }));
 */
export async function call<T>(
  run: (signal: AbortSignal) => Promise<FetchResult<T>>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await run(requestSignal(options.timeoutMs));
  } catch (error) {
    const kind: ApiErrorKind =
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : "network";
    throw new ApiError(0, null, kind);
  }
  if (result.response.ok) return result.data as T;
  throw new ApiError(result.response.status, result.error as ApiErrorBody | undefined);
}
