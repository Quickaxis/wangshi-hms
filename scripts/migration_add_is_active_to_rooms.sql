-- ==========================================================
-- MIGRATION: Add is_active to rooms
-- ==========================================================

-- 1. Add the is_active column with a default value of TRUE
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Ensure existing rooms are active (redundant due to DEFAULT, but safe)
UPDATE rooms SET is_active = TRUE WHERE is_active IS NULL;

-- 3. Notify PostgREST to reload the schema cache so the API immediately recognizes the new column
NOTIFY pgrst, 'reload schema';
