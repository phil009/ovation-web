import type { Metadata } from "next";
import { strings } from "@/lib/strings";
import { EditAwardee } from "./edit-awardee";

export const metadata: Metadata = { title: strings.awardees.edit };

export default function EditAwardeePage() {
  return <EditAwardee />;
}
