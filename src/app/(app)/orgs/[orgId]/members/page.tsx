import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { AdminPlaceholder } from "../placeholders";

export const metadata: Metadata = { title: strings.org.members };

export default function Page() {
  return <AdminPlaceholder title={strings.org.members} body={strings.org.membersPlaceholder} />;
}
