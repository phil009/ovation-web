"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Main, PageHeading } from "@/components/app/shell";
import { ListSkeleton, QueryError, ScrollRegion } from "@/components/app/query-state";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/choice";
import { Card } from "@/components/ui/misc";
import {
  AUDIT_PAGE_SIZE,
  auditQuery,
  membersQuery,
  type AuditEntity,
  type AuditEntry,
  type AuditFilters,
} from "@/lib/api/queries";
import { changedFields } from "@/lib/audit";
import { formatDateTime } from "@/lib/dates";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { AdminOnly, OrgName, useOrgRole } from "../org-shell";

const ENTITIES = Object.keys(strings.audit.entities) as AuditEntity[];

export function AuditView() {
  return (
    <AdminOnly title={strings.org.audit}>
      <Audit />
    </AdminOnly>
  );
}

function Audit() {
  const { orgId } = useOrgRole();
  const [filters, setFilters] = useState<AuditFilters>({ offset: 0 });
  // The form edits a draft; "Show" applies it, so the list doesn't reload on every change.
  const [draft, setDraft] = useState<{ entity: string; userId: string }>({
    entity: "",
    userId: "",
  });
  const audit = useQuery({ ...auditQuery(orgId, filters), placeholderData: keepPreviousData });
  const members = useQuery(membersQuery(orgId));

  const entityOptions = [
    { value: "", label: strings.audit.any },
    ...ENTITIES.map((value) => ({ value, label: strings.audit.entities[value] })),
  ];
  const userOptions = [
    { value: "", label: strings.audit.anyone },
    ...(members.data ?? []).map((m) => ({ value: m.userId, label: m.name })),
  ];

  const total = audit.data?.total ?? 0;
  const from = total === 0 ? 0 : filters.offset + 1;
  const to = Math.min(filters.offset + AUDIT_PAGE_SIZE, total);

  return (
    <Main>
      <PageHeading intro={<OrgName />}>{strings.org.audit}</PageHeading>
      <p className="mb-6 text-muted">{strings.audit.intro}</p>

      <form
        aria-label={strings.audit.filters}
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({
            entity: (draft.entity || undefined) as AuditEntity | undefined,
            userId: draft.userId || undefined,
            offset: 0,
          });
        }}
      >
        <SelectField
          id="audit-entity"
          label={strings.audit.entity}
          options={entityOptions}
          value={draft.entity}
          onChange={(e) => setDraft((d) => ({ ...d, entity: e.target.value }))}
          className="min-w-48"
        />
        <SelectField
          id="audit-user"
          label={strings.audit.user}
          options={userOptions}
          value={draft.userId}
          onChange={(e) => setDraft((d) => ({ ...d, userId: e.target.value }))}
          className="min-w-48"
        />
        <Button type="submit" variant="secondary">
          {strings.audit.apply}
        </Button>
      </form>

      {audit.isPending ? (
        <ListSkeleton />
      ) : audit.isError ? (
        <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.data.items.length === 0 ? (
        <Card>
          <p>{strings.audit.empty}</p>
        </Card>
      ) : (
        <div aria-busy={audit.isFetching || undefined} className="flex flex-col gap-4">
          <p aria-live="polite" className="text-muted">
            {strings.audit.showing(from, to, total)}
          </p>
          <AuditTable items={audit.data.items} />
          <nav aria-label={strings.audit.caption} className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={filters.offset === 0 || audit.isFetching}
              onClick={() =>
                setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - AUDIT_PAGE_SIZE) }))
              }
            >
              <ChevronLeft aria-hidden />
              {strings.audit.previous}
            </Button>
            <Button
              variant="secondary"
              disabled={to >= total || audit.isFetching}
              onClick={() => setFilters((f) => ({ ...f, offset: f.offset + AUDIT_PAGE_SIZE }))}
            >
              {strings.audit.next}
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        </div>
      )}
    </Main>
  );
}

const cell = "border-b border-divider px-3 py-3 align-top";

function AuditTable({ items }: { items: AuditEntry[] }) {
  return (
    <ScrollRegion labelledBy="audit-caption">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption id="audit-caption" className="sr-only">
          {strings.audit.caption}
        </caption>
        <thead>
          <tr className="text-sm text-muted">
            <th scope="col" className={cell}>
              {strings.audit.colWhen}
            </th>
            <th scope="col" className={cell}>
              {strings.audit.colWho}
            </th>
            <th scope="col" className={cell}>
              {strings.audit.colWhat}
            </th>
            <th scope="col" className={cell}>
              {strings.audit.colChanges}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const changes = changedFields(entry.before, entry.after);
  const action = strings.audit.actions[entry.action] ?? entry.action;
  return (
    <tr>
      <td className={cn(cell, "whitespace-nowrap tabular")}>{formatDateTime(entry.createdAt)}</td>
      <td className={cell}>
        <span className="font-semibold">{entry.user.name}</span>
        <span className="block text-sm break-all text-muted">{entry.user.email}</span>
      </td>
      <td className={cell}>
        {action} · {strings.audit.entities[entry.entity]}
      </td>
      <td className={cell}>
        {changes.length === 0 ? (
          <span className="text-muted">{strings.audit.noFieldChanges}</span>
        ) : (
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-primary">
              {strings.audit.details} ({changes.length})
            </summary>
            <dl className="mt-2 flex flex-col gap-2 text-sm">
              {changes.map((c) => (
                <div key={c.field}>
                  <dt className="font-mono font-semibold">{c.field}</dt>
                  <dd className="break-all">
                    <span className="sr-only">{strings.audit.before}: </span>
                    <span className="text-muted line-through">{c.before}</span>
                    <span aria-hidden> → </span>
                    <span className="sr-only">, {strings.audit.after}: </span>
                    <span>{c.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </td>
    </tr>
  );
}
