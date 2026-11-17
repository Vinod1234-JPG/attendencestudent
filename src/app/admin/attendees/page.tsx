'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Landmark } from 'lucide-react';

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
const nameSize = (len: number) => Math.max(2.2, Math.min(7, 135 / Math.max(len, 1)));
const collegeSize = (len: number) => Math.max(1.4, Math.min(2.6, 100 / Math.max(len, 1)));

/** Cinematic backdrop: aurora glows, a perspective grid floor and slow floating orbs. */
function Backdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(60vw 62vh at 0% 0%, rgba(20,184,166,0.50), transparent 62%)',
            'radial-gradient(72vw 72vh at 100% 28%, rgba(37,99,235,0.55), transparent 62%)',
            'radial-gradient(64vw 50vh at 58% 112%, rgba(124,58,237,0.50), transparent 62%)',
            'linear-gradient(160deg, #040A18 0%, #0A1A3F 52%, #050F26 100%)',
          ].join(','),
        }}
      />

      {/* perspective grid floor */}
      <div
        className="absolute inset-x-[-30vw] bottom-0 h-[46vh] live-grid"
        style={{
          backgroundImage:
            'linear-gradient(rgba(125,211,252,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.22) 1px, transparent 1px)',
          backgroundSize: '5vw 6vh',
          transform: 'perspective(48vh) rotateX(64deg)',
          transformOrigin: '50% 100%',
          WebkitMaskImage: 'linear-gradient(to top, #000 15%, transparent 95%)',
          maskImage: 'linear-gradient(to top, #000 15%, transparent 95%)',
        }}
      />

      {/* floating orbs */}
      <div className="live-orb absolute left-[41vw] top-[19vh] h-[6.4vw] w-[6.4vw] rounded-full" style={{ background: 'radial-gradient(circle at 32% 28%, #bae6fd, #2563eb 48%, #0b1e5a 100%)', animationDelay: '0s' }} />
      <div className="live-orb absolute left-[3.5vw] bottom-[9vh] h-[11vw] w-[11vw] rounded-full" style={{ background: 'radial-gradient(circle at 32% 28%, #7dd3fc, #0e7490 46%, #052a4a 100%)', animationDelay: '-3s' }} />
      <div className="live-orb absolute right-[6vw] bottom-[8vh] h-[7vw] w-[7vw] rounded-full" style={{ background: 'radial-gradient(circle at 32% 28%, #ddd6fe, #7c3aed 50%, #2e1065 100%)', animationDelay: '-5s' }} />

      {/* film grain / scan lines */}
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)' }}
      />
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 14vw rgba(2,6,23,0.65)' }} />
    </div>
  );
}

