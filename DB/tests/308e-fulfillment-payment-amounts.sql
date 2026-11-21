\set ON_ERROR_STOP on

-- Run only against a disposable LOCAL fixture database with 308e applied.
-- Supply -v schema_name=... and pass the fixture JSON contents with -v fixtures=...
-- fixtures is an array of three fresh, server-generated positive ADVANCE_PAY_NOW quote inputs.
-- Each entry contains scenario, organizationId, storeId, subscriptionId, customerUserId,
-- requestKey, requestHash, benefits, offers, products, quote, expectedCompletion and expectedCollection.
-- Use the same quote JSON evidence sent by CustomerFulfillmentService to the SQL function.
-- Scenarios are discounted (the CAD 10.99 / 2.74 / 1.07 / 9.32 case), no-discount, and multi-item.
-- This script neither claims a checkout nor contacts a provider. All inserted rows are rolled back.
BEGIN;
SET LOCAL search_path = pg_catalog, :"schema_name", pg_temp;
CREATE TEMP TABLE payment_amount_fixtures ON COMMIT DROP AS
SELECT entry FROM jsonb_array_elements(:'fixtures'::jsonb) entry;

DO $test$
DECLARE
    f jsonb;
    scenario text;
    quote jsonb;
    gross_minor bigint;
    discount_minor bigint;
    tax_minor bigint;
    total_minor bigint;
    org varchar;
    request_key varchar;
    intent_id varchar;
    replay_id varchar;
    benefit_ids varchar[];
    offer_ids varchar[];
    payment payment_intents%ROWTYPE;
    attempt payment_attempts%ROWTYPE;
    commerce commerce_transactions%ROWTYPE;
BEGIN
    IF (SELECT array_agg(entry->>'scenario' ORDER BY entry->>'scenario') FROM payment_amount_fixtures)
       IS DISTINCT FROM ARRAY['discounted','multi-item','no-discount']::text[] THEN
        RAISE EXCEPTION 'Supply one fixture for each required scenario';
    END IF;
    FOR f IN SELECT entry FROM payment_amount_fixtures LOOP
        BEGIN
            scenario := f->>'scenario';
            quote := f->'quote';
            gross_minor := (quote->>'subtotalMinor')::bigint;
            discount_minor := (quote->>'adjustmentTotalMinor')::bigint;
            tax_minor := (quote->>'taxTotalMinor')::bigint;
            total_minor := (quote->>'totalMinor')::bigint;
            IF quote->>'journey' IS DISTINCT FROM 'ADVANCE_PAY_NOW' OR coalesce(total_minor,0) <= 0
               OR (scenario = 'discounted' AND (quote->>'currencyCode',gross_minor,discount_minor,tax_minor,total_minor)
                   IS DISTINCT FROM ('CAD'::text,1099::bigint,274::bigint,107::bigint,932::bigint))
               OR (scenario = 'no-discount' AND discount_minor IS DISTINCT FROM 0)
               OR (scenario = 'multi-item' AND (coalesce(discount_minor,0) <= 0 OR jsonb_array_length(quote->'lines') < 2)) THEN
                RAISE EXCEPTION 'Invalid fixture for %', scenario;
            END IF;
            org := f->>'organizationId';
            request_key := f->>'requestKey';
            IF EXISTS (SELECT 1 FROM payment_intents i WHERE i.organization_id=org AND i.idempotency_key=request_key) THEN
                RAISE EXCEPTION 'Use a fresh request key for %', scenario;
            END IF;
            benefit_ids := ARRAY(SELECT jsonb_array_elements_text(f->'benefits')::varchar);
            offer_ids := ARRAY(SELECT jsonb_array_elements_text(f->'offers')::varchar);
            intent_id := accept_customer_fulfillment(org,(f->>'storeId')::varchar,(f->>'subscriptionId')::varchar,
                (f->>'customerUserId')::varchar,request_key,(f->>'requestHash')::varchar,benefit_ids,offer_ids,f->'products',
                quote,(f->>'expectedCompletion')::timestamptz,(f->>'expectedCollection')::timestamptz);
            replay_id := accept_customer_fulfillment(org,(f->>'storeId')::varchar,(f->>'subscriptionId')::varchar,
                (f->>'customerUserId')::varchar,request_key,(f->>'requestHash')::varchar,benefit_ids,offer_ids,f->'products',
                quote,(f->>'expectedCompletion')::timestamptz,(f->>'expectedCollection')::timestamptz);

            SELECT * INTO STRICT payment FROM payment_intents i WHERE i.payment_intent_id=intent_id;
            SELECT * INTO STRICT attempt FROM payment_attempts a WHERE a.payment_intent_id=intent_id;
            SELECT * INTO STRICT commerce FROM commerce_transactions c WHERE c.organization_id=org AND c.idempotency_key=request_key;
            IF replay_id IS DISTINCT FROM intent_id OR payment.status <> 'PENDING' OR attempt.status <> 'PENDING'
               OR payment.provider_reference_id IS NOT NULL OR attempt.provider_reference_id IS NOT NULL
               OR commerce.status <> 'DRAFT' OR commerce.commerce_transaction_id <> payment.commerce_transaction_id
               OR payment.collect_integration_configuration_id IS NULL OR attempt.idempotency_key <> request_key
               OR (payment.subtotal_amount,payment.tax_rate,payment.tax_amount,payment.amount,payment.currency_code)
                   IS DISTINCT FROM (attempt.subtotal_amount,attempt.tax_rate,attempt.tax_amount,attempt.amount,attempt.currency_code)
               OR (payment.subtotal_amount*100,payment.tax_amount*100,payment.amount*100,payment.currency_code::text)
                   IS DISTINCT FROM (gross_minor-discount_minor,tax_minor,total_minor,quote->>'currencyCode')
               OR payment.tax_rate IS DISTINCT FROM coalesce(round(tax_minor::numeric*100/nullif(gross_minor-discount_minor,0),4),0)
               OR (commerce.subtotal_minor,commerce.adjustment_total_minor,commerce.tax_total_minor,commerce.total_minor)
                   IS DISTINCT FROM (gross_minor,discount_minor,tax_minor,total_minor) THEN
                RAISE EXCEPTION 'Incorrect payment snapshots or replay for %', scenario;
            END IF;
            RAISE SQLSTATE 'T308E'; -- Undo this fixture so the same subscription can be reused.
        EXCEPTION WHEN SQLSTATE 'T308E' THEN
            RAISE NOTICE 'Payment amount and repeated submission verified for %', scenario;
        END;
    END LOOP;
END;
$test$;
ROLLBACK;
