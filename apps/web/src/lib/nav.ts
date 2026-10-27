'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Client navigation that still works offline: soft navigation needs the RSC payload from the
 * network, so offline we do a full load, which the service worker serves from the precached shell.
 */
export function useGo() {
  const router = useRouter();
  return useCallback(
    (href: string, opts?: { replace?: boolean }) => {
      if (!navigator.onLine) {
        if (opts?.replace) location.replace(href);
        else location.assign(href);
      } else if (opts?.replace) router.replace(href);
      else router.push(href);
    },
    [router],
  );
}

export function useQueryId(key = 'id'): string | null {
  return useSearchParams().get(key);
}
