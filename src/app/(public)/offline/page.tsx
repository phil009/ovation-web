import type { Metadata } from "next";
import { Main, PageHeading } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: strings.offline.title };

/** Precached by the service worker and shown when a page cannot load offline. */
export default function OfflinePage() {
  return (
    <Main narrow>
      <PageHeading>{strings.offline.title}</PageHeading>
      <p className="mb-6 text-lg">{strings.offline.body}</p>
      <RetryButton />
    </Main>
  );
}
