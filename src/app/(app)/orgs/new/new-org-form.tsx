"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { PageHeading } from "@/components/app/shell";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { meQueryKey } from "@/lib/auth/auth-provider";
import { strings } from "@/lib/strings";
import { orgSchema, type OrgValues } from "@/lib/validation";
import { orgsQueryKey } from "../org-list";

const ids = { name: "org-name" };

export function NewOrgForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: "" },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name }) => {
    try {
      const org = await call((signal) => api.POST("/api/orgs", { body: { name }, signal }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
        queryClient.invalidateQueries({ queryKey: orgsQueryKey }),
      ]);
      toast.show({ message: strings.orgs.created(org.name), tone: "success" });
      router.push(`/orgs/${org.id}`);
    } catch (error) {
      fail(error);
    }
  }, onInvalid);

  return (
    <>
      <PageHeading intro={strings.orgs.newIntro}>{strings.orgs.newTitle}</PageHeading>
      <div className="flex flex-col gap-6">
        <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          <TextField
            id={ids.name}
            label={strings.orgs.name}
            hint={strings.orgs.nameHint}
            autoComplete="organization"
            required
            error={errors.name?.message}
            {...form.register("name")}
          />
          <Button type="submit" size="wide" disabled={isSubmitting || coolingDown}>
            {isSubmitting ? strings.orgs.submitting : strings.orgs.submit}
          </Button>
        </form>
      </div>
    </>
  );
}
