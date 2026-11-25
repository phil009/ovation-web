/**
 * Storage for the outbox. Browsers may clear IndexedDB under pressure unless the site has
 * persistent storage, so ask once when the first donation is saved. Chrome on Android grants
 * it to installed apps without a prompt; Safari decides by itself. Never throws.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** True when more than 90% of the quota is used (warn before saving fails). */
export async function storageNearlyFull(): Promise<boolean> {
  try {
    const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
    return usage !== undefined && quota !== undefined && quota > 0 && usage / quota > 0.9;
  } catch {
    return false;
  }
}
