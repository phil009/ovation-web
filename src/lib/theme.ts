/**
 * Theme preference. Stored in a plain, non-sensitive cookie so the server renders the right
 * `data-theme` on <html> and there is no flash and no inline script (which the CSP would block).
 */
export const THEME_COOKIE = "ovation-theme";
export type ThemePreference = "system" | "light" | "dark";

export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function currentTheme(): ThemePreference {
  return parseTheme(document.documentElement.dataset.theme);
}
