const CACHE_NAME = 'sri-sai-pg-cache-v1.0.2'; // Increment this version to invalidate old caches

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pg-logo.jpg',
  '/pg-logo-192.png',
  '/pg-logo-512.png',
];

// Install Event - cache core assets
self.addEventListener('install', (e) => {
  console.log('[ServiceWorker] Installing...');
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching App Shell...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event - clean up old caches
self.addEventListener('activate', (e) => {
  console.log('[ServiceWorker] Activating...');
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event - network first, fallback to cache for pages/assets
self.addEventListener('fetch', (e) => {
  // Avoid caching non-GET requests or firebase auth/firestore endpoints
  if (e.request.method !== 'GET' || e.request.url.includes('/firestore') || e.request.url.includes('/identitytoolkit')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Clone response to cache it
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Cache only local HTTP/HTTPS calls
          if (e.request.url.startsWith(self.location.origin)) {
            cache.put(e.request, resClone);
          }
        });
        return res;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Return offline fallback if it's index.html
          if (e.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

// Listen for messages to force updates
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
