--liquibase formatted sql
--changeset mynikatech:151-poynt-terminal-store-id-optional runOnChange:false splitStatements:false

DO $block$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = '"${schemaName}".poynt_terminal_bindings'::regclass
          AND attname = 'poynt_store_id'
          AND attnotnull
          AND NOT attisdropped
    ) THEN
        ALTER TABLE "${schemaName}".poynt_terminal_bindings
            ALTER COLUMN poynt_store_id DROP NOT NULL;
    END IF;
END;
$block$;