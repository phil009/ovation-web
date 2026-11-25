"use client";

import { useSession } from "@/lib/auth/auth-provider";
import { formatEventDate } from "@/lib/dates";
import { kitsFor } from "@/lib/offline/kits";
import { useLiveQuery } from "@/lib/offline/live";
import { strings } from "@/lib/strings";

/**
 * Links to the entry screens this phone can open offline (events whose entry screen loaded
 * online before). Plain links: offline, a full page load is what the service worker serves
 * from its cache.
 */
export function OfflineRecordLinks({ orgId }: { orgId?: string }) {
  const { user } = useSession();
  const kits = useLiveQuery(
    () => (user ? kitsFor(user.id) : Promise.resolve([])),
    `kits:${user?.id ?? ""}`,
  );
  const shown = (kits ?? []).filter((k) => !orgId || k.orgId === orgId);
  if (!user || !kits) return null;

  return (
    <section aria-labelledby="offline-record-heading" className="mt-8 flex flex-col gap-3">
      <h2 id="offline-record-heading" className="text-2xl font-semibold">
        {strings.offlineRecord.title}
      </h2>
      {shown.length === 0 ? (
        <p className="text-muted">{strings.offlineRecord.none}</p>
      ) : (
        <>
          <p>{strings.offlineRecord.intro}</p>
          <ul className="flex flex-col gap-2">
            {shown.map((k) => (
              <li key={k.eventId}>
                <a
                  href={`/orgs/${k.orgId}/events/${k.eventId}/record`}
                  className="ov-border flex min-h-12 flex-col justify-center rounded-xl border border-divider bg-surface px-4 py-3 font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {k.event.name}
                  <span className="text-sm font-normal text-muted">
                    {formatEventDate(k.event.date)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
