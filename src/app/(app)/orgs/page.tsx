import type { Metadata } from "next";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { OrgList } from "./org-list";

export const metadata: Metadata = { title: strings.orgs.title };

export default function OrgsPage() {
  return (
    <Main>
      <OrgList />
    </Main>
  );
}
