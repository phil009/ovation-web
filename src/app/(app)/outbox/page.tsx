import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { OutboxView } from "./outbox-view";

export const metadata: Metadata = { title: strings.outbox.title };

export default function OutboxPage() {
  return <OutboxView />;
}