function Slide({ reg, className }: { reg: Registration; className: string }) {
  return (
    <div className={`absolute inset-0 flex items-center gap-[5.5vw] px-[5.5vw] ${className}`}>
      {/* Photo: tilted glass frame with a glowing gradient edge, orbit ring and reflection */}
      <div className="relative shrink-0" style={{ perspective: '120vh' }}>
        <div className="live-orbit absolute -right-[5.5vw] bottom-[-1vh] h-[7vw] w-[17vw]" aria-hidden />
        <div
          className="live-frame-in relative"
          style={{
            transform: 'rotateY(-7deg) rotateX(2deg) rotateZ(-1deg)',
            WebkitBoxReflect: 'below 1.2vh linear-gradient(transparent 72%, rgba(255,255,255,0.16))',
          }}
        >
          <div
            className="live-glow rounded-[2.4vw] p-[0.42vw]"
            style={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #22d3ee 48%, #34d399 100%)',
            }}
          >
            <div className="relative h-[64vh] w-[31vw] overflow-hidden rounded-[2vw] bg-[#0B1B30]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={reg.photoUrl}
                alt={reg.name}
                className="h-full w-full object-cover"
                style={{ objectPosition: 'center 35%' }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
              <div className="live-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {/* Name + college */}
      <div className="min-w-0 flex-1">
        <h1
          className="live-rise pb-[0.14em] font-extrabold leading-[1.1] tracking-tight line-clamp-2 break-words"
          style={{
            fontSize: `${nameSize(reg.name.length)}vw`,
            backgroundImage: 'linear-gradient(180deg, #ffffff 35%, #b9d3ff 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 0 1.6vw rgba(96,165,250,0.45))',
            animationDelay: '0.15s',
          }}
        >
          {reg.name}
        </h1>

        <div className="live-grow mt-[3vh] h-[0.9vh] w-[11vw] rounded-full bg-gradient-to-r from-teal-300 via-sky-400 to-violet-400" style={{ animationDelay: '0.45s' }} />

        {reg.college && (
          <div
            className="live-rise mt-[4vh] inline-flex max-w-full items-center gap-[1.3vw] rounded-[1.5vw] border border-white/15 bg-white/10 px-[1.3vw] py-[1.6vh] shadow-[0_1vh_4vh_rgba(2,6,23,0.35)] backdrop-blur-xl"
            style={{ animationDelay: '0.6s' }}
          >
            <span className="flex h-[4.2vw] w-[4.2vw] shrink-0 items-center justify-center rounded-[1.1vw] bg-gradient-to-br from-sky-400 to-teal-400 shadow-[0_0_2vw_rgba(56,189,248,0.55)]">
              <Landmark className="h-[2.2vw] w-[2.2vw] text-white" strokeWidth={1.8} />
            </span>
            <span
              className="min-w-0 font-semibold leading-snug text-white/90 line-clamp-2 break-words"
              style={{ fontSize: `${collegeSize(reg.college.length)}vw` }}
            >
              {reg.college}
            </span>
          </div>
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
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#040A18] text-white select-none ${
        moving ? '' : 'cursor-none'
      }`}
    >
      <Backdrop />

      {/* Top bar: glass pill */}
      <header className="absolute inset-x-[2.5vw] top-[2.4vh] z-10 flex h-[max(8vh,52px)] items-center gap-[1.2vw] rounded-[1.4vw] border border-white/15 bg-white/10 px-[1.4vw] shadow-[0_1vh_5vh_rgba(2,6,23,0.4)] backdrop-blur-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpg"
          alt="MIT Mysore"
          className="aspect-square h-[max(5.4vh,34px)] rounded-full bg-white object-contain p-[2px] ring-2 ring-sky-300/70"
        />
        <span className="font-bold tracking-wide text-white" style={{ fontSize: 'max(2.6vh, 14px)' }}>
          MIT Mysore Student Attendance Tracker
        </span>
        <Link
          href="/admin"
          onClick={(e) => e.stopPropagation()}
          className={`ml-auto rounded-full bg-white/15 px-[1.2vw] py-[0.8vh] text-white/90 transition-opacity duration-300 hover:bg-white/25 ${
            moving ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ fontSize: 'max(1.9vh, 12px)' }}
        >
          ← Dashboard
        </Link>
      </header>

      {/* Stage */}
      <div className="absolute inset-x-0 bottom-0 top-[calc(2.4vh+max(8vh,52px))]">
        {previous && <Slide key={`prev-${slideKey}`} reg={previous} className="live-fade-out" />}
        {current ? (
          <Slide key={`cur-${slideKey}`} reg={current} className={previous ? 'live-fade-in' : ''} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3vh]">
            <div className="live-pulse-ring h-[9vh] w-[9vh] rounded-full border-[0.5vh] border-sky-300/70" />
            <p className="font-semibold text-white/80" style={{ fontSize: 'max(3.4vh, 18px)' }}>
              Waiting for registration…
            </p>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes liveFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes liveFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes liveFrameIn {
          from { opacity: 0; transform: translateX(-9vw) rotateY(-30deg) rotateX(2deg) scale(0.92); }
          to { opacity: 1; transform: rotateY(-7deg) rotateX(2deg) rotateZ(-1deg) scale(1); }
        }
        @keyframes liveRise {
          from { opacity: 0; transform: translateY(3.5vh); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes liveGrow { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes liveFloat { from { transform: translateY(0) scale(1); } to { transform: translateY(-3vh) scale(1.04); } }
        @keyframes liveSweep { from { transform: translateX(0); } to { transform: translateX(420%); } }
        @keyframes liveGlow {
          0%, 100% { box-shadow: 0 0 5vw rgba(56,189,248,0.40), 0 3vh 8vh rgba(2,6,23,0.55); }
          50% { box-shadow: 0 0 8vw rgba(139,92,246,0.55), 0 3vh 8vh rgba(2,6,23,0.55); }
        }
        @keyframes liveOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes livePulse { 0% { transform: scale(0.85); opacity: 0.9; } 100% { transform: scale(1.7); opacity: 0; } }

        .live-fade-in { animation: liveFadeIn 400ms ease forwards; }
        .live-fade-out { animation: liveFadeOut 400ms ease forwards; }
        .live-frame-in { animation: liveFrameIn 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .live-rise { opacity: 0; animation: liveRise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .live-grow { transform-origin: left center; opacity: 0; animation: liveGrow 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .live-orb { animation: liveFloat 9s ease-in-out infinite alternate; box-shadow: 0 0 4vw rgba(56,189,248,0.25); }
        .live-sweep { animation: liveSweep 1400ms ease 600ms 1 both; }
        .live-glow { animation: liveGlow 5s ease-in-out infinite; }
        .live-orbit {
          border-radius: 9999px;
          background: conic-gradient(from 200deg, #a78bfa, #22d3ee, #34d399, #a78bfa);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 0.7vw), #000 calc(100% - 0.7vw));
          mask: radial-gradient(farthest-side, transparent calc(100% - 0.7vw), #000 calc(100% - 0.7vw));
          filter: drop-shadow(0 0 1.2vw rgba(139, 92, 246, 0.6));
          opacity: 0.9;
        }
        .live-pulse-ring { animation: livePulse 2s ease-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .live-fade-in, .live-fade-out, .live-frame-in, .live-rise, .live-grow, .live-orb,
          .live-sweep, .live-glow, .live-pulse-ring { animation-duration: 1ms; animation-iteration-count: 1; }
        }
      `}</style>
    </div>
  );
}
