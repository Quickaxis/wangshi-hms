-- ==========================================================
-- STORAGE SETUP & POLICIES FOR HOMESTAY LOGOS
-- ==========================================================

-- 1. Create the homestay-logos bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('homestay-logos', 'homestay-logos', true) 
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public access to view logos
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'homestay-logos');

-- Note: We do not add INSERT/UPDATE/DELETE policies for authenticated users
-- because the uploads will be handled via a secure Next.js Server Action
-- using the Supabase Service Role key. This prevents users from uploading
-- arbitrary files to other homestays' folders directly from the browser.
