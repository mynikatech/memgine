-- Migration 181 test 1: refund request and idempotency; NO provider/network calls.
-- Run in a SQL client connected to your LOCAL PostgreSQL database, not production.
-- Creates an isolated CAD 1.00 simulated sale using an existing organization/integration.
-- Automatically picks an authorized organization user.
-- This test inserts temporary refund ledger records and ROLLS THEM BACK.
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
    v_key varchar := 'TEST-181-CREATE-' || gen_random_uuid()::text;
    v_first record;
    v_again record;
    v_rows bigint;
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

    SELECT * INTO v_first FROM memginedev.payment_refund_request_commerce(
        v_refund, v_org, v_commerce, 1::bigint, 'DUPLICATE_PAYMENT',
        NULL::varchar, NULL::varchar, v_key, v_actor
    );
    IF v_first."paymentRefundId" IS DISTINCT FROM v_refund OR
       v_first."approvalStatus" IS DISTINCT FROM 'APPROVED' OR
       v_first."executionStatus" IS DISTINCT FROM 'READY' OR
       v_first."refundAmountMinor" IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'FAIL: first refund request returned unexpected fields';
    END IF;

    SELECT * INTO v_again FROM memginedev.payment_refund_request_commerce(
        'PRF_' || gen_random_uuid()::text, v_org, v_commerce, 1::bigint,
        'DUPLICATE_PAYMENT', NULL::varchar, NULL::varchar, v_key, v_actor
    );
    IF v_again."paymentRefundId" IS DISTINCT FROM v_first."paymentRefundId" THEN
        RAISE EXCEPTION 'FAIL: idempotency repeated request created a different refund';
    END IF;

    SELECT count(*) INTO v_rows FROM memginedev.payment_refunds
    WHERE organization_id = v_org AND idempotency_key = v_key;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'FAIL: expected exactly one refund row, got %', v_rows;
    END IF;

    RAISE NOTICE 'PASS TEST 1: refund created, auto-approved, repeat request reused same row. All changes will roll back.';
END;
$test$;
ROLLBACK;
-- Expected output: NOTICE PASS TEST 1 and ROLLBACK.
