"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  Download,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toaster";
import { useInstall, IosInstallHint } from "@/components/pwa/pwa";
import { useAuthActions, useSession } from "@/lib/auth/auth-provider";
import { strings } from "@/lib/strings";
import { applyTheme, currentTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { OfflineBanner } from "./offline-banner";
import { SessionExpiryWarning } from "./session-expiry";

/** The brand lockup: colour on light themes, reversed (cream) on dark. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-12 items-center rounded-lg px-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
      <img
        src="/icons/ovation-lockup-color.svg"
        alt={strings.app.name}
        width={148}
        height={36}
        className="h-9 w-auto dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/ovation-lockup-reversed.svg"
        alt={strings.app.name}
        width={148}
        height={36}
        className="hidden h-9 w-auto dark:block"
      />
    </Link>
  );
}

function OrgSwitcher() {
  const { memberships } = useSession();
  const params = useParams<{ orgId?: string }>();
  const router = useRouter();
  const current = memberships?.find((m) => m.organization.id === params.orgId);

  if (!memberships || memberships.length === 0) return null;

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" className="max-w-full min-w-0 justify-between">
          <Building2 aria-hidden />
          <span className="sr-only">{strings.orgs.switcher}: </span>
          <span className="truncate">{current?.organization.name ?? strings.orgs.allOrgs}</span>
          <ChevronDown aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent align="start" className="max-w-[min(24rem,calc(100vw-1rem))]">
        <MenuLabel>{strings.orgs.switcher}</MenuLabel>
        {memberships.map((m) => {
          const isCurrent = m.organization.id === params.orgId;
          return (
            <MenuItem
              key={m.organization.id}
              onSelect={() => router.push(`/orgs/${m.organization.id}`)}
            >
              {isCurrent ? <Check aria-hidden /> : <span aria-hidden className="size-5" />}
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{m.organization.name}</span>
                <span className="text-sm font-normal text-muted">
                  {strings.roles[m.role]}
                  {isCurrent ? <span className="sr-only">, {strings.orgs.current}</span> : null}
                </span>
              </span>
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/orgs")}>{strings.orgs.allOrgs}</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function UserMenu() {
  const { user } = useSession();
  const { logout } = useAuthActions();
  const { canPrompt, install } = useInstall();
  const router = useRouter();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePreference>(() =>
    typeof document === "undefined" ? "system" : currentTheme(),
  );

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={strings.header.menu}>
          <UserRound aria-hidden />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {user ? (
          <MenuLabel className="pb-1">
            <span className="block font-semibold text-text">{user.name}</span>
            <span className="block break-all">{user.email}</span>
          </MenuLabel>
        ) : null}
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/settings")}>
          <Settings aria-hidden />
          {strings.header.settings}
        </MenuItem>
        {canPrompt ? (
          <MenuItem onSelect={() => void install()}>
            <Download aria-hidden />
            {strings.header.install}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuLabel>{strings.theme.toggle}</MenuLabel>
        <MenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const next = value as ThemePreference;
            applyTheme(next);
            setTheme(next);
          }}
        >
          <MenuRadioItem value="system">{strings.settings.themeSystem}</MenuRadioItem>
          <MenuRadioItem value="light">{strings.settings.themeLight}</MenuRadioItem>
          <MenuRadioItem value="dark">{strings.settings.themeDark}</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await logout();
            toast.show({ message: strings.login.signedOut, tone: "success" });
            router.replace("/login");
          }}
        >
          <LogOut aria-hidden />
          {strings.header.logout}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Header for signed-in pages. */
export function AppHeader() {
  return (
    <header className="ov-border border-b border-divider bg-surface">
      <IosInstallHint />
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Wordmark />
        <div className="flex min-w-0 flex-1 justify-start">
          <OrgSwitcher />
        </div>
        <UserMenu />
      </div>
      <OfflineBanner />
      <SessionExpiryWarning />
    </header>
  );
}

/** Header for public pages (sign in, register, join, offline). */
export function PublicHeader() {
  return (
    <header className="ov-border border-b border-divider bg-surface">
      <div className="mx-auto flex max-w-5xl items-center px-4 py-2">
        <Wordmark />
      </div>
      <OfflineBanner />
    </header>
  );
}

export function Main({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn("mx-auto w-full px-4 py-8 outline-none", narrow ? "max-w-lg" : "max-w-5xl")}
    >
      {children}
    </main>
  );
}

export function PageHeading({ children, intro }: { children: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 tabIndex={-1} className="text-3xl font-semibold sm:text-4xl">
        {children}
      </h1>
      {intro ? <p className="text-lg text-muted">{intro}</p> : null}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "link";
  className?: string;
}) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant }), className)}>
      {children}
    </Link>
  );
}

/** "← All events" style link back up the hierarchy. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex min-h-12 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
    >
      <ArrowLeft aria-hidden className="size-5" />
      {children}
    </Link>
  );
}
