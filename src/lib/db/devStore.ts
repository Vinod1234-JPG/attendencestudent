import fs from 'fs';
import path from 'path';

export interface DevAttendeeRecord {
  id: string;
  operation_id: string;
  captured_at_device: string;
  received_at_server: string;
  status: string;
  session_name: string;
  attendee: {
    id: string;
    name: string;
    category: 'guide' | 'phd_scholar' | 'student';
    identifier: string;
    extra_details?: Record<string, any>;
  };
  photo: {
    available: boolean;
    signed_url: string; // Base64 data URL in dev mode
    file_size: number;
    content_type: string;
  };
}

export interface DevPerson {
  id: string;
  name: string;
  category: 'guide' | 'phd_scholar' | 'student';
  normalized_email?: string | null;
  phd_id?: string | null;
  college?: string | null;
  student_key?: string | null;
  created_at?: string;
  metadata?: Record<string, any>;
}

const DATA_FILE = path.join(process.cwd(), '.dev_persistence.json');

interface DevStorage {
  attendanceRecords: DevAttendeeRecord[];
  people: DevPerson[];
}

function loadStorage(): DevStorage {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('Could not read dev persistence file:', e);
  }

  // Initial Seed Data
  return {
    attendanceRecords: [],
    people: [
      {
        id: 'dev-guide-1',
        name: 'Prof. R. Natarajan',
        category: 'guide',
        normalized_email: 'r.natarajan@mrf.org',
        metadata: {
          Department: 'Commerce & Management',
          Institution: 'Maharaja Research Foundation',
          Designation: 'Professor & Research Guide',
        },
      },
      {
        id: 'dev-guide-2',
        name: 'Dr. Sunita Kulkarni',
        category: 'guide',
        normalized_email: 's.kulkarni@mrf.org',
        metadata: {
          Department: 'Economics & Commerce',
          Institution: 'Central University',
          Designation: 'Associate Professor',
        },
      },
      {
        id: 'dev-scholar-1',
        name: 'Aditya Verma',
        category: 'phd_scholar',
        phd_id: 'MRF-PHD-2026-001',
        metadata: {
          Department: 'Commerce & Banking',
          Guide: 'Prof. R. Natarajan',
          Topic: 'Digital Payment Adoption in Rural Economies',
        },
      },
      {
        id: 'dev-scholar-2',
        name: 'Deepika Sharma',
        category: 'phd_scholar',
        phd_id: 'MRF-PHD-2026-002',
        metadata: {
          Department: 'Commerce & Accountancy',
          Guide: 'Dr. Sunita Kulkarni',
          Topic: 'Forensic Accounting Practices in Emerging Markets',
        },
      },
    ],
  };
}

function saveStorage(storage: DevStorage) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storage, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not write dev persistence file:', e);
  }
}

export function getDevStorage(): DevStorage {
  return loadStorage();
}

export function addDevAttendanceRecord(record: DevAttendeeRecord) {
  const store = loadStorage();
  // Filter out duplicate if same person or operation
  store.attendanceRecords = [
    record,
    ...store.attendanceRecords.filter(
      (r) => r.operation_id !== record.operation_id && r.attendee.id !== record.attendee.id
    ),
  ];
  saveStorage(store);
}

export function removeDevAttendanceRecord(idOrPersonId: string): boolean {
  const store = loadStorage();
  const initialLen = store.attendanceRecords.length;
  store.attendanceRecords = store.attendanceRecords.filter(
    (r) =>
      r.id !== idOrPersonId &&
      r.attendee.id !== idOrPersonId &&
      r.operation_id !== idOrPersonId
  );
  if (store.attendanceRecords.length !== initialLen) {
    saveStorage(store);
    return true;
  }
  return false;
}

export function addDevPeople(newPeople: DevPerson[]) {
  const store = loadStorage();
  const existingMap = new Map(store.people.map((p) => [p.id, p]));
  for (const p of newPeople) {
    existingMap.set(p.id, p);
  }
  store.people = Array.from(existingMap.values());
  saveStorage(store);
}
