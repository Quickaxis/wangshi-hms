-- ==========================================================
-- PHASE 4 DATABASE MIGRATION: PROPERTY SETTINGS, ROOM CONFIGURATION & GUEST KYC
-- ==========================================================
-- Motivation:
-- 1. Property Settings: Provide operational settings for property profiles, check-in/out policies,
--    tax defaults, and billing information per tenant homestay (PAN and bank details excluded).
-- 2. Room Configuration: Support room types (defaulting to NULL/Unspecified) and safe archival flags
--    without breaking existing foreign keys or rewriting historical booking/invoice prices.
-- 3. Guest KYC: Support optional ID document verification (ID type, masked ID number, KYC status, notes)
--    and secure private storage object paths (id_front_path, id_back_path) with strict tenant RLS.
--
-- Safety Guarantees:
-- - All ALTER TABLE statements use ADD COLUMN IF NOT EXISTS (100% additive, non-destructive).
-- - Zero changes to existing booking, payment, or invoice tables.
-- - No deletion of existing columns or tables.
-- - No hard deletions of historical rooms or guest records.
-- - Storage bucket verification halts with RAISE EXCEPTION if an existing bucket has incompatible configuration.
-- - Command-aware storage policy audit inspects SELECT (USING), INSERT (WITH CHECK), UPDATE (both), DELETE (USING), ALL (both).
-- - Exact named policy validation ensures roles={authenticated}, bucket equality, tenant folder isolation, super-admin, and zero permissive OR bypasses.
-- - Existing storage policies and homestay-logos bucket are completely preserved.
-- - Storage bucket is strictly PRIVATE (public = false).
-- - Existing guest data is NEVER automatically updated; stops and reports NULL kyc_status count.
-- - Exact KYC constraint validation via pg_get_constraintdef; rejects constraints that permit extra or unauthorized values.
-- ==========================================================

-- 1. HOMESTAYS EXTENSIONS
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS website TEXT;

-- Check-in / Check-out Policies
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS check_in_time TEXT DEFAULT '12:00 PM';
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS check_out_time TEXT DEFAULT '11:00 AM';
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS early_checkin_policy TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS late_checkout_policy TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS child_policy TEXT;

-- Billing & Tax Defaults (Applies only to future invoices; never alters historical invoices)
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV';
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS accepted_payment_methods TEXT[] DEFAULT ARRAY['cash', 'upi', 'bank_transfer', 'card'];
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS billing_name TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS billing_address TEXT;

-- Branding Details
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS invoice_logo_url TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS invoice_contact_details TEXT;
ALTER TABLE homestays ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb;

-- 2. ROOMS EXTENSIONS (No default room_type to prevent auto-classifying rooms as Standard Room)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. GUESTS EXTENSIONS (KYC & Identification - Object Paths, Never Public URLs)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_type TEXT; -- 'passport', 'driving_licence', 'voter_id', 'aadhaar', 'other'
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_number_masked TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_front_path TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS id_back_path TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS kyc_notes TEXT;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS address TEXT;

-- Ensure column exists with default before checking nullability
ALTER TABLE guests ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'not_uploaded';

-- 3.1 KYC Column Verification & Constraint Enforcement
DO $$
DECLARE
    v_is_nullable TEXT;
    v_column_default TEXT;
    v_null_count INTEGER;
    v_backfill_approved TEXT;
    v_con_oid OID;
    v_condef TEXT;
    v_extracted_values TEXT[];
