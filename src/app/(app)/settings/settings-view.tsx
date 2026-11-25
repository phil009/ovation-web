"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, LogOut, MonitorSmartphone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { PageHeading } from "@/components/app/shell";
import { SignOutWarning } from "@/components/app/sign-out-guard";
import { useUnsent } from "@/components/app/sync-provider";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { useInstall } from "@/components/pwa/pwa";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/error-summary";
import { useAnnounce } from "@/components/ui/live-region";
import { Notice } from "@/components/ui/misc";
import { PasswordField } from "@/components/ui/password-field";
import { useToast } from "@/components/ui/toaster";
import { isApiError } from "@/lib/api/errors";
import { useAuthActions, useSession } from "@/lib/auth/auth-provider";
import { strings } from "@/lib/strings";
import { applyTheme, currentTheme, type ThemePreference } from "@/lib/theme";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validation";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="ov-border flex flex-col gap-4 rounded-xl border border-divider bg-surface p-5"
    >
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SettingsView() {
  const { user } = useSession();
  return (
    <>
      <PageHeading intro={user ? strings.settings.signedInAs(user.name, user.email) : undefined}>
        {strings.settings.title}
      </PageHeading>
      <div className="flex flex-col gap-6">
        <ChangePassword />
        <Appearance />
        <Install />
        <Sessions />
      </div>
    </>
  );
}

const ids = { currentPassword: "current-password", newPassword: "new-password" };

function ChangePassword() {
  const { changePassword } = useAuthActions();
  const announce = useAnnounce();
  const [done, setDone] = useState(false);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setDone(false);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      form.reset();
      setDone(true);
      announce(strings.settings.passwordChanged, { debounceMs: 0 });
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        form.setError("currentPassword", {
          type: "server",
          message: strings.settings.wrongPassword,
        });
        onInvalid();
        return;
      }
      fail(error);
    }
  }, onInvalid);

  return (
    <Section id="password-heading" title={strings.settings.changePassword}>
      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      {done ? <Notice tone="success">{strings.settings.passwordChanged}</Notice> : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <PasswordField
          id={ids.currentPassword}
          label={strings.settings.currentPassword}
          autoComplete="current-password"
          required
          error={errors.currentPassword?.message}
          {...form.register("currentPassword")}
        />
        <PasswordField
          id={ids.newPassword}
          label={strings.settings.newPassword}
          hint={strings.settings.newPasswordHint}
          autoComplete="new-password"
          required
          error={errors.newPassword?.message}
          {...form.register("newPassword")}
        />
        <Button type="submit" disabled={isSubmitting || coolingDown} className="self-start">
          {isSubmitting ? strings.settings.savingPassword : strings.settings.savePassword}
        </Button>
      </form>
      <p className="text-sm text-muted">{strings.settings.recoveryNote}</p>
    </Section>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<ThemePreference>("system");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the DOM after hydration
    setTheme(currentTheme());
  }, []);

  const options: [ThemePreference, string][] = [
    ["system", strings.settings.themeSystem],
    ["light", strings.settings.themeLight],
    ["dark", strings.settings.themeDark],
  ];

  return (
    <Section id="appearance-heading" title={strings.settings.appearance}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{strings.settings.theme}</legend>
        {options.map(([value, label]) => (
          <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => {
                applyTheme(value);
                setTheme(value);
              }}
              className="size-5 accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
    </Section>
  );
}

function Install() {
  const { canPrompt, installed, install } = useInstall();
  return (
    <Section id="install-heading" title={strings.settings.installTitle}>
      <p>{installed ? strings.settings.installed : strings.settings.installHint}</p>
      {installed ? null : canPrompt ? (
        <Button onClick={() => void install()} className="self-start">
          <Download aria-hidden />
          {strings.settings.install}
        </Button>
      ) : (
        <p className="text-sm text-muted">{strings.settings.installUnavailable}</p>
      )}
    </Section>
  );
}

function Sessions() {
  const { logout, logoutAll } = useAuthActions();
  const { user } = useSession();
  const unsent = useUnsent(user?.id);
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which sign-out waits for the unsent-donations warning. The header menu sends people here
  // with ?signout=1 when donations are still on the phone.
  const [confirming, setConfirming] = useState<"logout" | "logoutAll" | null>(() =>
    search.get("signout") === "1" ? "logout" : null,
  );

  /** Signs out, unless donations are unsent: then the warning comes first. */
  function request(kind: "logout" | "logoutAll") {
    if (unsent && unsent.length > 0) setConfirming(kind);
    else void run(kind === "logout" ? logout : logoutAll);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
      toast.show({ message: strings.login.signedOut, tone: "success" });
      router.replace("/login");
    } catch (e) {
      setPending(false);
      setError(isApiError(e) ? e.message : strings.errors.unexpected);
    }
  }

  return (
    <Section id="sessions-heading" title={strings.settings.sessions}>
      {error ? (
        <Notice tone="error" live="assertive">
          {error}
        </Notice>
      ) : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => request("logout")}
        className="self-start"
      >
        <LogOut aria-hidden />
        {pending ? strings.settings.loggingOut : strings.settings.logout}
      </Button>
      <p className="text-muted">{strings.settings.logoutAllHint}</p>
      <ConfirmDialog
        trigger={
          <Button variant="danger" disabled={pending} className="self-start">
            <MonitorSmartphone aria-hidden />
            {strings.settings.logoutAll}
          </Button>
        }
        title={strings.settings.logoutAllConfirmTitle}
        description={strings.settings.logoutAllConfirmBody}
        confirmLabel={strings.settings.logoutAllConfirm}
        cancelLabel={strings.settings.cancel}
        destructive
        onConfirm={() => request("logoutAll")}
      />
      {confirming && unsent && unsent.length > 0 ? (
        <SignOutWarning
          entries={unsent}
          pending={pending}
          onConfirm={() => void run(confirming === "logout" ? logout : logoutAll)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </Section>
  );
}
