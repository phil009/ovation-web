import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { EventView } from "./event-view";

export const metadata: Metadata = { title: strings.org.event };

export default function EventPage() {
  return <EventView />;
}
