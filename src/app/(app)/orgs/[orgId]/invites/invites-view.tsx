"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Main, PageHeading } from "@/components/app/shell";
import { ListSkeleton, QueryError, Section } from "@/components/app/query-state";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { RadioFieldset } from "@/components/ui/choice";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/error-summary";
import { TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { invitesQuery, keys, type InviteDto } from "@/lib/api/queries";
import { formatDateTime } from "@/lib/dates";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { INVITE_ROLES, inviteBody, inviteSchema, type InviteValues } from "@/lib/validation";
import { AdminOnly, OrgName, useOrg, useOrgRole } from "../org-shell";

export function InvitesView() {
  return (
    <AdminOnly title={strings.org.invites}>
      <Invites />
    </AdminOnly>
  );
}

function Invites() {
  const { orgId } = useOrgRole();
  const invites = useQuery(invitesQuery(orgId));
  const [created, setCreated] = useState<InviteDto | null>(null);

  return (
    <Main>
      <PageHeading intro={<OrgName />}>{strings.org.invites}</PageHeading>
      <p className="text-muted">{strings.invites.intro}</p>

      {created ? <NewCode invite={created} /> : null}

      <Section id="create-invite-heading" title={strings.invites.create}>
        <CreateInvite onCreated={setCreated} />
      </Section>

      <Section id="invite-list-heading" title={strings.invites.list}>
        {invites.isPending ? (
          <ListSkeleton />
        ) : invites.isError ? (
          <QueryError error={invites.error} onRetry={() => void invites.refetch()} />
        ) : invites.data.length === 0 ? (
          <Card>
            <p>{strings.invites.empty}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {invites.data.map((invite) => (
              <li key={invite.id}>
                <InviteRow invite={invite} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Main>
  );
}

const roleOptions = INVITE_ROLES.map((value) => ({
  value,
  label: strings.roles[value],
  description: strings.roleCan[value],
}));

const ids = { role: "invite-role", maxUses: "invite-max-uses", expiresInDays: "invite-expires" };

function CreateInvite({ onCreated }: { onCreated: (invite: InviteDto) => void }) {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "EDITOR", maxUses: "", expiresInDays: "7" },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, reset, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const invite = await call((signal) =>
        api.POST("/api/orgs/{orgId}/invites", {
          params: { path: { orgId } },
          body: inviteBody(values),
          signal,
        }),
      );
      reset();
      await queryClient.invalidateQueries({ queryKey: keys.invites(orgId) });
      onCreated(invite);
    } catch (error) {
      fail(error);
    }
  }, onInvalid);

  return (
    <div className="flex flex-col gap-6">
      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      <form noValidate onSubmit={onSubmit} className="flex max-w-lg flex-col gap-5">
        <RadioFieldset
          id={ids.role}
          legend={strings.invites.role}
          options={roleOptions}
          required
          error={errors.role?.message}
          {...form.register("role")}
        />
        <TextField
          id={ids.maxUses}
          label={strings.invites.maxUses}
          hint={strings.invites.maxUsesHint}
          inputMode="numeric"
          autoComplete="off"
          className="max-w-40"
          error={errors.maxUses?.message}
          {...form.register("maxUses")}
        />
        <TextField
          id={ids.expiresInDays}
          label={strings.invites.expires}
          hint={strings.invites.expiresHint}
          inputMode="numeric"
          autoComplete="off"
          className="max-w-40"
          required
          error={errors.expiresInDays?.message}
          {...form.register("expiresInDays")}
        />
        <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
          {isSubmitting ? strings.invites.submitting : strings.invites.submit}
        </Button>
      </form>
    </div>
  );
}

/** The new code, large, with copy and WhatsApp share. Focus moves here once it appears. */
function NewCode({ invite }: { invite: InviteDto }) {
  const { orgId } = useOrgRole();
  const org = useOrg(orgId);
  const toast = useToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const role = strings.roles[invite.role];
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    heading.current?.focus();
    // window is only read in the browser, after the code exists.
    const joinUrl = `${window.location.origin}/join?code=${encodeURIComponent(invite.code)}`;
    const text = strings.invites.shareText(org.data?.name ?? "", role, invite.code, joinUrl);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- needs window.location
    setShareUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }, [invite.code, org.data?.name, role]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.code);
      toast.show({ message: strings.invites.copied, tone: "success" });
    } catch {
      toast.show({ message: strings.invites.copyFailed, tone: "error" });
    }
  };

  return (
    <section
      aria-labelledby="new-code-heading"
      className="ov-border mt-8 flex flex-col gap-4 rounded-xl border-2 border-primary bg-surface p-5"
    >
      <h2 id="new-code-heading" ref={heading} tabIndex={-1} className="text-2xl font-semibold">
        {strings.invites.newCode}
      </h2>
      <p className="font-mono text-3xl font-bold tracking-wider break-all select-all sm:text-4xl">
        {invite.code}
      </p>
      <p>{strings.invites.newCodeFor(role)}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void copy()}>
          <Copy aria-hidden />
          {strings.invites.copy}
        </Button>
        {shareUrl ? (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary" })}
          >
            <Share2 aria-hidden />
            {strings.invites.share}
            <span className="sr-only"> {strings.invites.shareNewTab}</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}

function InviteRow({ invite }: { invite: InviteDto }) {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const active = invite.status === "ACTIVE";

  const revoke = useMutation({
    mutationFn: () =>
      call((signal) =>
        api.DELETE("/api/orgs/{orgId}/invites/{inviteId}", {
          params: { path: { orgId, inviteId: invite.id } },
          signal,
        }),
      ),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: keys.invites(orgId) });
      toast.show({ message: strings.invites.revoked(invite.code), tone: "success" });
    },
    onError: (e) => setError(isApiError(e) ? e.message : strings.errors.unexpected),
  });

  return (
    <div
      className={cn(
        "ov-border flex flex-col gap-3 rounded-xl border border-divider bg-surface p-4",
        !active && "opacity-90",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-xl font-semibold tracking-wide break-all">{invite.code}</p>
        <InviteStatus status={invite.status} />
      </div>
      <p>{strings.roles[invite.role]}</p>
      <p className="text-sm text-muted">
        {strings.invites.uses(invite.uses, invite.maxUses)}
        {" · "}
        {invite.expiresAt
          ? strings.invites.expiresAt(formatDateTime(invite.expiresAt))
          : strings.invites.noExpiry}
      </p>
      {error ? (
        <Notice tone="error" live="assertive">
          <p>{error}</p>
        </Notice>
      ) : null}
      {active ? (
        <ConfirmDialog
          trigger={
            <Button
              variant="secondary"
              className="self-start"
              disabled={revoke.isPending}
              aria-label={strings.invites.revokeLabel(invite.code)}
            >
              <Ban aria-hidden />
              {strings.invites.revoke}
            </Button>
          }
          title={strings.invites.revokeTitle(invite.code)}
          description={strings.invites.revokeBody}
          confirmLabel={strings.invites.revoke}
          cancelLabel={strings.org.cancel}
          destructive
          onConfirm={() => revoke.mutate()}
        />
      ) : null}
    </div>
  );
}

/** Text plus a border style, never colour alone. */
function InviteStatus({ status }: { status: InviteDto["status"] }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={cn(
        "ov-border inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-sm font-semibold",
        active ? "border-success text-success" : "border-dashed border-border text-muted",
      )}
    >
      {strings.invites.status[status]}
    </span>
  );
}
