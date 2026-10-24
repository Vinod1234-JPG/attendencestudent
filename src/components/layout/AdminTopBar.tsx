'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getOfflineDb } from '@/lib/db/dexie';

interface AdminTopBarProps {
  title?: string;
  eventName?: string;
}

export function AdminTopBar({
  title = 'Overview',
  eventName = 'MRF Annual Research Conclave 2026',
}: AdminTopBarProps) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    // Check initial online status
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);

      const updateOnlineStatus = () => {
        setIsOnline(navigator.onLine);
      };

      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);

      // Check Dexie pending count
      const checkPending = async () => {
        try {
          const db = getOfflineDb();
          const count = await db.attendance_queue
            .where('sync_status')
            .anyOf('pending', 'failed')
            .count();
          setPendingCount(count);
        } catch (e) {
          // ignore IndexedDB load errors during SSR or initial hydration
        }
      };

      checkPending();
      const interval = setInterval(checkPending, 5000);

      return () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
        clearInterval(interval);
      };
    }
  }, []);

  return (
    <header className="h-16 bg-white border-b border-[#E4E9F0] px-8 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* Title & Active Event */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-[#182230]">{title}</h2>
        <span className="text-[#CBD5E1]">|</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#667085]">Active Event:</span>
          <span className="text-xs font-semibold text-[#142D4E] bg-[#EAF2FC] px-2.5 py-1 rounded border border-[#2864B4]/20">
            {eventName}
          </span>
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex items-center gap-4">
        {/* Sync queue indicator */}
        <Link
          href="/admin/sync"
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            pendingCount > 0
              ? 'bg-[#B7791F]/10 text-[#B7791F] border-[#B7791F]/30 hover:bg-[#B7791F]/20'
              : 'bg-[#EEF1F5] text-[#667085] border-[#E4E9F0] hover:text-[#182230]'
          }`}
        >
          {pendingCount > 0 ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-[#B7791F]" />
              <span>{pendingCount} Pending Uploads</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16835D]" />
              <span>All Local Data Synced</span>
            </>
          )}
        </Link>

        {/* Server Connection Status */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
            isOnline
              ? 'bg-[#16835D]/10 text-[#16835D] border-[#16835D]/20'
              : 'bg-[#C0393A]/10 text-[#C0393A] border-[#C0393A]/20'
          }`}
        >
          {isOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#16835D] animate-pulse"></span>
              <Wifi className="w-3.5 h-3.5" />
              <span>Online</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[#C0393A]"></span>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Mode</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
