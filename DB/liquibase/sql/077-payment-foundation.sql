-- 077-provider-neutral-payment-foundation.sql
-- Payment intent and attempt persistence for membership purchases. External providers are not configured here.

CREATE TABLE IF NOT EXISTS "${schemaName}".payment_provider_configs (
    payment_provider_config_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) REFERENCES "${schemaName}".organization(organization_id),
    provider_code varchar(64) NOT NULL,
    configuration_reference varchar(160),
    display_name varchar(120) NOT NULL,
    is_enabled boolean NOT NULL DEFAULT true,
    is_test_mode boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64),
    CONSTRAINT ck_payment_provider_code CHECK (provider_code ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_provider_configs_scope_code
    ON "${schemaName}".payment_provider_configs (COALESCE(organization_id, ''), provider_code);

CREATE TABLE IF NOT EXISTS "${schemaName}".payment_intents (
    payment_intent_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    payment_provider_config_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_provider_configs(payment_provider_config_id),
    business_otp_challenge_id varchar(64) UNIQUE REFERENCES "${schemaName}".otp_challenges(otp_challenge_id),
    authorization_mode varchar(32) NOT NULL DEFAULT 'OTP',
    membership_plan_id varchar(64) NOT NULL REFERENCES "${schemaName}".subscription_plans(subscription_plan_id),
    customer_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    staff_id varchar(64) REFERENCES "${schemaName}".staff(staff_id),
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency_code varchar(10) NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'PENDING',
    idempotency_key varchar(128) NOT NULL,
    provider_reference_id varchar(160),
    failure_code varchar(80),
    failure_message varchar(500),
    cancelled_at timestamp with time zone,
    finalized_subscription_id varchar(64) REFERENCES "${schemaName}".subscriptions(subscription_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64),
    CONSTRAINT ck_payment_intent_status CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED')),
    CONSTRAINT ck_payment_intent_authorization CHECK (authorization_mode IN ('OTP', 'CUSTOMER_SESSION')),
    CONSTRAINT ux_payment_intents_org_idempotency UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS "${schemaName}".payment_attempts (
    payment_attempt_id varchar(64) PRIMARY KEY,
    payment_intent_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    provider_reference_id varchar(160),
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency_code varchar(10) NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'PENDING',
    idempotency_key varchar(128) NOT NULL,
    failure_code varchar(80),
    failure_message varchar(500),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    CONSTRAINT ck_payment_attempt_status CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED')),
    CONSTRAINT ux_payment_attempts_intent_idempotency UNIQUE (payment_intent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_payment_intents_org_created
    ON "${schemaName}".payment_intents (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_attempts_intent_created
    ON "${schemaName}".payment_attempts (payment_intent_id, created_at DESC);

-- A test config is deliberately disabled outside runtime local/dev selection in Kotlin.
INSERT INTO "${schemaName}".payment_provider_configs (
    payment_provider_config_id, organization_id, provider_code, configuration_reference,
    display_name, is_enabled, is_test_mode, created_by, updated_by
) VALUES (
    'payment-provider-test', NULL, 'TEST', 'local-dev-only',
    'Local test payment provider', true, true, 'system', 'system'
) ON CONFLICT (payment_provider_config_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    configuration_reference = EXCLUDED.configuration_reference,
    is_test_mode = EXCLUDED.is_test_mode,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'system';

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar,
    p_challenge_id varchar, p_provider_code varchar, p_idempotency_key varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar;
    v_plan_id varchar;
    v_user_id varchar;
    v_store_id varchar;
    v_staff_id varchar;
    v_amount numeric(12,2);
    v_currency varchar(10);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents
     WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status,
            v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id,
            v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text
        FROM "${schemaName}".payment_provider_configs pc
        WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;
    SELECT c.plan_id, c.user_id, c.store_id, c.staff_id
      INTO v_plan_id, v_user_id, v_store_id, v_staff_id
      FROM "${schemaName}".business_otp_context c
      JOIN "${schemaName}".otp_challenges o ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose IN ('COUNTER_PURCHASE_VERIFY', 'APP_MEMBERSHIP_PURCHASE_VERIFY')
       AND o.status = 'CONSUMED'
     FOR UPDATE OF c;
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Verified membership purchase authorization is unavailable' USING ERRCODE = '22023';
    END IF;
    SELECT sp.price, cur.currency_code INTO v_amount, v_currency
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id
     WHERE sp.subscription_plan_id = v_plan_id AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted AND NOT mp.is_deleted;
    IF v_amount IS NULL THEN RAISE EXCEPTION 'Membership plan is unavailable for payment' USING ERRCODE = '22023'; END IF;
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id, business_otp_challenge_id,
        membership_plan_id, customer_user_id, store_id, staff_id, amount, currency_code,
        status, idempotency_key, created_by, updated_by
    ) VALUES (p_intent_id, p_organization_id, v_provider_id, p_challenge_id,
        v_plan_id, v_user_id, v_store_id, v_staff_id, v_amount, v_currency,
        'PENDING', p_idempotency_key, p_actor_user_id, p_actor_user_id);
    INSERT INTO "${schemaName}".payment_attempts (
        payment_attempt_id, payment_intent_id, amount, currency_code, status, idempotency_key
    ) VALUES (p_attempt_id, p_intent_id, v_amount, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING', v_amount::double precision,
        v_currency, NULL::varchar, v_plan_id, v_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_intent(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "failureCode" varchar, "failureMessage" varchar, "membershipPlanId" varchar,
    "customerUserId" varchar, "finalizedSubscriptionId" varchar, "createdAt" text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT i.payment_intent_id, pc.provider_code, i.status, i.amount::double precision,
        i.currency_code, i.provider_reference_id, i.failure_code, i.failure_message,
        i.membership_plan_id, i.customer_user_id, i.finalized_subscription_id, i.created_at::text
      FROM "${schemaName}".payment_intents i
      JOIN "${schemaName}".payment_provider_configs pc ON pc.payment_provider_config_id = i.payment_provider_config_id
     WHERE i.organization_id = p_organization_id AND i.payment_intent_id = p_intent_id
       AND (i.created_by = p_actor_user_id OR i.customer_user_id = p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_authenticated_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar,
    p_plan_id varchar, p_customer_user_id varchar, p_provider_code varchar,
    p_idempotency_key varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar;
    v_amount numeric(12,2);
    v_currency varchar(10);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents
     WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status,
            v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id,
            v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text
        FROM "${schemaName}".payment_provider_configs pc
        WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;
    IF NOT "${schemaName}".customer_has_active_relationship(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT sp.price, cur.currency_code INTO v_amount, v_currency
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id
     WHERE sp.subscription_plan_id = p_plan_id AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted AND NOT mp.is_deleted;
    IF v_amount IS NULL THEN RAISE EXCEPTION 'Membership plan is unavailable for payment' USING ERRCODE = '22023'; END IF;
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id, authorization_mode,
        membership_plan_id, customer_user_id, amount, currency_code, status, idempotency_key, created_by, updated_by
    ) VALUES (
        p_intent_id, p_organization_id, v_provider_id, 'CUSTOMER_SESSION',
        p_plan_id, p_customer_user_id, v_amount, v_currency, 'PENDING', p_idempotency_key, p_customer_user_id, p_customer_user_id
    );
    INSERT INTO "${schemaName}".payment_attempts (
        payment_attempt_id, payment_intent_id, amount, currency_code, status, idempotency_key
    ) VALUES (p_attempt_id, p_intent_id, v_amount, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING', v_amount::double precision,
        v_currency, NULL::varchar, p_plan_id, p_customer_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_result(
    p_intent_id varchar, p_attempt_id varchar, p_status varchar, p_provider_reference varchar,
    p_failure_code varchar, p_failure_message varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_intent "${schemaName}".payment_intents%ROWTYPE; v_attempt_id varchar;
BEGIN
    SELECT * INTO v_intent FROM "${schemaName}".payment_intents WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR (v_intent.created_by IS DISTINCT FROM p_actor_user_id AND v_intent.customer_user_id IS DISTINCT FROM p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;
    IF v_intent.status IN ('SUCCEEDED', 'CANCELED') THEN
        RETURN v_intent.status = p_status;
    END IF;
    SELECT payment_attempt_id INTO v_attempt_id FROM "${schemaName}".payment_attempts
     WHERE payment_intent_id = p_intent_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_attempt_id IS NULL THEN RAISE EXCEPTION 'Payment attempt is unavailable' USING ERRCODE = '22023'; END IF;
    IF p_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED') THEN RAISE EXCEPTION 'Invalid payment result' USING ERRCODE = '22023'; END IF;
    UPDATE "${schemaName}".payment_intents SET status = p_status, provider_reference_id = COALESCE(p_provider_reference, provider_reference_id),
        failure_code = p_failure_code, failure_message = p_failure_message,
        cancelled_at = CASE WHEN p_status = 'CANCELED' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id WHERE payment_intent_id = p_intent_id;
    UPDATE "${schemaName}".payment_attempts SET status = p_status, provider_reference_id = COALESCE(p_provider_reference, provider_reference_id),
        failure_code = p_failure_code, failure_message = p_failure_message, processed_at = CURRENT_TIMESTAMP
     WHERE payment_attempt_id = COALESCE(p_attempt_id, v_attempt_id) AND payment_intent_id = p_intent_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment attempt is unavailable' USING ERRCODE = '22023'; END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_cancel_intent(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
    UPDATE "${schemaName}".payment_intents SET status = 'CANCELED', cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id
     WHERE organization_id = p_organization_id AND payment_intent_id = p_intent_id AND status IN ('PENDING', 'PROCESSING')
       AND (created_by = p_actor_user_id OR customer_user_id = p_actor_user_id);
    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_finalize_membership(
    p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    i "${schemaName}".payment_intents%ROWTYPE;
    c "${schemaName}".business_otp_context%ROWTYPE;
    v_result record;
BEGIN
    SELECT * INTO i FROM "${schemaName}".payment_intents WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR (i.created_by IS DISTINCT FROM p_actor_user_id AND i.customer_user_id IS DISTINCT FROM p_actor_user_id) THEN RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501'; END IF;
    IF i.status <> 'SUCCEEDED' THEN RAISE EXCEPTION 'Payment has not succeeded' USING ERRCODE = '22023'; END IF;
    IF i.finalized_subscription_id IS NOT NULL THEN
        RETURN QUERY SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number, s.subscription_plan_id, s.subscription_date::text, s.start_date::text, s.end_date::text, s.subscription_status_id, s.total_amount::double precision, cur.currency_code FROM "${schemaName}".subscriptions s JOIN "${schemaName}".organization_user ou ON ou.organization_user_id=s.organization_user_id JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id=s.subscription_plan_id JOIN "${schemaName}".currencies cur ON cur.currency_id=sp.currency_id WHERE s.subscription_id=i.finalized_subscription_id;
        RETURN;
    END IF;
    IF i.authorization_mode = 'CUSTOMER_SESSION' THEN
        SELECT * INTO v_result FROM "${schemaName}".purchase_membership_subscription(
            i.organization_id, i.membership_plan_id, i.customer_user_id, NULL, NULL, NULL, NULL, p_actor_user_id);
    ELSE
        SELECT * INTO c FROM "${schemaName}".business_otp_context WHERE otp_challenge_id=i.business_otp_challenge_id FOR UPDATE;
        IF NOT FOUND OR c.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'Verified membership purchase authorization is unavailable' USING ERRCODE = '22023'; END IF;
        IF c.organization_id <> i.organization_id OR c.plan_id <> i.membership_plan_id THEN
            RAISE EXCEPTION 'Payment authorization context is invalid' USING ERRCODE = '22023';
        END IF;
        IF c.purpose = 'COUNTER_PURCHASE_VERIFY' THEN
        SELECT * INTO v_result FROM "${schemaName}".counter_purchase_subscription(i.organization_id, c.store_id, c.staff_id, c.plan_id, c.user_id, NULL, NULL, NULL, NULL, p_actor_user_id);
        ELSIF c.purpose = 'APP_MEMBERSHIP_PURCHASE_VERIFY' THEN
        SELECT * INTO v_result FROM "${schemaName}".purchase_membership_subscription(i.organization_id, c.plan_id, c.user_id, c.payload->>'firstName', c.payload->>'lastName', c.payload->>'primaryEmail', c.payload->>'primaryPhone', p_actor_user_id);
        ELSE RAISE EXCEPTION 'Payment does not authorize a membership purchase' USING ERRCODE = '22023'; END IF;
    END IF;
    IF v_result."subscriptionId" IS NULL THEN RAISE EXCEPTION 'Membership purchase was not created' USING ERRCODE = 'P0002'; END IF;
    UPDATE "${schemaName}".payment_intents SET finalized_subscription_id = v_result."subscriptionId", updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id WHERE payment_intent_id = p_intent_id;
    UPDATE "${schemaName}".business_otp_context SET consumed_at = CURRENT_TIMESTAMP WHERE otp_challenge_id = i.business_otp_challenge_id;
    RETURN QUERY SELECT v_result."subscriptionId", v_result."organizationUserId", v_result."userId", v_result."subscriptionNumber", v_result."subscriptionPlanId", v_result."subscriptionDate", v_result."startDate", v_result."endDate", v_result."subscriptionStatusId", v_result."totalAmount", v_result."currencyCode";
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".payment_provider_configs, "${schemaName}".payment_intents, "${schemaName}".payment_attempts FROM PUBLIC;
REVOKE ALL ON TABLE "${schemaName}".payment_provider_configs, "${schemaName}".payment_intents, "${schemaName}".payment_attempts FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".payment_start_membership_intent(varchar,varchar,varchar,varchar,varchar,varchar,varchar), "${schemaName}".payment_start_authenticated_membership_intent(varchar,varchar,varchar,varchar,varchar,varchar,varchar), "${schemaName}".payment_get_intent(varchar,varchar,varchar), "${schemaName}".payment_record_result(varchar,varchar,varchar,varchar,varchar,varchar,varchar), "${schemaName}".payment_cancel_intent(varchar,varchar,varchar), "${schemaName}".payment_finalize_membership(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_membership_intent(varchar,varchar,varchar,varchar,varchar,varchar,varchar), "${schemaName}".payment_start_authenticated_membership_intent(varchar,varchar,varchar,varchar,varchar,varchar,varchar), "${schemaName}".payment_get_intent(varchar,varchar,varchar), "${schemaName}".payment_record_result(varchar,varchar,varchar,varchar,varchar,varchar,varchar), "${schemaName}".payment_cancel_intent(varchar,varchar,varchar), "${schemaName}".payment_finalize_membership(varchar,varchar) TO "${appRole}";
