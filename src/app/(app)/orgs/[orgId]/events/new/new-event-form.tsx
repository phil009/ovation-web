"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { BackLink, PageHeading } from "@/components/app/shell";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { keys } from "@/lib/api/queries";
import { roleAtLeast } from "@/lib/auth/auth-provider";
import { todayLocal } from "@/lib/dates";
import { strings } from "@/lib/strings";
import { eventSchema, type EventValues } from "@/lib/validation";
import { useOrgRole } from "../../org-shell";

const ids = { name: "event-name", date: "event-date" };

export function NewEventForm() {
  const { orgId, role } = useOrgRole();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [today] = useState(todayLocal);
  const form = useForm<EventValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: { name: "", date: today },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, date }) => {
    try {
      const event = await call((signal) =>
        api.POST("/api/orgs/{orgId}/events", {
          params: { path: { orgId } },
          body: { name: name.trim(), date },
          signal,
        }),
      );
      queryClient.setQueryData(keys.event(orgId, event.id), event);
      await queryClient.invalidateQueries({ queryKey: keys.events(orgId) });
      toast.show({ message: strings.events.created(event.name), tone: "success" });
      router.push(`/orgs/${orgId}/events/${event.id}`);
    } catch (error) {
      fail(error);
    }
  }, onInvalid);

  const back = <BackLink href={`/orgs/${orgId}`}>{strings.events.back}</BackLink>;

  if (role && !roleAtLeast(role, "EDITOR")) {
    return (
      <>
        {back}
        <PageHeading>{strings.events.newTitle}</PageHeading>
        <Notice>{strings.errors.forbidden}</Notice>
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeading intro={strings.events.newIntro}>{strings.events.newTitle}</PageHeading>
      <div className="flex flex-col gap-6">
        <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          <TextField
            id={ids.name}
            label={strings.events.name}
            hint={strings.events.nameHint}
            autoComplete="off"
            required
            error={errors.name?.message}
            {...form.register("name")}
          />
          <TextField
            id={ids.date}
            type="date"
            label={strings.events.date}
            required
            error={errors.date?.message}
            {...form.register("date")}
          />
          <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
            {isSubmitting ? strings.events.submitting : strings.events.submit}
          </Button>
        </form>
      </div>
    </>
  );
}
