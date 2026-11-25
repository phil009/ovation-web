import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { DonationsView } from "./donations-view";

export const metadata: Metadata = { title: strings.donations.title };

export default function DonationsPage() {
  return <DonationsView />;
}
