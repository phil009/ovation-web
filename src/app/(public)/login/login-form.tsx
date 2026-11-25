"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { ColdStartStatus } from "@/components/app/cold-start";
import { PageHeading } from "@/components/app/shell";
import { useRedirectWhenSignedIn } from "@/components/app/route-guard";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { useLiveQuery } from "@/lib/offline/live";
import { allUnsentCount } from "@/lib/offline/outbox";
import { PasswordField } from "@/components/ui/password-field";
import { useAuthActions, useSession } from "@/lib/auth/auth-provider";
import { safeNextPath } from "@/lib/auth/redirect";
import { strings } from "@/lib/strings";
import { loginSchema, type LoginValues } from "@/lib/validation";

const ids = { email: "login-email", password: "login-password" };

export function LoginForm() {
  const search = useSearchParams();
  const next = safeNextPath(search.get("next"));
  const router = useRouter();
  const { login } = useAuthActions();
  const { endedReason } = useSession();
  useRedirectWhenSignedIn(next);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values.email, values.password);
      router.replace(next);
    } catch (error) {
      // Same message for unknown email and wrong password.
      fail(error, { 401: strings.login.failed });
    }
  }, onInvalid);

  const registerHref = next !== "/" ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <>
      <PageHeading intro={strings.login.intro}>{strings.login.title}</PageHeading>
      <div className="flex flex-col gap-6">
        <ColdStartStatus />
        {endedReason === "expired" ? (
          <Notice tone="warning">{strings.login.sessionExpired}</Notice>
        ) : null}
        <UnsentNotice />
        <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          <TextField
            id={ids.email}
            label={strings.login.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            error={errors.email?.message}
            {...form.register("email")}
          />
          <PasswordField
            id={ids.password}
            label={strings.login.password}
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...form.register("password")}
          />
          <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
            {isSubmitting ? strings.login.submitting : strings.login.submit}
          </Button>
        </form>

        <p className="text-muted">{strings.login.recoveryUnavailable}</p>
        <p>
          {strings.login.noAccount}{" "}
          <Link
            href={registerHref}
            className="inline-block py-3 font-semibold text-primary underline underline-offset-4"
          >
            {strings.login.register}
          </Link>
        </p>
      </div>
    </>
  );
}

/** Donations from an earlier session still on this phone: they go once the same account signs in. */
function UnsentNotice() {
  const count = useLiveQuery(allUnsentCount, "unsent:all");
  if (!count) return null;
  return <Notice tone="warning">{strings.login.unsent(count)}</Notice>;
}
