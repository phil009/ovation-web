"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

/**
 * Re-runs an IndexedDB query whenever the tables it reads change, in this tab or another
 * (Dexie liveQuery). Undefined until the first result. `key` must change when the query's
 * inputs change.
 */
export function useLiveQuery<T>(query: () => Promise<T>, key: string): T | undefined {
  const [result, setResult] = useState<{ key: string; value: T } | null>(null);

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (value) => setResult({ key, value }),
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
    // The query is rebuilt on every render; `key` says when it actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result?.key === key ? result.value : undefined;
}
