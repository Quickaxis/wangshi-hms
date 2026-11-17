-- ==============================================================================
-- HOSPIRO — Web Push Notifications & In-App Booking Notifications Migration
-- File: scripts/migration_push_notifications.sql
-- Description: Creates tables, indexes, and RLS policies for:
--   1. public.push_subscriptions (browser Web Push VAPID subscriptions)
--   2. public.notifications (in-app notifications for booking submissions & alerts)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABLE: public.push_subscriptions
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    homestay_id UUID REFERENCES public.homestays(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for push_subscriptions
CREATE INDEX IF NOT EXISTS idx_push_sub_user_id ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_partner_id ON public.push_subscriptions(partner_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_homestay_id ON public.push_subscriptions(homestay_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_active ON public.push_subscriptions(is_active) WHERE is_active = true;

-- ------------------------------------------------------------------------------
-- 2. TABLE: public.notifications
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homestay_id UUID NOT NULL REFERENCES public.homestays(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    booking_request_id UUID REFERENCES public.booking_requests(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'booking_request',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notif_homestay_id ON public.notifications(homestay_id);
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_is_read ON public.notifications(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_idempotency ON public.notifications(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notif_booking_request ON public.notifications(booking_request_id);

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- PUSH SUBSCRIPTIONS POLICIES:
-- A. Authenticated users can only read, create, update, and delete their own subscriptions
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions"
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- B. Service role has full administrative access (for sending pushes and removing invalid endpoints)
DROP POLICY IF EXISTS "Service role full access on push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role full access on push subscriptions"
ON public.push_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- NOTIFICATIONS POLICIES:
-- A. Active partners can only read notifications for their assigned homestay (super admins can read all)
DROP POLICY IF EXISTS "Allow active partners to read homestay notifications" ON public.notifications;
CREATE POLICY "Allow active partners to read homestay notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
    public.is_super_admin()
    OR (
        (homestay_id = public.get_user_homestay_id())
        AND public.is_active_partner()
    )
);

-- B. Active partners can update read status on their homestay notifications
DROP POLICY IF EXISTS "Allow active partners to update homestay notifications" ON public.notifications;
CREATE POLICY "Allow active partners to update homestay notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
    public.is_super_admin()
    OR (
        (homestay_id = public.get_user_homestay_id())
        AND public.is_active_partner()
    )
)
WITH CHECK (
    public.is_super_admin()
    OR (
        (homestay_id = public.get_user_homestay_id())
        AND public.is_active_partner()
    )
);

-- C. Service role has full access (for inserting incoming website booking notifications)
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;
CREATE POLICY "Service role full access on notifications"
ON public.notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. REALTIME PUBLICATION
-- ------------------------------------------------------------------------------
-- Enable Supabase Realtime for notifications so connected clients receive instant alerts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

COMMIT;

