-- ==============================================================================
-- Storage Bucket Setup for MRF Attendance Photos
-- Bucket: mrf-attendance-photos (Private Bucket)
-- ==============================================================================

-- 1. Create the private bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'mrf-attendance-photos',
    'mrf-attendance-photos',
    false,
    5242880, -- 5 MB limit per photo
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 2. Storage Policies:
-- Only authenticated admins or server backend (via service role) can access photos
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

CREATE POLICY "Admins can delete photos if authorized"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'mrf-attendance-photos' AND 
    (auth.role() = 'service_role' OR public.is_admin())
);
