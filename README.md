# MRF Event Attendance Tracker
**Organization:** Maharaja Research Foundation (MRF)  
**System Type:** Production-ready Self-Service Attendance Kiosk & Administrator Portal (Online & Offline Enabled)

---

## 1. Executive Summary & Objective

The **MRF Event Attendance Tracker** is an academic event management solution engineered specifically for the Maharaja Research Foundation. The system handles attendance check-ins for two primary attendee categories:

1. **Guides** (identified by their registered email address)
2. **PhD Scholars** (identified by their official MRF-issued PhD ID, preserving leading zeros and formatting)

Attendees use a touch-friendly self-service entrance kiosk (`/kiosk`) to check in, verify registered details, capture a live photograph via camera (`getUserMedia`), preview the photograph, and confirm attendance.

The system is built **offline-first**:
- **Primary Cloud Backend:** Supabase PostgreSQL with Row Level Security (RLS) and a private Supabase Storage bucket (`mrf-attendance-photos`).
- **Offline Resilience:** IndexedDB (via Dexie) with full schemas for cached events, sessions, attendees, photograph Blobs, and a persistent synchronization queue.
- **Service Worker:** Application shell caching (`/sw.js`) and asset pre-caching for uninterrupted kiosk operation during network dropouts.
- **Durable Sync Engine:** Idempotent, conflict-aware synchronization that automatically reconciles local records when network connectivity returns, plus manual **Sync Now** controls and emergency offline recovery exports.

---

## 2. Key Technology Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS (academic palette), Lucide Icons.
- **Backend & Persistence:** Supabase PostgreSQL, Supabase Auth, Supabase Storage (Private Bucket), Server Route Handlers.
- **Offline & Storage:** IndexedDB (Dexie 4.x), Service Worker (PWA application shell caching), Blob photograph persistence.
- **Spreadsheets & Archives:** SheetJS (`xlsx`) for CSV/Excel parsing and formula injection sanitization; JSZip for photographic archives with manifests.
- **Testing:** Vitest 5.x test runner with unit tests for identifier normalization, duplicate detection, and spreadsheet sanitization.

---

## 3. UI Design System & Academic Color Palette

The interface adheres to an academic color palette:
- **Primary Navy:** `#142D4E` (Headings, primary buttons, branding)
- **Dark Navy:** `#0B1B30` (Sidebar backgrounds, camera frames)
- **Primary Blue:** `#2864B4` (Interactive accents, focus states, links)
- **Light Blue:** `#EAF2FC` (Badges, active states, cards)
- **Main Background:** `#F7F9FC`
- **Card Background:** `#FFFFFF`
- **Primary Text:** `#182230`
- **Secondary Text:** `#667085`
- **Border:** `#E4E9F0`
- **Semantic Success:** `#16835D`
- **Semantic Warning:** `#B7791F`
- **Semantic Error:** `#C0393A`

---

## 4. Application Routes

### Public & Kiosk Routes
| Route | Purpose |
|---|---|
| `/` | Landing page with direct links to Kiosk and Administrator portal |
| `/kiosk` | Full touch-friendly attendance kiosk (7-step workflow) |
| `/kiosk/ready` | Offline readiness audit and authorized data download |
| `/offline` | Dedicated offline status page with recovery guidance |
| `/login` | Administrator login (Supabase Auth / audited dev fallback) |

### Administrator Protected Routes (`/admin/*`)
| Route | Purpose |
|---|---|
| `/admin` | Real-time operations dashboard, attendance rates, recent check-ins |
| `/admin/attendance` | Searchable attendance records, filters, signed photo thumbnails & modal |
| `/admin/import` | 5-stage CSV / Excel import wizard with duplicate detection & templates |
| `/admin/exports` | CSV, Excel, Photos ZIP with manifest, and Offline Recovery export |
| `/admin/event` | Event configuration, session status (open/closed), kiosk toggle, retention |
| `/admin/sync` | Offline sync queue manager, retry failed items, conflict reconciliation |
| `/admin/audit` | Comprehensive system audit log with outcome filters |

---

