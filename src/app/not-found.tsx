import type { Metadata } from "next";
import { LinkButton, Main, PageHeading, PublicHeader } from "@/components/app/shell";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.notFound.title };

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <Main narrow>
        <PageHeading>{strings.notFound.title}</PageHeading>
        <p className="mb-6 text-lg">{strings.notFound.body}</p>
        <LinkButton href="/orgs">{strings.notFound.home}</LinkButton>
      </Main>
    </>
  );
}
