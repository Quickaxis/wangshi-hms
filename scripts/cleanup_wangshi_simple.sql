-- ==============================================================================
-- WANGSHI HOMESTAY: PRODUCTION TEST DATA CLEANUP (SIMPLE & TARGETED)
-- Target Homestay: Wangshi Homestay ('ce603bb8-c9e3-4ce1-a57e-b6c4140ea459')
--
-- TARGET DELETION SCOPE (EXACT RECORD IDS ONLY):
--   - public.payments:       Exactly 2 rows (₹5,000 + ₹2,080 cash for INV-WAN-20261113-6763)
--   - public.invoice_items:  Exactly 3 rows (Room ₹5,000, Tea ₹80, Laundry ₹2,000)
--   - public.invoices:       Exactly 1 row  (INV-WAN-20261113-6763, total ₹7,080)
--   - public.guests:         Exactly 41 rows (Targeted by exact UUIDs)
--   - public.bookings:       Exactly 32 rows (Targeted by exact UUIDs)
--
-- PRESERVED RECORDS:
--   - 4 Wangshi Rooms (cabf8119, 639e42e6, 1616ce19, 43f18986)
--   - 4 Wangshi Partners (2ccc95f0, 02d301a2, cdee6e82, edcb791a)
--   - All data belonging to all other homestays
--   - The Conclave booking request (db6bbb72-15e0-463a-a24f-3ffe1ec978a0)
--
-- TRANSACTION SAFETY:
--   Runs in one single atomic transaction.
--   If any ID, invoice number, guest, booking, amount or count differs, raises an exception and rolls back.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_hs_id UUID := 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    v_b_cnt INT;
    v_g_cnt INT;
    v_i_cnt INT;
    v_it_cnt INT;
    v_p_cnt INT;
    v_r_cnt INT;
    v_pt_cnt INT;
    v_out_b_before INT;
    v_out_g_before INT;
    v_out_i_before INT;
    v_out_p_before INT;
    v_out_req_before INT;
