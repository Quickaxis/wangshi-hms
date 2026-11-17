// HOSPIRO PWA Minimal Service Worker
// Version: 1.0.0
// Designed strictly to fulfill Chrome PWA installability criteria without
// interfering with Supabase, authentication, API routes, or HMS business logic.

const CACHE_NAME = 'hospiro-pwa-v1';

// Essential static shell assets to pre-cache for offline fallback
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/logos/compactlogo.png',
  '/logos/bwoserfavicon.png'
];

self.addEventListener('install', (event) => {
  // Activate worker immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[HOSPIRO SW] Precache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  // Claim all active clients immediately and purge older caches
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only handle GET requests; never touch POST, PUT, DELETE, PATCH (bookings, payments, auth)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Ignore non-http schemes (e.g., chrome-extension://)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. Strict Passthrough: NEVER cache Supabase, external APIs, auth routes or Next.js server actions
  const isSupabase = url.hostname.includes('supabase.co');
  const isInternalAuth = url.pathname.startsWith('/auth') || url.pathname.startsWith('/login') || url.pathname.startsWith('/update-password');
  const isApiRoute = url.pathname.startsWith('/api/');
  const isServerAction = request.headers.has('next-action');

  if (isSupabase || isInternalAuth || isApiRoute || isServerAction || url.origin !== self.location.origin) {
    // Let the browser handle standard network request with credentials
    return;
  }

  // 4. Chrome PWA Installability Fetch Handler:
  // Network-First with Cache Fallback for navigation and static assets
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Optionally cache successful static assets
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith('/icons/') ||
           url.pathname.startsWith('/logos/') ||
           url.pathname.startsWith('/_next/static/'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // If offline, check cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If navigation request fails, return cached root or fail gracefully
        if (request.mode === 'navigate') {
          const fallback = await caches.match('/');
          if (fallback) return fallback;
        }
        return new Response('Network error occurred. You appear to be offline.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
  );
});

