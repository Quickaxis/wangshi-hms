-- ==============================================================================
-- ROLLBACK SCRIPT: LEGACY BOOKING COMPATIBILITY TRIGGER
-- ==============================================================================
-- Safely removes the compatibility trigger and function without altering tables.
--
-- ⚠️ ARCHITECTURAL IMPACT WARNING:
-- Dropping this trigger removes backward-compatibility inference for the legacy
-- 8-argument create_booking_atomic RPC (from schema.sql).
--
-- Because bookings.homestay_id is NOT NULL (enforced by Phase 1 migration),
-- any subsequent invocation of the legacy 8-argument RPC will FAIL with:
--   SQLSTATE 23502: null value in column "homestay_id" of relation "bookings"
--   violates not-null constraint.
--
-- Canonical 7-argument callers (passing p_guests and explicitly supplying
-- homestay_id) will continue to operate normally.
-- ==============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_infer_booking_homestay_id ON public.bookings;
DROP FUNCTION IF EXISTS public.infer_booking_homestay_id();

COMMIT;
