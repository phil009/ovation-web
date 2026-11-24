import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { AdminPlaceholder } from "../placeholders";

export const metadata: Metadata = { title: strings.org.audit };

export default function Page() {
  return <AdminPlaceholder title={strings.org.audit} body={strings.org.auditPlaceholder} />;
}
