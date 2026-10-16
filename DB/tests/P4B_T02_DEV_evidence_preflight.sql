-- P4-B Test 02: read-only eligibility/evidence inventory on DEV only.
-- Run against 127.0.0.1:15432/memgine_dev (schema memginedev).
-- Does NOT initiate a charge, finalize fulfillment or alter data.
BEGIN READ ONLY;
DO $p4b$
DECLARE
    v_collect_verified bigint;
    v_collect_recoverable bigint;
    v_collect_open_cases bigint;
    v_counter_membership bigint;
    v_counter_redemption bigint;
    v_counter_open_cases bigint;
    v_total_succeeded bigint;
BEGIN
    SELECT count(*) INTO v_collect_verified
      FROM memginedev.payment_intents p
      JOIN memginedev.poynt_collect_verified_captures c
        ON c.payment_intent_id = p.payment_intent_id
       AND c.organization_id = p.organization_id
     WHERE c.provider_transaction_id IS NOT DISTINCT FROM p.provider_reference_id
       AND c.provider_transaction_id IS NOT NULL
       AND round(p.amount * 100)::bigint = c.amount_minor
       AND upper(p.currency_code) = upper(c.currency_code);

    SELECT count(*) INTO v_collect_recoverable
      FROM memginedev.payment_intents p
      JOIN memginedev.poynt_collect_verified_captures c
        ON c.payment_intent_id = p.payment_intent_id
       AND c.organization_id = p.organization_id
      JOIN memginedev.payment_provider_configs pc
        ON pc.payment_provider_config_id = p.payment_provider_config_id
     WHERE pc.provider_code = 'POYNT_COLLECT'
       AND (pc.organization_id = p.organization_id OR pc.organization_id IS NULL)
       AND p.authorization_mode = 'CUSTOMER_SESSION'
       AND p.customer_user_id IS NOT NULL
       AND p.finalized_subscription_id IS NULL
       AND p.status = 'PROCESSING'
       AND c.provider_transaction_id IS NOT DISTINCT FROM p.provider_reference_id
       AND c.provider_transaction_id IS NOT NULL
       AND round(p.amount * 100)::bigint = c.amount_minor
       AND upper(p.currency_code) = upper(c.currency_code);

    SELECT count(*) INTO v_counter_membership
      FROM memginedev.commerce_transactions t
     WHERE t.source_channel = 'COUNTER'
       AND t.status = 'PROVIDER_SUCCEEDED'
       AND t.subscription_id IS NULL
       AND NOT t.is_deleted
       AND EXISTS (
         SELECT 1 FROM memginedev.commerce_provider_payment_attempts a
          WHERE a.commerce_transaction_id = t.commerce_transaction_id
            AND a.payment_channel = 'REMOTE_TERMINAL'
            AND a.provider_status = 'SUCCEEDED'
            AND NULLIF(btrim(a.provider_reference_id), '') IS NOT NULL
            AND NULLIF(btrim(a.provider_transaction_id), '') IS NOT NULL
            AND a.amount_minor = t.total_minor
            AND upper(a.currency_code) = upper(t.currency_code)
       );

    SELECT count(*) INTO v_counter_redemption
      FROM memginedev.commerce_transactions t
     WHERE t.source_channel = 'COUNTER_REDEMPTION'
       AND t.status = 'PROVIDER_SUCCEEDED'
       AND NOT t.is_deleted
       AND EXISTS (
         SELECT 1 FROM memginedev.commerce_provider_payment_attempts a
          WHERE a.commerce_transaction_id = t.commerce_transaction_id
            AND a.payment_channel = 'REMOTE_TERMINAL'
            AND a.provider_status = 'SUCCEEDED'
            AND NULLIF(btrim(a.provider_reference_id), '') IS NOT NULL
            AND NULLIF(btrim(a.provider_transaction_id), '') IS NOT NULL
            AND a.amount_minor = t.total_minor
            AND upper(a.currency_code) = upper(t.currency_code)
       );

    SELECT count(*) INTO v_collect_open_cases
      FROM memginedev.poynt_collect_financial_exceptions
     WHERE source_channel = 'CUSTOMER_MEMBERSHIP' AND case_status = 'OPEN';

    SELECT count(*) INTO v_counter_open_cases
      FROM memginedev.poynt_collect_financial_exceptions
     WHERE source_channel IN ('COUNTER', 'COUNTER_REDEMPTION') AND case_status = 'OPEN';

    SELECT count(*) INTO v_total_succeeded
      FROM memginedev.commerce_provider_payment_attempts
     WHERE payment_channel = 'REMOTE_TERMINAL' AND provider_status = 'SUCCEEDED';

    RAISE NOTICE 'P4B T02 PASS: read-only evidence inventory finished';
    RAISE NOTICE 'Collect verified matching capture records: %', v_collect_verified;
    RAISE NOTICE 'Collect apparently recoverable (PROCESSING, no subscription): %', v_collect_recoverable;
    RAISE NOTICE 'Counter membership apparently recoverable: %', v_counter_membership;
    RAISE NOTICE 'Counter redemption apparently recoverable: %', v_counter_redemption;
    RAISE NOTICE 'Open Collect exception cases: %', v_collect_open_cases;
    RAISE NOTICE 'Open Counter exception cases: %', v_counter_open_cases;
    RAISE NOTICE 'Total successful remote-terminal attempt records: %', v_total_succeeded;
    RAISE NOTICE 'Counts are preliminary evidence indicators, NOT authorization or fulfillment proof.';
END;
$p4b$;
ROLLBACK;
