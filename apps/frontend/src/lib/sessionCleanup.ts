import { queryClient } from "./queryClient";
import { SEARCH_RECENTS_STORAGE_PREFIX } from "../features/search/useSearchRecents";

/**
 * Web-storage key prefixes that hold user-specific data (e.g. recent search
 * entries naming accounts/assets). These are removed when the session ends.
 * Device-level preferences that contain no user data do not belong here.
 */
const USER_DATA_STORAGE_PREFIXES: readonly string[] = [SEARCH_RECENTS_STORAGE_PREFIX];

function removeUserDataKeys(storage: Storage): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const storageKey = storage.key(i);
    if (storageKey && USER_DATA_STORAGE_PREFIXES.some((p) => storageKey.startsWith(p))) {
      keysToRemove.push(storageKey);
    }
  }
  for (const storageKey of keysToRemove) {
    storage.removeItem(storageKey);
  }
}

/**
 * Reset every client-side cache that may hold user data. Called whenever the
 * auth store transitions to unauthenticated (manual logout, session expiry,
 * failed token refresh) so cached data is never served to a different user
 * on the same device.
 *
 * Lives outside the auth store so the store does not depend on the query
 * client directly (the query client already references the auth store via a
 * dynamic import).
 */
export function resetClientCaches(): void {
  queryClient.clear();

  try {
    removeUserDataKeys(window.localStorage);
    removeUserDataKeys(window.sessionStorage);
  } catch {
    // Storage unavailable (e.g. blocked in privacy mode) — nothing persisted.
  }
}
