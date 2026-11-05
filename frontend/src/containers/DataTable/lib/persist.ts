import { useCallback, useEffect, useState } from "react";

/**
 * Per-browser memory for tables (`useDataTable`'s `persistKey`) and the
 * screens around them: sort, search, filters, page, columns survive a
 * reload or a trip to a detail page and back. `localStorage` under
 * `platform-core:<key>`; every access is guarded - private windows,
 * blocked storage and SSR (no `window`) just mean "nothing remembered".
 */
const PREFIX = "platform-core:";

export function readPersisted<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writePersisted(key: string, value: unknown): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the table still works, it just forgets.
  }
}

/**
 * `useState` that remembers its value under `key` (no key = plain state).
 * The stored value is applied AFTER mount, not in the initializer, so the
 * server render and the first client render agree (no hydration
 * mismatch); `restored` turns true once that happened.
 */
export function usePersistedState<T>(key: string | undefined, initial: T): [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(!key);

  useEffect(() => {
    if (!key) return;
    const stored = readPersisted<T>(key);
    // Reading browser storage is synchronizing with an external system.
    // oxlint-disable-next-line react/set-state-in-effect
    if (stored != null) setValue(stored);
    // oxlint-disable-next-line react/set-state-in-effect
    setRestored(true);
  }, [key]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      if (key) writePersisted(key, next);
    },
    [key],
  );
  return [value, set, restored];
}
