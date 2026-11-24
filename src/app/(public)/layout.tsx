import type { ReactNode } from "react";
import { PublicHeader } from "@/components/app/shell";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
    </>
  );
}
