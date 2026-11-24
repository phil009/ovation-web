import type { Metadata } from "next";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { NewOrgForm } from "./new-org-form";

export const metadata: Metadata = { title: strings.orgs.newTitle };

export default function NewOrgPage() {
  return (
    <Main narrow>
      <NewOrgForm />
    </Main>
  );
}
