-- ==============================================================================
-- PRODUCTION PREFLIGHT AUDIT REPORT FOR PHASE 1 PAYMENTS LEDGER
-- ==============================================================================
-- DIRECTIVE: STRICTLY READ-ONLY.
-- DOES NOT INSERT, UPDATE, DELETE, ALTER, OR LOCK ANY PRODUCTION DATA.
--
-- PURPOSE:
-- Executes exhaustive pre-validation diagnostics against the live payments table
-- to confirm readiness for Phase 1 migration (NOT NULL & Foreign Key enforcement).
--
-- EVALUATES:
-- 1. NULL values across critical columns (homestay_id, booking_id, amount, payment_type, payment_method, recorded_by).
-- 2. Invalid data values (non-positive amounts, invalid payment_types, invalid payment_methods).
-- 3. Orphaned foreign keys (payments referencing non-existent homestays, bookings, partners, or parent payments).
-- 4. Invalid parent payment relationships (parent not 'payment', parent on different booking, reversals without parent).
-- 5. Cumulative refund/reversal balances and negative global net cash positions.
-- ==============================================================================

-- 1. Comprehensive Check Diagnostics Table
WITH 
payment_diagnostics AS (
    SELECT
        COUNT(*) AS total_records,
        -- Null checks
        COUNT(*) FILTER (WHERE homestay_id IS NULL) AS null_homestay_count,
        COUNT(*) FILTER (WHERE booking_id IS NULL) AS null_booking_count,
        COUNT(*) FILTER (WHERE amount IS NULL) AS null_amount_count,
        COUNT(*) FILTER (WHERE payment_type IS NULL) AS null_type_count,
        COUNT(*) FILTER (WHERE payment_method IS NULL) AS null_method_count,
        COUNT(*) FILTER (WHERE recorded_by IS NULL) AS null_recorded_by_count,
        -- Value constraint checks
        COUNT(*) FILTER (WHERE amount <= 0) AS non_positive_amount_count,
        COUNT(*) FILTER (WHERE payment_type NOT IN ('payment', 'refund', 'reversal')) AS invalid_type_count,
        COUNT(*) FILTER (WHERE payment_method NOT IN ('cash', 'upi', 'bank_transfer', 'card', 'ota_payout')) AS invalid_method_count
    FROM public.payments
),
orphan_diagnostics AS (
    SELECT
        -- Orphan foreign key checks
        (SELECT COUNT(*) FROM public.payments p WHERE p.homestay_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.homestays h WHERE h.id = p.homestay_id)) AS orphan_homestay_count,
        (SELECT COUNT(*) FROM public.payments p WHERE p.booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p.booking_id)) AS orphan_booking_count,
        (SELECT COUNT(*) FROM public.payments p WHERE p.recorded_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.partners pt WHERE pt.id = p.recorded_by)) AS orphan_partner_count,
        (SELECT COUNT(*) FROM public.payments p WHERE p.parent_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payments pp WHERE pp.id = p.parent_payment_id)) AS orphan_parent_count
),
parent_relationship_diagnostics AS (
    SELECT
        -- Reversal without parent payment
        COUNT(*) FILTER (WHERE payment_type = 'reversal' AND parent_payment_id IS NULL) AS reversal_missing_parent_count,
        -- Original payment with parent_payment_id
        COUNT(*) FILTER (WHERE payment_type = 'payment' AND parent_payment_id IS NOT NULL) AS payment_with_parent_count,
        -- Parent payment is not of type 'payment'
        (
            SELECT COUNT(*) 
            FROM public.payments child
            JOIN public.payments parent ON child.parent_payment_id = parent.id
            WHERE parent.payment_type <> 'payment'
        ) AS invalid_parent_type_count,
        -- Parent payment belongs to a different booking
        (
            SELECT COUNT(*) 
            FROM public.payments child
            JOIN public.payments parent ON child.parent_payment_id = parent.id
            WHERE parent.booking_id <> child.booking_id
        ) AS cross_booking_parent_count
    FROM public.payments
),
over_allocated_parent_diagnostics AS (
    SELECT COUNT(*) AS over_allocated_parent_count
    FROM (
        SELECT 
            parent.id AS parent_id,
            parent.amount AS original_amount,
            COALESCE(SUM(child.amount), 0) AS allocated_amount
        FROM public.payments parent
        JOIN public.payments child ON child.parent_payment_id = parent.id
        WHERE child.payment_type IN ('reversal', 'refund')
        GROUP BY parent.id, parent.amount
        HAVING COALESCE(SUM(child.amount), 0) > parent.amount
    ) over_alloc
),
negative_cash_booking_diagnostics AS (
    SELECT COUNT(*) AS negative_cash_booking_count
    FROM (
        SELECT 
            booking_id,
            SUM(
                CASE 
                    WHEN payment_type = 'payment' THEN amount 
                    WHEN payment_type IN ('refund', 'reversal') THEN -amount 
                    ELSE 0 
                END
            ) AS net_cash
        FROM public.payments
        GROUP BY booking_id
        HAVING SUM(
            CASE 
                WHEN payment_type = 'payment' THEN amount 
                WHEN payment_type IN ('refund', 'reversal') THEN -amount 
                ELSE 0 
            END
        ) < 0
    ) neg_cash
),
raw_checks AS (
    -- Metadata
    SELECT 
        1 AS check_id,
        'Total Payments Count' AS check_name,
        'METRIC' AS category,
        pd.total_records AS detected_violations,
        'Informational total of all payment ledger records.' AS remediation_guidance
    FROM payment_diagnostics pd
    
    UNION ALL
    -- NULL checks
    SELECT 2, 'NULL homestay_id', 'NOT NULL', pd.null_homestay_count, 'Resolve missing homestay associations before Phase 1 applies NOT NULL.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 3, 'NULL booking_id', 'NOT NULL', pd.null_booking_count, 'Resolve missing booking associations before Phase 1 applies NOT NULL.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 4, 'NULL amount', 'NOT NULL', pd.null_amount_count, 'Resolve missing payment amounts before Phase 1 applies NOT NULL.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 5, 'NULL payment_type', 'NOT NULL', pd.null_type_count, 'Resolve missing payment types before Phase 1 applies NOT NULL.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 6, 'NULL payment_method', 'NOT NULL', pd.null_method_count, 'Resolve missing payment methods before Phase 1 applies NOT NULL.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 7, 'NULL recorded_by', 'NOT NULL', pd.null_recorded_by_count, 'Resolve missing partner recorder IDs before Phase 1 applies NOT NULL.' FROM payment_diagnostics pd
    
    UNION ALL
    -- Value Constraint checks
    SELECT 8, 'Non-Positive Amount (amount <= 0)', 'CHECK CONSTRAINT', pd.non_positive_amount_count, 'Payments must have amount > 0.00. Refunds/reversals are positive amounts of their respective type.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 9, 'Invalid payment_type', 'CHECK CONSTRAINT', pd.invalid_type_count, 'Allowed types: payment, refund, reversal.' FROM payment_diagnostics pd
    UNION ALL
    SELECT 10, 'Invalid payment_method', 'CHECK CONSTRAINT', pd.invalid_method_count, 'Allowed methods: cash, upi, bank_transfer, card, ota_payout.' FROM payment_diagnostics pd
    
    UNION ALL
    -- Orphan FK checks
    SELECT 11, 'Orphaned homestay_id', 'FOREIGN KEY', od.orphan_homestay_count, 'Payment references homestay_id not found in public.homestays.' FROM orphan_diagnostics od
    UNION ALL
    SELECT 12, 'Orphaned booking_id', 'FOREIGN KEY', od.orphan_booking_count, 'Payment references booking_id not found in public.bookings.' FROM orphan_diagnostics od
    UNION ALL
    SELECT 13, 'Orphaned recorded_by', 'FOREIGN KEY', od.orphan_partner_count, 'Payment references recorded_by partner not found in public.partners.' FROM orphan_diagnostics od
    UNION ALL
    SELECT 14, 'Orphaned parent_payment_id', 'FOREIGN KEY', od.orphan_parent_count, 'Child payment references parent_payment_id not found in public.payments.' FROM orphan_diagnostics od
    
    UNION ALL
    -- Parent-child relationships
    SELECT 15, 'Reversal Missing Parent Payment', 'RELATIONSHIP', prd.reversal_missing_parent_count, 'Reversal entries must link to the original parent payment (parent_payment_id).' FROM parent_relationship_diagnostics prd
    UNION ALL
    SELECT 16, 'Original Payment With Parent Reference', 'RELATIONSHIP', prd.payment_with_parent_count, 'Original "payment" entries cannot link to a parent payment.' FROM parent_relationship_diagnostics prd
    UNION ALL
    SELECT 17, 'Parent Payment Not Original Payment Type', 'RELATIONSHIP', prd.invalid_parent_type_count, 'Parent payment must be an original "payment" entry (not refund or reversal).' FROM parent_relationship_diagnostics prd
    UNION ALL
    SELECT 18, 'Cross-Booking Parent Payment Reference', 'RELATIONSHIP', prd.cross_booking_parent_count, 'Parent payment and child payment must belong to the exact same booking_id.' FROM parent_relationship_diagnostics prd
    UNION ALL
    SELECT 19, 'Parent Payment Over-Allocated Balance', 'FINANCIAL INTEGRITY', oap.over_allocated_parent_count, 'Combined refunds and reversals on parent payment exceed the parent payment amount.' FROM over_allocated_parent_diagnostics oap
    UNION ALL
    SELECT 20, 'Negative Global Net Cash Booking', 'FINANCIAL INTEGRITY', ncb.negative_cash_booking_count, 'Cumulative refunds/reversals on booking exceed total collected payments.' FROM negative_cash_booking_diagnostics ncb
),
evaluated_report AS (
    SELECT 
        check_id,
        check_name,
        category,
        detected_violations,
        CASE 
            WHEN check_id = 1 THEN 'INFO'
            WHEN detected_violations = 0 THEN 'PASS'
            ELSE 'FAIL - BLOCKING'
        END AS status,
        remediation_guidance
    FROM raw_checks
)
-- 1. Detailed Diagnostic Breakdown
SELECT 
    check_id,
    check_name,
    category,
    detected_violations,
    status,
    remediation_guidance
