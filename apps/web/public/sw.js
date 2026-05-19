const VERSION = 'yachiyo-assets-v3';
const IMAGE_CACHE = `${VERSION}:images`;
const IMAGE_MAX_ENTRIES = 260;
const RELOAD_CLIENTS_ON_ACTIVATE = true;
const IMAGE_PATH_RE =
  /^\/(?:_optimized|backgrounds|banners|cards|crash|game-art|games|halls|promos|slots)\//;
const IMAGE_EXT_RE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  (key.startsWith('bg-assets-') || key.startsWith('yachiyo-assets-')) &&
                  !key.startsWith(VERSION),
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]).then(() => reloadClientsOnActivate()),
  );
});

async function reloadClientsOnActivate() {
  if (!RELOAD_CLIENTS_ON_ACTIVATE) return;
  const clients = await self.clients.matchAll({ type: 'window' });
  await Promise.all(
    clients.map((client) => {
      if ('navigate' in client) return client.navigate(client.url);
      return undefined;
    }),
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImageRequest(url, request)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_MAX_ENTRIES));
  }
});

function isImageRequest(url, request) {
  return (
    request.destination === 'image' ||
    (IMAGE_PATH_RE.test(url.pathname) && IMAGE_EXT_RE.test(url.pathname))
  );
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    cache.put(request, response.clone()).then(() => trimCache(cache, maxEntries));
  }
  return response;
}

function isCacheable(response) {
  return response && response.ok && response.type !== 'opaque';
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  await Promise.all(
    keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)),
  );
}
