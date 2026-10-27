/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    __SHELL_REV: string;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** App shell pages. Live-night routes use ?id=, so these few HTML files cover every screen offline. */
const SHELL = [
  '/',
  '/~offline',
  '/login',
  '/app',
  '/app/new',
  '/app/onboarding',
  '/app/s',
  '/app/s/count',
  '/app/s/settle',
  '/app/s/log',
  '/app/groups',
  '/app/g',
  '/app/history',
  '/app/me',
];
const SHELL_CACHE = `shell-${self.__SHELL_REV}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)))),
  );
});

async function shellFor(url: string): Promise<Response | undefined> {
  const { pathname } = new URL(url);
  const cache = await caches.open(SHELL_CACHE);
  return (await cache.match(pathname)) ?? (await cache.match('/~offline'));
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // NetworkFirst for navigations, falling back to the cached shell (query string ignored).
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 4,
        plugins: [{ handlerDidError: async ({ request }) => shellFor(request.url) }],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
