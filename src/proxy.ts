import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce per request. Next reads the nonce from the
 * request's CSP header and applies it to its own scripts and inline styles.
 * Because of the nonce every page renders dynamically (see docs/DECISIONS.md).
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === "development";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const apiOrigin = apiUrl ? new URL(apiUrl).origin : "";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets the nonced Next runtime load its chunks. 'unsafe-eval' is
    // development only (React uses eval for error stacks there).
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Production: only nonced <style> elements and same-origin stylesheets, no inline styles.
    "style-src": ["'self'", isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    "connect-src": ["'self'", apiOrigin, ...(isDev ? ["ws:", "wss:"] : [])].filter(Boolean),
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  let csp = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  if (!isDev && apiOrigin.startsWith("https:")) csp += "; upgrade-insecure-requests";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: skip static files, the service worker route, and metadata files.
      source:
        "/((?!_next/static|_next/image|serwist|favicon.ico|icons/|manifest.webmanifest|apple-icon|icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
