import type { Metadata } from "next";
import { Main } from "@/components/app/shell";
import { strings } from "@/lib/strings";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: strings.settings.title };

export default function SettingsPage() {
  return (
    <Main narrow>
      <SettingsView />
    </Main>
  );
}
