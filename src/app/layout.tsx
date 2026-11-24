import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/app/providers";
import { strings } from "@/lib/strings";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "@/styles/globals.css";

// Self-hosted by next/font at build time: no requests to Google at runtime, works offline.
// "vietnamese" carries the dotted vowels Igbo names need (ị ọ ụ, U+1Exx); "latin-ext" has ṅ and ₦.
const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: { template: `%s · ${strings.app.name}`, default: strings.app.name },
  description: strings.app.tagline,
  applicationName: strings.app.name,
  appleWebApp: { capable: true, title: strings.app.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never restrict zoom.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2E2A72" },
    { media: "(prefers-color-scheme: dark)", color: "#12121C" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading cookies makes every page dynamic, which the per-request CSP nonce needs anyway.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={`${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:inline-flex focus:min-h-12 focus:items-center focus:rounded-lg focus:bg-surface focus:px-4 focus:font-semibold focus:text-primary"
        >
          {strings.app.skipToContent}
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
