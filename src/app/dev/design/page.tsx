import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignSheet } from "./design-sheet";

export const metadata: Metadata = { title: "Design tokens (dev)", robots: { index: false } };

/** Development only: 404 in production builds. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignSheet />;
}
