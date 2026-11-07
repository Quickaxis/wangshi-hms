-- ==========================================================
-- PHASE 4 LOCAL MIGRATION ROLLBACK SCRIPT
-- ==========================================================
-- WARNING: DATA LOSS RISKS & OPERATIONAL AUDIT SPECIFICATION
-- ----------------------------------------------------------
-- Executing this script will permanently DROP all Phase 4 columns and table constraints:
-- 1. homestays: Drops property profile (address, city, state, pincode, website),
--    check-in/out policies, billing settings (gstin, billing_name, billing_address, currency,
--    default_tax_rate, invoice_prefix, accepted_payment_methods), branding (invoice_logo_url,
--    invoice_contact_details), and settings_json.
-- 2. rooms: Drops room_type classification and is_archived flags.
-- 3. guests: Drops address, KYC metadata (id_type, id_number_masked, id_front_path, id_back_path,
--    kyc_status, kyc_notes) and check_guests_kyc_status constraint.
--
-- AUDIT SPECIFICATION: EXPECTED DEFAULTS VS. CONFIGURED VALUES
-- -------------------------------------------------------------------------------------------------
-- 1. EXPECTED UNCONFIGURED DEFAULTS (Will NOT trigger the rollback safety guard):
--    - guests:
--        kyc_status = 'not_uploaded'
--        id_type, id_number_masked, id_front_path, id_back_path, kyc_notes, address IS NULL
--    - rooms:
--        room_type IS NULL (or blank)
--        is_archived = FALSE
--    - homestays:
--        check_in_time = '12:00 PM'
--        check_out_time = '11:00 AM'
--        currency = 'INR'
--        default_tax_rate = 0
--        invoice_prefix = 'INV'
--        accepted_payment_methods = ARRAY['cash', 'upi', 'bank_transfer', 'card']::text[]
--        settings_json = '{}'::jsonb
--        address, city, state, pincode, website, early_checkin_policy, late_checkout_policy,
--        cancellation_policy, child_policy, billing_name, gstin, billing_address,
--        invoice_logo_url, invoice_contact_details ARE NULL (or blank)
--
-- 2. CONFIGURED BUSINESS VALUES (WILL TRIGGER THE ROLLBACK SAFETY GUARD & HALT EXECUTION):
--    - guests:
--        address IS NOT NULL AND trim(address) != ''
--        kyc_status != 'not_uploaded'
--        id_type, id_number_masked, id_front_path, id_back_path, kyc_notes populated
--    - rooms:
--        room_type IS NOT NULL AND trim(room_type) != ''
--        is_archived = TRUE
--    - homestays:
--        address, city, state, pincode, website, early_checkin_policy, late_checkout_policy,
--        cancellation_policy, child_policy, billing_name, gstin, billing_address,
--        invoice_logo_url, invoice_contact_details populated
--        check_in_time != '12:00 PM' OR check_out_time != '11:00 AM'
--        currency != 'INR' OR default_tax_rate != 0 OR invoice_prefix != 'INV'
--        accepted_payment_methods != ARRAY['cash', 'upi', 'bank_transfer', 'card']::text[]
--        settings_json != '{}'::jsonb
--
-- PARTIAL-SCHEMA SAFETY GUARANTEE:
-- - Every Phase 4 column is detected independently across guests, rooms, and homestays.
-- - No single column is used as a sentinel.
-- - If a partial Phase 4 schema exists on any table, rollback is REFUSED with a detailed list of missing columns.
-- - Data audit is NEVER skipped, inspecting every Phase 4 column that is present.
--
-- BUSINESS DATA PRESERVATION GUARANTEES:
-- - NEVER deletes existing bookings, guest profiles (id, name, phone, email), rooms, invoices, or payments.
-- - NEVER drops or empties the Supabase storage bucket 'guest-id-documents'.
-- - Uploaded ID document files in storage are 100% PRESERVED.
-- - Pre-flight validation checks if populated operational data exists in ANY Phase 4 column;
--   if found, rollback is REFUSED unless the explicit confirmation flag is set in the session:
--       SET hms.confirm_phase4_data_loss = 'true';
-- ==========================================================

