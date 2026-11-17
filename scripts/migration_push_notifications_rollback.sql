-- ==============================================================================
-- HOSPIRO — Rollback Web Push Notifications Migration
-- File: scripts/migration_push_notifications_rollback.sql
-- Description: Safely drops notification and push subscription tables and policies.
-- ==============================================================================

BEGIN;

-- 1. Remove table from realtime publication if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
    END IF;
END $$;

-- 2. Drop RLS policies
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Service role full access on push subscriptions" ON public.push_subscriptions;

DROP POLICY IF EXISTS "Allow active partners to read homestay notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow active partners to update homestay notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;

-- 3. Drop tables and indexes
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;

COMMIT;

