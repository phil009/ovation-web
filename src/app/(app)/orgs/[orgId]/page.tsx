import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { EventsPlaceholder } from "./placeholders";

export const metadata: Metadata = { title: strings.org.events };

export default function OrgPage() {
  return <EventsPlaceholder />;
}
