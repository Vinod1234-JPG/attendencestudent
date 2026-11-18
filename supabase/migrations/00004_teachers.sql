-- ==============================================================================
-- MIT Mysore Student Attendance Tracker - Teachers
-- Admins can create teacher accounts. Each registration remembers who made it, so every
-- teacher sees (and shows on their Live Display) only the students they registered.
-- Safe to run more than once.
-- ==============================================================================

-- A teacher is a login with the 'teacher' role.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'super_admin', 'teacher'));

-- Who registered the student / took the attendance. NULL = nobody was signed in at the kiosk.
ALTER TABLE public.people
    ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_records
    ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_people_registered_by ON public.people (registered_by);
CREATE INDEX IF NOT EXISTS idx_attendance_registered_by ON public.attendance_records (registered_by);