## 5. Supabase Setup & Database Migrations

### Step 1: Execute SQL Migrations
1. Open your Supabase Dashboard -> **SQL Editor**.
2. Run the migration script located at `supabase/migrations/00001_initial_schema.sql`:
   - Provisions `profiles`, `events`, `event_sessions`, `people`, `attendance_records`, `attendance_photos`, `import_batches`, `import_errors`, `audit_logs`, and `sync_conflicts`.
   - Enables Row Level Security (RLS) policies on all tables.
   - Enforces unique constraints:
     - `UNIQUE(session_id, person_id)` preventing duplicate attendance.
     - `UNIQUE(normalized_email)` for Guides.
     - `UNIQUE(phd_id)` for PhD Scholars.
3. Run the storage migration script at `supabase/migrations/00002_storage_setup.sql`:
   - Creates the private storage bucket `mrf-attendance-photos` (max 5 MB per image, private access only).
4. Run `supabase/seed.sql`:
   - Seeds the default **MRF Annual Research Conclave 2026** event and initial active check-in session.

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env.local` and add your real Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ORGANIZATION_NAME="Maharaja Research Foundation"
NEXT_PUBLIC_APP_TITLE="MRF Event Attendance Tracker"
```

---

## 6. Administrator Account Setup

### Production Supabase Auth Account
1. In Supabase Dashboard -> **Authentication** -> **Users** -> **Add User**.
2. Enter email (e.g. `admin@mrf.org`) and a strong password.
3. In SQL Editor, grant the admin role:
   ```sql
   INSERT INTO public.profiles (id, role, full_name)
   VALUES ('<AUTH_USER_UUID>', 'admin', 'MRF Administrator')
   ON CONFLICT (id) DO UPDATE SET role = 'admin';
   ```

### Development Fallback Mode
When running in local development before connecting a live Supabase cloud project, the application includes a secure dev administrator credential:
- **Email:** `admin@mrf.org`
- **Password:** `MRF@Conclave2026`
*(All logins are logged in the audit trail).*

---

## 7. Attendee Check-In Workflow (Kiosk)

1. **Category Selection:** Attendee selects **Guide** or **PhD Scholar**.
2. **Identifier Lookup:**
   - **Guide:** Enters registered email address. System trims whitespace and normalizes to lowercase.
   - **PhD Scholar:** Enters official MRF PhD ID. System preserves leading zeros and standardizes formatting.
   - *(Queries Supabase when online; queries local IndexedDB `cached_people` when offline).*
3. **Identity Confirmation:** Shows registered name, category, masked identifier (`j***e@domain.com` or `MR***42`), and session name.
4. **Camera Capture:**
   - Opens live camera via `navigator.mediaDevices.getUserMedia`.
   - Real-time video preview with face positioning guide.
   - Click **Capture Photo** to grab the frame and immediately release media tracks.
5. **Photo Preview & Inspection:** Attendee inspects the photograph. Options: **Retake Photo**, **Cancel**, or **Confirm & Submit Attendance**.
6. **Persistence:**
   - **Online:** Photo uploads to private Supabase Storage (`photos/{sessionId}/{personId}_{operationId}.jpg`), record inserted with `operation_id` for idempotency.
   - **Offline:** Photo stored as a Blob in IndexedDB `attendance_queue` with unique `operation_id` and capture timestamp.
7. **Success Display:**
   - Online: Green badge *"Attendance Recorded Successfully"*.
   - Offline: Amber badge *"Attendance Saved on This Device — Waiting to sync"*.
8. **Auto-Reset:** Automatically resets back to the welcome screen after 8 seconds, or immediately via *"Start Next Attendance"*. Previous attendee data is completely wiped from view.

---

## 8. Offline Mode & Synchronization Architecture

### How to Prepare Kiosks Before an Event
1. Ensure the kiosk laptop/tablet is connected to the internet before doors open.
2. Visit `/kiosk/ready` (or click "Prep Offline" in the top bar).
3. Click **"Download Data for Offline Use"**.
4. The system queries `/api/kiosk/prep-offline`, downloads active event details, open session details, and all registered Guides & Scholars into IndexedDB.
5. The system performs an immediate read-back verification and marks the status **Ready for Offline Kiosk**.

