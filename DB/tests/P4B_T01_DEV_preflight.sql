-- P4-B Test 01: read-only database preflight.
-- Run ONLY against DEV PostgreSQL 127.0.0.1:15432/memgine_dev.
-- No provider operations, data writes, or financial recovery calls.
BEGIN READ ONLY;
DO $test$
DECLARE
    v_migration_count integer;
    v_func record;
    v_check text;
    v_constraint text;
    v_role text := 'memgine_app_dev';
BEGIN
    SELECT count(*) INTO v_migration_count
    FROM memginedev.databasechangelog
    WHERE id = '166-financial-exception-fulfillment-recovery'
      AND exectype = 'EXECUTED';
    IF v_migration_count <> 1 THEN
        RAISE EXCEPTION 'P4B T01 FAIL: migration 166 not registered exactly once as EXECUTED (found %)', v_migration_count;
    END IF;

    FOR v_func IN
        SELECT * FROM (VALUES
          ('payment_recover_collect_financial_exception(varchar,varchar,varchar)'),
          ('commerce_open_counter_financial_exception_for_recovery(varchar,varchar,varchar)'),
          ('commerce_recover_counter_financial_exception(varchar,varchar,varchar)')
        ) AS required(signature)
    LOOP
        IF to_regprocedure('memginedev.' || v_func.signature) IS NULL THEN
            RAISE EXCEPTION 'P4B T01 FAIL: missing function %', v_func.signature;
        END IF;
        IF NOT EXISTS (
           SELECT 1 FROM pg_proc p
           WHERE p.oid = to_regprocedure('memginedev.' || v_func.signature)
             AND p.prosecdef
             AND p.proconfig @> ARRAY['search_path=pg_catalog, memginedev']::text[]
        ) THEN
            -- search_path formatting can vary; check actual config separately below.
            IF NOT EXISTS (
               SELECT 1 FROM pg_proc p
               WHERE p.oid = to_regprocedure('memginedev.' || v_func.signature)
                 AND p.prosecdef
                 AND EXISTS (SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%' AND x LIKE '%memginedev%')
            ) THEN
               RAISE EXCEPTION 'P4B T01 FAIL: function security/search_path invalid: %', v_func.signature;
            END IF;
        END IF;
        IF NOT has_function_privilege(v_role, to_regprocedure('memginedev.' || v_func.signature), 'EXECUTE') THEN
            RAISE EXCEPTION 'P4B T01 FAIL: application role cannot execute %', v_func.signature;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl WHERE p.oid = to_regprocedure('memginedev.' || v_func.signature) AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') THEN
            RAISE EXCEPTION 'P4B T01 FAIL: PUBLIC can execute %', v_func.signature;
        END IF;
    END LOOP;

    SELECT pg_get_constraintdef(c.oid) INTO v_constraint
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'memginedev'
      AND t.relname = 'poynt_collect_financial_exceptions'
      AND c.conname = 'ck_financial_exception_fulfillment_outcome';
    IF v_constraint IS NULL OR position('FULFILLED' IN v_constraint) = 0 THEN
       RAISE EXCEPTION 'P4B T01 FAIL: FULFILLED outcome not allowed in exception constraint';
    END IF;
    RAISE NOTICE 'P4B T01 PASS: migration 166, three secure functions, app permissions, and FULFILLED constraint verified';
END;
$test$;
ROLLBACK;
