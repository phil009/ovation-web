import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { MembersView } from "./members-view";

export const metadata: Metadata = { title: strings.org.members };

export default function MembersPage() {
  return <MembersView />;
}
