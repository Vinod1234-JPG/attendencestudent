-- ==============================================================================
-- MRF Event Attendance Tracker - Primary Schema Migration
-- Organization: Maharaja Research Foundation (MRF)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES (Admin access tracking)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2. EVENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    event_date DATE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
    kiosk_enabled BOOLEAN NOT NULL DEFAULT true,
    offline_allowed BOOLEAN NOT NULL DEFAULT true,
    photo_retention_days INTEGER NOT NULL DEFAULT 365,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 3. EVENT SESSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opens_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 4. IMPORT BATCHES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL CHECK (category IN ('guide', 'phd_scholar')),
    original_filename TEXT NOT NULL,
    initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    total_rows INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    summary JSONB DEFAULT '{}'::jsonb
);

-- ------------------------------------------------------------------------------
-- 5. PEOPLE (Guides and PhD Scholars)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL CHECK (category IN ('guide', 'phd_scholar')),
    name TEXT NOT NULL,
    normalized_email TEXT,
    phd_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    
    -- Constraint: Guides require email, PhD Scholars require PhD ID
    CONSTRAINT chk_people_identifiers CHECK (
        (category = 'guide' AND normalized_email IS NOT NULL AND phd_id IS NULL) OR
        (category = 'phd_scholar' AND phd_id IS NOT NULL AND normalized_email IS NULL)
    )
);

-- Unique index for Guide email (case-insensitive & trimmed via normalized_email)
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_guide_email 
ON public.people (normalized_email) 
WHERE category = 'guide';

-- Unique index for PhD ID
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_phd_id 
ON public.people (phd_id) 
WHERE category = 'phd_scholar';

-- ------------------------------------------------------------------------------
-- 6. ATTENDANCE RECORDS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.event_sessions(id) ON DELETE RESTRICT,
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
    operation_id UUID NOT NULL UNIQUE,
    captured_at_device TIMESTAMPTZ NOT NULL,
    received_at_server TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    recorded_at_server TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'flagged_review')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    
    -- Crucial: Duplicate prevention at database level
    CONSTRAINT uq_session_person UNIQUE (session_id, person_id)
);

-- ------------------------------------------------------------------------------
-- 7. ATTENDANCE PHOTOS (Metadata for private storage bucket)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_record_id UUID NOT NULL UNIQUE REFERENCES public.attendance_records(id) ON DELETE CASCADE,
    storage_object_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL DEFAULT 'image/jpeg',
    file_size INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))
);

-- ------------------------------------------------------------------------------
-- 8. IMPORT ERRORS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    diagnostic_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure', 'warning')),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ------------------------------------------------------------------------------
-- 10. SYNC CONFLICTS & RECONCILIATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
    person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
    conflict_type TEXT NOT NULL CHECK (conflict_type IN ('duplicate_submission', 'session_closed', 'identifier_mismatch', 'invalid_metadata')),
    client_captured_at TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'resolved_ignored', 'resolved_accepted')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ------------------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_people_category ON public.people (category);
CREATE INDEX IF NOT EXISTS idx_people_name ON public.people (name);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records (session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_person ON public.attendance_records (person_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_captured ON public.attendance_records (captured_at_device DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the current user is an authorized admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: Admins can view profiles, users can view own profile
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admins can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Events & Sessions: Authenticated admins can manage; anonymous kiosk can read active event/session for check-in
CREATE POLICY "Public read active events for kiosk"
ON public.events FOR SELECT
USING (status = 'active');

CREATE POLICY "Admins have full access to events"
ON public.events FOR ALL
USING (public.is_admin());

CREATE POLICY "Public read open sessions for kiosk"
ON public.event_sessions FOR SELECT
USING (status = 'open');

CREATE POLICY "Admins have full access to sessions"
ON public.event_sessions FOR ALL
USING (public.is_admin());

-- People: Admins can manage all people; Public lookup only by exact identifier match (prevent enumeration)
CREATE POLICY "Admins have full access to people"
ON public.people FOR ALL
USING (public.is_admin());

-- Attendance records: Admins can view/export; Kiosk service role or server actions can insert
CREATE POLICY "Admins have full access to attendance records"
ON public.attendance_records FOR ALL
USING (public.is_admin());

-- Attendance photos: Admins can view photo metadata
CREATE POLICY "Admins have full access to attendance photos"
ON public.attendance_photos FOR ALL
USING (public.is_admin());

-- Import batches & errors: Admins only
CREATE POLICY "Admins have full access to import batches"
ON public.import_batches FOR ALL
USING (public.is_admin());

CREATE POLICY "Admins have full access to import errors"
ON public.import_errors FOR ALL
USING (public.is_admin());

-- Audit logs: Admins can view; Service role / server inserts
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (public.is_admin());

-- Sync conflicts: Admins only
CREATE POLICY "Admins have full access to sync conflicts"
ON public.sync_conflicts FOR ALL
USING (public.is_admin());
