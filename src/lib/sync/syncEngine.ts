import { getOfflineDb, OfflineAttendanceRecord, SyncStatus } from '../db/dexie';

export interface SyncEngineStatus {
  isSyncing: boolean;
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncAt: Date | null;
  lastError: string | null;
}

type SyncListener = (status: SyncEngineStatus) => void;

class SyncEngine {
  private isSyncing = false;
  private listeners: Set<SyncListener> = new Set();
  private lastSyncAt: Date | null = null;
  private lastError: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network connection restored. Triggering auto-sync...');
        this.triggerSync();
      });

      window.addEventListener('focus', () => {
        this.triggerSync();
      });
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.emitStatus();
    return () => this.listeners.delete(listener);
  }

  private async emitStatus() {
    if (typeof window === 'undefined') return;
    try {
      const db = getOfflineDb();
      const pendingCount = await db.attendance_queue.where('sync_status').equals('pending').count();
      const syncedCount = await db.attendance_queue.where('sync_status').equals('synced').count();
      const failedCount = await db.attendance_queue.where('sync_status').equals('failed').count();
      const conflictCount = await db.attendance_queue.where('sync_status').equals('conflict').count();

      const status: SyncEngineStatus = {
        isSyncing: this.isSyncing,
        pendingCount,
        syncedCount,
        failedCount,
        conflictCount,
        lastSyncAt: this.lastSyncAt,
        lastError: this.lastError,
      };

      this.listeners.forEach((l) => l(status));
    } catch (e) {
      // Ignore during unmount or init
    }
  }

  public async triggerSync(): Promise<{ success: boolean; synced: number; failed: number }> {
    if (this.isSyncing || typeof window === 'undefined') {
      return { success: false, synced: 0, failed: 0 };
    }

    // Verify online state
    if (!navigator.onLine) {
      console.log('[SyncEngine] Offline; sync postponed.');
      return { success: false, synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.emitStatus();

    let synced = 0;
    let failed = 0;

    try {
      const db = getOfflineDb();
      // Fetch operations needing sync
      const recordsToSync = await db.attendance_queue
        .where('sync_status')
        .anyOf('pending', 'failed')
        .limit(20)
        .toArray();

      for (const item of recordsToSync) {
        try {
          // Update status to 'uploading'
          await db.attendance_queue.update(item.operation_id, {
            sync_status: 'uploading',
            attempt_count: item.attempt_count + 1,
            last_attempted_at: new Date().toISOString(),
          });
          await this.emitStatus();

          // Prepare form data
          const formData = new FormData();
          formData.append('operation_id', item.operation_id);
          formData.append('session_id', item.session_id);
          formData.append('person_id', item.person_id);
          formData.append('category', item.category);
          formData.append('identifier', item.identifier);
          formData.append('captured_at_device', item.captured_at_device);
          formData.append('photo', item.photo_blob, `${item.operation_id}.jpg`);

          const response = await fetch('/api/sync/upload', {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();

          if (response.ok && result.success) {
            await db.attendance_queue.update(item.operation_id, {
              sync_status: 'synced',
              last_error: null,
            });
            synced++;
          } else if (result.conflict) {
            await db.attendance_queue.update(item.operation_id, {
              sync_status: 'conflict',
              last_error: result.message || 'Duplicate conflict detected',
            });
            failed++;
          } else {
            throw new Error(result.error || `Server responded with ${response.status}`);
          }
        } catch (itemErr: any) {
          console.warn(`[SyncEngine] Item ${item.operation_id} failed:`, itemErr.message);
          await db.attendance_queue.update(item.operation_id, {
            sync_status: 'failed',
            last_error: itemErr.message,
          });
          failed++;
        }
      }

      this.lastSyncAt = new Date();
    } catch (err: any) {
      console.error('[SyncEngine] Sync batch error:', err);
      this.lastError = err.message || 'Failed to complete synchronization batch.';
    } finally {
      this.isSyncing = false;
      await this.emitStatus();
    }

    return { success: failed === 0, synced, failed };
  }
}

export const syncEngine = new SyncEngine();
