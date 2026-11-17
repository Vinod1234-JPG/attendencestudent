'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? 'Invalid credentials. Check your email and password and try again.'
            : data.error || 'Sign in failed. Please try again.'
        );
      }

      // Return to the admin page that redirected here (same-origin /admin paths only).
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next && /^\/admin(\/[\w\-\/]*)?$/.test(next) ? next : '/admin');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Sign in failed. Please try again.');
      setPassword('');
      setShakeKey((k) => k + 1);
      setIsLoading(false);
    }
  };

  const inputClass = (invalid: boolean) =>
    `w-full h-11 px-3.5 rounded-lg border bg-white text-sm text-[#182230] placeholder-[#98A2B3] outline-none transition-shadow focus:ring-2 ${
      invalid
        ? 'border-[#C0393A] focus:ring-[#C0393A]/25'
        : 'border-[#D0D5DD] focus:border-[#2864B4] focus:ring-[#2864B4]/25'
    }`;

  return (
    <main className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-5">
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="MIT Mysore"
            className="w-14 h-14 rounded-full border border-[#E4E9F0] bg-white p-0.5 mx-auto mb-4 object-contain"
          />
          <h1 className="text-lg font-bold text-[#142D4E]">Admin Sign In</h1>
          <p className="text-xs text-[#667085] mt-1">MIT Mysore Student Attendance Tracker</p>
        </div>

        <form
          key={shakeKey}
          onSubmit={handleSubmit}
          className={`bg-white border border-[#E4E9F0] rounded-2xl shadow-sm p-6 space-y-4 ${
            shakeKey > 0 ? 'login-shake' : ''
          }`}
        >
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-[#C0393A]/30 bg-[#FEF3F2] px-3.5 py-3 text-[13px] leading-snug text-[#B42318]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-[#344054] mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={!!errorMessage}
              className={inputClass(!!errorMessage)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-[#344054] mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-invalid={!!errorMessage}
                className={`${inputClass(!!errorMessage)} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-[#667085] hover:text-[#142D4E]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-lg bg-[#142D4E] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#1E4D8C] disabled:opacity-70 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Sign in <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-[#98A2B3] mt-5">
          Authorized staff only. Sign-ins are audited.
        </p>
      </div>

      <style jsx global>{`
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .login-shake { animation: login-shake 0.4s ease-in-out; }
        @media (prefers-reduced-motion: reduce) { .login-shake { animation: none; } }
      `}</style>
    </main>
  );
}
