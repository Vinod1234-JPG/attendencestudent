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
