-- Allow subscription rows to be created before payment finalization writes
-- the authoritative tax snapshot from payment_intents.
--
-- This block is explicitly rerunnable. It only drops NOT NULL when the column
-- currently has the constraint.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'subscriptions'
          AND column_name = 'subtotal_amount'
          AND is_nullable = 'NO'
    ) THEN
        EXECUTE 'ALTER TABLE "${schemaName}".subscriptions ALTER COLUMN subtotal_amount DROP NOT NULL';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'subscriptions'
          AND column_name = 'tax_rate'
          AND is_nullable = 'NO'
    ) THEN
        EXECUTE 'ALTER TABLE "${schemaName}".subscriptions ALTER COLUMN tax_rate DROP NOT NULL';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'subscriptions'
          AND column_name = 'tax_amount'
          AND is_nullable = 'NO'
    ) THEN
        EXECUTE 'ALTER TABLE "${schemaName}".subscriptions ALTER COLUMN tax_amount DROP NOT NULL';
    END IF;
END
$$;