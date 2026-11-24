import type { Metadata } from "next";
import { Suspense } from "react";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { JoinFlow } from "./join-flow";

export const metadata: Metadata = { title: strings.join.title };

export default function JoinPage() {
  return (
    <Main narrow>
      <Suspense>
        <JoinFlow />
      </Suspense>
    </Main>
  );
}
