-- ==============================================================================
-- STAGING-ONLY MIGRATION: HARDENED LEGACY BOOKING COMPATIBILITY & TENANT TRIGGER
-- ==============================================================================
-- Resolves backward compatibility for legacy 8-argument create_booking_atomic
-- callers while strictly enforcing tenant isolation, validating room/tenant
-- integrity, and preventing cross-tenant or partner impersonation.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.infer_booking_homestay_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_room_homestay_id UUID;
    v_caller_partner public.partners%ROWTYPE;
    v_caller_role TEXT;
    v_caller_uid UUID;
BEGIN
    -- 1. Validate that referenced room exists and has an assigned homestay_id
    SELECT homestay_id INTO v_room_homestay_id
    FROM public.rooms
    WHERE id = NEW.room_id;

    IF v_room_homestay_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id = NEW.room_id) THEN
            RAISE EXCEPTION 'ROOM_NOT_FOUND: Referenced room (%) does not exist', NEW.room_id;
        ELSE
            RAISE EXCEPTION 'ROOM_HOMESTAY_UNASSIGNED: Referenced room (%) has no assigned homestay_id', NEW.room_id;
        END IF;
    END IF;

    -- 2. Tenant Mismatch Check:
    -- If NEW.homestay_id was explicitly provided (e.g. from canonical RPC),
    -- ensure it strictly matches the room's homestay_id to prevent tenant spoofing.
    IF NEW.homestay_id IS NOT NULL AND NEW.homestay_id <> v_room_homestay_id THEN
        RAISE EXCEPTION 'BOOKING_TENANT_MISMATCH: Booking homestay_id (%) does not match room homestay_id (%)',
            NEW.homestay_id, v_room_homestay_id;
    END IF;

    -- 3. Infer homestay_id from room if omitted (e.g. legacy 8-argument RPC)
    NEW.homestay_id := v_room_homestay_id;

    -- 4. Authorization & Cross-Tenant Defense:
    -- Extract caller role and user identity from JWT context
    v_caller_role := COALESCE(
        current_setting('request.jwt.claim.role', true),
        (SELECT (auth.jwt() ->> 'role'))
    );
    v_caller_uid := auth.uid();

    -- A. Trusted backend operations:
    -- 1) Authenticated service_role API calls (PostgREST with service-role key):
    IF v_caller_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- 2) Direct administrative SQL sessions (migrations, dashboard SQL editor, psql):
    -- session_user must be postgres/supabase_admin, with no user JWT claims.
    IF session_user IN ('postgres', 'supabase_admin') AND v_caller_role IS NULL AND v_caller_uid IS NULL THEN
        RETURN NEW;
    END IF;

    -- B. If executing as an authenticated partner / client:
    IF v_caller_role = 'authenticated' OR v_caller_uid IS NOT NULL THEN
        IF v_caller_uid IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Authenticated role specified but user ID is missing';
        END IF;

        SELECT * INTO v_caller_partner
        FROM public.partners
        WHERE auth_user_id = v_caller_uid AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'UNAUTHORIZED: No active partner profile found for authenticated session (%)', v_caller_uid;
        END IF;

        -- Permit super_admin cross-tenant access; regular partners must match room homestay
        IF v_caller_partner.role <> 'super_admin' AND v_caller_partner.homestay_id <> v_room_homestay_id THEN
            RAISE EXCEPTION 'UNAUTHORIZED_CROSS_TENANT_BOOKING: Partner (%) is not authorized to create bookings for homestay (%)',
                v_caller_partner.id, v_room_homestay_id;
        END IF;

        -- Prevent partner impersonation on legacy calls: enforce that booking partner_id matches caller
        IF v_caller_partner.role <> 'super_admin' THEN
            NEW.partner_id := v_caller_partner.id;
        END IF;

        RETURN NEW;
    END IF;

    -- C. Any other unauthenticated role (e.g. 'anon' or unauthenticated API caller) is strictly forbidden
    RAISE EXCEPTION 'UNAUTHORIZED: Unauthenticated booking creation is prohibited';
END;
$$;

-- Explicitly harden ownership and execution privileges
REVOKE ALL ON FUNCTION public.infer_booking_homestay_id() FROM public;
REVOKE ALL ON FUNCTION public.infer_booking_homestay_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.infer_booking_homestay_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_infer_booking_homestay_id ON public.bookings;
CREATE TRIGGER trg_infer_booking_homestay_id
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.infer_booking_homestay_id();

COMMIT;
