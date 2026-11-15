-- ==============================================================================
-- WANGSHI HOMESTAY: CLEANUP ROLLBACK & RESTORATION SCRIPT (AIRTIGHT FULL-COLUMN)
-- Target Homestay: Wangshi Homestay ('ce603bb8-c9e3-4ce1-a57e-b6c4140ea459')
-- Production Project Ref: algorrnjotffcvtinbyy (Supabase Production)
--
-- Restores all 32 bookings, 41 guests, 1 invoice, 3 invoice items, and 2 payments
-- with every original column value and UUID captured from the production snapshot.
--
-- Safety & Verification Architecture:
--   1. Transactional Table Locks (ordered top-down) with a 5s lock_timeout fail-safe.
--   2. Preflight Conflict Detection: Asserts that NONE of the snapshot IDs already exist.
--      Any existing duplicate ID causes an immediate, clean failure rather than being silently ignored.
--   3. Preflight Foreign Key Validation: Confirms all referenced homestay, room, and partner records exist.
--   4. Staging Tables (LIKE ... INCLUDING ALL): Loads snapshot records into temporary staging tables.
--   5. Controlled Sequential Insertion: bookings -> guests -> invoices -> invoice_items -> payments.
--   6. Trigger State Management: Disables payment ledger triggers during historical insert and re-enables them.
--   7. Deep Bidirectional EXCEPT Verification: Compares production tables against staging tables across ALL columns.
--
-- EXECUTION REQUIREMENT:
--   Must be executed via the SUPABASE DASHBOARD SQL EDITOR (runs as 'postgres' role).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. TIMEOUT GUARDS
-- ------------------------------------------------------------------------------
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ------------------------------------------------------------------------------
-- 1. TRANSACTIONAL TABLE LOCKS (Ordered top-down)
-- ------------------------------------------------------------------------------
LOCK TABLE public.homestays IN SHARE MODE;
LOCK TABLE public.rooms IN SHARE MODE;
LOCK TABLE public.partners IN SHARE MODE;
LOCK TABLE public.booking_requests IN SHARE MODE;
LOCK TABLE public.bookings IN EXCLUSIVE MODE;
LOCK TABLE public.guests IN EXCLUSIVE MODE;
LOCK TABLE public.invoices IN EXCLUSIVE MODE;
LOCK TABLE public.invoice_items IN EXCLUSIVE MODE;
LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE;

