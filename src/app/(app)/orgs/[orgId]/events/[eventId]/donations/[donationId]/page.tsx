import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { EditDonation } from "./edit-donation";

export const metadata: Metadata = { title: strings.donations.edit };

export default function EditDonationPage() {
  return <EditDonation />;
}
