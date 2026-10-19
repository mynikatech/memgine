-- Migration 181 test 2: single execution claim, UNKNOWN and no unsafe redispatch.
-- No Poynt HTTP or terminal calls. Test ONLY on LOCAL PostgreSQL.
-- Uses isolated synthetic successful-commerce evidence; real provider untouched.
-- This test inserts temporary refund/attempt/event records and ROLLS THEM BACK.
BEGIN;
DO $test$
DECLARE
    v_org varchar := 'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b';
    v_integration varchar := 'integration-1790520886277';
    v_org_user varchar;
    v_provider_transaction varchar := 'TEST-181-PROVIDER-' || gen_random_uuid()::text;
    v_actor varchar;
    v_commerce varchar := 'CT_' || gen_random_uuid()::text;
    v_refund varchar := 'PRF_' || gen_random_uuid()::text;
    v_attempt varchar := 'PRA_' || gen_random_uuid()::text;
    v_key varchar := 'TEST-181-CLAIM-' || gen_random_uuid()::text;
    v_created record;
    v_first record;
    v_duplicate record;
    v_unknown record;
    v_unknown_again record;
    v_count bigint;
    v_rejected boolean := false;
BEGIN
    -- Select an existing authorized identity; create only synthetic commerce evidence.
    SELECT ou.user_id, ou.organization_user_id
      INTO v_actor, v_org_user
      FROM memginedev.organization_user ou
     WHERE ou.organization_id = v_org
       AND (memginedev.rbac_has_capability(ou.user_id,v_org,'ORG_ADMIN_ACCESS')
         OR memginedev.rbac_has_capability(ou.user_id,v_org,'BUSINESS_OWNER_ACCESS'))
     ORDER BY ou.organization_user_id LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'No active authorized organization user found; test aborted';
    END IF;

    INSERT INTO memginedev.commerce_transactions(
        commerce_transaction_id,organization_id,integration_configuration_id,
        source_channel,status,currency_code,total_minor,provider_transaction_id,
        idempotency_key,created_by,updated_by
    ) VALUES (
        v_commerce,v_org,v_integration,'COUNTER','PROVIDER_SUCCEEDED','CAD',100,
        v_provider_transaction,'TEST-181-COMMERCE-' || gen_random_uuid()::text,
        v_org_user,v_org_user
    );

    INSERT INTO memginedev.commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,commerce_transaction_id,
        provider_transaction_id,provider_status,amount_minor,currency_code,
        created_by,payment_channel,provider_reference_id,target_pos_device_id,
        provider_business_id,provider_store_id,provider_device_id
    ) VALUES (
        'CPA_' || gen_random_uuid()::text,v_commerce,v_provider_transaction,
        'SUCCEEDED',100,'CAD',v_org_user,'REMOTE_TERMINAL',
        'TEST-181-REF-' || gen_random_uuid()::text,
        'TEST-181-POS','41413bb9-379c-45a7-aad4-f9ab128b6e26',
        '1e5e94c1-e646-4b5a-8f50-d85eeb11f4b4','TEST-181-DEVICE'
    );

    SELECT * INTO v_created FROM memginedev.payment_refund_request_commerce(
        v_refund, v_org, v_commerce, 1::bigint, 'DUPLICATE_PAYMENT',
        NULL::varchar, NULL::varchar, v_key, v_actor
    );

    SELECT * INTO v_first FROM memginedev.payment_refund_claim_poynt_bridge_execution(
        v_org, v_refund, v_attempt, v_actor
    );
    IF v_first."dispatchRequired" IS DISTINCT FROM true OR
       v_first."paymentRefundAttemptId" IS DISTINCT FROM v_attempt OR
       v_first."attemptStatus" IS DISTINCT FROM 'PENDING' THEN
        RAISE EXCEPTION 'FAIL: first claim did not create a pending dispatch';
    END IF;

    -- The second call deliberately supplies a DIFFERENT proposed attempt ID.
    SELECT * INTO v_duplicate FROM memginedev.payment_refund_claim_poynt_bridge_execution(
        v_org, v_refund, 'PRA_' || gen_random_uuid()::text, v_actor
    );
    IF v_duplicate."dispatchRequired" IS DISTINCT FROM false OR
       v_duplicate."paymentRefundAttemptId" IS DISTINCT FROM v_attempt THEN
        RAISE EXCEPTION 'FAIL: duplicate claim could dispatch another refund';
    END IF;

    SELECT count(*) INTO v_count FROM memginedev.payment_refund_attempts
    WHERE payment_refund_id = v_refund;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: expected only one refund attempt, got %', v_count;
    END IF;

    SELECT * INTO v_unknown FROM memginedev.payment_refund_record_poynt_bridge_outcome(
        v_org, v_refund, v_attempt, 'UNKNOWN_REQUIRES_RECONCILIATION', NULL::varchar, v_actor
    );
    IF v_unknown."executionStatus" IS DISTINCT FROM 'UNKNOWN_REQUIRES_RECONCILIATION' THEN
        RAISE EXCEPTION 'FAIL: uncertain result did not remain UNKNOWN';
    END IF;

    SELECT * INTO v_unknown_again FROM memginedev.payment_refund_record_poynt_bridge_outcome(
        v_org, v_refund, v_attempt, 'UNKNOWN_REQUIRES_RECONCILIATION', NULL::varchar, v_actor
    );
    IF v_unknown_again."versionNo" IS DISTINCT FROM v_unknown."versionNo" THEN
        RAISE EXCEPTION 'FAIL: duplicate UNKNOWN changed ledger version';
    END IF;

    SELECT * INTO v_duplicate FROM memginedev.payment_refund_claim_poynt_bridge_execution(
        v_org, v_refund, 'PRA_' || gen_random_uuid()::text, v_actor
    );
    IF v_duplicate."dispatchRequired" IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'FAIL: UNKNOWN refund permitted another dispatch';
    END IF;

    -- Only authenticated callback or verified recovery may record success.
    BEGIN
        PERFORM * FROM memginedev.payment_refund_record_poynt_bridge_outcome(
            v_org, v_refund, v_attempt, 'SUCCEEDED', 'FAKE-PROVIDER-ID', v_actor
        );
    EXCEPTION WHEN SQLSTATE '42501' THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'FAIL: unverified SQL outcome was permitted to mark SUCCEEDED';
    END IF;

    SELECT count(*) INTO v_count FROM memginedev.payment_refunds
    WHERE payment_refund_id=v_refund AND execution_status='UNKNOWN_REQUIRES_RECONCILIATION';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: incorrect final ledger state';
    END IF;

    RAISE NOTICE 'PASS TEST 2: only one claim, duplicate denied, UNKNOWN stable, unverified SUCCEEDED rejected. All changes will roll back.';
END;
$test$;
ROLLBACK;
-- Expected output: NOTICE PASS TEST 2 and ROLLBACK.
