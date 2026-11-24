import type { Metadata } from "next";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { NewEventForm } from "./new-event-form";

export const metadata: Metadata = { title: strings.events.newTitle };

export default function NewEventPage() {
  return (
    <Main narrow>
      <NewEventForm />
    </Main>
  );
}
