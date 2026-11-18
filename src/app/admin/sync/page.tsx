'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ArrowRight,
  Database,
  Camera,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getOfflineDb, OfflineAttendanceRecord } from '@/lib/db/dexie';
import { syncEngine, SyncEngineStatus } from '@/lib/sync/syncEngine';

export default function SyncStatusPage() {
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>({
    isSyncing: false,
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    conflictCount: 0,
    lastSyncAt: null,
    lastError: null,
  });
  const [queueItems, setQueueItems] = useState<OfflineAttendanceRecord[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  const loadQueue = async () => {
    try {
      const db = getOfflineDb();
      const items = await db.attendance_queue.orderBy('created_at').reverse().toArray();
      setQueueItems(items);

      // Fetch server conflicts if online
      if (navigator.onLine) {
        const res = await fetch('/api/sync/conflicts');
        const data = await res.json();
        if (data.success) {
          setConflicts(data.conflicts || []);
        }
      }
    } catch (e) {
      console.warn('Queue load error:', e);
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus(status);
      loadQueue();
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    loadQueue();

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSyncNow = async () => {
    await syncEngine.triggerSync({ force: true });
    await loadQueue();
  };

  const handleRetryItem = async (operationId: string) => {
    const db = getOfflineDb();
    await db.attendance_queue.update(operationId, {
      sync_status: 'pending',
      last_error: null,
    });
    await syncEngine.triggerSync({ force: true });
    await loadQueue();
  };

  const handleResolveConflict = async (conflictId: string, action: 'accept' | 'ignore') => {
    try {
      const res = await fetch('/api/sync/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflict_id: conflictId, resolution_action: action }),
      });
      if (res.ok) {
        await loadQueue();
      }
    } catch (e) {
      alert('Failed to resolve conflict.');
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#142D4E]">Offline Synchronization Status</h1>
          <p className="text-xs text-[#667085] mt-1">
            Monitor the durable synchronization queue, review duplicate conflicts, and trigger manual sync.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isOnline
                ? 'bg-[#16835D]/10 text-[#16835D] border-[#16835D]/20'
                : 'bg-[#C0393A]/10 text-[#C0393A] border-[#C0393A]/20'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Server Reachable</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline — Sync Paused</span>
              </>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSyncNow}
            isLoading={syncStatus.isSyncing}
            disabled={!isOnline}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync Now
          </Button>
        </div>
      </div>

      {/* Sync Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[#B7791F] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Pending Uploads
            </span>
            <p className="text-2xl font-bold text-[#142D4E] mt-2">{syncStatus.pendingCount}</p>
            <p className="text-[10px] text-[#667085] mt-1">In local IndexedDB queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[#16835D] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Synced to Server
            </span>
            <p className="text-2xl font-bold text-[#16835D] mt-2">{syncStatus.syncedCount}</p>
            <p className="text-[10px] text-[#667085] mt-1">Confirmed with photos</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[#C0393A] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Failed Attempts
            </span>
            <p className="text-2xl font-bold text-[#C0393A] mt-2">{syncStatus.failedCount}</p>
            <p className="text-[10px] text-[#667085] mt-1">Eligible for auto-retry</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[#142D4E] flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[#B7791F]" /> Conflicts Flagged
            </span>
            <p className="text-2xl font-bold text-[#142D4E] mt-2">
              {conflicts.filter((c) => c.status === 'pending_review').length}
            </p>
            <p className="text-[10px] text-[#667085] mt-1">Requires review</p>
          </CardContent>
        </Card>
      </div>

      {/* Conflicts Section (if any exist) */}
      {conflicts.length > 0 && (
        <Card className="border-[#B7791F]/30 bg-[#FFFDF5]">
          <CardHeader>
            <CardTitle className="text-base text-[#B7791F] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Synchronization Conflicts Requiring Review
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#B7791F]/10 text-[#B7791F] font-semibold border-b border-[#B7791F]/20">
                  <tr>
                    <th className="px-6 py-3">Attendee</th>
                    <th className="px-6 py-3">Conflict Type</th>
                    <th className="px-6 py-3">Device Capture</th>
                    <th className="px-6 py-3">Server Receipt</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E9F0]">
                  {conflicts.map((c) => (
                    <tr key={c.id}>
                      <td className="px-6 py-3 font-bold text-[#182230]">
                        {c.people?.name || c.metadata?.personName || 'Unknown'}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="warning">{c.conflict_type}</Badge>
                      </td>
                      <td className="px-6 py-3 text-[#667085]">
                        {new Date(c.client_captured_at).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3 text-[#667085]">
                        {new Date(c.server_received_at).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={c.status === 'pending_review' ? 'warning' : 'neutral'}
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right space-x-2">
                        {c.status === 'pending_review' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResolveConflict(c.id, 'ignore')}
                            >
                              Ignore
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleResolveConflict(c.id, 'accept')}
                            >
                              Accept
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Local Queue Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-[#2864B4]" /> Local Queue Operations (IndexedDB)
          </CardTitle>
          <span className="text-xs text-[#667085]">Total stored: {queueItems.length}</span>
        </CardHeader>
        <CardContent className="p-0">
          {queueItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#667085]">
              No local attendance records currently in queue.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] text-[#667085] border-b border-[#E4E9F0]">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Attendee Name</th>
                    <th className="px-6 py-3 font-semibold">College</th>
                    <th className="px-6 py-3 font-semibold">Capture Timestamp</th>
                    <th className="px-6 py-3 font-semibold">Attempts</th>
                    <th className="px-6 py-3 font-semibold">Sync Status</th>
                    <th className="px-6 py-3 font-semibold">Error / Note</th>
                    <th className="px-6 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E9F0]">
                  {queueItems.map((item) => (
                    <tr key={item.operation_id} className="hover:bg-[#F7F9FC]/60">
                      <td className="px-6 py-3 font-bold text-[#182230]">
                        {item.person_name}
                      </td>
                      <td className="px-6 py-3">{item.college || item.identifier}</td>
                      <td className="px-6 py-3 text-[#667085]">
                        {new Date(item.captured_at_device).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3 font-mono">{item.attempt_count}</td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={
                            item.sync_status === 'synced'
                              ? 'success'
                              : item.sync_status === 'pending'
                              ? 'warning'
                              : item.sync_status === 'failed'
                              ? 'error'
                              : 'neutral'
                          }
                        >
                          {item.sync_status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-[#C0393A] max-w-xs truncate">
                        {item.last_error || '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {item.sync_status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetryItem(item.operation_id)}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
