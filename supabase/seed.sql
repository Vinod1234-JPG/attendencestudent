-- ==============================================================================
-- MRF Event Attendance Tracker - Initial Seed Data
-- ==============================================================================

-- 1. Create Default Active Event
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

-- 2. Create Default Active Attendance Session
INSERT INTO public.event_sessions (id, event_id, name, status, opens_at, closes_at)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'General Conclave Check-in Session',
    'open',
    timezone('utc'::text, now()),
    timezone('utc'::text, now() + interval '12 hours')
)
ON CONFLICT (id) DO NOTHING;

-- 3. Initial Audit Log
INSERT INTO public.audit_logs (id, action, entity_type, entity_id, timestamp, outcome, metadata)
VALUES (
    uuid_generate_v4(),
    'SYSTEM_INITIALIZED',
    'EVENT',
    'a0000000-0000-0000-0000-000000000001',
    timezone('utc'::text, now()),
    'success',
    '{"message": "MRF Event Attendance Tracker initial schema and seed applied"}'::jsonb
);
