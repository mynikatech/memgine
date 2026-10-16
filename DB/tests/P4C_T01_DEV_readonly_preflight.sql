-- P4-C / Test 01 / DEV / READ-ONLY
-- Run from a connection to 127.0.0.1:15432/memgine_dev, schema memginedev.
-- This script NEVER modifies data and does not invoke recovery/provider functions.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;

DO $test$
DECLARE
  v_migrations integer;
  v_trigger integer;
  v_missing integer;
  v_duplicate integer;
  v_unexpected integer;
  v_events bigint;
BEGIN
  IF current_database() <> 'memgine_dev' OR to_regnamespace('memginedev') IS NULL THEN
    RAISE EXCEPTION 'P4C T01 STOP: unexpected database/schema';
  END IF;

  SELECT count(*) INTO v_migrations
  FROM memginedev.databasechangelog
  WHERE id = '167-financial-exception-lifecycle-audit'
    AND author = 'mynikatech'
    AND exectype = 'EXECUTED';
  IF v_migrations <> 1 THEN
    RAISE EXCEPTION 'P4C T01 FAIL: migration 167 recorded % times', v_migrations;
  END IF;

  IF to_regclass('memginedev.financial_exception_events') IS NULL THEN
    RAISE EXCEPTION 'P4C T01 FAIL: audit table missing';
  END IF;

  SELECT count(*) INTO v_trigger
  FROM pg_trigger
  WHERE tgrelid = 'memginedev.poynt_collect_financial_exceptions'::regclass
    AND tgname = 'financial_exception_audit_after_change'
    AND NOT tgisinternal AND tgenabled <> 'D';
  IF v_trigger <> 1 THEN
    RAISE EXCEPTION 'P4C T01 FAIL: active audit trigger count %', v_trigger;
  END IF;

  -- App role may execute vetted functions but cannot write directly to audit table.
  IF has_table_privilege('memgine_app_dev', 'memginedev.financial_exception_events', 'INSERT')
     OR has_table_privilege('memgine_app_dev', 'memginedev.financial_exception_events', 'UPDATE')
     OR has_table_privilege('memgine_app_dev', 'memginedev.financial_exception_events', 'DELETE') THEN
    RAISE EXCEPTION 'P4C T01 FAIL: app role has direct audit write privilege';
  END IF;

  IF NOT has_function_privilege('memgine_app_dev',
       'memginedev.financial_exception_record_recovery_failure(character varying,character varying,character varying,character varying,character varying)', 'EXECUTE')
     OR NOT has_function_privilege('memgine_app_dev',
       'memginedev.financial_exception_transition(character varying,character varying,character varying,character varying,character varying)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P4C T01 FAIL: app role missing required function execution privilege';
  END IF;

  SELECT count(*) INTO v_missing
  FROM memginedev.poynt_collect_financial_exceptions c
  WHERE NOT EXISTS (
    SELECT 1 FROM memginedev.financial_exception_events e
    WHERE e.financial_exception_id = c.financial_exception_id AND e.event_type='OPENED'
      AND e.event_identity = 'OPENED:' || c.financial_exception_id
      AND e.organization_id = c.organization_id
  );
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'P4C T01 FAIL: % cases have no OPENED history event', v_missing;
  END IF;

  SELECT count(*) INTO v_duplicate FROM (
     SELECT financial_exception_id FROM memginedev.financial_exception_events
     WHERE event_type='OPENED' GROUP BY financial_exception_id HAVING count(*) <> 1
  ) x;
  IF v_duplicate <> 0 THEN
    RAISE EXCEPTION 'P4C T01 FAIL: % cases have multiple opening events', v_duplicate;
  END IF;

  SELECT count(*) INTO v_unexpected
  FROM memginedev.financial_exception_events e
  JOIN memginedev.poynt_collect_financial_exceptions c
    ON c.financial_exception_id=e.financial_exception_id
  WHERE e.event_type='OPENED'
    AND e.description LIKE 'Historical exception opening;%'
    AND (e.created_at IS DISTINCT FROM c.opened_at
         OR e.new_case_status IS NOT NULL
         OR e.new_fulfillment_outcome IS NOT NULL
         OR e.actor_origin <> 'SYSTEM'
         OR e.actor_user_id IS NOT NULL);
  IF v_unexpected <> 0 THEN
    RAISE EXCEPTION 'P4C T01 FAIL: % historical backfill event(s) are inconsistent', v_unexpected;
  END IF;

  SELECT count(*) INTO v_events FROM memginedev.financial_exception_events;
  RAISE NOTICE 'P4C T01 PASS: migration 167 registered; audit table and trigger present';
  RAISE NOTICE 'P4C T01 PASS: app-role permissions verified; historical opening events consistent';
  RAISE NOTICE 'P4C T01 INFO: total audit events = %', v_events;
END $test$;
ROLLBACK;
