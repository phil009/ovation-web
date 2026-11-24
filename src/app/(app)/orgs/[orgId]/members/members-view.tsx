"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, UserMinus } from "lucide-react";
import { useState } from "react";
import { LinkButton, Main, PageHeading } from "@/components/app/shell";
import { ListSkeleton, QueryError } from "@/components/app/query-state";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/choice";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { keys, membersQuery, type MemberDto } from "@/lib/api/queries";
import { meQueryKey, useSession, type Role } from "@/lib/auth/auth-provider";
import { formatDateTime } from "@/lib/dates";
import { strings } from "@/lib/strings";
import { AdminOnly, OrgName, orgQueryKey, useOrgRole } from "../org-shell";

const ROLES: Role[] = ["ADMIN", "EDITOR", "VIEWER"];
const roleOptions = ROLES.map((value) => ({ value, label: strings.roles[value] }));

export function MembersView() {
  return (
    <AdminOnly title={strings.org.members}>
      <Members />
    </AdminOnly>
  );
}

function Members() {
  const { orgId } = useOrgRole();
  const members = useQuery(membersQuery(orgId));

  return (
    <Main>
      <PageHeading intro={<OrgName />}>{strings.org.members}</PageHeading>
      <p className="mb-4 text-muted">{strings.members.intro}</p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p>{strings.members.inviteHint}</p>
        <LinkButton href={`/orgs/${orgId}/invites`} variant="secondary">
          <Ticket aria-hidden />
          {strings.org.invites}
        </LinkButton>
      </div>
      {members.isPending ? (
        <ListSkeleton />
      ) : members.isError ? (
        <QueryError error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="flex flex-col gap-3">
          {members.data.map((member) => (
            <li key={member.userId}>
              {/* Keyed on the role too, so the picker resets when the role changes elsewhere. */}
              <MemberRow key={member.role} member={member} />
            </li>
          ))}
        </ul>
      )}
    </Main>
  );
}

function MemberRow({ member }: { member: MemberDto }) {
  const { orgId } = useOrgRole();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<Role>(member.role);
  const [error, setError] = useState<string | null>(null);
  const isMe = user?.id === member.userId;
  const selectId = `role-${member.userId}`;

  const explain = (e: unknown) =>
    setError(
      isApiError(e) && e.status === 409
        ? strings.members.lastAdmin
        : isApiError(e)
          ? e.message
          : strings.errors.unexpected,
    );

  // Your own role can change what you may see, so refresh /auth/me and the organisation too.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.members(orgId) }),
      isMe ? queryClient.invalidateQueries({ queryKey: meQueryKey }) : undefined,
      isMe ? queryClient.invalidateQueries({ queryKey: orgQueryKey(orgId) }) : undefined,
    ]);

  const changeRole = useMutation({
    mutationFn: (next: Role) =>
      call((signal) =>
        api.PATCH("/api/orgs/{orgId}/members/{userId}", {
          params: { path: { orgId, userId: member.userId } },
          body: { role: next },
          signal,
        }),
      ),
    onSuccess: async (updated) => {
      setError(null);
      await refresh();
      toast.show({
        message: strings.members.roleChanged(updated.name, strings.roles[updated.role]),
        tone: "success",
      });
    },
    onError: (e) => {
      setRole(member.role);
      explain(e);
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      call((signal) =>
        api.DELETE("/api/orgs/{orgId}/members/{userId}", {
          params: { path: { orgId, userId: member.userId } },
          signal,
        }),
      ),
    onSuccess: async () => {
      setError(null);
      await refresh();
      toast.show({ message: strings.members.removed(member.name), tone: "success" });
    },
    onError: explain,
  });

  const busy = changeRole.isPending || remove.isPending;

  return (
    <div className="ov-border flex flex-col gap-4 rounded-xl border border-divider bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-lg font-semibold wrap-break-word">
          {member.name}
          {isMe ? <span className="font-normal text-muted"> ({strings.members.you})</span> : null}
        </p>
        <p className="break-all text-muted">{member.email}</p>
        <p className="text-sm text-muted">
          {strings.members.joined(formatDateTime(member.joinedAt))}
        </p>
      </div>
      {error ? (
        <Notice tone="error" live="assertive">
          <p>{error}</p>
        </Notice>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (role !== member.role) changeRole.mutate(role);
        }}
      >
        <SelectField
          id={selectId}
          label={strings.members.roleFor(member.name)}
          options={roleOptions}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="min-w-40"
        />
        <Button type="submit" variant="secondary" disabled={busy || role === member.role}>
          {changeRole.isPending ? strings.form.wait : strings.members.saveRole}
        </Button>
        {isMe ? null : (
          <ConfirmDialog
            trigger={
              <Button
                variant="secondary"
                disabled={busy}
                aria-label={strings.members.removeLabel(member.name)}
              >
                <UserMinus aria-hidden />
                {strings.members.remove}
              </Button>
            }
            title={strings.members.removeTitle(member.name)}
            description={strings.members.removeBody}
            confirmLabel={strings.members.remove}
            cancelLabel={strings.org.cancel}
            destructive
            onConfirm={() => remove.mutate()}
          />
        )}
      </form>
    </div>
  );
}
