import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { RecordView } from "./record-view";

export const metadata: Metadata = { title: strings.record.title };

export default function RecordPage() {
  return <RecordView />;
}
