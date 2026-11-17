'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, GraduationCap } from 'lucide-react';

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

// Font sizes (in cqw: percent of the 16:9 stage width) that shrink for long text so it stays within two lines.
const nameSize = (len: number) => Math.max(2.4, Math.min(6.4, 118 / Math.max(len, 1)));
const collegeSize = (len: number) => Math.max(1.5, Math.min(2.8, 90 / Math.max(len, 1)));

const GOLD = '#F5A524';
const GOLD_LIGHT = '#FFD76A';

/** Stylised night-time campus illustration (decorative). */
function Campus() {
  const stars = Array.from({ length: 34 }, (_, i) => ({
    x: (i * 137) % 790 + 5,
    y: ((i * 61) % 330) + 10,
    r: 0.8 + ((i * 7) % 4) * 0.45,
    o: 0.35 + ((i * 13) % 6) * 0.1,
  }));
  const windows: { x: number; y: number; on: boolean }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 9; col++) {
      if (col >= 4 && col <= 4) continue; // leave the central tower clear
      windows.push({ x: 150 + col * 55, y: 470 + row * 68, on: (row * 7 + col * 3) % 5 !== 0 });
    }
  }
  const towerWindows: { x: number; y: number; on: boolean }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 2; col++) {
      towerWindows.push({ x: 355 + col * 55, y: 335 + row * 68, on: (row + col) % 3 !== 0 });
    }
  }
  const trees = [
    { x: 700, y: 640, s: 1.25 },
    { x: 770, y: 700, s: 1.5 },
    { x: 620, y: 700, s: 0.9 },
    { x: 40, y: 700, s: 1.1 },
  ];

  return (
    <svg
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="cSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081a44" />
          <stop offset="0.55" stopColor="#12337a" />
          <stop offset="1" stopColor="#0a1a3d" />
        </linearGradient>
        <linearGradient id="cWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#33497f" />
          <stop offset="1" stopColor="#17264d" />
        </linearGradient>
        <linearGradient id="cGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1b3b" />
          <stop offset="1" stopColor="#050a18" />
        </linearGradient>
        <radialGradient id="cMoon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff8dc" />
          <stop offset="0.45" stopColor="#fde68a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cGlow" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="900" fill="url(#cSky)" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dbeafe" opacity={s.o} />
      ))}
      <circle cx="610" cy="150" r="120" fill="url(#cMoon)" opacity="0.55" />
      <circle cx="610" cy="150" r="30" fill="#fff4c4" />

      {/* warm glow behind the building */}
      <ellipse cx="400" cy="770" rx="420" ry="220" fill="url(#cGlow)" />

      {/* building */}
      <rect x="60" y="520" width="110" height="250" fill="url(#cWall)" />
      <rect x="630" y="520" width="110" height="250" fill="url(#cWall)" />
      <rect x="140" y="440" width="520" height="330" fill="url(#cWall)" />
      <rect x="320" y="300" width="160" height="470" fill="url(#cWall)" />
      <polygon points="308,300 400,236 492,300" fill="#3a5290" />
      <rect x="130" y="428" width="540" height="16" fill="#3f5a9c" />
      <rect x="50" y="508" width="130" height="14" fill="#3f5a9c" />
      <rect x="620" y="508" width="130" height="14" fill="#3f5a9c" />
      <line x1="400" y1="236" x2="400" y2="170" stroke="#8aa4d6" strokeWidth="3" />
      <polygon points="402,172 452,186 402,200" fill={GOLD} opacity="0.9" />

      {windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width="28" height="42" rx="3" fill={w.on ? '#fde68a' : '#223863'} opacity={w.on ? 0.85 : 0.9} />
      ))}
      {towerWindows.map((w, i) => (
        <rect key={`t${i}`} x={w.x} y={w.y} width="32" height="44" rx="3" fill={w.on ? '#fde68a' : '#223863'} opacity={w.on ? 0.9 : 0.9} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`c${i}`} x={338 + i * 30} y="690" width="14" height="80" fill="#8aa4d6" opacity="0.7" />
      ))}
      <path d="M368 770 v-52 a32 32 0 0 1 64 0 v52 z" fill="#fde68a" opacity="0.9" />

      {/* ground and path */}
      <rect x="0" y="770" width="800" height="130" fill="url(#cGround)" />
      <polygon points="372,770 428,770 560,900 240,900" fill="#16254a" opacity="0.9" />

      {/* trees */}
      {trees.map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`}>
          <rect x="-5" y="40" width="10" height="70" fill="#050c1d" />
          <circle cx="0" cy="10" r="48" fill="#071428" />
          <circle cx="-30" cy="34" r="34" fill="#061126" />
          <circle cx="30" cy="30" r="38" fill="#08162c" />
        </g>
      ))}
    </svg>
  );
}

/** Cinematic backdrop: navy base, gold and blue glows, campus on the right, light streaks. */
function Backdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(60vw 80vh at 20% 58%, rgba(245,165,36,0.20), transparent 62%)',
            'radial-gradient(60vw 70vh at 90% 25%, rgba(37,99,235,0.30), transparent 62%)',
            'linear-gradient(135deg, #03060E 0%, #07122A 55%, #050B1C 100%)',
          ].join(','),
        }}
      />

      {/* campus, faded into the dark on its left edge */}
      <div
        className="absolute inset-y-0 right-0 w-[52vw] opacity-90"
        style={{
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 42%)',
          maskImage: 'linear-gradient(to right, transparent 0%, #000 42%)',
        }}
      >
        <Campus />
      </div>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(3,6,14,0.55) 0%, rgba(3,6,14,0.0) 55%)' }} />

      {/* light streaks, top right */}
      <div className="live-streak absolute right-[3vw] top-[5vh] h-[0.55vh] w-[14vw] -skew-x-[32deg] rounded-full bg-gradient-to-r from-transparent via-sky-400/70 to-sky-300" />
      <div className="live-streak absolute right-[9vw] top-[9vh] h-[0.4vh] w-[9vw] -skew-x-[32deg] rounded-full bg-gradient-to-r from-transparent via-sky-500/60 to-sky-300/90" style={{ animationDelay: '-2s' }} />
      <div className="live-streak absolute right-[1vw] top-[12vh] h-[0.35vh] w-[7vw] -skew-x-[32deg] rounded-full bg-gradient-to-r from-transparent to-blue-300/80" style={{ animationDelay: '-4s' }} />

      {/* fine scan lines + vignette */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)' }}
      />
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 12vw rgba(1,3,10,0.8)' }} />
    </div>
  );
}

/** The MIT lock-up shown top-left on every screen. */
function Brand() {
  return (
    <div className="absolute left-[3cqw] top-[3.6cqh] z-10 flex items-center gap-[1.2cqw]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpg"
        alt="MIT Mysore"
        className="aspect-square h-[max(9cqh,56px)] rounded-full bg-white object-contain p-[3px] shadow-[0_0_2.4vw_rgba(245,165,36,0.45)] ring-[0.25cqw] ring-amber-400/80"
      />
      <span className="h-[7.5cqh] w-[0.14cqw] rounded-full bg-gradient-to-b from-transparent via-amber-400 to-transparent" />
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight text-white" style={{ fontSize: 'max(3.6cqh, 18px)' }}>
          MIT Mysore
        </div>
        <div className="font-medium text-slate-200/90" style={{ fontSize: 'max(2.6cqh, 13px)' }}>
          Student Attendance Tracker
        </div>
      </div>
    </div>
  );
}

function Slide({ reg, className }: { reg: Registration; className: string }) {
  const S = 'min(54cqh, 31cqw)'; // diameter of the photo circle
  return (
    <div className={`absolute inset-0 flex items-center gap-[7cqw] pl-[8cqw] pr-[4cqw] pt-[8cqh] ${className}`}>
      {/* Photo: golden concentric rings */}
      <div className="relative shrink-0 live-scale-in" style={{ width: S, height: S }}>
        <div
          className="live-spin-slow absolute rounded-full"
          style={{ inset: '-17%', border: '0.13cqw dashed rgba(245,165,36,0.5)' }}
          aria-hidden
        />
        <div
          className="live-spin-rev absolute rounded-full"
          style={{
            inset: '-10%',
            background: `conic-gradient(from 30deg, ${GOLD_LIGHT} 0 22%, transparent 22% 38%, ${GOLD} 38% 66%, transparent 66% 82%, ${GOLD_LIGHT} 82% 100%)`,
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 0.45cqw), #000 calc(100% - 0.45cqw))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 0.45cqw), #000 calc(100% - 0.45cqw))',
            filter: 'drop-shadow(0 0 1cqw rgba(245,165,36,0.7))',
          }}
          aria-hidden
        />
        <div
          className="live-ring-glow absolute rounded-full"
          style={{
            inset: '-4%',
            background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD} 45%, #B45309 75%, ${GOLD_LIGHT})`,
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 0.6cqw), #000 calc(100% - 0.6cqw))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 0.6cqw), #000 calc(100% - 0.6cqw))',
          }}
          aria-hidden
        />
        <div className="absolute inset-0 overflow-hidden rounded-full border-[0.3cqw] border-[#0a1226] bg-[#0B1B30] shadow-[0_0_4vw_rgba(0,0,0,0.6)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reg.photoUrl}
            alt={reg.name}
            className="h-full w-full object-cover"
            style={{ objectPosition: 'center 35%' }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/15 via-transparent to-black/25" />
        </div>

        {/* Student badge */}
        <div
          className="live-pop absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-[0.7cqw] rounded-full border border-amber-400/80 bg-[#0a1226] px-[1.5cqw] py-[1.1cqh] shadow-[0_0_2vw_rgba(245,165,36,0.35)]"
          style={{ bottom: '-4.2%', animationDelay: '0.5s' }}
        >
          <GraduationCap className="h-[2.6cqh] w-[2.6cqh] text-amber-400" strokeWidth={2} />
          <span className="font-bold tracking-wide text-white" style={{ fontSize: 'max(2.3cqh, 12px)' }}>
            Student
          </span>
        </div>
      </div>

      {/* Name, college, tagline */}
      <div className="min-w-0 flex-1">
        <h1
          className="live-rise pb-[0.12em] font-extrabold leading-[1.1] tracking-tight text-white line-clamp-2 break-words"
          style={{
            fontSize: `${nameSize(reg.name.length)}cqw`,
            textShadow: '0 0 2.4cqw rgba(245,165,36,0.28)',
            animationDelay: '0.2s',
          }}
        >
          {reg.name}
          <BadgeCheck
            className="ml-[0.22em] inline-block align-[-0.1em]"
            style={{ width: '0.78em', height: '0.78em' }}
            fill={GOLD}
            stroke="#FFF7E0"
            strokeWidth={1.6}
          />
        </h1>

        <div className="live-grow my-[3cqh] h-[0.25cqh] w-full max-w-[34cqw] bg-gradient-to-r from-amber-400 via-amber-400/40 to-transparent" style={{ animationDelay: '0.4s' }} />

        {reg.college && (
          <div className="live-rise flex items-center gap-[1.3cqw]" style={{ animationDelay: '0.55s' }}>
            <GraduationCap
              className="shrink-0 text-amber-400"
              style={{ width: `${Math.max(2, collegeSize(reg.college.length) * 1.5)}cqw`, height: `${Math.max(2, collegeSize(reg.college.length) * 1.5)}cqw` }}
              strokeWidth={1.8}
            />
            <span
              className="min-w-0 font-semibold leading-snug text-white line-clamp-2 break-words"
              style={{ fontSize: `${collegeSize(reg.college.length)}cqw` }}
            >
              {reg.college}
            </span>
          </div>
        )}

        <div className="live-rise mt-[5cqh] flex items-center gap-[1cqw] italic text-slate-200/80" style={{ fontSize: 'max(2.6cqh, 14px)', animationDelay: '0.7s' }}>
          <span>Learn</span>
          <span className="text-amber-400">•</span>
          <span>Grow</span>
          <span className="text-amber-400">•</span>
          <span>Excel</span>
        </div>
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
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#03060E] text-white select-none ${
        moving ? '' : 'cursor-none'
      }`}
    >
      <Backdrop />

      {/* 16:9 stage: the biggest 16:9 box that fits the screen; everything inside is sized in cqw/cqh */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 'min(100vw, 177.78vh)', height: 'min(100vh, 56.25vw)', containerType: 'size' }}
      >
      <Brand />

      <Link
        href="/admin"
        onClick={(e) => e.stopPropagation()}
        className={`absolute right-[2vw] top-[2.4vh] z-20 rounded-full border border-white/15 bg-white/10 px-[1.2vw] py-[0.8vh] text-white/90 backdrop-blur transition-opacity duration-300 hover:bg-white/20 ${
          moving ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ fontSize: 'max(1.9vh, 12px)' }}
      >
        ← Dashboard
      </Link>

      <div className="absolute inset-0">
        {previous && <Slide key={`prev-${slideKey}`} reg={previous} className="live-fade-out" />}
        {current ? (
          <Slide key={`cur-${slideKey}`} reg={current} className={previous ? 'live-fade-in' : ''} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3cqh]">
            <div className="live-pulse-ring h-[9cqh] w-[9cqh] rounded-full border-[0.5cqh] border-amber-400/70" />
            <p className="font-semibold text-white/85" style={{ fontSize: 'max(3.4cqh, 18px)' }}>
              Waiting for registration…
            </p>
          </div>
        )}
      </div>
      </div>

      <style jsx global>{`
        @keyframes liveFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes liveFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes liveScaleIn { from { opacity: 0; transform: scale(0.82); } to { opacity: 1; transform: scale(1); } }
        @keyframes liveRise {
          from { opacity: 0; transform: translateY(3vh); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes livePop { 0% { opacity: 0; transform: translateX(-50%) scale(0.6); } 70% { transform: translateX(-50%) scale(1.08); } 100% { opacity: 1; transform: translateX(-50%) scale(1); } }
        @keyframes liveGrow { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes liveSpin { to { transform: rotate(360deg); } }
        @keyframes liveRingGlow {
          0%, 100% { filter: drop-shadow(0 0 1.4vw rgba(245,165,36,0.55)); }
          50% { filter: drop-shadow(0 0 2.6vw rgba(255,215,106,0.85)); }
        }
        @keyframes liveStreak { 0% { transform: translateX(6vw) skewX(-32deg); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateX(-4vw) skewX(-32deg); opacity: 0; } }
        @keyframes livePulse { 0% { transform: scale(0.85); opacity: 0.9; } 100% { transform: scale(1.7); opacity: 0; } }

        .live-fade-in { animation: liveFadeIn 400ms ease forwards; }
        .live-fade-out { animation: liveFadeOut 400ms ease forwards; }
        .live-scale-in { animation: liveScaleIn 800ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .live-rise { opacity: 0; animation: liveRise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .live-pop { opacity: 0; animation: livePop 600ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }
        .live-grow { transform-origin: left center; opacity: 0; animation: liveGrow 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .live-spin-slow { animation: liveSpin 60s linear infinite; }
        .live-spin-rev { animation: liveSpin 24s linear infinite reverse; }
        .live-ring-glow { animation: liveRingGlow 4s ease-in-out infinite; }
        .live-streak { animation: liveStreak 6s ease-in-out infinite; }
        .live-pulse-ring { animation: livePulse 2s ease-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .live-fade-in, .live-fade-out, .live-scale-in, .live-rise, .live-pop, .live-grow,
          .live-spin-slow, .live-spin-rev, .live-ring-glow, .live-streak, .live-pulse-ring {
            animation-duration: 1ms; animation-iteration-count: 1;
          }
        }
      `}</style>
    </div>
  );
}