-- PRE-FLIGHT COMPREHENSIVE DATA POPULATION & PARTIAL-SCHEMA AUDIT
DO $$
DECLARE
    v_confirm_flag TEXT;
    
    -- Canonical Phase 4 column definitions
    v_expected_guest_cols TEXT[] := ARRAY['id_type', 'id_number_masked', 'id_front_path', 'id_back_path', 'kyc_status', 'kyc_notes', 'address'];
    v_expected_room_cols TEXT[] := ARRAY['room_type', 'is_archived'];
    v_expected_homestay_cols TEXT[] := ARRAY['address', 'city', 'state', 'pincode', 'website', 'check_in_time', 'check_out_time', 'early_checkin_policy', 'late_checkout_policy', 'cancellation_policy', 'child_policy', 'currency', 'default_tax_rate', 'invoice_prefix', 'accepted_payment_methods', 'billing_name', 'gstin', 'billing_address', 'invoice_logo_url', 'invoice_contact_details', 'settings_json'];

    -- Present columns detected in database
    v_present_guest_cols TEXT[];
    v_present_room_cols TEXT[];
    v_present_homestay_cols TEXT[];

    -- Missing columns (if partial schema detected)
    v_missing_guest_cols TEXT[];
    v_missing_room_cols TEXT[];
    v_missing_homestay_cols TEXT[];

    -- Data population counters
    v_guest_data_count INTEGER := 0;
    v_room_data_count INTEGER := 0;
    v_homestay_data_count INTEGER := 0;

    -- Dynamic query fragments
    v_query TEXT;
    v_clauses TEXT[];
    v_col TEXT;
BEGIN
    v_confirm_flag := current_setting('hms.confirm_phase4_data_loss', true);

    -- =========================================================================
    -- 1. INDEPENDENT COLUMN DETECTION & PARTIAL-SCHEMA AUDIT
    -- =========================================================================

    -- 1A. Inspect guests table
    SELECT COALESCE(array_agg(column_name::text ORDER BY column_name), ARRAY[]::text[])
    INTO v_present_guest_cols
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'guests'
      AND column_name = ANY(v_expected_guest_cols);

    IF cardinality(v_present_guest_cols) > 0 AND cardinality(v_present_guest_cols) < cardinality(v_expected_guest_cols) THEN
        SELECT array_agg(c ORDER BY c)
        INTO v_missing_guest_cols
        FROM unnest(v_expected_guest_cols) c
        WHERE NOT (c = ANY(v_present_guest_cols));
    END IF;

    -- 1B. Inspect rooms table
    SELECT COALESCE(array_agg(column_name::text ORDER BY column_name), ARRAY[]::text[])
    INTO v_present_room_cols
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'rooms'
      AND column_name = ANY(v_expected_room_cols);

    IF cardinality(v_present_room_cols) > 0 AND cardinality(v_present_room_cols) < cardinality(v_expected_room_cols) THEN
        SELECT array_agg(c ORDER BY c)
        INTO v_missing_room_cols
        FROM unnest(v_expected_room_cols) c
        WHERE NOT (c = ANY(v_present_room_cols));
    END IF;

    -- 1C. Inspect homestays table
    SELECT COALESCE(array_agg(column_name::text ORDER BY column_name), ARRAY[]::text[])
    INTO v_present_homestay_cols
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'homestays'
      AND column_name = ANY(v_expected_homestay_cols);

    IF cardinality(v_present_homestay_cols) > 0 AND cardinality(v_present_homestay_cols) < cardinality(v_expected_homestay_cols) THEN
        SELECT array_agg(c ORDER BY c)
        INTO v_missing_homestay_cols
        FROM unnest(v_expected_homestay_cols) c
        WHERE NOT (c = ANY(v_present_homestay_cols));
    END IF;

    -- If ANY table has a partial Phase 4 schema, refuse rollback immediately
    IF v_missing_guest_cols IS NOT NULL OR v_missing_room_cols IS NOT NULL OR v_missing_homestay_cols IS NOT NULL THEN
        RAISE EXCEPTION '
================================================================================
ROLLBACK HALTED: PARTIAL PHASE 4 SCHEMA DETECTED!
================================================================================
The rollback script requires a consistent schema state before safe column drops.
One or more tables have incomplete Phase 4 columns:
  - guests: % of % present. Missing columns: %
  - rooms: % of % present. Missing columns: %
  - homestays: % of % present. Missing columns: %

