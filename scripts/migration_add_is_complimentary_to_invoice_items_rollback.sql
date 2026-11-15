-- ==========================================================
-- HMS MIGRATION ROLLBACK: REMOVE is_complimentary FROM public.invoice_items
-- ==========================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_invoice_items_is_complimentary;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'invoice_items' 
          AND column_name = 'is_complimentary'
    ) THEN
        ALTER TABLE public.invoice_items 
            DROP COLUMN is_complimentary;

        RAISE NOTICE 'Dropped column "is_complimentary" from public.invoice_items.';
    END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

