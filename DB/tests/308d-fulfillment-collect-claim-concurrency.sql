\set ON_ERROR_STOP on

-- Run in two psql sessions against the same disposable LOCAL database with 308d applied.
-- Use a role with fixture-table read access and permission to execute the claim.
-- Supply -v schema_name=... -v first_intent=... -v second_intent=... in both sessions.
-- Use two fresh, individually claimable PENDING fixtures with PENDING attempts on the same
-- customer subscription, distinct keys and Stores, and disjoint product selections.
-- Run with -v session=a, then with -v session=b when A prints its ready message.
-- A commits its claim so B can observe it. Discard the fixture database after the run.
-- This script calls the database claim only. It never submits a provider charge.
SELECT :'session' = 'a' AS first_session, :'session' IN ('a','b') AS valid_session \gset
\if :valid_session
\else
    \echo 'Supply -v session=a or -v session=b'
    SELECT 1/0;
\endif

BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path = pg_catalog, :"schema_name", pg_temp;
SET LOCAL lock_timeout = '75s';

CREATE TEMP TABLE claim_fixture ON COMMIT DROP AS
SELECT i.payment_intent_id, i.organization_id, i.customer_user_id, c.subscription_id,
       i.store_id, i.idempotency_key, i.fulfillment_checkout->'products' AS products,
       (i.fulfillment_checkout->>'paymentBusinessId')::varchar AS merchant_business,
       (i.fulfillment_checkout->>'paymentStoreId')::varchar AS merchant_store,
       i.payment_intent_id = :'first_intent' AS first_intent
FROM payment_intents i JOIN commerce_transactions c USING (commerce_transaction_id)
WHERE i.payment_intent_id IN (:'first_intent', :'second_intent')
  AND i.fulfillment_checkout IS NOT NULL AND i.status = 'PENDING' AND c.status = 'DRAFT'
  AND i.provider_reference_id IS NULL
  AND EXISTS (SELECT 1 FROM payment_attempts a
              WHERE a.payment_intent_id = i.payment_intent_id AND a.status = 'PENDING');

DO $test$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM claim_fixture a CROSS JOIN claim_fixture b
        WHERE a.first_intent AND NOT b.first_intent
          AND a.organization_id = b.organization_id AND a.customer_user_id = b.customer_user_id
          AND a.subscription_id = b.subscription_id AND a.idempotency_key <> b.idempotency_key
          AND a.store_id <> b.store_id AND a.products <> '{}'::jsonb AND b.products <> '{}'::jsonb
          AND NOT EXISTS (
              SELECT 1 FROM jsonb_each_text(a.products) ap JOIN jsonb_each_text(b.products) bp USING (value)
          )
    ) THEN
        RAISE EXCEPTION 'Expected two pending intents on one subscription with different keys, Stores and products';
    END IF;
END;
$test$;

\if :first_session
    -- Prove the second checkout would otherwise claim successfully, then undo that claim.
    SAVEPOINT check_second;
    DO $test$
    DECLARE f record;
    BEGIN
        SELECT * INTO STRICT f FROM claim_fixture WHERE NOT first_intent;
        IF claim_customer_fulfillment_collect(f.organization_id,f.payment_intent_id,f.customer_user_id,
            f.merchant_business,f.merchant_store) IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'Second fixture is not individually claimable';
        END IF;
    END;
    $test$;
    ROLLBACK TO SAVEPOINT check_second;

    DO $test$
    DECLARE f record;
    BEGIN
        SELECT * INTO STRICT f FROM claim_fixture WHERE first_intent;
        IF claim_customer_fulfillment_collect(f.organization_id,f.payment_intent_id,f.customer_user_id,
            f.merchant_business,f.merchant_store) IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'First claim did not succeed';
        END IF;
        IF claim_customer_fulfillment_collect(f.organization_id,f.payment_intent_id,f.customer_user_id,
            f.merchant_business,f.merchant_store) IS DISTINCT FROM false THEN
            RAISE EXCEPTION 'Retrying the same claim must not claim payment twice';
        END IF;
    END;
    $test$;

    \echo 'First claim is ready. Start session B now.'
    DO $test$
    DECLARE deadline timestamptz := clock_timestamp() + interval '60 seconds';
    BEGIN
        LOOP
            PERFORM pg_stat_clear_snapshot();
            EXIT WHEN EXISTS (
                SELECT 1 FROM pg_stat_activity a
                WHERE a.datname = current_database()
                  AND a.application_name = '308d-second-claim'
                  AND pg_backend_pid() = ANY(pg_blocking_pids(a.pid))
            );
            IF clock_timestamp() >= deadline THEN
                RAISE EXCEPTION 'Session B did not block on the first claim';
            END IF;
            PERFORM pg_sleep(0.1);
        END LOOP;
    END;
    $test$;
    COMMIT;
\else
    SET LOCAL application_name = '308d-second-claim';
    DO $test$
    DECLARE f record;
    BEGIN
        SELECT * INTO STRICT f FROM claim_fixture WHERE NOT first_intent;
        BEGIN
            PERFORM claim_customer_fulfillment_collect(f.organization_id,f.payment_intent_id,f.customer_user_id,
                f.merchant_business,f.merchant_store);
            RAISE EXCEPTION 'Second claim did not return the expected conflict';
        EXCEPTION WHEN unique_violation THEN
            IF SQLERRM <> 'An existing checkout requires payment confirmation' THEN RAISE; END IF;
        END;

        IF EXISTS (
            SELECT 1 FROM claim_fixture fixture JOIN payment_intents i USING (payment_intent_id)
            WHERE i.status IS DISTINCT FROM CASE WHEN fixture.first_intent THEN 'PROCESSING' ELSE 'PENDING' END
               OR i.provider_reference_id IS NOT NULL
               OR NOT EXISTS (
                   SELECT 1 FROM payment_attempts a WHERE a.payment_intent_id = i.payment_intent_id
                     AND a.status = i.status
               )
        ) THEN RAISE EXCEPTION 'Only the first intent and its attempt should be processing'; END IF;
    END;
    $test$;
    ROLLBACK;
\endif
