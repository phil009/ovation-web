/**
 * Validates the post-login `next` parameter so it can never send someone off-site.
 * Only same-origin relative paths that start with a single "/" are allowed.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (value.length > 2048) return fallback;
  // Must start with exactly one slash: rejects "//evil", "https://", "javascript:", "evil".
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Browsers treat "\" like "/", and control characters can smuggle schemes.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const base = "https://ovation.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") ? fallback : path;
  } catch {
    return fallback;
  }
}

/** Builds /login?next=... for the given path. */
export function loginUrl(currentPath: string): string {
  const next = safeNextPath(currentPath, "");
  return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