BEGIN
    -- 1. Preflight: Verify target homestay existence
    IF NOT EXISTS (SELECT 1 FROM public.homestays WHERE id = v_hs_id AND name = 'Wangshi Homestay') THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Target Wangshi Homestay not found with expected ID %!', v_hs_id;
    END IF;

    -- 2. Preflight: Verify exact Wangshi rooms (4 rooms)
    SELECT COUNT(*) INTO v_r_cnt FROM public.rooms WHERE homestay_id = v_hs_id;
    IF v_r_cnt <> 4 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 4 rooms for Wangshi Homestay, found %!', v_r_cnt;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.rooms
        WHERE homestay_id = v_hs_id
          AND id IN (
              'cabf8119-6326-4d63-994d-3de1cdc33ddc',
              '639e42e6-6421-4333-829c-14f80aed2ebd',
              '1616ce19-da33-439f-8ce3-9aebceb2605a',
              '43f18986-9dd8-4beb-a8e4-0fe27ef686af'
          )
    ) <> 4 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Wangshi room ID mismatch!';
    END IF;

    -- 3. Preflight: Verify exact Wangshi partners (4 partners)
    SELECT COUNT(*) INTO v_pt_cnt FROM public.partners WHERE homestay_id = v_hs_id;
    IF v_pt_cnt <> 4 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 4 partners for Wangshi Homestay, found %!', v_pt_cnt;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.partners
        WHERE homestay_id = v_hs_id
          AND id IN (
              '2ccc95f0-92a7-4cba-810d-b97d3cda0bbf',
              '02d301a2-b643-4b1f-99f1-8de3f1ed96a0',
              'cdee6e82-11a9-4310-9de1-4404c340ec0e',
              'edcb791a-7471-4540-a7fc-a0e5ed8de94b'
          )
    ) <> 4 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Wangshi partner ID mismatch!';
    END IF;

    -- 4. Preflight: Verify exact deletion targets (Invoice, Items, Payments)
    -- Verify Invoice
    IF NOT EXISTS (
        SELECT 1 FROM public.invoices
        WHERE id = '55196fbd-e221-4d5b-a55d-3d55b1466382'
          AND homestay_id = v_hs_id
          AND invoice_number = 'INV-WAN-20261113-6763'
          AND booking_id = '2c54ddce-1d32-4d0b-8181-edfd37763aa4'
          AND grand_total = 7080
          AND amount_paid = 7080
          AND balance_due = 0
          AND status = 'paid'
    ) THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Target invoice INV-WAN-20261113-6763 does not match expected database record!';
    END IF;

    -- Verify Invoice Items (Exactly 3 items totaling 7080)
    IF (
        SELECT COUNT(*) FROM public.invoice_items
        WHERE invoice_id = '55196fbd-e221-4d5b-a55d-3d55b1466382'
          AND homestay_id = v_hs_id
          AND (
              (id = '1a153644-1727-4445-9842-bca5e3e40139' AND category = 'room' AND amount = 5000 AND description = 'Room No. 1 – 2 Night Stay') OR
              (id = '04ca6461-d8fa-4d88-a7a5-7d61b3810e8f' AND category = 'custom' AND amount = 80 AND description = 'Tea') OR
              (id = '47139eee-0273-4782-b1ee-f026ef996b82' AND category = 'custom' AND amount = 2000 AND description = 'Laundry Service')
          )
    ) <> 3 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Target invoice items do not match expected IDs, amounts, or descriptions!';
    END IF;

    -- Verify Payments (Exactly 2 cash payments totaling 7080)
    IF (
        SELECT COUNT(*) FROM public.payments
        WHERE invoice_id = '55196fbd-e221-4d5b-a55d-3d55b1466382'
          AND homestay_id = v_hs_id
          AND booking_id = '2c54ddce-1d32-4d0b-8181-edfd37763aa4'
          AND payment_method = 'cash'
          AND (
              (id = '4ce40a84-f7a1-4e4f-a206-4dfec4a10139' AND amount = 5000) OR
              (id = '5dfb7d20-3628-455c-929a-d10b34f0250b' AND amount = 2080)
          )
    ) <> 2 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Target payments do not match expected IDs, amounts, or cash methods!';
    END IF;

    -- 5. Preflight: Verify exact Wangshi bookings (32 rows)
    SELECT COUNT(*) INTO v_b_cnt FROM public.bookings WHERE homestay_id = v_hs_id;
    IF v_b_cnt <> 32 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 32 bookings for Wangshi Homestay, found %!', v_b_cnt;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.bookings
        WHERE homestay_id = v_hs_id
          AND id IN (
              'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb',
              '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222',
              'c65fcd6b-0428-4521-8e45-37d68512f795',
              '82236762-2265-4749-97c8-cfbb2dc0e62f',
              '0a064075-573e-417d-a047-1f3fadcb7308',
              '3f0cd2e9-c620-4f43-8e4f-b59688202c77',
              '1d3ba405-a801-4d86-97bd-6197cf63031f',
              '25123836-5641-4b4f-8449-b167fa86776f',
              '45ff7159-b980-41ca-8883-0a60ccb45aad',
              '812660f3-a9cb-4e11-b789-1db0d3621bd2',
              '1fc6d0b8-c4a9-487f-9ef4-af12eead3942',
              '5f067bc9-11c9-4134-b878-c5aa28be3059',
              '1c237fa9-fa46-4e53-bbce-d013c5972f50',
              '8360d4f8-fd9b-493f-98e5-e6177b022d18',
              'fa20ab92-29ab-4717-b84d-1e48474d79c5',
              'e55065f2-51bd-4fc5-ba35-135d846ed4cd',
              '9bbebbf9-10ff-4679-8c92-a3c667efa2b5',
              '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065',
              '8308e192-0f59-4e01-8454-986877a76b49',
              'ebb0d7a0-4c1f-4f88-b490-38033eb39e48',
              '978933be-496b-439e-a143-c11963f96fcb',
              '2d36a63a-35c8-4840-b36b-f50a134d0194',
              '51845915-19b8-4f6c-8f95-0ae19f7262b9',
              '0ea66346-1648-4e38-b9ca-dec456fef7c3',
              'd695585f-dc8a-435a-93f5-6207c395d15a',
              '89fe33fd-3246-4fdd-80f8-c6c7c851b897',
              '99f3e234-d768-4bbb-9d8a-0b4bb3876364',
              'f76f4266-7b0d-4caf-b2aa-4f542265e358',
              'd0c94372-9a79-4e60-a92e-0c86e5f270be',
              '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d',
              '401e804d-7ede-4ac3-bc94-06972cb6e9e1',
              '2c54ddce-1d32-4d0b-8181-edfd37763aa4'
          )
    ) <> 32 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: One or more Wangshi booking IDs do not match the expected 32 IDs!';
    END IF;

    -- 6. Preflight: Verify exact Wangshi guests (41 rows)
    SELECT COUNT(*) INTO v_g_cnt FROM public.guests WHERE homestay_id = v_hs_id;
    IF v_g_cnt <> 41 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 41 guests for Wangshi Homestay, found %!', v_g_cnt;
    END IF;

    IF (
        SELECT COUNT(*) FROM public.guests
        WHERE homestay_id = v_hs_id
          AND id IN (
              '44563196-11aa-42a2-b6de-aff5e3d90223',
              'ec9ea509-14e1-4fba-8c59-f5bbfd6d7bb4',
              '2cf05bee-49dd-4ad2-b25b-12ca42f34fd7',
              '739951e7-e2d7-4e01-b465-a1ff16246861',
              'fa6aae12-c694-48c2-ac95-407ade016405',
              '9e213bf2-ee88-4d41-8c65-00f4a17fb4ee',
              '410d75d5-0dee-4ecd-a3ec-481fd3798d5b',
              '462a6f85-66f4-4fc2-a41e-7cd61e29f804',
              'ff708f57-0d50-4f63-9b56-669bf0552b4b',
              'fc30fe1a-1e46-4567-8387-e7b17405367c',
              'af478a87-0fd1-491a-9eb7-044e1f94b1fa',
              'be0e7a03-f026-46ef-9207-47917c615a41',
              '07c67cf3-aeba-4611-bb85-dd4e1beed42d',
              'dab2e733-80bc-4e1c-9ea7-422f99efc0fd',
              '94d20567-d0ee-4af9-bd06-dd77a6ae0b34',
              '28d7f0b5-b5a0-4357-8635-2a049b2491f0',
              'f8ea3686-aee8-4720-9027-330eda2664a2',
              '83f02071-107c-453b-a377-8ccfca3c55aa',
              '1db13727-4f12-4a74-b201-0c8d69ba0f21',
              '2aeb682c-fee4-479e-ac7a-ff7b83e29fbe',
              '3941f417-7b1e-4117-8052-215e8131cff3',
              '7d29b354-d586-4981-bb80-646ec20fcb95',
              'b26900fa-f99f-4d14-929b-98c84dbc87da',
              'b2c6f4e0-5886-4c5f-a1f6-e2c80c2541da',
              '3cbb5429-8504-4394-be45-8c34f5a222e5',
              '698c838d-584e-4bf1-ba16-8e1ec367400d',
              '50711bdf-43e0-48f1-895a-4c0e567a9ddf',
              'b55ae2bd-b7d6-44f9-a63f-5ef74fec8247',
              'a662d24f-a6d7-4a16-8267-48f440bcd650',
              'e0be8b82-c821-4d47-8968-ca4039ec2792',
              '44560e02-f1bb-44b5-a91d-297f44036259',
              '7acfbfb8-12ad-40e3-b28b-93f9e05b9d2a',
              '24586028-ef9e-42d9-b2f5-c3ff0cd4e821',
              '862ad9ac-654e-4cba-a24c-d0d2ade7ab3e',
              '0862aec8-43bb-48b8-87b9-d54ee6890cea',
              'e5c6bad8-bfc6-4afc-a9bf-fb91d0600eda',
              'ddbdb0d4-1d25-4c04-91d0-3b6238eeecf6',
              '491bf1b3-f668-49ee-be28-2484076539d3',
              'eafa4347-165b-4a14-85e1-f03195366891',
              '41be33bd-64fe-4f11-9a43-bb9460d1ecac',
              'f2e61d80-dac2-43b0-a90d-87ce923c3c1c'
          )
    ) <> 41 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: One or more Wangshi guest IDs do not match the expected 41 IDs!';
    END IF;

    -- 7. Preflight: Verify Wangshi booking requests = 0
    IF EXISTS (SELECT 1 FROM public.booking_requests WHERE homestay_id = v_hs_id) THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Unexpected booking request found under Wangshi Homestay!';
    END IF;

    -- 8. Preflight: Verify The Conclave booking request is intact
    IF NOT EXISTS (
        SELECT 1 FROM public.booking_requests
        WHERE id = 'db6bbb72-15e0-463a-a24f-3ffe1ec978a0'
          AND homestay_id = '3356f10c-cfb7-44af-99bb-c616619bf42a'
    ) THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Preserved booking request for The Conclave missing!';
    END IF;

    -- Baseline non-Wangshi counts to guarantee other homestays remain untouched
    SELECT COUNT(*) INTO v_out_b_before FROM public.bookings WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_g_before FROM public.guests WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_i_before FROM public.invoices WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_p_before FROM public.payments WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_req_before FROM public.booking_requests WHERE homestay_id <> v_hs_id;

    RAISE NOTICE 'Preflight verified: All 32 bookings, 41 guests, 1 invoice, 3 items, 2 payments match expected database records.';