Refusing rollback to prevent leaving the database in an undefined or broken state.
A Database Administrator must inspect and reconcile the missing schema columns.
================================================================================',
        cardinality(v_present_guest_cols), cardinality(v_expected_guest_cols), COALESCE(v_missing_guest_cols::text, 'none'),
        cardinality(v_present_room_cols), cardinality(v_expected_room_cols), COALESCE(v_missing_room_cols::text, 'none'),
        cardinality(v_present_homestay_cols), cardinality(v_expected_homestay_cols), COALESCE(v_missing_homestay_cols::text, 'none');
    END IF;

    -- =========================================================================
    -- 2. DATA AUDIT: NEVER SKIP A DATA AUDIT ACROSS PRESENT COLUMNS
    -- =========================================================================

    -- 2A. Audit data in guests (every present column audited independently)
    IF cardinality(v_present_guest_cols) > 0 THEN
        v_clauses := ARRAY[]::text[];
        FOREACH v_col IN ARRAY v_present_guest_cols LOOP
            IF v_col = 'kyc_status' THEN
                v_clauses := array_append(v_clauses, 'kyc_status != ''not_uploaded''');
            ELSIF v_col = 'address' THEN
                v_clauses := array_append(v_clauses, '(address IS NOT NULL AND trim(address) != '''')');
            ELSIF v_col = 'kyc_notes' THEN
                v_clauses := array_append(v_clauses, '(kyc_notes IS NOT NULL AND trim(kyc_notes) != '''')');
            ELSE
                v_clauses := array_append(v_clauses, quote_ident(v_col) || ' IS NOT NULL');
            END IF;
        END LOOP;

        IF cardinality(v_clauses) > 0 THEN
            v_query := 'SELECT COUNT(*) FROM guests WHERE ' || array_to_string(v_clauses, ' OR ');
            EXECUTE v_query INTO v_guest_data_count;
        END IF;
    END IF;

    -- 2B. Audit data in rooms (every present column audited independently)
    IF cardinality(v_present_room_cols) > 0 THEN
        v_clauses := ARRAY[]::text[];
        FOREACH v_col IN ARRAY v_present_room_cols LOOP
            IF v_col = 'room_type' THEN
                v_clauses := array_append(v_clauses, '(room_type IS NOT NULL AND trim(room_type) != '''')');
            ELSIF v_col = 'is_archived' THEN
                v_clauses := array_append(v_clauses, 'is_archived IS TRUE');
            END IF;
        END LOOP;

        IF cardinality(v_clauses) > 0 THEN
            v_query := 'SELECT COUNT(*) FROM rooms WHERE ' || array_to_string(v_clauses, ' OR ');
            EXECUTE v_query INTO v_room_data_count;
        END IF;
    END IF;

    -- 2C. Audit data in homestays (every present column audited independently)
    IF cardinality(v_present_homestay_cols) > 0 THEN
        v_clauses := ARRAY[]::text[];
        FOREACH v_col IN ARRAY v_present_homestay_cols LOOP
            IF v_col = 'check_in_time' THEN
                v_clauses := array_append(v_clauses, '(check_in_time IS NOT NULL AND check_in_time != ''12:00 PM'')');
            ELSIF v_col = 'check_out_time' THEN
                v_clauses := array_append(v_clauses, '(check_out_time IS NOT NULL AND check_out_time != ''11:00 AM'')');
            ELSIF v_col = 'currency' THEN
                v_clauses := array_append(v_clauses, '(currency IS NOT NULL AND currency != ''INR'')');
            ELSIF v_col = 'default_tax_rate' THEN
                v_clauses := array_append(v_clauses, '(default_tax_rate IS NOT NULL AND default_tax_rate != 0)');
            ELSIF v_col = 'invoice_prefix' THEN
                v_clauses := array_append(v_clauses, '(invoice_prefix IS NOT NULL AND invoice_prefix != ''INV'')');
            ELSIF v_col = 'accepted_payment_methods' THEN
                v_clauses := array_append(v_clauses, '(accepted_payment_methods IS NOT NULL AND accepted_payment_methods != ARRAY[''cash'', ''upi'', ''bank_transfer'', ''card'']::text[])');
            ELSIF v_col = 'settings_json' THEN
                v_clauses := array_append(v_clauses, '(settings_json IS NOT NULL AND settings_json != ''{}''::jsonb)');
            ELSE
                v_clauses := array_append(v_clauses, '(' || quote_ident(v_col) || ' IS NOT NULL AND trim(' || quote_ident(v_col) || ') != '''')');
            END IF;
        END LOOP;

        IF cardinality(v_clauses) > 0 THEN
            v_query := 'SELECT COUNT(*) FROM homestays WHERE ' || array_to_string(v_clauses, ' OR ');
            EXECUTE v_query INTO v_homestay_data_count;
        END IF;
    END IF;

    -- Halt if populated operational data is detected without explicit confirmation override
    IF (v_guest_data_count > 0 OR v_room_data_count > 0 OR v_homestay_data_count > 0) THEN
        IF v_confirm_flag IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION '
