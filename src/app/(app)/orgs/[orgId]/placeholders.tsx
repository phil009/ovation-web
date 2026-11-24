"use client";

import { Main, PageHeading } from "@/components/app/shell";
import { Notice } from "@/components/ui/misc";
import { strings } from "@/lib/strings";
import { AdminOnly, OrgName } from "./org-shell";

export function EventsPlaceholder() {
  return (
    <Main>
      <PageHeading intro={<OrgName />}>{strings.org.events}</PageHeading>
      <Notice>{strings.org.eventsPlaceholder}</Notice>
    </Main>
  );
}

export function EventPlaceholder() {
  return (
    <Main>
      <PageHeading>{strings.org.event}</PageHeading>
      <Notice>{strings.org.eventPlaceholder}</Notice>
    </Main>
  );
}

export function AdminPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <AdminOnly title={title}>
      <Main>
        <PageHeading intro={<OrgName />}>{title}</PageHeading>
        <Notice>{body}</Notice>
      </Main>
    </AdminOnly>
  );
}