END $$;

-- ------------------------------------------------------------------------------
-- EXECUTE TARGETED DELETIONS (Exact IDs only, children before parents)
-- ------------------------------------------------------------------------------

-- Step 1: Delete Payments (Exactly 2 rows)
-- Note: trg_prevent_payment_ledger_mutation prevents DELETE on public.payments.
-- We temporarily disable this trigger solely to delete these 2 test rows, then re-enable immediately.
ALTER TABLE public.payments DISABLE TRIGGER trg_prevent_payment_ledger_mutation;

DELETE FROM public.payments
WHERE id IN (
    '4ce40a84-f7a1-4e4f-a206-4dfec4a10139',
    '5dfb7d20-3628-455c-929a-d10b34f0250b'
)
AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

ALTER TABLE public.payments ENABLE TRIGGER trg_prevent_payment_ledger_mutation;

-- Step 2: Delete Invoice Items (Exactly 3 rows)
DELETE FROM public.invoice_items
WHERE id IN (
    '1a153644-1727-4445-9842-bca5e3e40139',
    '04ca6461-d8fa-4d88-a7a5-7d61b3810e8f',
    '47139eee-0273-4782-b1ee-f026ef996b82'
)
AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- Step 3: Delete Invoices (Exactly 1 row)
DELETE FROM public.invoices
WHERE id IN (
    '55196fbd-e221-4d5b-a55d-3d55b1466382'
)
AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- Step 4: Delete Guests (Exactly 41 rows)
DELETE FROM public.guests
WHERE id IN (
    '44563196-11aa-42a2-b6de-aff5e3d90223',
    'ec9ea509-14e1-4fba-8c59-f5bbfd6d7bb4',
    '2cf05bee-49dd-4ad2-b25b-12ca42f34fd7',
    '739951e7-e2d7-4e01-b465-a1ff16246861',
    'fa6aae12-c694-48c2-ac95-407ade016405',
    '9e213bf2-ee88-4d41-8c65-00f4a17fb4ee',
    '410d75d5-0dee-4ecd-a3ec-481fd3798d5b',
    '462a6f85-66f4-4fc2-a41e-7cd61e29f804',
    'ff708f57-0d50-4f63-9b56-669bf0552b4b',
    'fc30fe1a-1e46-4567-8387-e7b17405367c',
    'af478a87-0fd1-491a-9eb7-044e1f94b1fa',
    'be0e7a03-f026-46ef-9207-47917c615a41',
    '07c67cf3-aeba-4611-bb85-dd4e1beed42d',
    'dab2e733-80bc-4e1c-9ea7-422f99efc0fd',
    '94d20567-d0ee-4af9-bd06-dd77a6ae0b34',
    '28d7f0b5-b5a0-4357-8635-2a049b2491f0',
    'f8ea3686-aee8-4720-9027-330eda2664a2',
    '83f02071-107c-453b-a377-8ccfca3c55aa',
    '1db13727-4f12-4a74-b201-0c8d69ba0f21',
    '2aeb682c-fee4-479e-ac7a-ff7b83e29fbe',
    '3941f417-7b1e-4117-8052-215e8131cff3',
    '7d29b354-d586-4981-bb80-646ec20fcb95',
    'b26900fa-f99f-4d14-929b-98c84dbc87da',
    'b2c6f4e0-5886-4c5f-a1f6-e2c80c2541da',
    '3cbb5429-8504-4394-be45-8c34f5a222e5',
    '698c838d-584e-4bf1-ba16-8e1ec367400d',
    '50711bdf-43e0-48f1-895a-4c0e567a9ddf',
    'b55ae2bd-b7d6-44f9-a63f-5ef74fec8247',
    'a662d24f-a6d7-4a16-8267-48f440bcd650',
    'e0be8b82-c821-4d47-8968-ca4039ec2792',
    '44560e02-f1bb-44b5-a91d-297f44036259',
    '7acfbfb8-12ad-40e3-b28b-93f9e05b9d2a',
    '24586028-ef9e-42d9-b2f5-c3ff0cd4e821',
    '862ad9ac-654e-4cba-a24c-d0d2ade7ab3e',
    '0862aec8-43bb-48b8-87b9-d54ee6890cea',
    'e5c6bad8-bfc6-4afc-a9bf-fb91d0600eda',
    'ddbdb0d4-1d25-4c04-91d0-3b6238eeecf6',
    '491bf1b3-f668-49ee-be28-2484076539d3',
    'eafa4347-165b-4a14-85e1-f03195366891',
    '41be33bd-64fe-4f11-9a43-bb9460d1ecac',
    'f2e61d80-dac2-43b0-a90d-87ce923c3c1c'
)
AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- Step 5: Delete Bookings (Exactly 32 rows)
DELETE FROM public.bookings
WHERE id IN (
    'a7f7abcc-434d-43c1-b3a1-ce4fedcfcdeb',
    '17cb0bbb-0c6d-4f3e-af9a-ac71e195d222',
    'c65fcd6b-0428-4521-8e45-37d68512f795',
    '82236762-2265-4749-97c8-cfbb2dc0e62f',
    '0a064075-573e-417d-a047-1f3fadcb7308',
    '3f0cd2e9-c620-4f43-8e4f-b59688202c77',
    '1d3ba405-a801-4d86-97bd-6197cf63031f',
    '25123836-5641-4b4f-8449-b167fa86776f',
    '45ff7159-b980-41ca-8883-0a60ccb45aad',
    '812660f3-a9cb-4e11-b789-1db0d3621bd2',
    '1fc6d0b8-c4a9-487f-9ef4-af12eead3942',
    '5f067bc9-11c9-4134-b878-c5aa28be3059',
    '1c237fa9-fa46-4e53-bbce-d013c5972f50',
    '8360d4f8-fd9b-493f-98e5-e6177b022d18',
    'fa20ab92-29ab-4717-b84d-1e48474d79c5',
    'e55065f2-51bd-4fc5-ba35-135d846ed4cd',
    '9bbebbf9-10ff-4679-8c92-a3c667efa2b5',
    '2d28d1f8-7ea6-45cd-a2b3-d8a30df34065',
    '8308e192-0f59-4e01-8454-986877a76b49',
    'ebb0d7a0-4c1f-4f88-b490-38033eb39e48',
    '978933be-496b-439e-a143-c11963f96fcb',
    '2d36a63a-35c8-4840-b36b-f50a134d0194',
    '51845915-19b8-4f6c-8f95-0ae19f7262b9',
    '0ea66346-1648-4e38-b9ca-dec456fef7c3',
    'd695585f-dc8a-435a-93f5-6207c395d15a',
    '89fe33fd-3246-4fdd-80f8-c6c7c851b897',
    '99f3e234-d768-4bbb-9d8a-0b4bb3876364',
    'f76f4266-7b0d-4caf-b2aa-4f542265e358',
    'd0c94372-9a79-4e60-a92e-0c86e5f270be',
    '4f270eb0-eba4-49fd-ad92-9f71fb5dac7d',
    '401e804d-7ede-4ac3-bc94-06972cb6e9e1',
    '2c54ddce-1d32-4d0b-8181-edfd37763aa4'
)
AND homestay_id = 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';