================================================================================
ROLLBACK HALTED: POPULATED PHASE 4 OPERATIONAL DATA DETECTED!
================================================================================
The rollback cannot proceed because actual business data was found in Phase 4 columns:
  - Guests with configured KYC or address data: %
  - Rooms with custom room types or archived states: %
  - Homestays with custom property profiles, policies, or billing configurations: %

Dropping these columns will PERMANENTLY DESTROY this operational data.

If you understand the risk and explicitly intend to purge this operational data,
you must execute the following command in your session before running this script:

    SET hms.confirm_phase4_data_loss = ''true'';

================================================================================',
            v_guest_data_count, v_room_data_count, v_homestay_data_count;
        ELSE
            RAISE WARNING 'ROLLBACK OVERRIDE ACTIVE: Dropping Phase 4 columns containing operational data (% guest records, % room configs, % homestay profiles).',
                v_guest_data_count, v_room_data_count, v_homestay_data_count;
        END IF;
    ELSE
        RAISE NOTICE 'Rollback pre-flight check passed: No populated Phase 4 operational data found.';
    END IF;
END $$;

-- 1. Remove storage policy only (preserves bucket and uploaded document blobs)
DROP POLICY IF EXISTS "Allow authorized homestay staff to access guest ID documents" ON storage.objects;

-- 2. Drop guests KYC check constraint, indexes & additive columns (preserves core guest records)
ALTER TABLE guests DROP CONSTRAINT IF EXISTS check_guests_kyc_status;
DROP INDEX IF EXISTS idx_guests_kyc_status;
ALTER TABLE guests DROP COLUMN IF EXISTS id_type;
ALTER TABLE guests DROP COLUMN IF EXISTS id_number_masked;
ALTER TABLE guests DROP COLUMN IF EXISTS id_front_path;
ALTER TABLE guests DROP COLUMN IF EXISTS id_back_path;
ALTER TABLE guests DROP COLUMN IF EXISTS kyc_status;
ALTER TABLE guests DROP COLUMN IF EXISTS kyc_notes;
ALTER TABLE guests DROP COLUMN IF EXISTS address;

-- 3. Drop rooms additive columns and indexes (preserves all room records and foreign keys)
DROP INDEX IF EXISTS idx_rooms_is_archived;
ALTER TABLE rooms DROP COLUMN IF EXISTS room_type;
ALTER TABLE rooms DROP COLUMN IF EXISTS is_archived;

-- 4. Drop homestays additive settings columns (preserves core homestay records)
ALTER TABLE homestays DROP COLUMN IF EXISTS address;
ALTER TABLE homestays DROP COLUMN IF EXISTS city;
ALTER TABLE homestays DROP COLUMN IF EXISTS state;
ALTER TABLE homestays DROP COLUMN IF EXISTS pincode;
ALTER TABLE homestays DROP COLUMN IF EXISTS website;
ALTER TABLE homestays DROP COLUMN IF EXISTS check_in_time;
ALTER TABLE homestays DROP COLUMN IF EXISTS check_out_time;
ALTER TABLE homestays DROP COLUMN IF EXISTS early_checkin_policy;
ALTER TABLE homestays DROP COLUMN IF EXISTS late_checkout_policy;
ALTER TABLE homestays DROP COLUMN IF EXISTS cancellation_policy;
ALTER TABLE homestays DROP COLUMN IF EXISTS child_policy;
ALTER TABLE homestays DROP COLUMN IF EXISTS currency;
ALTER TABLE homestays DROP COLUMN IF EXISTS default_tax_rate;
ALTER TABLE homestays DROP COLUMN IF EXISTS invoice_prefix;
ALTER TABLE homestays DROP COLUMN IF EXISTS accepted_payment_methods;
ALTER TABLE homestays DROP COLUMN IF EXISTS billing_name;
ALTER TABLE homestays DROP COLUMN IF EXISTS gstin;
ALTER TABLE homestays DROP COLUMN IF EXISTS billing_address;
ALTER TABLE homestays DROP COLUMN IF EXISTS invoice_logo_url;
ALTER TABLE homestays DROP COLUMN IF EXISTS invoice_contact_details;
ALTER TABLE homestays DROP COLUMN IF EXISTS settings_json;

NOTIFY pgrst, 'reload schema';
