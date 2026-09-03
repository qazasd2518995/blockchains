const VERSION = 'bg-assets-v10-game-cache-first-20260904';
const DEBUG_VERSION = 'game-runtime-cache-20260904-01';
const IMAGE_CACHE = `${VERSION}:images`;
const GAME_CACHE = `${VERSION}:games`;
const IMAGE_MAX_ENTRIES = 420;
const GAME_MAX_ENTRIES = 900;
const IMAGE_PATH_RE =
  /^\/(?:_optimized|backgrounds|banners|cards|crash|game-art|games|halls|promos|slots)\//;
const IMAGE_EXT_RE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const GAME_ASSET_PATH_RE =
  /^\/(?:games\/[^/]+\/assets\/|games\/power-of-thor-2\/original\/.*\/remote\/[^/]+\/(?:native|import)\/|slotFramework\/[a-f0-9]+\/)/i;
const GAME_ASSET_EXT_RE =
  /\.(?:astc|bin|css|eot|gif|jpe?g|js|json|m4a|mp3|ogg|plist|png|svg|ttf|wasm|wav|webp|woff2?)$/i;

self.addEventListener('install', () => {
  console.info('[slot-debug] sw:install', { version: VERSION, debugVersion: DEBUG_VERSION });
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.info('[slot-debug] sw:activate', { version: VERSION, debugVersion: DEBUG_VERSION });
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
    ]),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SLOT_DEBUG_PING') return;
  event.source?.postMessage({
    type: 'SLOT_DEBUG_PONG',
    version: VERSION,
    debugVersion: DEBUG_VERSION,
  });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isGameAssetRequest(url, request)) {
    event.respondWith(cacheFirst(request, GAME_CACHE, GAME_MAX_ENTRIES, event));
    return;
  }

  if (isImageRequest(url, request)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, IMAGE_MAX_ENTRIES, event));
  }
});

async function cacheFirst(request, cacheName, maxEntries, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    event.waitUntil(
      cache
        .put(request, response.clone())
        .then(() => trimCache(cache, maxEntries))
        .catch(() => undefined),
    );
  }
  return response;
}

function isGameAssetRequest(url, request) {
  return (
    !request.headers.get('range') &&
    GAME_ASSET_PATH_RE.test(url.pathname) &&
    GAME_ASSET_EXT_RE.test(url.pathname)
  );
}

function isImageRequest(url, request) {
  return (
    request.destination === 'image' ||
    (IMAGE_PATH_RE.test(url.pathname) && IMAGE_EXT_RE.test(url.pathname))
  );
}

async function staleWhileRevalidate(request, cacheName, maxEntries, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (isCacheable(response)) {
      return cache
        .put(request, response.clone())
        .then(() => trimCache(cache, maxEntries))
        .catch(() => undefined)
        .then(() => response);
    }
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
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
