import React from 'react';
import Link from 'next/link';
import { WifiOff, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflineLandingPage() {
  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-[#B7791F]/10 text-[#B7791F] flex items-center justify-center mb-6">
        <WifiOff className="w-8 h-8" />
      </div>

      <h1 className="text-2xl md:text-3xl font-extrabold text-[#142D4E] tracking-tight">
        Operating in Offline Mode
      </h1>

      <p className="text-sm text-[#667085] mt-2 max-w-md">
        The application is currently disconnected from the internet. The self-service attendance kiosk continues to function locally using cached records.
      </p>

      <div className="my-8 p-6 bg-white border border-[#E4E9F0] rounded-xl max-w-md text-left space-y-3 shadow-sm">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#16835D] shrink-0 mt-0.5" />
          <p className="text-xs text-[#182230]">
            <strong className="font-semibold">Local Attendance Recording:</strong> Attendee lookup, camera capture, and photo storage operate uninterrupted on this device.
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <RefreshCw className="w-5 h-5 text-[#2864B4] shrink-0 mt-0.5" />
          <p className="text-xs text-[#182230]">
            <strong className="font-semibold">Automatic Synchronization:</strong> All offline records are stored in a persistent local queue and will sync to Supabase once connectivity returns.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/kiosk">
          <Button variant="primary" size="lg" className="w-full sm:w-auto">
            Open Attendance Kiosk <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
        <Link href="/kiosk/ready">
          <Button variant="outline" size="lg" className="w-full sm:w-auto">
            Check Local Storage Status
          </Button>
        </Link>
      </div>
    </div>
  );
}
