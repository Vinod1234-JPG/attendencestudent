import Dexie, { type Table } from 'dexie';

export interface CachedEvent {
  id: string;
  name: string;
  event_date: string;
  timezone: string;
  status: string;
  kiosk_enabled: boolean;
  offline_allowed: boolean;
  updated_at: string;
}

export interface CachedSession {
  id: string;
  event_id: string;
  name: string;
  status: string;
  opens_at: string;
  closes_at?: string | null;
  updated_at: string;
}

export interface CachedPerson {
  id: string;
  category: 'guide' | 'phd_scholar';
  name: string;
  normalized_email?: string | null;
  phd_id?: string | null;
  metadata?: Record<string, any>;
  extra_details?: Record<string, any>;
  updated_at?: string;
}

export type SyncStatus = 'pending' | 'uploading' | 'synced' | 'failed' | 'conflict';

export interface OfflineAttendanceRecord {
  operation_id: string; // Client-generated UUID
  session_id: string;
  person_id: string;
  category: 'guide' | 'phd_scholar';
  identifier: string; // The email or PhD ID entered
  person_name: string;
  captured_at_device: string; // ISO 8601 string
  photo_blob: Blob;
  photo_mime_type: string;
  sync_status: SyncStatus;
  attempt_count: number;
  last_attempted_at?: string | null;
  last_error?: string | null;
  created_at: string;
}

export interface SyncMetadata {
  key: string;
  value: any;
  updated_at: string;
}

export class MRFDatabase extends Dexie {
  cached_events!: Table<CachedEvent, string>;
  cached_sessions!: Table<CachedSession, string>;
  cached_people!: Table<CachedPerson, string>;
  attendance_queue!: Table<OfflineAttendanceRecord, string>;
  sync_metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('MRFAttendanceDB');

    // Define tables and indexes
    this.version(1).stores({
      cached_events: 'id, status',
      cached_sessions: 'id, event_id, status',
      cached_people: 'id, category, normalized_email, phd_id',
      attendance_queue: 'operation_id, session_id, person_id, sync_status, created_at, [session_id+person_id]',
      sync_metadata: 'key',
    });
  }
}

// Global singleton instance for browser runtime
let dbInstance: MRFDatabase | null = null;

export function getOfflineDb(): MRFDatabase {
  if (typeof window === 'undefined') {
    // Return mock or dummy instance for SSR
    return new MRFDatabase();
  }
  if (!dbInstance) {
    dbInstance = new MRFDatabase();
  }
  return dbInstance;
}
