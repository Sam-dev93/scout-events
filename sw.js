/*
 * Scout Events — service worker
 *  • index.html is network-first, so uploads show next launch (cache = offline fallback).
 *  • Bump VERSION on every deploy; the page switches over when the app next goes to the background.
 *  • Apps Script API calls are never cached (the app keeps its own saved copy for offline).
 */
const VERSION = '2026.10.14-10';
const CACHE = `scout-events-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script API, fonts: straight to network
  if (url.pathname.endsWith('/sw.js')) return;

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (isPage) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
        if (fresh && fresh.ok && !url.search) (await caches.open(CACHE)).put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) ||
          new Response('<h1 style="font-family:system-ui">Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});