-- ------------------------------------------------------------------------------
-- 2. CREATE STAGING TABLES (EXACT SCHEMA MATCH)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE _snapshot_bookings (LIKE public.bookings INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_guests (LIKE public.guests INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_invoices (LIKE public.invoices INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_invoice_items (LIKE public.invoice_items INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE _snapshot_payments (LIKE public.payments INCLUDING ALL) ON COMMIT DROP;

-- ------------------------------------------------------------------------------
-- 3. LOAD EXACT SNAPSHOT ROWS INTO STAGING TABLES
-- ------------------------------------------------------------------------------
-- Bookings (32 rows, 15 columns)
INSERT INTO _snapshot_bookings (
    id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time
) VALUES
(
    'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', '1616ce19-da33-439f-8ce3-9aebceb2605a', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 2, 2500, 2500, NULL, '2026-09-13T06:03:00.671777+00:00', '2026-09-13T06:18:37.137+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-17', 'cancelled', 1, 2500, 10000, 'Test Booking', '2026-09-13T06:05:53.540167+00:00', '2026-09-13T06:10:15.593+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'c65fcd6b-0428-4521-8e45-37d68512f795', '43f18986-9dd8-4beb-a8e4-0fe27ef686af', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 2, 2000, 2000, NULL, '2026-09-13T06:10:44.2202+00:00', '2026-09-13T06:14:01.956+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '82236762-2265-4749-97c8-cfbb2dc0e62f', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-15', '2026-09-16', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T06:12:50.331889+00:00', '2026-09-13T06:18:50.82+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '0a064075-573e-417d-a047-1f3fadcb7308', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T06:29:53.312644+00:00', '2026-09-13T06:33:33.737+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '3f0cd2e9-c620-4f43-8e4f-b59688202c77', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T06:38:12.512303+00:00', '2026-09-13T06:40:50.913+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '1d3ba405-a801-4d86-97bd-6197cf63031f', '43f18986-9dd8-4beb-a8e4-0fe27ef686af', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-15', '2026-09-17', 'cancelled', 2, 2000, 4000, NULL, '2026-09-13T06:39:32.150615+00:00', '2026-09-13T06:40:58.719+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '25123836-5641-4b4f-8449-b167fa86776f', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T07:05:41.591891+00:00', '2026-09-13T07:06:44.282+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '45ff7159-b980-41ca-8883-0a60ccb45aad', '43f18986-9dd8-4beb-a8e4-0fe27ef686af', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2000, 2000, NULL, '2026-09-13T07:16:52.913321+00:00', '2026-09-13T07:17:04.681+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-14', '2026-09-16', 'cancelled', 3, 2500, 5000, 'Condoms at service', '2026-09-13T07:25:56.385771+00:00', '2026-09-13T07:26:59.281+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '1fc6d0b8-c4a9-487f-9ef4-af12eead3942', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-17', 'cancelled', 1, 2500, 10000, 'Test Booking', '2026-09-13T07:55:25.287403+00:00', '2026-09-13T08:13:12.643+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '5f067bc9-11c9-4134-b878-c5aa28be3059', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T08:11:27.506774+00:00', '2026-09-13T08:13:19.541+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '1c237fa9-fa46-4e53-bbce-d013c5972f50', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T08:15:20.940835+00:00', '2026-09-13T08:26:43.774+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '8360d4f8-fd9b-493f-98e5-e6177b022d18', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-20', '2026-09-21', 'cancelled', 1, 2500, 2500, 'Test note', '2026-09-13T09:10:18.538053+00:00', '2026-09-13T09:53:50.866+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'fa20ab92-29ab-4717-b84d-1e48474d79c5', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-25', '2026-09-30', 'cancelled', 1, 2500, 12500, 'Hejek', '2026-09-13T09:57:29.416783+00:00', '2026-09-13T14:03:26.914+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'e55065f2-51bd-4fc5-ba35-135d846ed4cd', '1616ce19-da33-439f-8ce3-9aebceb2605a', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T14:01:37.922938+00:00', '2026-09-13T14:01:43.984+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '9bbebbf9-10ff-4679-8c92-a3c667efa2b5', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 2, 2500, 2500, NULL, '2026-09-13T14:01:57.800746+00:00', '2026-09-13T14:03:15.101+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 2, 2500, 2500, NULL, '2026-09-13T15:29:14.721786+00:00', '2026-09-13T15:32:25.944+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '8308e192-0f59-4e01-8454-986877a76b49', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-15', 'cancelled', 2, 2500, 5000, NULL, '2026-09-13T15:34:26.394382+00:00', '2026-09-13T15:41:25.553+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'ebb0d7a0-4c1f-4f88-b490-38033eb39e48', '1616ce19-da33-439f-8ce3-9aebceb2605a', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T15:35:49.118453+00:00', '2026-09-13T15:41:30.818+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '978933be-496b-439e-a143-c11963f96fcb', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-15', 'cancelled', 2, 2500, 5000, NULL, '2026-09-13T15:44:09.56816+00:00', '2026-09-13T15:46:16.471+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '2d36a63a-35c8-4840-b36b-f50a134d0194', '1616ce19-da33-439f-8ce3-9aebceb2605a', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-13', '2026-09-14', 'cancelled', 1, 2500, 2500, NULL, '2026-09-13T15:44:52.033541+00:00', '2026-09-13T16:03:51.097+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '51845915-19b8-4f6c-8f95-0ae19f7262b9', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-14', '2026-09-15', 'cancelled', 2, 2500, 2500, NULL, '2026-09-14T11:32:32.553394+00:00', '2026-09-14T11:33:09.175+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '0ea66346-1648-4e38-b9ca-dec456fef7c3', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-14', '2026-09-15', 'cancelled', 2, 2500, 2500, NULL, '2026-09-14T12:23:14.504141+00:00', '2026-09-14T12:24:04.093+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'd695585f-dc8a-435a-93f5-6207c395d15a', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-16', '2026-09-17', 'cancelled', 2, 2500, 2500, NULL, '2026-09-16T01:43:50.463419+00:00', '2026-09-16T01:44:08.108+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '89fe33fd-3246-4fdd-80f8-c6c7c851b897', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-16', '2026-09-17', 'cancelled', 2, 2500, 2500, NULL, '2026-09-16T01:44:23.430052+00:00', '2026-09-16T01:51:14.027+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-16', '2026-09-17', 'cancelled', 1, 2500, 2500, NULL, '2026-09-16T01:58:42.465362+00:00', '2026-09-16T11:55:33.375+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'f76f4266-7b0d-4caf-b2aa-4f542265e358', '639e42e6-6421-4333-829c-14f80aed2ebd', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-09-16', '2026-09-17', 'cancelled', 2, 2500, 2500, NULL, '2026-09-16T01:59:31.697756+00:00', '2026-09-16T11:55:29.629+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    'd0c94372-9a79-4e60-a92e-0c86e5f270be', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-10-01', '2026-10-09', 'checked_out', 2, 2500, 20000, NULL, '2026-10-01T13:41:29.187888+00:00', '2026-10-08T00:41:40.937+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', 'cdee6e82-11a9-4310-9de1-4404c340ec0e', '2026-10-24', '2026-10-30', 'cancelled', 1, 2500, 15000, 'Daily room rendi service needed', '2026-10-24T17:36:19.530546+00:00', '2026-10-25T02:53:51.209+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '401e804d-7ede-4ac3-bc94-06972cb6e9e1', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-11-13', '2026-11-14', 'cancelled', 2, 2500, 2500, NULL, '2026-11-13T02:51:43.919262+00:00', '2026-11-13T03:07:09.931+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
),
(
    '2c54ddce-1d32-4d0b-8181-edfd37763aa4', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-11-17', '2026-11-19', 'cancelled', 1, 2500, 5000, NULL, '2026-11-13T02:52:29.548285+00:00', '2026-11-13T03:46:54.943+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', NULL, NULL
);

-- Guests (41 rows, 9 columns)
INSERT INTO _snapshot_guests (
    id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id
) VALUES
(
    '44563196-11aa-42a2-b6de-aff5e3d90223', 'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', 'oooo', '9999999999', NULL, true, '2026-09-13T06:03:01.103456+00:00', '2026-09-13T06:03:01.103456+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'ec9ea509-14e1-4fba-8c59-f5bbfd6d7bb4', 'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb', 'ooo', NULL, NULL, false, '2026-09-13T06:03:01.103456+00:00', '2026-09-13T06:03:01.103456+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '2cf05bee-49dd-4ad2-b25b-12ca42f34fd7', 'c65fcd6b-0428-4521-8e45-37d68512f795', 'Rahul pandey', '8822095217', NULL, true, '2026-09-13T06:10:44.585955+00:00', '2026-09-13T06:10:44.585955+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '739951e7-e2d7-4e01-b465-a1ff16246861', 'c65fcd6b-0428-4521-8e45-37d68512f795', 'RAJGANDHANI', NULL, NULL, false, '2026-09-13T06:10:44.585955+00:00', '2026-09-13T06:10:44.585955+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'fa6aae12-c694-48c2-ac95-407ade016405', '82236762-2265-4749-97c8-cfbb2dc0e62f', 'Rajesh mishra', '7578923440', NULL, true, '2026-09-13T06:12:50.695653+00:00', '2026-09-13T06:12:50.695653+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '9e213bf2-ee88-4d41-8c65-00f4a17fb4ee', '0a064075-573e-417d-a047-1f3fadcb7308', 'Rajesh', '2222222', NULL, true, '2026-09-13T06:29:53.680146+00:00', '2026-09-13T06:29:53.680146+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '410d75d5-0dee-4ecd-a3ec-481fd3798d5b', '3f0cd2e9-c620-4f43-8e4f-b59688202c77', 'TAMAL PAIK', '75789  23400', NULL, true, '2026-09-13T06:38:12.587577+00:00', '2026-09-13T06:38:12.587577+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '462a6f85-66f4-4fc2-a41e-7cd61e29f804', '1d3ba405-a801-4d86-97bd-6197cf63031f', 'Unmesh', '8822095217', NULL, true, '2026-09-13T06:39:32.177902+00:00', '2026-09-13T06:39:32.177902+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'ff708f57-0d50-4f63-9b56-669bf0552b4b', '1d3ba405-a801-4d86-97bd-6197cf63031f', 'Prachi', NULL, NULL, false, '2026-09-13T06:39:32.177902+00:00', '2026-09-13T06:39:32.177902+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'fc30fe1a-1e46-4567-8387-e7b17405367c', '25123836-5641-4b4f-8449-b167fa86776f', 'Unmesh', '8822095217', NULL, true, '2026-09-13T07:05:41.974833+00:00', '2026-09-13T07:05:41.974833+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'af478a87-0fd1-491a-9eb7-044e1f94b1fa', '45ff7159-b980-41ca-8883-0a60ccb45aad', 'awdawdawd', 'awdawdawdad ad', NULL, true, '2026-09-13T07:16:53.295861+00:00', '2026-09-13T07:16:53.295861+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'be0e7a03-f026-46ef-9207-47917c615a41', '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'Uttaran', '8822095217', NULL, true, '2026-09-13T07:25:56.444067+00:00', '2026-09-13T07:25:56.444067+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '07c67cf3-aeba-4611-bb85-dd4e1beed42d', '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'Puja', NULL, NULL, false, '2026-09-13T07:25:56.444067+00:00', '2026-09-13T07:25:56.444067+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'dab2e733-80bc-4e1c-9ea7-422f99efc0fd', '812660f3-a9cb-4e11-b789-1db0d3621bd2', 'Ekta', NULL, NULL, false, '2026-09-13T07:25:56.444067+00:00', '2026-09-13T07:25:56.444067+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '94d20567-d0ee-4af9-bd06-dd77a6ae0b34', '5f067bc9-11c9-4134-b878-c5aa28be3059', '22222', '22222', NULL, true, '2026-09-13T08:11:27.553897+00:00', '2026-09-13T08:11:27.553897+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '28d7f0b5-b5a0-4357-8635-2a049b2491f0', '1c237fa9-fa46-4e53-bbce-d013c5972f50', 'Unmesh', '8822095217', NULL, true, '2026-09-13T08:15:21.279957+00:00', '2026-09-13T08:15:21.279957+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'f8ea3686-aee8-4720-9027-330eda2664a2', 'fa20ab92-29ab-4717-b84d-1e48474d79c5', 'Yrjr', '8474836522', NULL, true, '2026-09-13T09:57:29.483474+00:00', '2026-09-13T09:57:29.483474+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '83f02071-107c-453b-a377-8ccfca3c55aa', 'e55065f2-51bd-4fc5-ba35-135d846ed4cd', 'TAMAL PAIK', '97077 70290', NULL, true, '2026-09-13T14:01:38.295136+00:00', '2026-09-13T14:01:38.295136+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '1db13727-4f12-4a74-b201-0c8d69ba0f21', '9bbebbf9-10ff-4679-8c92-a3c667efa2b5', 'tamal paik', '97077 70290', NULL, true, '2026-09-13T14:01:57.835853+00:00', '2026-09-13T14:01:57.835853+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '2aeb682c-fee4-479e-ac7a-ff7b83e29fbe', '9bbebbf9-10ff-4679-8c92-a3c667efa2b5', 'baidehi baidya', NULL, NULL, false, '2026-09-13T14:01:57.835853+00:00', '2026-09-13T14:01:57.835853+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '3941f417-7b1e-4117-8052-215e8131cff3', '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065', 'Dev joshi', '7722789812129', NULL, true, '2026-09-13T15:29:14.784805+00:00', '2026-09-13T15:29:14.784805+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '7d29b354-d586-4981-bb80-646ec20fcb95', '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065', 'Anushka', NULL, NULL, false, '2026-09-13T15:29:14.784805+00:00', '2026-09-13T15:29:14.784805+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'b26900fa-f99f-4d14-929b-98c84dbc87da', '8308e192-0f59-4e01-8454-986877a76b49', 'RAHUL', '8822095217', NULL, true, '2026-09-13T15:34:26.439863+00:00', '2026-09-13T15:34:26.439863+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'b2c6f4e0-5886-4c5f-a1f6-e2c80c2541da', '8308e192-0f59-4e01-8454-986877a76b49', 'RAJESH', NULL, NULL, false, '2026-09-13T15:34:26.439863+00:00', '2026-09-13T15:34:26.439863+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '3cbb5429-8504-4394-be45-8c34f5a222e5', 'ebb0d7a0-4c1f-4f88-b490-38033eb39e48', 'Unmesh', '8822095217', NULL, true, '2026-09-13T15:35:49.146294+00:00', '2026-09-13T15:35:49.146294+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '698c838d-584e-4bf1-ba16-8e1ec367400d', '978933be-496b-439e-a143-c11963f96fcb', 'Unmesh', '8822095217', NULL, true, '2026-09-13T15:44:09.612713+00:00', '2026-09-13T15:44:09.612713+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '50711bdf-43e0-48f1-895a-4c0e567a9ddf', '978933be-496b-439e-a143-c11963f96fcb', 'dev', NULL, NULL, false, '2026-09-13T15:44:09.612713+00:00', '2026-09-13T15:44:09.612713+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'b55ae2bd-b7d6-44f9-a63f-5ef74fec8247', '2d36a63a-35c8-4840-b36b-f50a134d0194', 'rahul', '3308121029', NULL, true, '2026-09-13T15:44:52.073371+00:00', '2026-09-13T15:44:52.073371+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'a662d24f-a6d7-4a16-8267-48f440bcd650', '51845915-19b8-4f6c-8f95-0ae19f7262b9', 'sahil sir', '77447912911', NULL, true, '2026-09-14T11:32:32.934472+00:00', '2026-09-14T11:32:32.934472+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'e0be8b82-c821-4d47-8968-ca4039ec2792', '51845915-19b8-4f6c-8f95-0ae19f7262b9', 'Sahil sir 2', NULL, NULL, false, '2026-09-14T11:32:32.934472+00:00', '2026-09-14T11:32:32.934472+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '44560e02-f1bb-44b5-a91d-297f44036259', '0ea66346-1648-4e38-b9ca-dec456fef7c3', 'ashok da', '8822095217', NULL, true, '2026-09-14T12:23:14.590963+00:00', '2026-09-14T12:23:14.590963+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '7acfbfb8-12ad-40e3-b28b-93f9e05b9d2a', '0ea66346-1648-4e38-b9ca-dec456fef7c3', 'ashok da 2', NULL, NULL, false, '2026-09-14T12:23:14.590963+00:00', '2026-09-14T12:23:14.590963+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '24586028-ef9e-42d9-b2f5-c3ff0cd4e821', '99f3e234-d768-4bbb-9d8a-0b4bb3876364', 'aa', '8220952171', NULL, true, '2026-09-16T01:58:42.465362+00:00', '2026-09-16T01:58:42.465362+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '862ad9ac-654e-4cba-a24c-d0d2ade7ab3e', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'GPT 1', '8822095217', NULL, true, '2026-09-16T01:59:31.697756+00:00', '2026-09-16T01:59:31.697756+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '0862aec8-43bb-48b8-87b9-d54ee6890cea', 'f76f4266-7b0d-4caf-b2aa-4f542265e358', 'GPT 2 \', NULL, NULL, false, '2026-09-16T01:59:31.697756+00:00', '2026-09-16T01:59:31.697756+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'e5c6bad8-bfc6-4afc-a9bf-fb91d0600eda', 'd0c94372-9a79-4e60-a92e-0c86e5f270be', 'Rahul', '8822095217', NULL, true, '2026-10-01T13:41:29.187888+00:00', '2026-10-01T13:41:29.187888+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'ddbdb0d4-1d25-4c04-91d0-3b6238eeecf6', 'd0c94372-9a79-4e60-a92e-0c86e5f270be', 'Riya', NULL, NULL, false, '2026-10-01T13:41:29.187888+00:00', '2026-10-01T13:41:29.187888+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '491bf1b3-f668-49ee-be28-2484076539d3', '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d', 'Unmesh rendi', '8822095217', NULL, true, '2026-10-24T17:36:19.530546+00:00', '2026-10-24T17:36:19.530546+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'eafa4347-165b-4a14-85e1-f03195366891', '401e804d-7ede-4ac3-bc94-06972cb6e9e1', 'Unmesh Gogoi', '8822095217', NULL, true, '2026-11-13T02:51:43.919262+00:00', '2026-11-13T02:51:43.919262+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    '41be33bd-64fe-4f11-9a43-bb9460d1ecac', '401e804d-7ede-4ac3-bc94-06972cb6e9e1', 'Dev Joshi', NULL, NULL, false, '2026-11-13T02:51:43.919262+00:00', '2026-11-13T02:51:43.919262+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
),
(
    'f2e61d80-dac2-43b0-a90d-87ce923c3c1c', '2c54ddce-1d32-4d0b-8181-edfd37763aa4', 'Unmesh Gogoi', '8822095217', NULL, true, '2026-11-13T02:52:29.548285+00:00', '2026-11-13T02:52:29.548285+00:00', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
);

-- Invoices (1 row, 26 columns)
INSERT INTO _snapshot_invoices (
    id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at
) VALUES
(
    '55196fbd-e221-4d5b-a55d-3d55b1466382', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2c54ddce-1d32-4d0b-8181-edfd37763aa4', 'INV-WAN-20261113-6763', '2026-11-13', 'paid', 'Unmesh Gogoi', '8822095217', NULL, NULL, '2026-11-17', '2026-11-19', 'cabf8119-6326-4d63-994d-3de1cdc33ddc', 'Room No. 1', 7080, 0, 0, 0, 7080, 7080, 0, NULL, NULL, '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', '2026-11-13T02:53:35.517985+00:00', '2026-11-13T02:53:59.055747+00:00'
);

-- Invoice Items (3 rows, 11 columns)
INSERT INTO _snapshot_invoice_items (
    id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at
) VALUES
(
    '1a153644-1727-4445-9842-bca5e3e40139', '55196fbd-e221-4d5b-a55d-3d55b1466382', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'room', 'Room No. 1 – 2 Night Stay', '2026-11-17 to 2026-11-19', 2, 2500, 5000, 0, '2026-11-13T02:53:35.517985+00:00'
),
(
    '04ca6461-d8fa-4d88-a7a5-7d61b3810e8f', '55196fbd-e221-4d5b-a55d-3d55b1466382', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'custom', 'Tea', NULL, 4, 20, 80, 1, '2026-11-13T02:53:35.517985+00:00'
),
(
    '47139eee-0273-4782-b1ee-f026ef996b82', '55196fbd-e221-4d5b-a55d-3d55b1466382', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', 'custom', 'Laundry Service', NULL, 1, 2000, 2000, 2, '2026-11-13T02:53:35.517985+00:00'
);

-- Payments (2 rows, 13 columns)
INSERT INTO _snapshot_payments (
    id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id
) VALUES
(
    '4ce40a84-f7a1-4e4f-a206-4dfec4a10139', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2c54ddce-1d32-4d0b-8181-edfd37763aa4', 5000, 'payment', 'cash', NULL, NULL, NULL, '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'inv-pay-55196fbd-e221-4d5b-a55d-3d55b1466382-1794538429281', '2026-11-13T02:53:48.996801+00:00', '55196fbd-e221-4d5b-a55d-3d55b1466382'
),
(
    '5dfb7d20-3628-455c-929a-d10b34f0250b', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459', '2c54ddce-1d32-4d0b-8181-edfd37763aa4', 2080, 'payment', 'cash', NULL, NULL, NULL, '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf', 'inv-pay-55196fbd-e221-4d5b-a55d-3d55b1466382-1794538439632', '2026-11-13T02:53:59.055747+00:00', '55196fbd-e221-4d5b-a55d-3d55b1466382'
);

-- ------------------------------------------------------------------------------
-- 4. PREFLIGHT CONFLICT DETECTION & FOREIGN-KEY VALIDATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_conflicts INTEGER;
    v_missing_fks INTEGER;
BEGIN
    -- Check 1: Ensure target homestay exists
    IF NOT EXISTS (
        SELECT 1 FROM public.homestays WHERE id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: Target homestay Wangshi Homestay (%) does not exist in public.homestays!', 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    END IF;

    -- Check 2: Conflict detection (Ensure NO snapshot IDs already exist in production)
    SELECT COUNT(*) INTO v_conflicts FROM public.bookings b JOIN _snapshot_bookings s ON b.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % booking IDs already exist in public.bookings! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.guests g JOIN _snapshot_guests s ON g.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % guest IDs already exist in public.guests! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.invoices i JOIN _snapshot_invoices s ON i.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % invoice IDs already exist in public.invoices! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.invoice_items it JOIN _snapshot_invoice_items s ON it.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % invoice item IDs already exist in public.invoice_items! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    SELECT COUNT(*) INTO v_conflicts FROM public.payments p JOIN _snapshot_payments s ON p.id = s.id;
    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: % payment IDs already exist in public.payments! Conflicting IDs cannot be silently overwritten.', v_conflicts;
    END IF;

    -- Check 3: Foreign Key Dependency Validation
    -- Verify referenced room IDs exist under Wangshi
    SELECT COUNT(*) INTO v_missing_fks
    FROM (
        SELECT DISTINCT room_id FROM _snapshot_bookings
        EXCEPT
        SELECT id FROM public.rooms WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) missing_rooms;

    IF v_missing_fks > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: Foreign key dependency broken! % referenced room IDs do not exist under Wangshi in public.rooms.', v_missing_fks;
    END IF;

    -- Verify referenced partner IDs exist under Wangshi
    SELECT COUNT(*) INTO v_missing_fks
    FROM (
        SELECT DISTINCT partner_id FROM _snapshot_bookings
        EXCEPT
        SELECT id FROM public.partners WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) missing_partners;

    IF v_missing_fks > 0 THEN
        RAISE EXCEPTION 'PRE-ROLLBACK FAILED: Foreign key dependency broken! % referenced partner IDs do not exist under Wangshi in public.partners.', v_missing_fks;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. SEQUENTIAL PRODUCTION RESTORATION
-- ------------------------------------------------------------------------------

-- Step 1: Restore Bookings (32 rows)
INSERT INTO public.bookings (
    id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time
)
SELECT id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time
FROM _snapshot_bookings;

-- Step 2: Restore Guests (41 rows)
INSERT INTO public.guests (
    id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id
)
SELECT id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id
FROM _snapshot_guests;

-- Step 3: Restore Invoices (1 row)
INSERT INTO public.invoices (
    id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at
)
SELECT id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at
FROM _snapshot_invoices;

-- Step 4: Restore Invoice Items (3 rows)
INSERT INTO public.invoice_items (
    id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at
)
SELECT id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at
FROM _snapshot_invoice_items;

-- Step 5: Restore Payments (2 rows)
-- Temporarily suspend immutability and insert validation triggers for historical restore
ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;
ALTER TABLE public.payments DISABLE TRIGGER trg_validate_payment_integrity;

INSERT INTO public.payments (
    id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id
)
SELECT id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id
FROM _snapshot_payments;

ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;
ALTER TABLE public.payments ENABLE TRIGGER trg_validate_payment_integrity;

-- ------------------------------------------------------------------------------
-- 6. POSTFLIGHT FULL-COLUMN BIDIRECTIONAL EXCEPT VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_b_count INTEGER;
    v_g_count INTEGER;
    v_i_count INTEGER;
    v_it_count INTEGER;
    v_p_count INTEGER;
    v_mut_trg TEXT;
    v_val_trg TEXT;
BEGIN
    -- 1. Verify exact counts restored
    SELECT COUNT(*) INTO v_b_count FROM public.bookings WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_g_count FROM public.guests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_i_count FROM public.invoices WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_it_count FROM public.invoice_items WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    SELECT COUNT(*) INTO v_p_count FROM public.payments WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

    IF v_b_count <> 32 OR v_g_count <> 41 OR v_i_count <> 1 OR v_it_count <> 3 OR v_p_count <> 2 THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Count mismatch! Bookings: % (exp 32), Guests: % (exp 41), Invoices: % (exp 1), Items: % (exp 3), Payments: % (exp 2)',
            v_b_count, v_g_count, v_i_count, v_it_count, v_p_count;
    END IF;

    -- 2. Deep Full-Column Bidirectional EXCEPT: Bookings (all 15 columns)
    IF EXISTS (
        SELECT id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time FROM _snapshot_bookings
        EXCEPT
        SELECT id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time FROM public.bookings WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time FROM public.bookings WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT id, room_id, partner_id, check_in, check_out, status, number_of_guests, nightly_rate, total_amount, notes, created_at, updated_at, homestay_id, check_in_time, check_out_time FROM _snapshot_bookings
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored bookings do not match snapshot across all 15 columns!';
    END IF;

    -- 3. Deep Full-Column Bidirectional EXCEPT: Guests (all 9 columns)
    IF EXISTS (
        SELECT id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id FROM _snapshot_guests
        EXCEPT
        SELECT id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id FROM public.guests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id FROM public.guests WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT id, booking_id, name, phone, email, is_primary, created_at, updated_at, homestay_id FROM _snapshot_guests
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored guests do not match snapshot across all 9 columns!';
    END IF;

    -- 4. Deep Full-Column Bidirectional EXCEPT: Invoices (all 26 columns)
    IF EXISTS (
        SELECT id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at FROM _snapshot_invoices
        EXCEPT
        SELECT id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at FROM public.invoices WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at FROM public.invoices WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT id, homestay_id, booking_id, invoice_number, invoice_date, status, guest_name, guest_phone, guest_email, guest_address, check_in, check_out, room_id, room_name, subtotal, tax_rate, tax_amount, discount_amount, grand_total, amount_paid, balance_due, notes, house_rules, created_by, created_at, updated_at FROM _snapshot_invoices
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored invoice does not match snapshot across all 26 columns!';
    END IF;

    -- 5. Deep Full-Column Bidirectional EXCEPT: Invoice Items (all 11 columns)
    IF EXISTS (
        SELECT id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at FROM _snapshot_invoice_items
        EXCEPT
        SELECT id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at FROM public.invoice_items WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at FROM public.invoice_items WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT id, invoice_id, homestay_id, category, description, stay_period, quantity, rate, amount, sort_order, created_at FROM _snapshot_invoice_items
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored invoice items do not match snapshot across all 11 columns!';
    END IF;

    -- 6. Deep Full-Column Bidirectional EXCEPT: Payments (all 13 columns)
    IF EXISTS (
        SELECT id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id FROM _snapshot_payments
        EXCEPT
        SELECT id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id FROM public.payments WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
    ) OR EXISTS (
        SELECT id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id FROM public.payments WHERE homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459'
        EXCEPT
        SELECT id, homestay_id, booking_id, amount, payment_type, payment_method, parent_payment_id, transaction_ref, notes, recorded_by, idempotency_key, created_at, invoice_id FROM _snapshot_payments
    ) THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Restored payments do not match snapshot across all 13 columns!';
    END IF;

    -- 7. Verify Trigger Restoration State on public.payments
    SELECT t.tgenabled::text INTO v_mut_trg
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payments' AND t.tgname = 'trg_prevent_payment_ledger_mutation';

    SELECT t.tgenabled::text INTO v_val_trg
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payments' AND t.tgname = 'trg_validate_payment_integrity';

    IF v_mut_trg <> 'O' THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Trigger trg_prevent_payment_ledger_mutation was not re-enabled (status: %)!', v_mut_trg;
    END IF;

    IF v_val_trg <> 'O' THEN
        RAISE EXCEPTION 'POST-ROLLBACK VERIFICATION FAILED: Trigger trg_validate_payment_integrity was not re-enabled (status: %)!', v_val_trg;
    END IF;

    RAISE NOTICE '========================================================================';
    RAISE NOTICE 'ROLLBACK RESTORATION VERIFIED WITH FULL-COLUMN FIDELITY:';
    RAISE NOTICE '  - Exactly 32 Bookings restored and verified across all 15 columns';
    RAISE NOTICE '  - Exactly 41 Guests restored and verified across all 9 columns';
    RAISE NOTICE '  - Exactly 1 Invoice restored and verified across all 26 columns (INV-WAN-20261113-6763)';
    RAISE NOTICE '  - Exactly 3 Invoice Items restored and verified across all 11 columns (Room ₹5000, Tea ₹80, Laundry ₹2000)';
    RAISE NOTICE '  - Exactly 2 Payments restored and verified across all 13 columns (₹5000 + ₹2080 Cash)';
    RAISE NOTICE '  - Both payment triggers verified active ("O")';
    RAISE NOTICE '========================================================================';
END $$;

COMMIT;