### What Happens During Network Disconnection
- Kiosk continues operating seamlessly. Attendee lookups run against IndexedDB.
- Photographs are stored as Blobs in the local database.
- A persistent queue entry is created with status `pending`.
- Interface clearly shows *"Offline Mode Active"* and *"Attendance Saved on This Device"*. No false server confirmations are presented.

### Automatic and Manual Synchronization
- When internet connectivity returns, `window.addEventListener('online')` automatically triggers `syncEngine.triggerSync()`.
- Sync also triggers on app startup, focus, or via the **Sync Now** button at `/admin/sync`.
- The synchronization engine:
  - Validates network reachability.
  - Sends records with client-generated `operation_id` to `/api/sync/upload`.
  - Server checks duplicate uniqueness `(session_id, person_id)`. If an identical operation is re-sent, it returns idempotent success. If a conflicting check-in occurred on another terminal, it records a conflict in `sync_conflicts` for administrator review.
  - Uploads photo to private storage and writes attendance record.
  - Marks local item as `synced`.

### Emergency Offline Recovery Export
If a device suffers hardware or permanent network failure and cannot connect to Supabase:
1. Open `/admin/exports`.
2. Under **Emergency Offline Recovery Export**, click **"Export Local Device Attendance"**.
3. The browser generates a ZIP package containing:
   - `local_photos/`: Raw captured photograph files.
   - `recovery_manifest.json`: Full metadata, capture timestamps, and operation IDs.
   - `RECOVERY_NOTICE.txt`: Institutional provenance documentation.

---

## 9. MRF Data Import Guidelines

- **Supported formats:** `.csv` and `.xlsx`
- **Guides Import Columns:**
  - `name` (Attendee full name)
  - `email` (Registered email address)
- **PhD Scholars Import Columns:**
  - `name` (Attendee full name)
  - `phd_id` (Official MRF PhD ID, e.g. `MRF-PHD-2026-001`)
- **Downloadable Templates:** Available directly from `/admin/import` or in `/public/templates/`.
- **Validation Features:**
  - Detects duplicate identifiers within the upload file.
  - Detects duplicate identifiers against existing database records.
  - Skips empty rows cleanly.
  - Provides a 5-row preview and downloadable error reports before committing.

---

## 10. Local Development & Testing Instructions

### Run Locally
```bash
# 1. Install dependencies (if not already installed)
npm install

# 2. Run unit tests
npm test

# 3. Run production build check
npm run build

# 4. Start local development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 11. Practical Pre-Event Checklist for MRF Staff

- [ ] **1. Supabase Project Ready:** Migrations and storage scripts applied. RLS policies active.
- [ ] **2. Attendee Data Uploaded:** Guides and PhD Scholars imported via `/admin/import`.
- [ ] **3. Kiosk Hardware Setup:** Touch terminal / laptop positioned at entrance with webcam facing attendee.
- [ ] **4. Camera Permission Granted:** Open `/kiosk` and verify browser camera permission is allowed.
- [ ] **5. Offline Data Prepared:** Navigate to `/kiosk/ready` and click *"Download Data for Offline Use"*. Verify green *"Ready for Offline Kiosk"* badge.
- [ ] **6. Test Online Check-in:** Run one test check-in with a sample attendee. Confirm photograph and record in `/admin/attendance`.
- [ ] **7. Test Disconnection:** Disconnect Wi-Fi. Verify kiosk records attendance locally with *"Attendance Saved on This Device"*.
- [ ] **8. Test Sync:** Reconnect Wi-Fi. Check `/admin/sync` and confirm the pending record syncs automatically to Supabase.
- [ ] **9. Full Screen / Kiosk Mode:** Press `F11` on browser for clean, borderless kiosk presentation.
- [ ] **10. Post-Event Export:** After conclave closes, navigate to `/admin/exports` and download the Combined Attendance Excel workbook and Photographs ZIP archive for institutional archives.
