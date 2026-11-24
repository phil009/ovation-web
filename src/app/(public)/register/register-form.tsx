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
import { PasswordField } from "@/components/ui/password-field";
import { useAuthActions } from "@/lib/auth/auth-provider";
import { safeNextPath } from "@/lib/auth/redirect";
import { strings } from "@/lib/strings";
import { registerSchema, type RegisterValues } from "@/lib/validation";

const ids = { name: "register-name", email: "register-email", password: "register-password" };

export function RegisterForm() {
  const search = useSearchParams();
  const next = safeNextPath(search.get("next"));
  const router = useRouter();
  const { register: registerAccount } = useAuthActions();
  useRedirectWhenSignedIn(next);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await registerAccount(values.name, values.email, values.password);
      router.replace(next);
    } catch (error) {
      fail(error, { 409: strings.register.emailTaken });
    }
  }, onInvalid);

  const loginHref = next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <>
      <PageHeading intro={strings.register.intro}>{strings.register.title}</PageHeading>
      <div className="flex flex-col gap-6">
        <ColdStartStatus />
        <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          <TextField
            id={ids.name}
            label={strings.register.name}
            hint={strings.register.nameHint}
            autoComplete="name"
            required
            error={errors.name?.message}
            {...form.register("name")}
          />
          <TextField
            id={ids.email}
            label={strings.register.email}
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
            label={strings.register.password}
            hint={strings.register.passwordHint}
            autoComplete="new-password"
            required
            error={errors.password?.message}
            {...form.register("password")}
          />
          <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
            {isSubmitting ? strings.register.submitting : strings.register.submit}
          </Button>
        </form>

        <p>
          {strings.register.haveAccount}{" "}
          <Link
            href={loginHref}
            className="inline-block py-3 font-semibold text-primary underline underline-offset-4"
          >
            {strings.register.login}
          </Link>
        </p>
      </div>
    </>
  );
}
