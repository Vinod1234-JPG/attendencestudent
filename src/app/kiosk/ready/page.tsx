'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Database,
  ArrowLeft,
  GraduationCap,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getOfflineDb } from '@/lib/db/dexie';

export default function OfflineReadyPage() {
  const [isPreparing, setIsPreparing] = useState(false);
  const [guideCount, setGuideCount] = useState(0);
  const [scholarCount, setScholarCount] = useState(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshCounts = async () => {
    try {
      const db = getOfflineDb();
      const guides = await db.cached_people.where('category').equals('guide').count();
      const scholars = await db.cached_people.where('category').equals('phd_scholar').count();
      const pending = await db.attendance_queue.where('sync_status').equals('pending').count();
      const meta = await db.sync_metadata.get('last_dataset_sync');

      setGuideCount(guides);
      setScholarCount(scholars);
      setPendingSyncCount(pending);
      setLastSyncDate(meta ? meta.value : null);

      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        setStorageEstimate({
          usage: est.usage || 0,
          quota: est.quota || 0,
        });
      }
    } catch (e: any) {
      console.warn('Could not read IndexedDB counts:', e);
    }
  };

  useEffect(() => {
    refreshCounts();
  }, []);

  const handlePrepareOffline = async () => {
    setIsPreparing(true);
    setStatusMessage('Connecting to server to fetch registered attendee records...');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/kiosk/prep-offline');
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to download offline attendee dataset.');
      }

      setStatusMessage('Storing event and attendee records into IndexedDB...');
      const db = getOfflineDb();

      // Clear existing cached dataset safely
      await db.cached_events.clear();
      await db.cached_sessions.clear();
      await db.cached_people.clear();

      // Insert event & session
      if (data.event) await db.cached_events.put(data.event);
      if (data.session) await db.cached_sessions.put(data.session);

      // Bulk insert people
      if (data.people && data.people.length > 0) {
        await db.cached_people.bulkPut(data.people);
      }

      const syncTime = new Date().toISOString();
      await db.sync_metadata.put({
        key: 'last_dataset_sync',
        value: syncTime,
        updated_at: syncTime,
      });

      // Verification: read back from IndexedDB
      const verifyCount = await db.cached_people.count();
      if (verifyCount !== data.people.length) {
        throw new Error('Local verification mismatch: Some records were not persisted in IndexedDB.');
      }

      setStatusMessage(`Offline preparation complete! ${verifyCount} attendees safely cached locally.`);
      await refreshCounts();
    } catch (err: any) {
      console.error('Offline preparation error:', err);
      setErrorMessage(err.message || 'Offline preparation failed.');
    } finally {
      setIsPreparing(false);
    }
  };

  const isReady = guideCount + scholarCount > 0;

  return (
    <div className="min-h-screen bg-[#F7F9FC] p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/kiosk"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-[#142D4E] mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Kiosk
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#142D4E]">
              Kiosk Offline Readiness & Preparation
            </h1>
            <p className="text-sm text-[#667085] mt-1">
              Verify local dataset cache and download offline attendee information for seamless operation.
            </p>
          </div>
          <div
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 ${
              isReady
                ? 'bg-[#16835D]/10 text-[#16835D] border-[#16835D]/20'
                : 'bg-[#B7791F]/10 text-[#B7791F] border-[#B7791F]/20'
            }`}
          >
            {isReady ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Ready for Offline Kiosk</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Preparation Needed</span>
              </>
            )}
          </div>
        </div>

        {/* Status Messages */}
        {statusMessage && (
          <div className="mb-6 p-4 bg-[#16835D]/10 border border-[#16835D]/20 text-[#16835D] rounded-lg text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 p-4 bg-[#C0393A]/10 border border-[#C0393A]/20 text-[#C0393A] rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="py-3 px-4">
              <span className="text-xs text-[#667085] font-semibold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#2864B4]" /> Cached Guides
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <p className="text-3xl font-extrabold text-[#142D4E]">{guideCount}</p>
              <p className="text-[11px] text-[#667085] mt-1">Stored in IndexedDB</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <span className="text-xs text-[#667085] font-semibold flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#2864B4]" /> Cached PhD Scholars
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <p className="text-3xl font-extrabold text-[#142D4E]">{scholarCount}</p>
              <p className="text-[11px] text-[#667085] mt-1">Stored in IndexedDB</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <span className="text-xs text-[#667085] font-semibold flex items-center gap-1.5">
                <Database className="w-4 h-4 text-[#B7791F]" /> Pending Sync Queue
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <p className="text-3xl font-extrabold text-[#142D4E]">{pendingSyncCount}</p>
              <p className="text-[11px] text-[#667085] mt-1">Locally recorded records</p>
            </CardContent>
          </Card>
        </div>

        {/* Readiness Checklist Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#2864B4]" />
              Offline System Checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-[#E4E9F0]">
              <div>
                <p className="text-sm font-semibold text-[#182230]">Service Worker Application Shell</p>
                <p className="text-xs text-[#667085]">Caches kiosk interface assets for offline access</p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#16835D]/10 text-[#16835D]">
                Active
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#E4E9F0]">
              <div>
                <p className="text-sm font-semibold text-[#182230]">IndexedDB Local Storage</p>
                <p className="text-xs text-[#667085]">
                  {storageEstimate
                    ? `${(storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB used of ${(storageEstimate.quota / (1024 * 1024)).toFixed(0)} MB available`
                    : 'Available'}
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#16835D]/10 text-[#16835D]">
                Available
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-semibold text-[#182230]">Last Dataset Synchronization</p>
                <p className="text-xs text-[#667085]">
                  {lastSyncDate ? new Date(lastSyncDate).toLocaleString() : 'Never Prepared'}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  lastSyncDate
                    ? 'bg-[#16835D]/10 text-[#16835D]'
                    : 'bg-[#B7791F]/10 text-[#B7791F]'
                }`}
              >
                {lastSyncDate ? 'Synced' : 'Action Required'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            size="lg"
            onClick={refreshCounts}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Status
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handlePrepareOffline}
            isLoading={isPreparing}
            className="shadow-sm"
          >
            <DownloadCloud className="w-5 h-5 mr-2" />
            Download Data for Offline Use
          </Button>
        </div>
      </div>
    </div>
  );
}
