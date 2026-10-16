-- P2: DEV ONLY. Execute entire script in ONE session. No provider calls.
-- Synthetic generic-Commerce fixture tests both installed recovery functions.
-- Counter authorization is tested as a denial only: a valid Counter checkout
-- requires real staff/store/redemption relationships and is NOT simulated here.
-- The application role's EXECUTE grant is not proven when run as a DB owner.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
DO $p2$
DECLARE
  v_org varchar(64);
  v_ou varchar(64);
  v_actor varchar(64);
  v_tx varchar(64);
  v_attempt varchar(64);
  v_ref varchar(160);
  v_status varchar(32);
  v_result record;
  v_before_tx jsonb;
  v_before_attempt jsonb;
  v_statuses text[] := ARRAY['DISPATCHING','DISPATCHED','RECEIVED','STARTED'];
  v_other_actor varchar(64) := 'P2_NO_SUCH_ACTOR';
  v_n integer := 0;
  v_sqlstate text;
BEGIN
  -- Select an existing authorized org administrator as FK owner (read only).
  SELECT ou.organization_id, ou.organization_user_id, ou.user_id
    INTO v_org, v_ou, v_actor
    FROM memginedev.organization_user ou
    JOIN memginedev.organization o ON o.organization_id = ou.organization_id
   WHERE NOT ou.is_deleted AND NOT o.is_deleted
     AND memginedev.can_administer_organization(ou.organization_id, ou.user_id)
   ORDER BY ou.organization_user_id LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'P2 PREREQUISITE: no authorized organization admin found in DEV';
  END IF;

  FOREACH v_status IN ARRAY v_statuses LOOP
    v_tx := 'P2TX_' || substr(md5(clock_timestamp()::text || random()::text),1,26);
    v_attempt := 'P2A_' || substr(md5(v_tx || 'attempt'),1,26);
    v_ref := 'P2REF_' || substr(md5(v_tx || 'reference'),1,26);

    INSERT INTO memginedev.commerce_transactions (
      commerce_transaction_id,organization_id,source_channel,status,
      currency_code,subtotal_minor,adjustment_total_minor,tax_total_minor,total_minor,
      idempotency_key,created_by,updated_by
    ) VALUES (
      v_tx,v_org,'P2_SQL_TEST','PROVIDER_IN_PROGRESS',
      'CAD',600,0,0,600,v_tx,v_ou,v_ou
    );
    -- A transaction without an active attempt must return no row.
    PERFORM * FROM memginedev.commerce_get_active_remote_terminal_payment_attempt(v_org,v_tx,v_actor);
    IF FOUND THEN
      RAISE EXCEPTION 'P2 FAIL %: unexpected attempt before insert',v_status;
    END IF;

    INSERT INTO memginedev.commerce_provider_payment_attempts (
      commerce_provider_payment_attempt_id,commerce_transaction_id,provider_status,
      amount_minor,currency_code,created_by,payment_channel,provider_reference_id
    ) VALUES (v_attempt,v_tx,v_status,600,'CAD',v_ou,'REMOTE_TERMINAL',v_ref);

    SELECT to_jsonb(t) INTO v_before_tx FROM memginedev.commerce_transactions t WHERE t.commerce_transaction_id=v_tx;
    SELECT to_jsonb(a) INTO v_before_attempt FROM memginedev.commerce_provider_payment_attempts a WHERE a.commerce_provider_payment_attempt_id=v_attempt;

    -- Active lookup: exact persisted reference and status.
    SELECT * INTO v_result FROM memginedev.commerce_get_active_remote_terminal_payment_attempt(v_org,v_tx,v_actor);
    IF NOT FOUND OR v_result."providerReferenceId" IS DISTINCT FROM v_ref OR v_result."providerStatus" IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'P2 FAIL %: active lookup returned wrong reference/status',v_status;
    END IF;
    IF memginedev.commerce_get_remote_terminal_payment_attempt_state(v_org,v_tx,v_ref,v_actor) IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'P2 FAIL %: reference lookup returned wrong status',v_status;
    END IF;

    -- Wrong reference must fail with not found, never reveal another attempt.
    v_sqlstate := NULL;
    BEGIN
      PERFORM memginedev.commerce_get_remote_terminal_payment_attempt_state(v_org,v_tx,v_ref || '_WRONG',v_actor);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE; END;
    IF v_sqlstate IS DISTINCT FROM 'P0002' THEN
      RAISE EXCEPTION 'P2 FAIL %: wrong reference SQLSTATE %, expected P0002',v_status,v_sqlstate;
    END IF;

    -- Wrong organization must fail without revealing attempt.
    v_sqlstate := NULL;
    BEGIN
      PERFORM memginedev.commerce_get_active_remote_terminal_payment_attempt('P2_NONEXISTENT_ORG',v_tx,v_actor);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE; END;
    IF v_sqlstate IS DISTINCT FROM 'P0002' THEN
      RAISE EXCEPTION 'P2 FAIL %: wrong organization SQLSTATE %, expected P0002',v_status,v_sqlstate;
    END IF;

    -- Unauthorized actor must fail for each lookup.
    v_sqlstate := NULL;
    BEGIN
      PERFORM memginedev.commerce_get_active_remote_terminal_payment_attempt(v_org,v_tx,v_other_actor);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE; END;
    IF v_sqlstate IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'P2 FAIL %: unauthorized active lookup SQLSTATE %, expected 42501',v_status,v_sqlstate;
    END IF;
    v_sqlstate := NULL;
    BEGIN
      PERFORM memginedev.commerce_get_remote_terminal_payment_attempt_state(v_org,v_tx,v_ref,v_other_actor);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE; END;
    IF v_sqlstate IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'P2 FAIL %: unauthorized reference lookup SQLSTATE %, expected 42501',v_status,v_sqlstate;
    END IF;

    -- Terminal lifecycle inconsistent with active attempt: active lookup must reject.
    UPDATE memginedev.commerce_transactions SET status='READY_FOR_PROVIDER' WHERE commerce_transaction_id=v_tx;
    v_sqlstate := NULL;
    BEGIN
      PERFORM memginedev.commerce_get_active_remote_terminal_payment_attempt(v_org,v_tx,v_actor);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE; END;
    IF v_sqlstate IS DISTINCT FROM '23505' THEN
      RAISE EXCEPTION 'P2 FAIL %: inconsistent Commerce SQLSTATE %, expected 23505',v_status,v_sqlstate;
    END IF;
    UPDATE memginedev.commerce_transactions SET status='PROVIDER_IN_PROGRESS' WHERE commerce_transaction_id=v_tx;

    IF (SELECT to_jsonb(t) - 'updated_at' - 'version_no' FROM memginedev.commerce_transactions t WHERE t.commerce_transaction_id=v_tx)
      IS DISTINCT FROM (v_before_tx - 'updated_at' - 'version_no') THEN
      RAISE EXCEPTION 'P2 FAIL %: Commerce changed unexpectedly',v_status;
    END IF;
    IF (SELECT to_jsonb(a) FROM memginedev.commerce_provider_payment_attempts a WHERE a.commerce_provider_payment_attempt_id=v_attempt)
      IS DISTINCT FROM v_before_attempt THEN
      RAISE EXCEPTION 'P2 FAIL %: attempt changed',v_status;
    END IF;
    v_n := v_n+1;
    RAISE NOTICE 'P2 PASS: % no-attempt, active/reference lookup, isolation, actor denial, inconsistent state, read-only',v_status;
  END LOOP;
  RAISE NOTICE 'P2 PASS: % synthetic status scenarios; outer ROLLBACK will remove all data',v_n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'P2 FAIL [%]: %',SQLSTATE,SQLERRM;
  RAISE EXCEPTION 'P2 validation failed';
END
$p2$;
ROLLBACK;
