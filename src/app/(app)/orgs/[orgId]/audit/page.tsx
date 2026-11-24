import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: strings.org.audit };

export default function AuditPage() {
  return <AuditView />;
}
