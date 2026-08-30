import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api/client';
import type { Paper } from '@/lib/api/papers';

interface LoadedFile {
  key: string;
  url: string | null;
  error: string | null;
}

/**
 * Loads the paper's PDF through the authenticated API and exposes it as an
 * object URL the viewer can consume. Revoked on unmount / paper change.
 */
export function usePaperFile(paper: Paper): {
  fileUrl: string | null;
  error: string | null;
} {
  // Keyed result: a paper change naturally reads as "loading" (null) until
  // the new fetch resolves — no synchronous resets inside the effect.
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const key = `${paper.id}:${paper.file_url ?? ''}`;

  useEffect(() => {
    if (!paper.file_url) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    fetchApi<Blob>(paper.file_url, {
      method: 'GET',
      responseType: 'blob',
      signal: controller.signal,
    })
      .then((blob) => {
        if (cancelled || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ key, url: objectUrl, error: null });
      })
      .catch((err) => {
        // Cancellation is expected when navigating between papers or when
        // React remounts the reader in development. It must not become a PDF
        // load error in the reader shell.
        if (cancelled || controller.signal.aborted) return;
        setLoaded({ key, url: null, error: err?.toString() ?? 'Failed to load PDF' });
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, paper.file_url]);

  if (!loaded || loaded.key !== key) return { fileUrl: null, error: null };
  return { fileUrl: loaded.url, error: loaded.error };
}
