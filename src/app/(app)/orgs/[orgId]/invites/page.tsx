import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { AdminPlaceholder } from "../placeholders";

export const metadata: Metadata = { title: strings.org.invites };

export default function Page() {
  return <AdminPlaceholder title={strings.org.invites} body={strings.org.invitesPlaceholder} />;
}
