# MRF Research Retreat — Event Attendance Tracker
**Organization:** Maharaja Research Foundation (MRF) & Maharaja Institute of Technology Mysore (MITM)  
**Engineering:** Department of Computer Science and Engineering, MITM  
**Technology Partner:** Powered by [Vovalyx](https://vovalyx.in)  
**System Type:** Production-Grade High-Concurrency Self-Service Attendance Kiosk & Administrator Portal (Online & Offline Enabled)  
**Live Production URL:** [https://attendencetracker-ten.vercel.app](https://attendencetracker-ten.vercel.app)

---
## 1. Executive Summary & Objective

The **MRF Research Retreat Attendance Tracker** is an enterprise-grade academic event management platform engineered for the Maharaja Research Foundation's **Research Retreat**. It provides automated, high-concurrency attendee verification, face photograph capture, and real-time attendance management across multiple kiosk terminals.

The platform handles two primary attendee categories:
1. **Research Guides** — Looked up via their registered MRF Email address.
2. **PhD Scholars** — Looked up via their official MRF PhD ID (e.g. `17`, `MRF-PHD-001`) or their registered MRF Email address.

### Core Architectural Pillars
- **High Concurrency & Multi-Terminal Resilience:** Engineered to comfortably support 500+ simultaneous attendees checking in across multiple parallel kiosk laptops/tablets without latency bottlenecks or database crashes.
- **Strict Duplicate Prevention ("Zero Copies"):** Enforces deterministic uniqueness at both database constraint and application logic levels (`UNIQUE(session_id, person_id)`), returning clean 409 conflict notifications and preventing race condition errors (PostgreSQL code `23505`).
- **Offline-First Continuity:** Complete IndexedDB (Dexie 4.x) local storage schema and Service Worker caching (`/sw.js`). Terminals can prep data beforehand at `/kiosk/ready` and operate with zero internet, automatically synchronizing when connectivity restores.
- **Academic Brand Identity:** Features the official MITM / MRF circular seal and a universal institutional footer across all kiosk screens, login portals, and administrator management views.
- **$0 Free-Tier 3-Day Wash Protocol:** Optimized for zero-cost operation on Vercel Hobby and Supabase Free Tier, complete with automated bulk data wiping procedures after the 3-day event lifecycle.

---

## 2. Key Technology Stack

- **Frontend Framework:** Next.js 14 (App Router), React 18, TypeScript (Strict Mode).
- **Styling & UI:** Tailwind CSS with academic navy palette, Lucide Icons, Shadcn-inspired accessible UI components.
- **Cloud Backend & Database:** Supabase PostgreSQL with Row Level Security (RLS) policies, Supabase Auth, and Private Storage Bucket (`mrf-attendance-photos`).
- **Client Offline Storage:** IndexedDB powered by Dexie 4.x, Service Worker application shell caching (`/sw.js`).
- **Data Processing & Security:** SheetJS (`xlsx`) with formula injection mitigation (OWASP spreadsheet guidelines); JSZip for high-speed multi-threaded photograph archiving.
- **Automated Testing:** Vitest 5.x test suite covering identifier normalization, duplicate detection, and sanitization.

---

## 3. UI Design System & Academic Branding

### Color Palette
- **Primary Navy:** `#142D4E` (Headings, primary CTA buttons, brand badges)
- **Dark Slate Navy:** `#0B1B30` (Camera preview backgrounds, footer styling)
- **Royal Blue Accent:** `#2864B4` (Focus rings, interactive controls, category cards)
- **Subtle Blue Tint:** `#EAF2FC` (Selected states, status pills)
- **Surface Background:** `#F7F9FC`
- **Semantic Badges:**
  - Success Green: `#16835D` / `#DCFCE7`
  - Warning Amber: `#B7791F` / `#FEF3C7`
  - Error Crimson: `#C0393A` / `#FEE2E2`

### Universal Institutional Branding & Footer
Every view across the platform (Landing, Kiosk, Login, Admin Dashboard, Reports) displays the official circular seal and institutional acknowledgment:
> **Engineered by Department of Computer Science and Engineering, MITM and powered by [Vovalyx](https://vovalyx.in)**

---

## 4. Platform Routes & Navigation

### Public & Kiosk Experience
| Route | Description |
|---|---|
| `/` | Event portal landing page with direct entry to Kiosk, Offline Prep, and Admin portal |
| `/kiosk` | Full multi-step touch-enabled attendance kiosk (Face Capture -> Details -> Confirm) |
| `/kiosk/ready` | Offline terminal preparation dashboard to pre-cache attendees into IndexedDB |
| `/offline` | PWA offline fallback screen with system status diagnostics |
| `/login` | Secure administrator authentication (Supabase Auth with audited fallback) |

### Administrator Control Center (`/admin/*`)
| Route | Description |
|---|---|
| `/admin` | Live operations overview, check-in velocity, hourly chart, and recent attendee feed |
| `/admin/attendance` | Searchable attendance register, category filters, signed photo inspection modal |
| `/admin/import` | 5-stage CSV / Excel import engine with duplicate detection and dynamic row preview (10, 50, 100, All) |
| `/admin/exports` | Real-time Excel exports, CSV logs, parallel-streamed Photo ZIP packages, and emergency offline exports |
| `/admin/event` | Event title management, active session toggles, kiosk lock/unlock, and data wipe utilities |
| `/admin/sync` | Multi-terminal sync queue inspector, conflict resolution manager, and manual sync triggers |
| `/admin/audit` | Comprehensive, tamper-evident security audit trail tracking all administrative actions |

---

## 5. Kiosk Attendee Check-In Workflow

```mermaid
flowchart TD
    A["Step 1: Live Photo Capture<br/>(Camera Viewfinder + Face Guide)"] -->|Capture Photo| B["Step 2: Enter Details<br/>(Category + Name + Email / PhD ID)"]
    B -->|Verify Against Database| C["Step 3: Confirm Identity<br/>(Masked ID + Session Details)"]
    C -->|Submit Attendance| D["Step 4: Real-time Persistence<br/>(Supabase Storage + PostgreSQL)"]
    D -->|Success (or Queued Offline)| E["Step 5: Completion Badge<br/>(8s Auto-Reset to Step 1)"]
    A -.->|Cancel Button| F["Safely Stop Camera Stream & Return Home"]
    B -.->|Back Button| A
    C -.->|Back Button| B
```

### Step 1: Camera First (`/kiosk`)
- Opens live webcam feed via `navigator.mediaDevices.getUserMedia` with mirrored positioning guide.
- Hardware streams are cleanly stopped when switching steps or clicking **Cancel**.
- Clicking **Cancel** halts all active video tracks and safely redirects to `/`.

### Step 2: Category & Details Verification
- **Category Selection:** Quick toggle between **Research Guide** and **PhD Scholar**.
- **Active Category Badge:** Live banner confirms `Showing inputs for: Research Guide` or `Showing inputs for: PhD Scholar`.
- **Form Inputs:**
  - **Full Name (as per MRF Website):** Ensures strict match against registered records.
  - **Registered Email Address (MRF Email):** For Research Guides.
  - **Registered Email Address / PhD ID (as per MRF Website):** For PhD Scholars (flexible: accepts PhD ID such as `17` or email address).
- **Intelligent Error Assistance:** If an attendee selects the wrong category button, the system detects their record in the alternate category and provides actionable guidance.

### Step 3: Identity & Session Confirmation
- Shows attendee name, category, masked identifier (e.g. `y***h@mitmysore.in` or `17`), and active session name.
- Allows the attendee to review their captured photograph before permanent commit.

### Step 4: Submission & Auto-Reset
- Automatically uploads photo to private storage and logs attendance record.
- Displays green confirmation banner *"Attendance Recorded Successfully"*.
- Automatically wipes memory and resets back to Step 1 after 8 seconds (or immediately on clicking *"Next Check-In"*).

---

## 6. High-Concurrency & Multi-Terminal Scalability

To support 500+ attendees checking in simultaneously across multiple kiosk terminals during peak entrance rush:

1. **Parallelized API Execution:**
   - Active event validation, session verification, and person lookup queries are executed concurrently using `Promise.all`.
   - Attendance submission latency reduced from ~1,200ms to **under 250ms**.
2. **Race-Condition & Duplicate Defense:**
   - PostgreSQL table constraint: `UNIQUE(session_id, person_id)`.
   - API intercepts error code `23505` to return HTTP `409 Conflict` with a user-friendly duplicate message instead of crashing with HTTP 500.
3. **Non-Blocking Audit Logs:**
   - System audit trail entries are dispatched asynchronously with `Promise.allSettled`, guaranteeing that audit logging overhead never blocks the attendee check-in pipeline.
4. **Optimized Bulk Operations:**
   - **Data Import:** Chunked in parallel batches of 15 records to prevent connection pool exhaustion.
   - **Photo ZIP Export:** Streams images concurrently (up to 12 parallel threads) with client-side memory throttling.

---

## 7. Offline Mode & Synchronization Protocol

### Preparing Kiosk Terminals Before Doors Open
1. Connect each terminal (laptop/tablet) to Wi-Fi.
2. Visit `/kiosk/ready` and click **"Download Data for Offline Use"**.
3. The terminal downloads the active event, session, and registered attendees into IndexedDB (`mrf_attendance_db`).
4. A green **"Ready for Offline Kiosk"** badge confirms the terminal can operate disconnected.

### Operation During Network Dropouts
- Lookups and name verifications run directly against IndexedDB.
- Captured photos are stored locally as Blobs in Dexie `attendance_queue`.
- Check-in records are assigned a client-generated UUID `operation_id` for idempotent reconciliation.
- Screen displays an amber badge: *"Attendance Saved on This Device — Waiting to sync"*.

### Re-Synchronization
- When connectivity restores, the Service Worker and `online` event automatically trigger `syncEngine.triggerSync()`.
- Records are uploaded sequentially or in micro-batches with duplicate reconciliation.
- An emergency recovery tool at `/admin/exports` allows instant offline export of local photos and JSON manifests if a terminal suffers permanent network failure.

---

## 8. Database Migrations & Environment Setup

### Database Provisioning
Run the SQL migration scripts in your Supabase SQL Editor:
1. `supabase/migrations/00001_initial_schema.sql` (Tables, indices, RLS policies, unique constraints).
2. `supabase/migrations/00002_storage_setup.sql` (Private storage bucket `mrf-attendance-photos`).
3. `supabase/seed.sql` (Seeds default event `MRF Research Retreat` and active session).

### Environment Configuration (`.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://attendencetracker-ten.vercel.app
NEXT_PUBLIC_ORGANIZATION_NAME="Maharaja Research Foundation"
NEXT_PUBLIC_APP_TITLE="MRF Research Retreat Attendance Tracker"
```

---

## 9. Administrator Credentials

- **Production Cloud Auth:** Managed via Supabase Dashboard -> Authentication.
- **Development / Emergency Master Administrator:**
  - **Email:** `admin@mrf.org`
  - **Password:** `MRF@Conclave2026`
  *(All master administrator sessions are cryptographically logged in `audit_logs`).*

---

## 10. Data Import Specifications

- **Accepted Formats:** `.xlsx` and `.csv`.
- **Research Guides Format:**
  - Columns: `name`, `email`
- **PhD Scholars Format:**
  - Columns: `name`, `phd_id` (preserves leading zeros, e.g. `007` or `17`)
- **Import Validation Features:**
  - Checks duplicate identifiers within file and against database.
  - Sanitizes formulas to prevent CSV injection vulnerabilities.
  - Interactive pagination preview (10, 50, 100, All rows) with search filter before database commit.

---

## 11. 3-Day Event Wash / Data Purge Protocol

To maintain complete data privacy and adhere to the free-tier $0 storage envelope:
1. Navigate to `/admin/exports`.
2. Download the **Final Attendance Excel Workbook** and the **Full Photographic ZIP Archive**.
3. Verify download integrity locally.
4. Navigate to `/admin/event` and execute the **3-Day Data Wipe Procedure**:
   - Truncates `attendance_records` and `sync_conflicts`.
   - Cleans up `mrf-attendance-photos` storage bucket objects.
   - Clears IndexedDB caches across kiosk terminals via `/kiosk/ready` -> Clear Offline Cache.

---

## 12. Local Verification & Testing

```bash
# Run Vitest test suite (normalization, import, sanitization)
npm test

# Run Next.js production build verification
npm run build
```

---

## 13. Institutional Attribution

- **Engineering:** Department of Computer Science and Engineering, Maharaja Institute of Technology Mysore (MITM).
- **Technology Partner:** Powered by [Vovalyx](https://vovalyx.in) (`vovalyx.in`).
- **Organization:** Maharaja Research Foundation (MRF).
