-- P1: Payment Bridge successful callback replay after Commerce completion.
-- DEV ONLY. Execute the WHOLE script together in one database session.
-- No provider calls, no use or update of existing payment/business rows.
-- Creates synthetic Commerce and payment-attempt rows, checks them, then ROLLBACK.
-- A PASS proves the installed callback function's replay behavior, not terminal integration
-- or the end-to-end purchase/redemption fulfillment path.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
DO $p1$
DECLARE
    owner_org varchar(64);
    owner_ou varchar(64);
    channel varchar(32);
    txid varchar(64);
    attemptid varchar(64);
    referenceid varchar(160);
    provider_txid varchar(160);
    before_tx jsonb;
    after_tx jsonb;
    before_attempt jsonb;
    after_attempt jsonb;
    callback_result boolean;
    rejected boolean;
    test_count integer := 0;
BEGIN
    -- Owner is only used as a valid FK. No pre-existing Commerce/payment row is changed.
    SELECT ou.organization_id, ou.organization_user_id
      INTO owner_org, owner_ou
      FROM memginedev.organization_user ou
      JOIN memginedev.organization org ON org.organization_id = ou.organization_id
     WHERE NOT ou.is_deleted AND NOT org.is_deleted
     ORDER BY ou.organization_user_id
     LIMIT 1;

    IF owner_org IS NULL OR owner_ou IS NULL THEN
        RAISE EXCEPTION 'P1 prerequisite missing: no usable organization_user in DEV';
    END IF;

    FOREACH channel IN ARRAY ARRAY['COUNTER'::varchar, 'COUNTER_REDEMPTION'::varchar] LOOP
        txid := 'P1TX_' || substr(md5(clock_timestamp()::text || random()::text), 1, 25);
        attemptid := 'P1ATT_' || substr(md5(txid || 'attempt'), 1, 25);
        referenceid := 'P1REF_' || substr(md5(txid || 'reference'), 1, 25);
        provider_txid := 'P1PROV_' || substr(md5(txid || 'provider'), 1, 25);

        INSERT INTO memginedev.commerce_transactions (
            commerce_transaction_id, organization_id, source_channel, status,
            currency_code, subtotal_minor, adjustment_total_minor, tax_total_minor,
            total_minor, provider_transaction_id, idempotency_key,
            completed_at, created_by, updated_by
        ) VALUES (
            txid, owner_org, channel, 'COMPLETED',
            'CAD', 600, 0, 0, 600, provider_txid, txid,
            CURRENT_TIMESTAMP, owner_ou, owner_ou
        );

        INSERT INTO memginedev.commerce_provider_payment_attempts (
            commerce_provider_payment_attempt_id, commerce_transaction_id,
            provider_transaction_id, provider_status,
            amount_minor, currency_code, created_by,
            payment_channel, provider_reference_id,
            provider_business_id, provider_store_id
        ) VALUES (
            attemptid, txid,
            provider_txid, 'SUCCEEDED',
            600, 'CAD', owner_ou,
            'REMOTE_TERMINAL', referenceid,
            'P1_TEST_BUSINESS', 'P1_TEST_STORE'
        );

        SELECT to_jsonb(c) INTO before_tx
          FROM memginedev.commerce_transactions c
         WHERE c.commerce_transaction_id = txid;
        SELECT to_jsonb(a) INTO before_attempt
          FROM memginedev.commerce_provider_payment_attempts a
         WHERE a.commerce_provider_payment_attempt_id = attemptid;

        -- The exact completed-state replay must succeed without any writes.
        SELECT memginedev.commerce_record_remote_payment_callback(
            referenceid, 'PROCESSED', provider_txid, 'CAPTURED',
            600::bigint, 'CAD', 'P1_TEST_BUSINESS', 'P1_TEST_STORE'
        ) INTO callback_result;
        IF callback_result IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION '%: matching captured callback did not return true', channel;
        END IF;

        SELECT to_jsonb(c) INTO after_tx
          FROM memginedev.commerce_transactions c
         WHERE c.commerce_transaction_id = txid;
        SELECT to_jsonb(a) INTO after_attempt
          FROM memginedev.commerce_provider_payment_attempts a
         WHERE a.commerce_provider_payment_attempt_id = attemptid;
        IF before_tx IS DISTINCT FROM after_tx OR before_attempt IS DISTINCT FROM after_attempt THEN
            RAISE EXCEPTION '%: matching replay modified financial state', channel;
        END IF;

        -- Negative test 1: same reference with a different provider transaction ID.
        rejected := false;
        BEGIN
            PERFORM memginedev.commerce_record_remote_payment_callback(
                referenceid, 'PROCESSED', provider_txid || '_WRONG', 'CAPTURED',
                600::bigint, 'CAD', 'P1_TEST_BUSINESS', 'P1_TEST_STORE'
            );
        EXCEPTION WHEN unique_violation THEN
            rejected := true;
        END;
        IF NOT rejected THEN
            RAISE EXCEPTION '%: conflicting provider transaction ID was accepted or returned wrong SQLSTATE', channel;
        END IF;

        -- Negative test 2: same reference with mismatched amount.
        rejected := false;
        BEGIN
            PERFORM memginedev.commerce_record_remote_payment_callback(
                referenceid, 'PROCESSED', provider_txid, 'CAPTURED',
                601::bigint, 'CAD', 'P1_TEST_BUSINESS', 'P1_TEST_STORE'
            );
        EXCEPTION WHEN invalid_parameter_value THEN
            rejected := true;
        END;
        IF NOT rejected THEN
            RAISE EXCEPTION '%: conflicting amount was accepted or returned wrong SQLSTATE', channel;
        END IF;

        SELECT to_jsonb(c) INTO after_tx FROM memginedev.commerce_transactions c WHERE c.commerce_transaction_id = txid;
        SELECT to_jsonb(a) INTO after_attempt FROM memginedev.commerce_provider_payment_attempts a WHERE a.commerce_provider_payment_attempt_id = attemptid;
        IF before_tx IS DISTINCT FROM after_tx OR before_attempt IS DISTINCT FROM after_attempt THEN
            RAISE EXCEPTION '%: rejected callbacks modified persisted state', channel;
        END IF;
        test_count := test_count + 1;
        RAISE NOTICE 'P1 PASS: % identical replay is no-op; conflicting transaction and amount rejected', channel;
    END LOOP;

    RAISE NOTICE 'P1 PASS: % synthetic business channels verified; entire transaction will roll back', test_count;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'P1 FAIL [%]: %', SQLSTATE, SQLERRM;
    -- This DO block's subtransaction is rolled back on error. Outer ROLLBACK remains effective.
END
$p1$;
ROLLBACK;
