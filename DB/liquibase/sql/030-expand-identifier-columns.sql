-- ============================================================
-- Memgine - Expand technical identifier columns
-- varchar(40) -> varchar(64)
--
-- Rerunnable / idempotent: YES
--
-- Applies to:
--   * *_id
--   * created_by
--   * updated_by
--
-- Only existing varchar(40) columns are changed.
-- Columns already varchar(64) are therefore untouched.
-- ============================================================

DO $block$
DECLARE
    v_column record;
BEGIN
    FOR v_column IN
        SELECT
            c.table_name,
            c.column_name
        FROM information_schema.columns c
        WHERE c.table_schema = '${schemaName}'
          AND c.data_type = 'character varying'
          AND c.character_maximum_length = 40
          AND (
              c.column_name LIKE '%\_id' ESCAPE '\'
              OR c.column_name IN ('created_by', 'updated_by')
          )
        ORDER BY
            c.table_name,
            c.ordinal_position
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE varchar(64)',
            '${schemaName}',
            v_column.table_name,
            v_column.column_name
        );
    END LOOP;
END;
$block$;