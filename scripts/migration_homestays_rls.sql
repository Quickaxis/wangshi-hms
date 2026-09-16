-- ==========================================================
-- HOMESTAYS TABLE RLS POLICIES
-- Adds missing RLS policies to allow Super Admin management 
-- while maintaining strict tenant isolation for normal partners.
-- ==========================================================

-- 1. Ensure RLS is explicitly enabled
ALTER TABLE homestays ENABLE ROW LEVEL SECURITY;

-- 2. SELECT Policy
-- Super Admins can see all homestays. 
-- Normal partners can only see their assigned homestay.
DROP POLICY IF EXISTS "Allow active partners to read homestays" ON homestays;
CREATE POLICY "Allow active partners to read homestays"
ON homestays FOR SELECT
TO authenticated
USING (
    is_super_admin() OR 
    id = get_user_homestay_id()
);

-- 3. INSERT/UPDATE/DELETE Policy
-- ONLY Super Admins can create, modify, or delete homestays.
DROP POLICY IF EXISTS "Allow super_admin to manage homestays" ON homestays;
CREATE POLICY "Allow super_admin to manage homestays"
ON homestays FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());
