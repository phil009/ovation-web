import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { EventPlaceholder } from "../../placeholders";

export const metadata: Metadata = { title: strings.org.event };

export default function EventPage() {
  return <EventPlaceholder />;
}
