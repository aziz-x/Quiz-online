// public/sw.js
self.addEventListener('install', () => {
  console.log('Service Worker installing.');
});

self.addEventListener('activate', () => {
  console.log('Service Worker activating.');
});

// Removed no-op fetch handler to improve performance and fix browser warnings.
// If offline support is needed in the future, implement a proper caching strategy here.

