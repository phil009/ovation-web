import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { InvitesView } from "./invites-view";

export const metadata: Metadata = { title: strings.org.invites };

export default function InvitesPage() {
  return <InvitesView />;
}