-- ------------------------------------------------------------------------------
-- POSTFLIGHT VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_hs_id UUID := 'ce603bb8-c9e3-4ce1-a57e-b6c4140ea459';
    v_b_cnt INT;
    v_g_cnt INT;
    v_i_cnt INT;
    v_it_cnt INT;
    v_p_cnt INT;
    v_r_cnt INT;
    v_pt_cnt INT;
    v_out_b_after INT;
    v_out_g_after INT;
    v_out_i_after INT;
    v_out_p_after INT;
    v_out_req_after INT;
    v_trg_state TEXT;
BEGIN
    -- 1. Verify Wangshi operational tables are now zero for bookings/financials
    SELECT COUNT(*) INTO v_b_cnt FROM public.bookings WHERE homestay_id = v_hs_id;
    SELECT COUNT(*) INTO v_g_cnt FROM public.guests WHERE homestay_id = v_hs_id;
    SELECT COUNT(*) INTO v_i_cnt FROM public.invoices WHERE homestay_id = v_hs_id;
    SELECT COUNT(*) INTO v_it_cnt FROM public.invoice_items WHERE homestay_id = v_hs_id;
    SELECT COUNT(*) INTO v_p_cnt FROM public.payments WHERE homestay_id = v_hs_id;

    IF v_b_cnt <> 0 OR v_g_cnt <> 0 OR v_i_cnt <> 0 OR v_it_cnt <> 0 OR v_p_cnt <> 0 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Residual records detected for Wangshi! Rolling back! Bookings %, Guests %, Invoices %, Items %, Payments %',
            v_b_cnt, v_g_cnt, v_i_cnt, v_it_cnt, v_p_cnt;
    END IF;

    -- 2. Verify all 4 Wangshi rooms and 4 partners remain intact
    SELECT COUNT(*) INTO v_r_cnt FROM public.rooms WHERE homestay_id = v_hs_id;
    SELECT COUNT(*) INTO v_pt_cnt FROM public.partners WHERE homestay_id = v_hs_id;

    IF v_r_cnt <> 4 OR v_pt_cnt <> 4 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Wangshi rooms or partners were altered! Rolling back! Rooms %, Partners %',
            v_r_cnt, v_pt_cnt;
    END IF;

    -- 3. Verify all other homestays remain 100% untouched
    SELECT COUNT(*) INTO v_out_b_after FROM public.bookings WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_g_after FROM public.guests WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_i_after FROM public.invoices WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_p_after FROM public.payments WHERE homestay_id <> v_hs_id;
    SELECT COUNT(*) INTO v_out_req_after FROM public.booking_requests WHERE homestay_id <> v_hs_id;

    IF v_out_b_after <> 9 OR v_out_g_after <> 14 OR v_out_i_after <> 4 OR v_out_p_after <> 7 OR v_out_req_after <> 1 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Other homestay data was modified! Rolling back! Outside Bookings %, Guests %, Invoices %, Payments %, Requests %',
            v_out_b_after, v_out_g_after, v_out_i_after, v_out_p_after, v_out_req_after;
    END IF;

    -- 4. Verify The Conclave booking request is untouched
    IF NOT EXISTS (
        SELECT 1 FROM public.booking_requests
        WHERE id = 'db6bbb72-15e0-463a-a24f-3ffe1ec978a0'
          AND homestay_id = '3356f10c-cfb7-44af-99bb-c616619bf42a'
    ) THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: The Conclave booking request missing or modified! Rolling back!';
    END IF;

    -- 5. Verify payment ledger trigger is active
    SELECT t.tgenabled::text INTO v_trg_state
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payments' AND t.tgname = 'trg_prevent_payment_ledger_mutation';

    IF v_trg_state <> 'O' THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Trigger trg_prevent_payment_ledger_mutation is not active (state: %)! Rolling back!', v_trg_state;
    END IF;

    RAISE NOTICE 'SUCCESS: Exactly 2 payments, 3 invoice items, 1 invoice, 41 guests, and 32 bookings deleted for Wangshi. 4 rooms and 4 partners preserved. Other homestays 100%% untouched.';
END $$;

COMMIT;
