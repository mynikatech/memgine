-- P4-C Test 01 restart. Read-only; no provider calls or mutations.
-- Use your established P4-C DEV connection; report server port as information only.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;

DO $p4c$
DECLARE
  v_migration integer; v_trigger integer; v_cases bigint; v_events bigint;
  v_missing bigint; v_duplicate bigint; v_bad_backfill bigint;
  v_insert boolean; v_update boolean; v_delete boolean;
  v_failure_exec boolean; v_transition_exec boolean;
BEGIN
  IF current_database() <> 'memgine_dev' OR to_regnamespace('memginedev') IS NULL THEN
    RAISE EXCEPTION 'P4C T01 STOP: unexpected database or schema';
  END IF;
  RAISE NOTICE 'P4C T01 TARGET: db=%, user=%, server_port=%',
    current_database(), current_user, inet_server_port();

  SELECT count(*) INTO v_migration FROM databasechangelog
  WHERE id='167-financial-exception-lifecycle-audit' AND author='mynikatech' AND exectype='EXECUTED';
  IF v_migration <> 1 THEN RAISE EXCEPTION 'P4C T01 FAIL: migration 167 records=%',v_migration; END IF;
  IF to_regclass('memginedev.financial_exception_events') IS NULL THEN
    RAISE EXCEPTION 'P4C T01 FAIL: event table missing';
  END IF;
  SELECT count(*) INTO v_trigger FROM pg_trigger
  WHERE tgrelid='memginedev.poynt_collect_financial_exceptions'::regclass
    AND tgname='financial_exception_audit_after_change'
    AND NOT tgisinternal AND tgenabled<>'D';
  IF v_trigger <> 1 THEN RAISE EXCEPTION 'P4C T01 FAIL: audit trigger count=%',v_trigger; END IF;
  RAISE NOTICE 'P4C T01 PASS: migration 167 and active audit trigger';

  SELECT count(*) INTO v_cases FROM poynt_collect_financial_exceptions;
  SELECT count(*) INTO v_events FROM financial_exception_events;
  SELECT count(*) INTO v_missing FROM poynt_collect_financial_exceptions c
  WHERE NOT EXISTS (SELECT 1 FROM financial_exception_events e
    WHERE e.financial_exception_id=c.financial_exception_id
      AND e.organization_id=c.organization_id AND e.event_type='OPENED'
      AND e.event_identity='OPENED:'||c.financial_exception_id);
  SELECT count(*) INTO v_duplicate FROM (
    SELECT financial_exception_id FROM financial_exception_events
    WHERE event_type='OPENED' GROUP BY financial_exception_id HAVING count(*)<>1
  ) d;
  SELECT count(*) INTO v_bad_backfill
  FROM financial_exception_events e JOIN poynt_collect_financial_exceptions c
    ON c.financial_exception_id=e.financial_exception_id
  WHERE e.event_type='OPENED' AND e.description LIKE 'Historical exception opening;%'
    AND (e.created_at IS DISTINCT FROM c.opened_at OR e.new_case_status IS NOT NULL
      OR e.new_fulfillment_outcome IS NOT NULL OR e.actor_origin<>'SYSTEM'
      OR e.actor_user_id IS NOT NULL);
  RAISE NOTICE 'P4C T01 HISTORY: cases=%, events=%, missing_opened=%, duplicate_opened=%, bad_backfill=%',
    v_cases,v_events,v_missing,v_duplicate,v_bad_backfill;
  IF v_missing<>0 OR v_duplicate<>0 OR v_bad_backfill<>0 THEN
    RAISE EXCEPTION 'P4C T01 FAIL: opening-event history inconsistency';
  END IF;
  RAISE NOTICE 'P4C T01 PASS: historical opening events';

  SELECT has_table_privilege('memgine_app_dev','memginedev.financial_exception_events','INSERT'),
         has_table_privilege('memgine_app_dev','memginedev.financial_exception_events','UPDATE'),
         has_table_privilege('memgine_app_dev','memginedev.financial_exception_events','DELETE')
    INTO v_insert,v_update,v_delete;
  SELECT has_function_privilege('memgine_app_dev',
    'memginedev.financial_exception_record_recovery_failure(varchar,varchar,varchar,varchar,varchar)','EXECUTE'),
    has_function_privilege('memgine_app_dev',
    'memginedev.financial_exception_transition(varchar,varchar,varchar,varchar,varchar)','EXECUTE')
    INTO v_failure_exec,v_transition_exec;
  RAISE NOTICE 'P4C T01 PERMISSIONS: app INSERT=%, UPDATE=%, DELETE=%, failure_function_EXECUTE=%, transition_function_EXECUTE=%',
    v_insert,v_update,v_delete,v_failure_exec,v_transition_exec;
  IF NOT v_failure_exec OR NOT v_transition_exec THEN
    RAISE EXCEPTION 'P4C T01 FAIL: app role lacks required function access';
  END IF;
  IF v_insert OR v_update OR v_delete THEN
    RAISE NOTICE 'P4C T01 WARNING: direct event-table writes are permitted; inspect table grants/default privileges before accepting append-only security';
  ELSE
    RAISE NOTICE 'P4C T01 PASS: app role cannot directly modify audit table';
  END IF;
  RAISE NOTICE 'P4C T01 COMPLETED: read-only diagnostic finished';
END $p4c$;
ROLLBACK;
