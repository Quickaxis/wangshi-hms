-- ==========================================================
-- HMS MIGRATION: ADD is_complimentary TO public.invoice_items
-- ==========================================================
-- Strictly additive, idempotent, and non-destructive.
-- Preserves existing invoice items, rates, and historical data.
-- Adds is_complimentary BOOLEAN NOT NULL DEFAULT false.
-- Safe backfill for existing zero-rate non-discount items.
-- Reloads PostgREST schema cache via NOTIFY pgrst.
-- ==========================================================

BEGIN;

-- 1. Ensure prerequisite tables exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'invoice_items'
    ) THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_PREREQUISITE_MISSING: Table "public.invoice_items" does not exist.';
    END IF;
END $$;

-- 2. Add is_complimentary column safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'invoice_items' 
          AND column_name = 'is_complimentary'
    ) THEN
        ALTER TABLE public.invoice_items 
            ADD COLUMN is_complimentary BOOLEAN NOT NULL DEFAULT false;

        -- Safe backfill: any existing line items where rate is 0.00 and category is not discount
        UPDATE public.invoice_items
        SET is_complimentary = true
        WHERE rate = 0.00 AND category <> 'discount';

        RAISE NOTICE 'Added column "is_complimentary" to public.invoice_items with default false.';
    ELSE
        RAISE NOTICE 'Column "is_complimentary" already exists on public.invoice_items.';
    END IF;
END $$;

-- 3. Create index for complimentary line item lookups
CREATE INDEX IF NOT EXISTS idx_invoice_items_is_complimentary 
    ON public.invoice_items(is_complimentary) 
    WHERE is_complimentary = true;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

