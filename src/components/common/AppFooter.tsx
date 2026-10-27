import React from 'react';
import Link from 'next/link';

interface AppFooterProps {
  className?: string;
  variant?: 'light' | 'dark' | 'glass';
}

export function AppFooter({ className = '', variant = 'light' }: AppFooterProps) {
  const isDark = variant === 'dark';

  return (
    <footer
      className={`w-full py-4 px-6 border-t transition-colors ${
        isDark
          ? 'bg-[#0B1B30] border-[#1E293B] text-[#94A3B8]'
          : 'bg-white border-[#E4E9F0] text-[#667085]'
      } ${className}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left text-xs">
        {/* Left: Institution Branding & Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-white shadow-xs shrink-0 border border-[#E4E9F0] flex items-center justify-center p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="MRF - MITM Logo"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
          <div>
            <p className={`font-semibold tracking-tight ${isDark ? 'text-white' : 'text-[#142D4E]'}`}>
              Maharaja Research Foundation (MRF)
            </p>
            <p className="text-[11px] opacity-80">
              Maharaja Institute of Technology Mysore (MITM)
            </p>
          </div>
        </div>

        {/* Center / Right: Engineering & Powered by Vovalyx */}
        <div className="flex flex-col sm:items-end items-center gap-0.5">
          <p className="text-xs leading-relaxed">
            Engineered by{' '}
            <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-[#182230]'}`}>
              Department of Computer Science and Engineering, MITM
            </span>
          </p>
          <p className="text-[11px]">
            and powered by{' '}
            <a
              href="https://vovalyx.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#2864B4] hover:text-[#142D4E] underline underline-offset-2 transition-colors inline-flex items-center gap-1"
            >
              <span>Vovalyx</span>
              <span className="opacity-75 font-normal">(vovalyx.in)</span>
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

export default AppFooter;
