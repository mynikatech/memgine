-- Migration 262: Staff-Assisted Counter membership Cash/POS finalization.
-- Add a durable, FK-backed purchase reference to payment_intents.
-- No payment status or existing payment row is rewritten.
-- Existing OTP / CUSTOMER_SESSION paths are preserved.

ALTER TABLE "${schemaName}".payment_intents
    ADD COLUMN IF NOT EXISTS counter_purchase_id varchar(64);

-- A retry of this historical migration must not add a second equivalent FK.
-- If an existing FK on counter_purchase_id is not the intended relationship,
-- fail explicitly rather than silently accepting a conflicting constraint.
DO $migration$
DECLARE
    v_schema text := '${schemaName}';
    v_payment_intents_oid oid;
    v_counter_purchases_oid oid;
    v_counter_purchase_attnum smallint;
    v_counter_purchase_ref_attnum smallint;
    v_constraint record;
    v_matching_constraint_count integer := 0;
BEGIN
    v_payment_intents_oid := to_regclass(format('%I.payment_intents', v_schema));
    v_counter_purchases_oid := to_regclass(format('%I.counter_purchases', v_schema));

    IF v_payment_intents_oid IS NULL OR v_counter_purchases_oid IS NULL THEN
        RAISE EXCEPTION 'Counter purchase FK prerequisites are unavailable';
    END IF;

    SELECT a.attnum
      INTO v_counter_purchase_attnum
      FROM pg_attribute a
     WHERE a.attrelid = v_payment_intents_oid
       AND a.attname = 'counter_purchase_id'
       AND NOT a.attisdropped;

    SELECT a.attnum
      INTO v_counter_purchase_ref_attnum
      FROM pg_attribute a
     WHERE a.attrelid = v_counter_purchases_oid
       AND a.attname = 'counter_purchase_id'
       AND NOT a.attisdropped;

    IF v_counter_purchase_attnum IS NULL
       OR v_counter_purchase_ref_attnum IS NULL THEN
        RAISE EXCEPTION 'Counter purchase FK columns are unavailable';
    END IF;

    FOR v_constraint IN
        SELECT c.conname,
               c.confrelid,
               c.conkey,
               c.confkey,
               c.confupdtype,
               c.confdeltype,
               c.confmatchtype,
               c.condeferrable,
               c.condeferred
          FROM pg_constraint c
         WHERE c.conrelid = v_payment_intents_oid
           AND c.contype = 'f'
           AND (
               c.conname = 'payment_intents_counter_purchase_id_fk'
               OR c.conkey = ARRAY[v_counter_purchase_attnum]::smallint[]
           )
    LOOP
        IF v_constraint.confrelid <> v_counter_purchases_oid
           OR v_constraint.confkey <> ARRAY[v_counter_purchase_ref_attnum]::smallint[]
           OR v_constraint.confupdtype <> 'a'
           OR v_constraint.confdeltype <> 'a'
           OR v_constraint.confmatchtype <> 's'
           OR v_constraint.condeferrable
           OR v_constraint.condeferred THEN
            RAISE EXCEPTION
                'Existing foreign key % on payment_intents.counter_purchase_id has an unexpected definition',
                v_constraint.conname;
        END IF;

        v_matching_constraint_count := v_matching_constraint_count + 1;
    END LOOP;

    IF v_matching_constraint_count > 1 THEN
        RAISE EXCEPTION
            'Multiple foreign keys exist on payment_intents.counter_purchase_id';
    ELSIF v_matching_constraint_count = 0 THEN
        EXECUTE format(
            'ALTER TABLE %I.payment_intents '
            || 'ADD CONSTRAINT payment_intents_counter_purchase_id_fk '
            || 'FOREIGN KEY (counter_purchase_id) '
            || 'REFERENCES %I.counter_purchases(counter_purchase_id)',
            v_schema,
            v_schema
        );
    END IF;
END;
$migration$;

