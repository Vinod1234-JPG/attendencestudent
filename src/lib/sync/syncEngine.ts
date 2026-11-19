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

const BATCH_SIZE = 20; // check-ins per sync round
const UPLOAD_CONCURRENCY = 3; // uploads at the same time
const STUCK_UPLOAD_MS = 2 * 60 * 1000; // an "uploading" check-in older than this was interrupted

/** Wait before retrying a failed check-in: 5 s, 10 s, 20 s ... up to 5 minutes. */
function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60 * 1000, 5000 * 2 ** Math.max(0, attempts - 1));
}

class SyncEngine {
  private isSyncing = false;
  private rerunRequested = false; // a check-in was queued while a round was running
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

  /**
   * Uploads queued offline check-ins.
   * - Check-ins left "uploading" by a closed tab or crash are put back in the queue (they were never retried before).
   * - Up to UPLOAD_CONCURRENCY uploads run at once. This is safe: the server treats a repeated operation_id as the
   *   same check-in, so nothing can be recorded twice.
   * - Failed check-ins wait a little longer after each failure (backoff), unless `force` (the Sync now button).
   */
  public async triggerSync(options: { force?: boolean } = {}): Promise<{ success: boolean; synced: number; failed: number }> {
    if (typeof window === 'undefined') {
      return { success: false, synced: 0, failed: 0 };
    }
    if (this.isSyncing) {
      // Do not make a new check-in wait for the next focus/online event: run again right after this round.
      this.rerunRequested = true;
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
    let moreWaiting = false;

    try {
      const db = getOfflineDb();
      const now = Date.now();

      // 1. Recover check-ins stuck in "uploading" (the tab closed mid-upload)
      const stuck = await db.attendance_queue.where('sync_status').equals('uploading').toArray();
      for (const item of stuck) {
        const last = item.last_attempted_at ? Date.parse(item.last_attempted_at) : 0;
        if (!last || now - last > STUCK_UPLOAD_MS) {
          await db.attendance_queue.update(item.operation_id, { sync_status: 'pending' });
        }
      }

      // 2. Pick what to send: everything pending, and failed ones whose wait is over
      const candidates = await db.attendance_queue
        .where('sync_status')
        .anyOf('pending', 'failed')
        .limit(BATCH_SIZE * 3)
        .toArray();
      const recordsToSync = candidates
        .filter((item) => {
          if (options.force || item.sync_status !== 'failed') return true;
          const last = item.last_attempted_at ? Date.parse(item.last_attempted_at) : 0;
          return !last || now - last >= retryDelayMs(item.attempt_count);
        })
        .slice(0, BATCH_SIZE);
      moreWaiting = candidates.length > recordsToSync.length && recordsToSync.length === BATCH_SIZE;

      const uploadOne = async (item: OfflineAttendanceRecord) => {
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
          formData.append('attendee_name', item.person_name);
          formData.append('college', item.college || item.identifier);
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
      };

      for (let i = 0; i < recordsToSync.length; i += UPLOAD_CONCURRENCY) {
        await Promise.all(recordsToSync.slice(i, i + UPLOAD_CONCURRENCY).map(uploadOne));
      }

      this.lastSyncAt = new Date();
    } catch (err: any) {
      console.error('[SyncEngine] Sync batch error:', err);
      this.lastError = err.message || 'Failed to complete synchronization batch.';
    } finally {
      this.isSyncing = false;
      await this.emitStatus();
      const again = this.rerunRequested || (moreWaiting && synced > 0);
      this.rerunRequested = false;
      if (again) setTimeout(() => this.triggerSync().catch(() => {}), 0);
    }

    return { success: failed === 0, synced, failed };
  }
}

export const syncEngine = new SyncEngine();