FROM evaluated_report

UNION ALL

-- 2. Overall Readiness Summary (Dynamically Computed from Real Diagnostics)
SELECT 
    999 AS check_id,
    'OVERALL MIGRATION READINESS' AS check_name,
    'SUMMARY' AS category,
    COALESCE(SUM(CASE WHEN check_id > 1 AND status = 'FAIL - BLOCKING' THEN detected_violations ELSE 0 END), 0) AS detected_violations,
    CASE 
        WHEN COALESCE(SUM(CASE WHEN check_id > 1 AND status = 'FAIL - BLOCKING' THEN 1 ELSE 0 END), 0) = 0 THEN 'READY'
        ELSE 'BLOCKED'
    END AS status,
    CASE 
        WHEN COALESCE(SUM(CASE WHEN check_id > 1 AND status = 'FAIL - BLOCKING' THEN 1 ELSE 0 END), 0) = 0 THEN
            'SUCCESS: ALL CHECKS PASSED (0 VIOLATIONS). PRODUCTION DATABASE IS 100% READY FOR PHASE 1 MIGRATION.'
        ELSE
            'ALERT: ' || SUM(CASE WHEN check_id > 1 AND status = 'FAIL - BLOCKING' THEN 1 ELSE 0 END)::text || 
            ' BLOCKING VIOLATION CATEGORIES DETECTED. DO NOT PROCEED WITH PHASE 1 UNTIL MANUAL DATA RESOLUTION IS PERFORMED.'
    END AS remediation_guidance
FROM evaluated_report
ORDER BY check_id;
