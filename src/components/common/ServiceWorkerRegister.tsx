'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Proactively purge old service worker caches in the user's browser
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            if (name !== 'mrf-attendance-shell-v5') {
              caches.delete(name);
            }
          }
        });
      }

      // 2. Register or update the service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            registration.update().catch(() => {});
          })
          .catch((err) => {
            console.warn('[SW] ServiceWorker registration failed: ', err);
          });
      }
    }
  }, []);

  return null;
}
