import React from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  QrCode,
  ShieldCheck,
  HardDrive,
  Users,
  Camera,
  ArrowRight,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppFooter } from '@/components/common/AppFooter';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col justify-between">
      {/* Top Bar */}
      <header className="bg-white border-b border-[#E4E9F0] px-8 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden bg-white shadow-xs shrink-0 border border-[#E4E9F0] flex items-center justify-center p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="MRF Logo" className="w-full h-full object-contain rounded-full" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#142D4E] tracking-tight">
              MAHARAJA RESEARCH FOUNDATION
            </h1>
            <p className="text-[11px] text-[#667085]">Academic Event Attendance Management</p>
          </div>
        </div>

        <Link href="/login">
          <Button variant="outline" size="sm">
            <Lock className="w-3.5 h-3.5 mr-1.5" /> Admin Login
          </Button>
        </Link>
      </header>

      {/* Main Hero */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="max-w-4xl w-full text-center space-y-8">
          <div>
            <span className="inline-block px-3.5 py-1 rounded-full text-xs font-semibold bg-[#EAF2FC] text-[#2864B4] mb-3">
              MRF Research Retreat Attendance System
            </span>
            <h2 className="text-3xl md:text-5xl font-extrabold text-[#142D4E] tracking-tight leading-tight">
              MRF Event Attendance Tracker
            </h2>
            <p className="text-sm md:text-base text-[#667085] max-w-2xl mx-auto mt-3">
              Official self-service kiosk and management system for Guides and PhD Scholars.
              Equipped with live camera verification, resilient offline caching, and automatic Supabase cloud synchronization.
            </p>
          </div>

          {/* Quick Access Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto text-left">
            <Link href="/kiosk" className="group">
              <div className="h-full bg-white border-2 border-[#E4E9F0] group-hover:border-[#2864B4] rounded-2xl p-8 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
                <div>
                  <div className="w-14 h-14 rounded-xl bg-[#EAF2FC] text-[#2864B4] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <QrCode className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-[#142D4E]">Take Attendance Kiosk</h3>
                  <p className="text-xs text-[#667085] mt-2 leading-relaxed">
                    Self-service entrance terminal for Guides (via registered email) and PhD Scholars (via official PhD ID) with live photograph capture.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-[#2864B4]">
                  <span>Launch Kiosk Terminal</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            <Link href="/login" className="group">
              <div className="h-full bg-white border-2 border-[#E4E9F0] group-hover:border-[#142D4E] rounded-2xl p-8 shadow-sm transition-all hover:shadow-md flex flex-col justify-between">
                <div>
                  <div className="w-14 h-14 rounded-xl bg-[#142D4E] text-white flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-[#142D4E]">Administrator Portal</h3>
                  <p className="text-xs text-[#667085] mt-2 leading-relaxed">
                    Real-time attendance dashboard, spreadsheet data import, CSV/Excel/ZIP export, sync queue manager, and audit logs.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-[#142D4E]">
                  <span>Open Admin Portal</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>

          {/* Institutional Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 max-w-3xl mx-auto text-left text-xs">
            <div className="flex items-start gap-3 p-4 bg-white border border-[#E4E9F0] rounded-xl shadow-xs">
              <HardDrive className="w-5 h-5 text-[#2864B4] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#182230]">Offline-First Resilience</p>
                <p className="text-[#667085] mt-0.5">Records locally via IndexedDB when network drops and auto-syncs.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-white border border-[#E4E9F0] rounded-xl shadow-xs">
              <Camera className="w-5 h-5 text-[#16835D] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#182230]">Photographic Verification</p>
                <p className="text-[#667085] mt-0.5">Real-time camera capture with secure private storage access.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-white border border-[#E4E9F0] rounded-xl shadow-xs">
              <Users className="w-5 h-5 text-[#142D4E] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[#182230]">Duplicate Prevention</p>
                <p className="text-[#667085] mt-0.5">Unique session constraints and client idempotent synchronization.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Constant Universal Footer */}
      <AppFooter />
    </div>
  );
}
