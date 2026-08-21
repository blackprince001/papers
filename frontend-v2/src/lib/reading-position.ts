/**
 * Per-paper reading position, persisted locally so reopening a paper
 * resumes where the reader left off. Stored page is always a positive
 * integer; corrupt entries are treated as "no stored position".
 */

const KEY_PREFIX = 'lumen:reading-position:';

export interface StoredReadingPosition {
  page: number
  savedAt: number
}

function key(paperId: number): string {
  return `${KEY_PREFIX}${paperId}`;
}

// Storage can be unavailable (private mode, quotas, exotic embeds); fall
// back to session memory so restore still works within a session.
let memoryStore: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null =
  null;

function backingStore(): Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
> {
  try {
    const store = window.localStorage;
    const probeKey = `${KEY_PREFIX}__probe`;
    store.setItem(probeKey, '1');
    store.removeItem(probeKey);
    return store;
  } catch {
    memoryStore ??= (() => {
      const map = new Map<string, string>();
      return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      };
    })();
    return memoryStore;
  }
}

/** Validate a stored entry; anything malformed means "no position". */
export function parseStoredPosition(
  raw: string | null,
): StoredReadingPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredReadingPosition>;
    if (
      typeof parsed?.page === 'number' &&
      Number.isInteger(parsed.page) &&
      parsed.page >= 1
    ) {
      return { page: parsed.page, savedAt: parsed.savedAt ?? 0 };
    }
    return null;
  } catch {
    return null;
  }
}

export function loadReadingPosition(
  paperId: number,
): StoredReadingPosition | null {
  try {
    return parseStoredPosition(backingStore().getItem(key(paperId)));
  } catch {
    return null;
  }
}

export function saveReadingPosition(paperId: number, page: number): void {
  try {
    const position: StoredReadingPosition = { page, savedAt: Date.now() };
    backingStore().setItem(key(paperId), JSON.stringify(position));
  } catch {
    // Storage unavailable: restoring is best-effort.
  }
}

export function clearReadingPosition(paperId: number): void {
  try {
    backingStore().removeItem(key(paperId));
  } catch {
    // Ignore.
  }
}