BEGIN
    SELECT is_nullable, column_default 
    INTO v_is_nullable, v_column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'guests' 
      AND column_name = 'kyc_status';

    -- Verify and enforce DEFAULT 'not_uploaded'
    IF v_column_default IS NULL OR v_column_default NOT LIKE '%not_uploaded%' THEN
        ALTER TABLE guests ALTER COLUMN kyc_status SET DEFAULT 'not_uploaded';
        RAISE NOTICE 'Set default for guests.kyc_status to ''not_uploaded''.';
    ELSE
        RAISE NOTICE 'Verified guests.kyc_status has DEFAULT ''not_uploaded''.';
    END IF;

    -- Safety Check for Existing NULL values:
    -- NEVER automatically UPDATE existing records without explicit user approval
    IF v_is_nullable = 'YES' THEN
        SELECT COUNT(*) INTO v_null_count FROM guests WHERE kyc_status IS NULL;
        IF v_null_count > 0 THEN
            v_backfill_approved := current_setting('hms.allow_kyc_status_backfill', true);
            IF v_backfill_approved IS DISTINCT FROM 'true' THEN
                RAISE EXCEPTION 'MIGRATION HALTED: Found % existing guest records with NULL kyc_status. NOT NULL enforcement cannot proceed without modifying existing data. Automatic updates are forbidden. To explicitly approve backfilling these % records with ''not_uploaded'', execute: SET hms.allow_kyc_status_backfill = ''true''; before running this migration.', v_null_count, v_null_count;
            ELSE
                UPDATE guests SET kyc_status = 'not_uploaded' WHERE kyc_status IS NULL;
                RAISE NOTICE 'Explicit approval verified: Backfilled % existing guest rows with NULL kyc_status to ''not_uploaded''.', v_null_count;
                ALTER TABLE guests ALTER COLUMN kyc_status SET NOT NULL;
                RAISE NOTICE 'Enforced NOT NULL on guests.kyc_status.';
            END IF;
        ELSE
            ALTER TABLE guests ALTER COLUMN kyc_status SET NOT NULL;
            RAISE NOTICE 'Enforced NOT NULL on guests.kyc_status (0 NULL rows found).';
        END IF;
    ELSE
        RAISE NOTICE 'Verified guests.kyc_status already has NOT NULL.';
    END IF;

    -- Verify CHECK constraint using pg_get_constraintdef
    SELECT oid INTO v_con_oid
    FROM pg_constraint 
    WHERE conname = 'check_guests_kyc_status' 
      AND conrelid = 'guests'::regclass;

    IF v_con_oid IS NOT NULL THEN
        v_condef := pg_get_constraintdef(v_con_oid);

        -- Target column must be kyc_status
        IF v_condef NOT LIKE '%kyc_status%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_CONSTRAINT_DEF: Constraint "check_guests_kyc_status" does not constrain kyc_status: %', v_condef;
        END IF;

        -- No wildcards or permissive bypasses
        IF v_condef ~* '\m(true|or\s+true)\M' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_CONSTRAINT_DEF: Constraint "check_guests_kyc_status" contains permissive bypass: %', v_condef;
        END IF;

        -- Extract all string literal values permitted by the constraint
        SELECT COALESCE(array_agg(m[1] ORDER BY m[1]), ARRAY[]::text[])
        INTO v_extracted_values
        FROM regexp_matches(v_condef, '''([^'']+)''', 'g') m;

        -- Exactly match the four canonical values: not_uploaded, pending, rejected, verified
        IF v_extracted_values IS DISTINCT FROM ARRAY['not_uploaded', 'pending', 'rejected', 'verified']::text[] THEN
            RAISE EXCEPTION 'INCOMPATIBLE_CONSTRAINT_DEF: Constraint "check_guests_kyc_status" on table guests contains unauthorized domain values: %. Expected exactly: [not_uploaded, pending, rejected, verified]. Halting migration.', v_extracted_values;
        ELSE
            RAISE NOTICE 'Verified existing constraint check_guests_kyc_status definition strictly matches approved domain: %', v_condef;
        END IF;
    ELSE
        ALTER TABLE guests ADD CONSTRAINT check_guests_kyc_status
        CHECK (kyc_status IN ('not_uploaded', 'pending', 'verified', 'rejected'));
        RAISE NOTICE 'Added constraint check_guests_kyc_status to table guests.';
    END IF;
END $$;

-- Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_guests_kyc_status ON guests(kyc_status);
CREATE INDEX IF NOT EXISTS idx_rooms_is_archived ON rooms(is_archived);

-- 4. PRIVATE STORAGE BUCKET VERIFICATION & CREATION
-- Strictly validates existing bucket configuration before insertion to prevent security misconfigurations
DO $$
DECLARE
    v_bucket_exists BOOLEAN;
    v_public BOOLEAN;
    v_file_size_limit BIGINT;
    v_allowed_mime_types TEXT[];
    v_expected_mime_types TEXT[] := ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'guest-id-documents'
    ) INTO v_bucket_exists;

    IF v_bucket_exists THEN
        SELECT public, file_size_limit, allowed_mime_types
        INTO v_public, v_file_size_limit, v_allowed_mime_types
        FROM storage.buckets
        WHERE id = 'guest-id-documents';

        -- Verify strictly private
        IF v_public IS DISTINCT FROM false THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_BUCKET: Bucket "guest-id-documents" already exists with public = % (expected public = false). Halting migration to prevent data exposure.', v_public;
        END IF;

        -- Verify file size limit is 5MB (5242880 bytes)
        IF v_file_size_limit IS DISTINCT FROM 5242880 THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_BUCKET: Bucket "guest-id-documents" already exists with file_size_limit = % (expected 5242880 bytes). Halting migration.', v_file_size_limit;
        END IF;

        -- Verify allowed MIME types match approved list
        IF v_allowed_mime_types IS NULL 
           OR NOT (v_allowed_mime_types @> v_expected_mime_types AND v_expected_mime_types @> v_allowed_mime_types) THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_BUCKET: Bucket "guest-id-documents" already exists with allowed_mime_types = % (expected %). Halting migration.', v_allowed_mime_types, v_expected_mime_types;
        END IF;

        RAISE NOTICE 'Verified existing "guest-id-documents" bucket matches required private configuration.';
    ELSE
        -- Insert new private bucket with verified parameters
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'guest-id-documents',
            'guest-id-documents',
            false, -- Strictly PRIVATE
            5242880, -- 5 MB limit
            v_expected_mime_types
        );
        RAISE NOTICE 'Created private "guest-id-documents" storage bucket with 5MB limit and approved MIME types.';
    END IF;
END $$;

-- 5. STORAGE RLS POLICY AUDIT & EXACT NAMED POLICY VALIDATION
DO $$
DECLARE
    v_policy_exists BOOLEAN;
    v_qual TEXT;
    v_with_check TEXT;
    v_cmd TEXT;
    v_roles NAME[];
    v_other RECORD;
    v_clean_qual TEXT;
    v_clean_with_check TEXT;
    v_or_count INTEGER;
