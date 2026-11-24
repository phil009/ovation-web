"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ColdStartStatus } from "@/components/app/cold-start";
import { LinkButton, PageHeading } from "@/components/app/shell";
import { PageSkeleton } from "@/components/app/route-guard";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { meQueryKey, useSession } from "@/lib/auth/auth-provider";
import { strings } from "@/lib/strings";
import { joinSchema, type JoinValues } from "@/lib/validation";
import type { components } from "@/sdk";

type Preview = components["schemas"]["InvitePreviewDto"];

/** Kept in sessionStorage (this tab only) while the person signs in or registers. */
const PENDING_CODE_KEY = "ovation-join-code";
const ids = { code: "join-code" };

export function JoinFlow() {
  const { status } = useSession();
  const search = useSearchParams();
  const [initialCode, setInitialCode] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = search.get("code")?.trim().slice(0, 40);
    if (fromUrl) sessionStorage.setItem(PENDING_CODE_KEY, fromUrl);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser-only storage once
    setInitialCode(fromUrl || sessionStorage.getItem(PENDING_CODE_KEY) || "");
  }, [search]);

  if (status === "loading" || initialCode === null) return <PageSkeleton />;

  return (
    <>
      <PageHeading intro={strings.join.intro}>{strings.join.title}</PageHeading>
      <div className="flex flex-col gap-6">
        <ColdStartStatus />
        {status === "anonymous" ? (
          <SignInFirst code={initialCode} />
        ) : (
          <CodeStep initialCode={initialCode} />
        )}
      </div>
    </>
  );
}

function SignInFirst({ code }: { code: string }) {
  const next = encodeURIComponent("/join");
  return (
    <>
      {code ? (
        <p>
          {strings.join.code}: <strong className="tabular">{code}</strong>
        </p>
      ) : null}
      <Notice>{strings.join.signInFirst}</Notice>
      <div className="flex flex-wrap gap-3">
        <LinkButton href={`/login?next=${next}`}>{strings.login.submit}</LinkButton>
        <LinkButton href={`/register?next=${next}`} variant="secondary">
          {strings.login.register}
        </LinkButton>
      </div>
    </>
  );
}

function CodeStep({ initialCode }: { initialCode: string }) {
  const [preview, setPreview] = useState<{ code: string; data: Preview } | null>(null);
  const form = useForm<JoinValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: { code: initialCode },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ code }) => {
    try {
      const data = await call((signal) =>
        api.POST("/api/invites/preview", { body: { code }, signal }),
      );
      sessionStorage.setItem(PENDING_CODE_KEY, code);
      setPreview({ code, data });
    } catch (error) {
      fail(error, { 404: strings.join.notFound, 410: strings.errors.gone });
    }
  }, onInvalid);

  if (preview) {
    return (
      <ConfirmStep code={preview.code} preview={preview.data} onBack={() => setPreview(null)} />
    );
  }

  return (
    <>
      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <TextField
          id={ids.code}
          label={strings.join.code}
          hint={strings.join.codeHint}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="tracking-wider uppercase tabular"
          error={errors.code?.message}
          {...form.register("code")}
        />
        <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
          {isSubmitting ? strings.join.checking : strings.join.check}
        </Button>
      </form>
    </>
  );
}

function ConfirmStep({
  code,
  preview,
  onBack,
}: {
  code: string;
  preview: Preview;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const org = preview.organization;
  const role = strings.roles[preview.role];

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const result = await call((signal) =>
        api.POST("/api/invites/accept", { body: { code }, signal }),
      );
      sessionStorage.removeItem(PENDING_CODE_KEY);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      toast.show({ message: strings.join.joined(result.organization.name), tone: "success" });
      router.push(`/orgs/${result.organization.id}`);
    } catch (e) {
      setPending(false);
      if (isApiError(e) && e.status === 409) setError(strings.join.conflict);
      else if (isApiError(e) && e.status === 404) setError(strings.join.notFound);
      else setError(isApiError(e) ? e.message : strings.errors.unexpected);
    }
  }

  if (preview.alreadyMember) {
    return (
      <Card className="flex flex-col gap-4">
        <p className="text-lg">{strings.join.alreadyMember(org.name)}</p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/orgs/${org.id}`}>{strings.join.openOrg}</LinkButton>
          <Button variant="secondary" onClick={onBack}>
            {strings.join.different}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{strings.join.preview(org.name, role)}</h2>
      <p className="text-muted">{strings.roleCan[preview.role]}</p>
      {error ? (
        <Notice tone="error" live="assertive">
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={accept} disabled={pending}>
          {pending ? strings.join.accepting : strings.join.accept}
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={pending}>
          {strings.join.different}
        </Button>
      </div>
    </Card>
  );
}
