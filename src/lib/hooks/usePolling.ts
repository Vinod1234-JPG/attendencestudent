import { useEffect, useRef } from 'react';

/**
 * Runs `callback` every `intervalMs`, but only while the browser tab is visible. When the tab becomes visible
 * again it refreshes once straight away. Hidden tabs and idle windows therefore stop hitting the server.
 */
export function usePolling(callback: () => void, intervalMs: number) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => saved.current(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        saved.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
