-- ==============================================================================
-- MAHARAJA RESEARCH FOUNDATION (MRF)
-- COMPLETE DATABASE SETUP SCRIPT FOR SUPABASE
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREATE PROFILES (Admin authorization)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. CREATE EVENTS
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

-- 4. CREATE EVENT SESSIONS
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

-- 5. CREATE IMPORT BATCHES
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

-- 6. CREATE PEOPLE (Guides and PhD Scholars with full metadata support)
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
    
    CONSTRAINT chk_people_identifiers CHECK (
        (category = 'guide' AND normalized_email IS NOT NULL AND phd_id IS NULL) OR
        (category = 'phd_scholar' AND phd_id IS NOT NULL AND normalized_email IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_guide_email 
ON public.people (normalized_email) 
WHERE category = 'guide';

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_phd_id 
ON public.people (phd_id) 
WHERE category = 'phd_scholar';

-- 7. CREATE ATTENDANCE RECORDS (With strict uniqueness prevention)
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
    
    CONSTRAINT uq_session_person UNIQUE (session_id, person_id)
);

-- 8. CREATE ATTENDANCE PHOTOS (Metadata linking to storage)
CREATE TABLE IF NOT EXISTS public.attendance_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_record_id UUID NOT NULL UNIQUE REFERENCES public.attendance_records(id) ON DELETE CASCADE,
    storage_object_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL DEFAULT 'image/jpeg',
    file_size INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))
);

-- 9. CREATE IMPORT ERRORS
CREATE TABLE IF NOT EXISTS public.import_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    diagnostic_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. CREATE AUDIT LOGS
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

-- 11. CREATE SYNC CONFLICTS
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

-- 12. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_people_category ON public.people (category);
CREATE INDEX IF NOT EXISTS idx_people_name ON public.people (name);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records (session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_person ON public.attendance_records (person_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_captured ON public.attendance_records (captured_at_device DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);

-- 13. ENABLE ROW LEVEL SECURITY (RLS)
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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS POLICIES
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "Admins can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public read active events" ON public.events FOR SELECT USING (status = 'active');
CREATE POLICY "Admins full access events" ON public.events FOR ALL USING (public.is_admin());

CREATE POLICY "Public read open sessions" ON public.event_sessions FOR SELECT USING (status = 'open');
CREATE POLICY "Admins full access sessions" ON public.event_sessions FOR ALL USING (public.is_admin());

CREATE POLICY "Admins full access people" ON public.people FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access attendance records" ON public.attendance_records FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access photos" ON public.attendance_photos FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access import batches" ON public.import_batches FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access import errors" ON public.import_errors FOR ALL USING (public.is_admin());
CREATE POLICY "Admins view audit logs" ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins full access sync conflicts" ON public.sync_conflicts FOR ALL USING (public.is_admin());

-- 14. SETUP PRIVATE STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'mrf-attendance-photos',
    'mrf-attendance-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage Security Policies
CREATE POLICY "Admins can view attendance photos"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'mrf-attendance-photos' AND 
    (auth.role() = 'service_role' OR public.is_admin())
);

CREATE POLICY "Server and admins can insert attendance photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'mrf-attendance-photos' AND 
    (auth.role() = 'service_role' OR public.is_admin())
);

CREATE POLICY "Admins can delete photos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'mrf-attendance-photos' AND 
    (auth.role() = 'service_role' OR public.is_admin())
);

-- 15. SEED INITIAL EVENT & SESSION
INSERT INTO public.events (id, name, event_date, timezone, status, kiosk_enabled, offline_allowed, photo_retention_days)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'MRF Annual Research Conclave 2026',
    CURRENT_DATE,
    'Asia/Kolkata',
    'active',
    true,
    true,
    365
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_sessions (id, event_id, name, status, opens_at, closes_at)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'General Conclave Check-in Session',
    'open',
    timezone('utc'::text, now()),
    timezone('utc'::text, now() + interval '24 hours')
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_logs (id, action, entity_type, entity_id, timestamp, outcome, metadata)
VALUES (
    uuid_generate_v4(),
    'SYSTEM_INITIALIZED',
    'EVENT',
    'a0000000-0000-0000-0000-000000000001',
    timezone('utc'::text, now()),
    'success',
    '{"message": "MRF Event Attendance Database and Storage initialized successfully."}'::jsonb
);


-- ==============================================================================
-- MIT Mysore Student Attendance Tracker - Student self-registration
-- Adds the 'student' category: students register themselves at the kiosk with
-- their name and college. Existing guide / phd_scholar rows are left untouched.
-- Safe to run more than once.
-- ==============================================================================

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS college TEXT;

-- Normalised "name|college" used to recognise the same student on later check-ins.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS student_key TEXT;

ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_category_check;
ALTER TABLE public.people
    ADD CONSTRAINT people_category_check
    CHECK (category IN ('guide', 'phd_scholar', 'student'));

ALTER TABLE public.people DROP CONSTRAINT IF EXISTS chk_people_identifiers;
ALTER TABLE public.people
    ADD CONSTRAINT chk_people_identifiers CHECK (
        (category = 'guide' AND normalized_email IS NOT NULL AND phd_id IS NULL) OR
        (category = 'phd_scholar' AND phd_id IS NOT NULL AND normalized_email IS NULL) OR
        (category = 'student' AND college IS NOT NULL AND student_key IS NOT NULL)
    );

-- One registration per student (same name at the same college).
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_student_key
ON public.people (student_key)
WHERE category = 'student';

CREATE INDEX IF NOT EXISTS idx_people_college ON public.people (college);