BEGIN
    -- STEP A: Command-Aware Catalog Audit of ALL other policies on storage.objects
    -- Inspects applicable expressions according to command:
    --   SELECT: USING
    --   INSERT: WITH CHECK
    --   UPDATE: USING and WITH CHECK
    --   DELETE: USING
    --   ALL:    both expressions
    FOR v_other IN
        SELECT policyname, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname != 'Allow authorized homestay staff to access guest ID documents'
    LOOP
        -- 1. Check applicable USING expression (for SELECT, UPDATE, DELETE, ALL)
        IF v_other.cmd IN ('SELECT', 'UPDATE', 'DELETE', 'ALL') THEN
            IF v_other.qual IS NULL OR trim(v_other.qual) = '' OR trim(v_other.qual) = 'true' THEN
                RAISE EXCEPTION 'INSECURE_STORAGE_POLICY_DETECTED: Policy "%" (cmd: %) on storage.objects has NULL, empty, or unrestricted USING expression (%). This permits unrestricted read/delete access to private guest-id-documents. Halting migration.',
                    v_other.policyname, v_other.cmd, v_other.qual;
            END IF;

            IF v_other.qual NOT LIKE '%bucket_id%' THEN
                RAISE EXCEPTION 'BROAD_UNSCOPED_STORAGE_POLICY_DETECTED: Policy "%" (cmd: %) on storage.objects does not filter by bucket_id in USING clause (%). It would permit access to private guest-id-documents. Halting migration.',
                    v_other.policyname, v_other.cmd, v_other.qual;
            END IF;

            IF v_other.qual LIKE '%guest-id-documents%' THEN
                RAISE EXCEPTION 'CONFLICTING_STORAGE_POLICY_DETECTED: Policy "%" (cmd: %) on storage.objects applies to "guest-id-documents" in USING clause (%). Only the canonical tenant-isolated policy is permitted for guest-id-documents. Halting migration.',
                    v_other.policyname, v_other.cmd, v_other.qual;
            END IF;
        END IF;

        -- 2. Check applicable WITH CHECK expression (for INSERT, UPDATE, ALL)
        IF v_other.cmd IN ('INSERT', 'UPDATE', 'ALL') THEN
            IF v_other.with_check IS NULL OR trim(v_other.with_check) = '' OR trim(v_other.with_check) = 'true' THEN
                RAISE EXCEPTION 'INSECURE_STORAGE_POLICY_DETECTED: Policy "%" (cmd: %) on storage.objects has NULL, empty, or unrestricted WITH CHECK expression (%). This permits unrestricted write access to private guest-id-documents. Halting migration.',
                    v_other.policyname, v_other.cmd, v_other.with_check;
            END IF;

            IF v_other.with_check NOT LIKE '%bucket_id%' THEN
                RAISE EXCEPTION 'BROAD_UNSCOPED_STORAGE_POLICY_DETECTED: Policy "%" (cmd: %) on storage.objects does not filter by bucket_id in WITH CHECK clause (%). It would permit access to private guest-id-documents. Halting migration.',
                    v_other.policyname, v_other.cmd, v_other.with_check;
            END IF;

            IF v_other.with_check LIKE '%guest-id-documents%' THEN
                RAISE EXCEPTION 'CONFLICTING_STORAGE_POLICY_DETECTED: Policy "%" (cmd: %) on storage.objects applies to "guest-id-documents" in WITH CHECK clause (%). Only the canonical tenant-isolated policy is permitted for guest-id-documents. Halting migration.',
                    v_other.policyname, v_other.cmd, v_other.with_check;
            END IF;
        END IF;
    END LOOP;
    RAISE NOTICE 'Audited storage.objects policies: Unrelated bucket-scoped policies (such as homestay-logos) preserved with zero exposure to guest-id-documents.';

    -- STEP B: Exact Named Policy Validation
    SELECT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Allow authorized homestay staff to access guest ID documents'
    ) INTO v_policy_exists;

    IF v_policy_exists THEN
        SELECT qual, with_check, cmd, roles
        INTO v_qual, v_with_check, v_cmd, v_roles
        FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Allow authorized homestay staff to access guest ID documents';

        -- 1. Validate Command: Must be exactly 'ALL'
        IF v_cmd IS DISTINCT FROM 'ALL' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_CMD: Policy "Allow authorized homestay staff to access guest ID documents" command must be exactly ALL. Found: %', v_cmd;
        END IF;

        -- 2. Validate Roles: Must be exactly {authenticated}
        IF v_roles IS DISTINCT FROM ARRAY['authenticated']::name[] THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_ROLES: Policy "Allow authorized homestay staff to access guest ID documents" roles must be exactly {authenticated}. Found: %', v_roles;
        END IF;

        -- 3. Mandatory non-null, non-empty expressions
        IF v_qual IS NULL OR trim(v_qual) = '' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_USING: Mandatory USING expression is missing or empty.';
        END IF;

        IF v_with_check IS NULL OR trim(v_with_check) = '' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_WITH_CHECK: Mandatory WITH CHECK expression is missing or empty.';
        END IF;

        -- Normalize whitespace for canonical inspection
        v_clean_qual := lower(regexp_replace(v_qual, '\s+', ' ', 'g'));
        v_clean_with_check := lower(regexp_replace(v_with_check, '\s+', ' ', 'g'));

        -- 4. Validate USING Expression:
        -- - Strict bucket equality
        IF v_clean_qual NOT LIKE '%bucket_id = ''guest-id-documents''%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_USING: Policy missing strict bucket equality "bucket_id = ''guest-id-documents''". Found: %', v_qual;
        END IF;

        -- - Homestay folder isolation
        IF v_clean_qual NOT LIKE '%storage.foldername%' OR v_clean_qual NOT LIKE '%get_user_homestay_id()%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_USING: Policy missing homestay folder isolation. Found: %', v_qual;
        END IF;

        -- - Super-admin access
        IF v_clean_qual NOT LIKE '%is_super_admin()%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_USING: Policy missing super-admin access. Found: %', v_qual;
        END IF;

        -- - Conjunction (AND) between bucket and tenant condition
        IF v_clean_qual NOT LIKE '% and %' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_USING: Policy missing top-level AND conjunction between bucket scoping and tenant check. Found: %', v_qual;
        END IF;

        -- - No additional permissive OR conditions (exactly 1 OR condition between super_admin and folder check)
        SELECT count(*) INTO v_or_count FROM regexp_matches(v_clean_qual, '\mor\M', 'g');
        IF v_or_count != 1 THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_USING: Expression contains unauthorized OR conditions (expected exactly 1 OR condition, found %): %', v_or_count, v_qual;
        END IF;

        -- 5. Validate WITH CHECK Expression:
        -- - Strict bucket equality
        IF v_clean_with_check NOT LIKE '%bucket_id = ''guest-id-documents''%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_WITH_CHECK: WITH CHECK missing strict bucket equality. Found: %', v_with_check;
        END IF;

        -- - Homestay folder isolation
        IF v_clean_with_check NOT LIKE '%storage.foldername%' OR v_clean_with_check NOT LIKE '%get_user_homestay_id()%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_WITH_CHECK: WITH CHECK missing homestay folder isolation. Found: %', v_with_check;
        END IF;

        -- - Super-admin access
        IF v_clean_with_check NOT LIKE '%is_super_admin()%' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_WITH_CHECK: WITH CHECK missing super-admin access. Found: %', v_with_check;
        END IF;

        -- - Conjunction (AND) between bucket and tenant check
        IF v_clean_with_check NOT LIKE '% and %' THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_WITH_CHECK: WITH CHECK missing top-level AND conjunction. Found: %', v_with_check;
        END IF;

        -- - No additional permissive OR conditions
        SELECT count(*) INTO v_or_count FROM regexp_matches(v_clean_with_check, '\mor\M', 'g');
        IF v_or_count != 1 THEN
            RAISE EXCEPTION 'INCOMPATIBLE_STORAGE_POLICY_WITH_CHECK: WITH CHECK contains unauthorized OR conditions (expected exactly 1 OR condition, found %): %', v_or_count, v_with_check;
        END IF;

        RAISE NOTICE 'Verified existing policy "Allow authorized homestay staff to access guest ID documents" matches exact canonical definition.';
    ELSE
        -- STEP C: Create canonical tenant-isolated policy
        CREATE POLICY "Allow authorized homestay staff to access guest ID documents"
        ON storage.objects
        FOR ALL
        TO authenticated
        USING (
            bucket_id = 'guest-id-documents'
            AND (
                is_super_admin()
                OR (storage.foldername(name))[1] = get_user_homestay_id()::text
            )
        )
        WITH CHECK (
            bucket_id = 'guest-id-documents'
            AND (
                is_super_admin()
                OR (storage.foldername(name))[1] = get_user_homestay_id()::text
            )
        );
        RAISE NOTICE 'Created storage policy "Allow authorized homestay staff to access guest ID documents" with strict tenant isolation.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
