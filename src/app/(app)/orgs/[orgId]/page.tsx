import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { EventsView } from "./events-view";

export const metadata: Metadata = { title: strings.org.events };

export default function OrgPage() {
  return <EventsView />;
}