-- The existing DB default assigns OTP when authorization_mode is omitted.
-- The Staff-Assisted insert explicitly assigns STAFF_ASSISTED instead.

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_staff_assisted_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar,
    p_counter_purchase_id varchar, p_provider_code varchar,
    p_idempotency_key varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar,
    "providerReferenceId" varchar, "membershipPlanId" varchar,
    "customerUserId" varchar, "createdAt" text,
    "commerceTransactionId" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_purchase counter_purchases%ROWTYPE;
    v_provider_id varchar;
    v_subtotal numeric(12,2);
    v_rate numeric(7,4);
    v_tax numeric(12,2);
    v_total numeric(12,2);
    v_currency varchar(10);
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_existing payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key NOT IN (p_counter_purchase_id || ':cash', p_counter_purchase_id || ':provider') THEN
        RAISE EXCEPTION 'Counter payment idempotency key does not match purchase' USING ERRCODE='22023';
    END IF;
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
       OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE='22023';
    END IF;

    SELECT * INTO v_purchase
      FROM counter_purchases cp
     WHERE cp.organization_id = p_organization_id
       AND cp.counter_purchase_id = p_counter_purchase_id
       AND cp.purchase_mode = 'STAFF_ASSISTED'
       AND cp.status = 'OPEN'
     FOR UPDATE;
    IF NOT FOUND OR NOT counter_can_operate(
        v_purchase.organization_id, v_purchase.store_id,
        v_purchase.staff_id, p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Staff-assisted Counter purchase is unavailable'
            USING ERRCODE='42501';
    END IF;

    SELECT * INTO v_existing
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key
     FOR UPDATE;
    IF FOUND THEN
        IF v_existing.membership_plan_id IS DISTINCT FROM v_purchase.subscription_plan_id
           OR v_existing.customer_user_id IS DISTINCT FROM v_purchase.customer_user_id
           OR v_existing.store_id IS DISTINCT FROM v_purchase.store_id
           OR v_existing.staff_id IS DISTINCT FROM v_purchase.staff_id
           OR v_existing.business_otp_challenge_id IS NOT NULL
           OR v_existing.authorization_mode IS DISTINCT FROM 'STAFF_ASSISTED'
           OR v_existing.counter_purchase_id IS DISTINCT FROM p_counter_purchase_id THEN
            RAISE EXCEPTION 'Existing payment conflicts with Staff-Assisted purchase'
                USING ERRCODE='23505';
        END IF;
        RETURN QUERY
        SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status,
               v_existing.amount::double precision, v_existing.currency_code,
               v_existing.provider_reference_id, v_existing.membership_plan_id,
               v_existing.customer_user_id, v_existing.created_at::text,
               v_existing.commerce_transaction_id
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;

    SELECT q."subtotalAmount", q."taxRate", q."taxAmount",
           q."totalAmount", q."currencyCode", q."taxCode", q."taxName"
      INTO v_subtotal, v_rate, v_tax, v_total, v_currency, v_tax_code, v_tax_name
      FROM membership_purchase_quote(
          p_organization_id, v_purchase.subscription_plan_id
      ) q;
    IF v_total IS NULL THEN
        RAISE EXCEPTION 'Membership purchase quote unavailable' USING ERRCODE='22023';
    END IF;

    SELECT payment_provider_config_id INTO v_provider_id
      FROM payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code
       AND is_enabled
     LIMIT 1;
    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE='22023';
    END IF;

    INSERT INTO payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id,
        business_otp_challenge_id, authorization_mode, counter_purchase_id,
        membership_plan_id, customer_user_id,
        store_id, staff_id, subtotal_amount, tax_rate, tax_amount,
        tax_code, tax_name, amount, currency_code, status,
        idempotency_key, created_by, updated_by
    ) VALUES (
        p_intent_id, p_organization_id, v_provider_id,
        NULL, 'STAFF_ASSISTED', p_counter_purchase_id,
        v_purchase.subscription_plan_id, v_purchase.customer_user_id,
        v_purchase.store_id, v_purchase.staff_id, v_subtotal, v_rate, v_tax,
        v_tax_code, v_tax_name, v_total, v_currency, 'PENDING',
        p_idempotency_key, p_actor_user_id, p_actor_user_id
    );
    INSERT INTO payment_attempts (
        payment_attempt_id, payment_intent_id, subtotal_amount, tax_rate,
        tax_amount, tax_code, tax_name, amount, currency_code,
        status, idempotency_key
    ) VALUES (
        p_attempt_id, p_intent_id, v_subtotal, v_rate, v_tax,
        v_tax_code, v_tax_name, v_total, v_currency, 'PENDING',
        p_idempotency_key
    );
    RETURN QUERY
    SELECT p_intent_id, p_provider_code, 'PENDING'::varchar,
           v_total::double precision, v_currency, NULL::varchar,
           v_purchase.subscription_plan_id, v_purchase.customer_user_id,
           CURRENT_TIMESTAMP::text, NULL::varchar;
