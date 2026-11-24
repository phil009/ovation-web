import { CheckCircle2, Clock, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { strings } from "@/lib/strings";
import { formatNaira, spokenNaira } from "@/lib/money";

/** Pledged vs received: never colour alone. Icon plus the word. */
export function StatusBadge({ status }: { status: "PLEDGED" | "RECEIVED" }) {
  const pledged = status === "PLEDGED";
  const Icon = pledged ? Clock : CheckCircle2;
  return (
    <span
      className={cn(
        "ov-border inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold",
        pledged
          ? "border-pledged-fg/30 bg-pledged-bg text-pledged-fg"
          : "border-received-fg/30 bg-received-bg text-received-fg",
      )}
    >
      <Icon aria-hidden className="size-4" />
      {pledged ? strings.status.pledged : strings.status.received}
    </span>
  );
}

/** A money value: tabular digits on screen, "50,000 naira" for screen readers. */
export function Money({ kobo, className }: { kobo: string; className?: string }) {
  return (
    <span className={cn("tabular", className)}>
      <span aria-hidden>{formatNaira(kobo)}</span>
      <span className="sr-only">{spokenNaira(kobo)}</span>
    </span>
  );
}

const noticeStyles = {
  info: { icon: Info, className: "border-primary" },
  success: { icon: CheckCircle2, className: "border-success" },
  warning: { icon: TriangleAlert, className: "border-accent" },
  error: { icon: TriangleAlert, className: "border-danger" },
} as const;

/**
 * Inline message. `live` makes it a status (polite) or alert (assertive) region;
 * leave it off for messages present on page load.
 */
export function Notice({
  tone = "info",
  live,
  children,
  className,
}: {
  tone?: keyof typeof noticeStyles;
  live?: "polite" | "assertive";
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = noticeStyles[tone];
  const role = live === "assertive" ? "alert" : live === "polite" ? "status" : undefined;
  return (
    <div
      role={role}
      className={cn(
        "ov-border flex items-start gap-3 rounded-lg border-2 border-l-8 bg-surface p-4",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-divider", className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("ov-border rounded-xl border border-divider bg-surface p-5", className)}>
      {children}
    </div>
  );
}
