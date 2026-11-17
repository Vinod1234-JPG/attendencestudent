'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Registration {
  attendeeId: string;
  name: string;
  college: string;
  photoUrl: string;
  capturedAt: string;
}

const time = (r: Registration) => {
  const t = Date.parse(r.capturedAt);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

// Font sizes (in vw) that shrink for long text so it stays within two lines.
const nameSize = (len: number) => Math.max(2.4, Math.min(6.2, 190 / Math.max(len, 1)));
const collegeSize = (len: number) => Math.max(1.5, Math.min(3.2, 180 / Math.max(len, 1)));

function Slide({ reg, className }: { reg: Registration; className: string }) {
  return (
    <div className={`absolute inset-0 flex items-center gap-[5vw] px-[5vw] ${className}`}>
      <div className="shrink-0 w-[35vw] h-[70vh] rounded-[2vw] border-[0.7vw] border-white bg-[#0B1B30] shadow-[0_2vh_6vh_rgba(20,41,75,0.35)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reg.photoUrl}
          alt={reg.name}
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center 35%' }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <h1
          className="font-extrabold text-[#14294B] leading-[1.05] line-clamp-2 break-words"
          style={{ fontSize: `${nameSize(reg.name.length)}vw` }}
        >
          {reg.name}
        </h1>
        {reg.college && (
          <p
            className="mt-[2.5vh] text-slate-500 font-medium leading-snug line-clamp-2 break-words"
            style={{ fontSize: `${collegeSize(reg.college.length)}vw` }}
          >
            {reg.college}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LiveDisplayPage() {
  const [current, setCurrent] = useState<Registration | null>(null);
  const [previous, setPrevious] = useState<Registration | null>(null);
  const [slideKey, setSlideKey] = useState(0);
  const [moving, setMoving] = useState(false);
  const currentRef = useRef<Registration | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPrev = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Shows a registration if it is newer than the one on screen; preloads the photo first. */
  const apply = useCallback((reg: Registration) => {
    if (!reg || !reg.name || !reg.photoUrl) return;
    const shown = currentRef.current;
    if (shown && !(time(reg) > time(shown))) return; // late offline syncs must not replace a newer student

    const swap = () => {
      const now = currentRef.current;
      if (now && !(time(reg) > time(now))) return; // something newer arrived while the image loaded
      setPrevious(now);
      currentRef.current = reg;
      setCurrent(reg);
      setSlideKey((k) => k + 1);
      if (clearPrev.current) clearTimeout(clearPrev.current);
      clearPrev.current = setTimeout(() => setPrevious(null), 450);
    };

    const img = new Image();
    img.onload = swap;
    img.onerror = swap; // still show the name even if the photo failed to load
    img.src = reg.photoUrl;
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/live/latest?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/login?next=/admin/attendees';
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data?.registration) apply(data.registration as Registration);
    } catch {
      // network hiccup: the next poll or stream event will catch up
    }
  }, [apply]);

  // Initial load + live stream + safety poll
  useEffect(() => {
    fetchLatest();

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/admin/live/stream');
      es.addEventListener('ready', () => fetchLatest());
      es.addEventListener('registration', (e) => {
        try {
          apply(JSON.parse((e as MessageEvent).data));
        } catch {
          // ignore malformed event
        }
      });
    } catch {
      // EventSource unavailable: polling below still works
    }

    // Serverless hosts can route the kiosk request and this stream to different instances, so a light
    // poll runs as a safety net. It is one tiny request every 5 seconds.
    const poll = setInterval(fetchLatest, 5000);

    return () => {
      es?.close();
      clearInterval(poll);
      if (clearPrev.current) clearTimeout(clearPrev.current);
    };
  }, [apply, fetchLatest]);

  // Cover the whole viewport, no scrollbars
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // Keep the screen awake
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        // not supported or denied
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // Fullscreen on click or "F"
  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen]);

  // Hide the cursor and the dashboard link after 3 s without mouse movement
  const onMouseMove = () => {
    setMoving(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setMoving(false), 3000);
  };
  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    []
  );

  return (
    <div
      onClick={() => !document.fullscreenElement && toggleFullscreen()}
      onMouseMove={onMouseMove}
      className={`fixed inset-0 z-[100] overflow-hidden bg-gradient-to-br from-[#F4F7FB] to-[#E3EBF6] select-none ${
        moving ? '' : 'cursor-none'
      }`}
    >
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 h-[max(9vh,52px)] bg-[#14294B] flex items-center gap-[1.2vw] px-[2.5vw] shadow-md z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpg"
          alt="MIT Mysore"
          className="h-[max(6vh,36px)] aspect-square rounded-full bg-white p-[2px] object-contain"
        />
        <span className="text-white font-bold tracking-wide" style={{ fontSize: 'max(2.6vh, 14px)' }}>
          MIT Mysore Student Attendance Tracker
        </span>
        <Link
          href="/admin"
          onClick={(e) => e.stopPropagation()}
          className={`ml-auto rounded-full bg-white/15 px-[1.2vw] py-[0.8vh] text-white/90 hover:bg-white/25 transition-opacity duration-300 ${
            moving ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ fontSize: 'max(1.9vh, 12px)' }}
        >
          ← Dashboard
        </Link>
      </header>

      {/* Stage */}
      <div className="absolute inset-x-0 top-[max(9vh,52px)] bottom-0">
        {previous && <Slide key={`prev-${slideKey}`} reg={previous} className="live-fade-out" />}
        {current ? (
          <Slide key={`cur-${slideKey}`} reg={current} className={previous ? 'live-fade-in' : ''} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-slate-500 font-semibold animate-pulse" style={{ fontSize: 'max(3.4vh, 18px)' }}>
              Waiting for registration…
            </p>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes liveFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes liveFadeOut { from { opacity: 1; } to { opacity: 0; } }
        .live-fade-in { animation: liveFadeIn 400ms ease forwards; }
        .live-fade-out { animation: liveFadeOut 400ms ease forwards; }
        @media (prefers-reduced-motion: reduce) {
          .live-fade-in, .live-fade-out { animation-duration: 1ms; }
        }
      `}</style>
    </div>
  );
}