END;
$function$;

-- The original finalizer used OTP context for every non-CUSTOMER_SESSION intent.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_finalize_membership(p_intent_id character varying, p_actor_user_id character varying)
 RETURNS TABLE("subscriptionId" character varying, "organizationUserId" character varying, "userId" character varying, "subscriptionNumber" character varying, "subscriptionPlanId" character varying, "subscriptionDate" text, "startDate" text, "endDate" text, "subscriptionStatusId" character varying, "totalAmount" double precision, "currencyCode" character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', '${schemaName}'
AS $function$
DECLARE
    i payment_intents%ROWTYPE;
    c business_otp_context%ROWTYPE;
    v_result record;
    v_purchase counter_purchases%ROWTYPE;
BEGIN
    SELECT * INTO i FROM payment_intents
     WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;
    IF i.status <> 'SUCCEEDED' THEN
        RAISE EXCEPTION 'Payment has not succeeded' USING ERRCODE = '22023';
    END IF;
    IF i.finalized_subscription_id IS NOT NULL THEN
        RETURN QUERY
        SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number,
               s.subscription_plan_id, s.subscription_date::text, s.start_date::text,
               s.end_date::text, s.subscription_status_id, s.total_amount::double precision,
               cur.currency_code
          FROM subscriptions s
          JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
          JOIN subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
          JOIN currencies cur ON cur.currency_id = sp.currency_id
         WHERE s.subscription_id = i.finalized_subscription_id;
        RETURN;
    END IF;

    IF i.authorization_mode = 'CUSTOMER_SESSION' THEN
        SELECT * INTO v_result FROM customer_purchase_subscription_authenticated(
            i.organization_id, i.membership_plan_id, i.customer_user_id
        );
    ELSIF i.authorization_mode = 'STAFF_ASSISTED' THEN
        IF i.business_otp_challenge_id IS NOT NULL OR i.counter_purchase_id IS NULL THEN
            RAISE EXCEPTION 'Staff-Assisted purchase authorization is unavailable' USING ERRCODE='22023';
        END IF;
        SELECT * INTO v_purchase FROM counter_purchases cp
         WHERE cp.counter_purchase_id = i.counter_purchase_id
           AND cp.organization_id = i.organization_id
           AND cp.purchase_mode = 'STAFF_ASSISTED'
           AND cp.status = 'OPEN'
           AND cp.store_id = i.store_id
           AND cp.staff_id = i.staff_id
           AND cp.customer_user_id = i.customer_user_id
           AND cp.subscription_plan_id = i.membership_plan_id
         FOR UPDATE;
        IF NOT FOUND OR NOT counter_can_operate(
            i.organization_id, i.store_id, i.staff_id, p_actor_user_id
        ) THEN
            RAISE EXCEPTION 'Staff-Assisted Counter purchase is unavailable' USING ERRCODE='42501';
        END IF;
        -- The accepted agreement is enforced before payment start in CounterService.
        -- Completion requires the original identity and a SUCCEEDED payment intent.
        SELECT * INTO v_result FROM counter_purchase_subscription(
            i.organization_id, i.store_id, i.staff_id, i.membership_plan_id,
            i.customer_user_id, NULL, NULL, NULL, NULL, p_actor_user_id
        );
    ELSIF i.authorization_mode = 'OTP' THEN
        SELECT * INTO c FROM business_otp_context
         WHERE otp_challenge_id = i.business_otp_challenge_id FOR UPDATE;
        IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.organization_id <> i.organization_id
           OR c.plan_id <> i.membership_plan_id THEN
            RAISE EXCEPTION 'Verified membership purchase authorization is unavailable'
                USING ERRCODE = '22023';
        END IF;
        IF c.purpose = 'COUNTER_PURCHASE_VERIFY' THEN
            SELECT * INTO v_result FROM counter_purchase_subscription(
                i.organization_id, c.store_id, c.staff_id, c.plan_id, c.user_id,
                NULL, NULL, NULL, NULL, p_actor_user_id
            );
        ELSIF c.purpose = 'APP_MEMBERSHIP_PURCHASE_VERIFY' THEN
            SELECT * INTO v_result FROM purchase_membership_subscription(
                i.organization_id, c.plan_id, c.user_id, c.payload->>'firstName',
                c.payload->>'lastName', c.payload->>'primaryEmail',
                c.payload->>'primaryPhone', p_actor_user_id
            );
        ELSE
            RAISE EXCEPTION 'Payment does not authorize a membership purchase'
                USING ERRCODE = '22023';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported membership purchase authorization mode' USING ERRCODE='22023';
    END IF;
    IF v_result."subscriptionId" IS NULL THEN
        RAISE EXCEPTION 'Membership purchase was not created' USING ERRCODE = 'P0002';
    END IF;
    UPDATE subscriptions
       SET subtotal_amount = i.subtotal_amount, tax_rate = i.tax_rate,
           tax_amount = i.tax_amount, tax_code = i.tax_code, tax_name = i.tax_name,
           total_amount = i.amount, updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE subscription_id = v_result."subscriptionId";
    UPDATE payment_intents
       SET finalized_subscription_id = v_result."subscriptionId",
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id
     WHERE payment_intent_id = p_intent_id;
    IF i.authorization_mode = 'OTP' THEN
        UPDATE business_otp_context
           SET consumed_at = CURRENT_TIMESTAMP
         WHERE otp_challenge_id = i.business_otp_challenge_id;
    END IF;
    RETURN QUERY
    SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number,
           s.subscription_plan_id, s.subscription_date::text, s.start_date::text,
           s.end_date::text, s.subscription_status_id, s.total_amount::double precision,
           cur.currency_code
      FROM subscriptions s
      JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
      JOIN subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN currencies cur ON cur.currency_id = sp.currency_id
     WHERE s.subscription_id = v_result."subscriptionId";
END;
$function$;

-- Mark both Counter OTP and Staff-Assisted purchases as completed.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_complete_purchase_from_payment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_counter_purchase_id varchar(64);
BEGIN
    IF NEW.finalized_subscription_id IS NULL
       OR NEW.finalized_subscription_id IS NOT DISTINCT FROM OLD.finalized_subscription_id THEN
        RETURN NEW;
    END IF;

    IF NEW.authorization_mode = 'STAFF_ASSISTED' THEN
        v_counter_purchase_id := NEW.counter_purchase_id;
    ELSIF NEW.business_otp_challenge_id IS NOT NULL THEN
        SELECT c.counter_purchase_id INTO v_counter_purchase_id
          FROM business_otp_context c
         WHERE c.otp_challenge_id = NEW.business_otp_challenge_id;
    END IF;

    IF v_counter_purchase_id IS NOT NULL THEN
        UPDATE counter_purchases cp
           SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
         WHERE cp.counter_purchase_id = v_counter_purchase_id
           AND cp.organization_id = NEW.organization_id
           AND cp.store_id = NEW.store_id
           AND cp.staff_id = NEW.staff_id
           AND cp.customer_user_id = NEW.customer_user_id
           AND cp.subscription_plan_id = NEW.membership_plan_id
           AND cp.status = 'OPEN';
    END IF;
    RETURN NEW;
END;
$function$;
