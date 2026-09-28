-- Database-owned membership tax configuration and transaction snapshots.
-- Organization addresses retain their country code; tax configuration resolves
-- it through the geographic countries reference table introduced in migration 090.

CREATE TABLE IF NOT EXISTS "${schemaName}".country_tax_configurations (
    country_tax_configuration_id varchar(64) PRIMARY KEY,
    country_id varchar(64) NOT NULL REFERENCES "${schemaName}".countries(country_id),
    tax_code varchar(32) NOT NULL,
    tax_name varchar(100) NOT NULL,
    tax_rate numeric(7,4) NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL,
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_country_tax_configuration_rate CHECK (tax_rate >= 0 AND tax_rate <= 100),
    CONSTRAINT ck_country_tax_configuration_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_country_tax_configuration_effective
    ON "${schemaName}".country_tax_configurations (country_id, tax_code, effective_from)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS ix_country_tax_configuration_resolution
    ON "${schemaName}".country_tax_configurations (country_id, effective_from DESC)
    WHERE is_active = true AND is_deleted = false;

-- Canada is configured as the MVP country-level rate. It is data, never application code.
INSERT INTO "${schemaName}".country_tax_configurations (
    country_tax_configuration_id, country_id, tax_code, tax_name, tax_rate,
    effective_from, is_active, created_by, updated_by
) VALUES (
    'CTC_CA_HST', 'country-ca', 'HST', 'Harmonized Sales Tax', 13.0000,
    DATE '2026-01-01', true, 'system', 'system'
) ON CONFLICT (country_tax_configuration_id) DO UPDATE
SET country_id = EXCLUDED.country_id,
    tax_code = EXCLUDED.tax_code,
    tax_name = EXCLUDED.tax_name,
    tax_rate = EXCLUDED.tax_rate,
    effective_from = EXCLUDED.effective_from,
    is_active = EXCLUDED.is_active,
    is_deleted = false,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'system',
    version_no = "${schemaName}".country_tax_configurations.version_no + 1;

ALTER TABLE "${schemaName}".subscriptions
    ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4),
    ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS tax_code varchar(32),
    ADD COLUMN IF NOT EXISTS tax_name varchar(100);

ALTER TABLE "${schemaName}".payment_intents
    ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4),
    ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS tax_code varchar(32),
    ADD COLUMN IF NOT EXISTS tax_name varchar(100);

ALTER TABLE "${schemaName}".payment_attempts
    ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4),
    ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS tax_code varchar(32),
    ADD COLUMN IF NOT EXISTS tax_name varchar(100);

-- Existing transactions were created before tax was collected. Preserve their totals.
UPDATE "${schemaName}".subscriptions
SET subtotal_amount = COALESCE(subtotal_amount, total_amount),
    tax_rate = COALESCE(tax_rate, 0),
    tax_amount = COALESCE(tax_amount, 0)
WHERE subtotal_amount IS NULL OR tax_rate IS NULL OR tax_amount IS NULL;

UPDATE "${schemaName}".payment_intents
SET subtotal_amount = COALESCE(subtotal_amount, amount),
    tax_rate = COALESCE(tax_rate, 0),
    tax_amount = COALESCE(tax_amount, 0)
WHERE subtotal_amount IS NULL OR tax_rate IS NULL OR tax_amount IS NULL;

UPDATE "${schemaName}".payment_attempts a
SET subtotal_amount = COALESCE(a.subtotal_amount, i.subtotal_amount, a.amount),
    tax_rate = COALESCE(a.tax_rate, i.tax_rate, 0),
    tax_amount = COALESCE(a.tax_amount, i.tax_amount, 0),
    tax_code = COALESCE(a.tax_code, i.tax_code),
    tax_name = COALESCE(a.tax_name, i.tax_name)
FROM "${schemaName}".payment_intents i
WHERE i.payment_intent_id = a.payment_intent_id
  AND (a.subtotal_amount IS NULL OR a.tax_rate IS NULL OR a.tax_amount IS NULL);

ALTER TABLE "${schemaName}".subscriptions
    ALTER COLUMN subtotal_amount SET NOT NULL,
    ALTER COLUMN tax_rate SET NOT NULL,
    ALTER COLUMN tax_amount SET NOT NULL;

ALTER TABLE "${schemaName}".payment_intents
    ALTER COLUMN subtotal_amount SET NOT NULL,
    ALTER COLUMN tax_rate SET NOT NULL,
    ALTER COLUMN tax_amount SET NOT NULL;

ALTER TABLE "${schemaName}".payment_attempts
    ALTER COLUMN subtotal_amount SET NOT NULL,
    ALTER COLUMN tax_rate SET NOT NULL,
    ALTER COLUMN tax_amount SET NOT NULL;

CREATE OR REPLACE FUNCTION "${schemaName}".membership_purchase_quote(
    p_organization_id varchar,
    p_plan_id varchar,
    p_purchase_date date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    "planId" varchar,
    "subtotalAmount" double precision,
    "taxRate" double precision,
    "taxAmount" double precision,
    "totalAmount" double precision,
    "currencyCode" varchar,
    "taxCode" varchar,
    "taxName" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_subtotal numeric(12,2);
    v_currency varchar(10);
    v_country_code varchar(16);
    v_country_id varchar(64);
    v_tax_rate numeric(7,4) := 0;
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_tax_amount numeric(12,2);
BEGIN
    SELECT sp.price, cur.currency_code, upper(NULLIF(trim(d.country), ''))
      INTO v_subtotal, v_currency, v_country_code
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp
        ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id
      JOIN "${schemaName}".entity_status pse
        ON pse.entity_status_id = sp.subscription_plan_status_id
      JOIN "${schemaName}".statuses ps ON ps.status_id = pse.status_id
      JOIN "${schemaName}".entity_status mse
        ON mse.entity_status_id = mp.product_status_id
      JOIN "${schemaName}".statuses ms ON ms.status_id = mse.status_id
      LEFT JOIN "${schemaName}".organization_details d
        ON d.organization_id = mp.organization_id AND d.is_deleted = false
     WHERE sp.subscription_plan_id = p_plan_id
       AND mp.organization_id = p_organization_id
       AND sp.is_deleted = false
       AND mp.is_deleted = false
       AND ps.status_code = 'ACTIVE'
       AND ms.status_code = 'ACTIVE'
       AND sp.effective_date <= p_purchase_date
       AND (sp.expiry_date IS NULL OR sp.expiry_date >= p_purchase_date)
       AND mp.effective_date <= p_purchase_date
       AND (mp.expiry_date IS NULL OR mp.expiry_date >= p_purchase_date);

    IF v_subtotal IS NULL THEN
        RAISE EXCEPTION 'Membership plan is unavailable for payment' USING ERRCODE = '22023';
    END IF;

    SELECT c.country_id INTO v_country_id
      FROM "${schemaName}".countries c
     WHERE c.country_code = v_country_code
       AND c.is_active = true
       AND c.is_deleted = false;

    SELECT t.tax_rate, t.tax_code, t.tax_name
      INTO v_tax_rate, v_tax_code, v_tax_name
      FROM "${schemaName}".country_tax_configurations t
     WHERE t.country_id = v_country_id
       AND t.is_active = true
       AND t.is_deleted = false
       AND t.effective_from <= p_purchase_date
       AND (t.effective_to IS NULL OR t.effective_to >= p_purchase_date)
     ORDER BY t.effective_from DESC, t.country_tax_configuration_id
     LIMIT 1;

    v_tax_rate := COALESCE(v_tax_rate, 0);
    v_tax_amount := round(v_subtotal * v_tax_rate / 100, 2);
    RETURN QUERY SELECT p_plan_id, v_subtotal::double precision,
        v_tax_rate::double precision, v_tax_amount::double precision,
        (v_subtotal + v_tax_amount)::double precision, v_currency,
        v_tax_code, v_tax_name;
END;
$function$;

-- Existing start-function signatures are retained. Their amount is now the tax-inclusive total.
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
    v_provider_id varchar; v_plan_id varchar; v_user_id varchar; v_store_id varchar; v_staff_id varchar;
    v_subtotal numeric(12,2); v_rate numeric(7,4); v_tax numeric(12,2); v_total numeric(12,2);
    v_currency varchar(10); v_tax_code varchar(32); v_tax_name varchar(100);
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
        FROM "${schemaName}".payment_provider_configs pc WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;
    SELECT c.plan_id, c.user_id, c.store_id, c.staff_id INTO v_plan_id, v_user_id, v_store_id, v_staff_id
      FROM "${schemaName}".business_otp_context c JOIN "${schemaName}".otp_challenges o ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id AND c.organization_id = p_organization_id AND c.consumed_at IS NULL
       AND c.purpose IN ('COUNTER_PURCHASE_VERIFY', 'APP_MEMBERSHIP_PURCHASE_VERIFY') AND o.status = 'CONSUMED' FOR UPDATE OF c;
    IF v_plan_id IS NULL THEN RAISE EXCEPTION 'Verified membership purchase authorization is unavailable' USING ERRCODE = '22023'; END IF;
    SELECT "subtotalAmount", "taxRate", "taxAmount", "totalAmount", "currencyCode", "taxCode", "taxName"
      INTO v_subtotal, v_rate, v_tax, v_total, v_currency, v_tax_code, v_tax_name
      FROM "${schemaName}".membership_purchase_quote(p_organization_id, v_plan_id);
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id, business_otp_challenge_id, membership_plan_id,
        customer_user_id, store_id, staff_id, subtotal_amount, tax_rate, tax_amount, tax_code, tax_name,
        amount, currency_code, status, idempotency_key, created_by, updated_by
    ) VALUES (p_intent_id, p_organization_id, v_provider_id, p_challenge_id, v_plan_id, v_user_id, v_store_id, v_staff_id,
        v_subtotal, v_rate, v_tax, v_tax_code, v_tax_name, v_total, v_currency, 'PENDING', p_idempotency_key, p_actor_user_id, p_actor_user_id);
    INSERT INTO "${schemaName}".payment_attempts (
        payment_attempt_id, payment_intent_id, subtotal_amount, tax_rate, tax_amount, tax_code, tax_name,
        amount, currency_code, status, idempotency_key
    ) VALUES (p_attempt_id, p_intent_id, v_subtotal, v_rate, v_tax, v_tax_code, v_tax_name, v_total, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING'::varchar, v_total::double precision,
        v_currency, NULL::varchar, v_plan_id, v_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_authenticated_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar, p_plan_id varchar,
    p_customer_user_id varchar, p_provider_code varchar, p_idempotency_key varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar; v_subtotal numeric(12,2); v_rate numeric(7,4); v_tax numeric(12,2); v_total numeric(12,2);
    v_currency varchar(10); v_tax_code varchar(32); v_tax_name varchar(100); v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status, v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id, v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text FROM "${schemaName}".payment_provider_configs pc WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id; RETURN; END IF;
    IF NOT "${schemaName}".customer_has_active_relationship(p_organization_id, p_customer_user_id) THEN RAISE EXCEPTION 'Customer purchase is not permitted' USING ERRCODE = '42501'; END IF;
    SELECT "subtotalAmount", "taxRate", "taxAmount", "totalAmount", "currencyCode", "taxCode", "taxName" INTO v_subtotal, v_rate, v_tax, v_total, v_currency, v_tax_code, v_tax_name FROM "${schemaName}".membership_purchase_quote(p_organization_id, p_plan_id);
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (payment_intent_id, organization_id, payment_provider_config_id, authorization_mode, membership_plan_id, customer_user_id, subtotal_amount, tax_rate, tax_amount, tax_code, tax_name, amount, currency_code, status, idempotency_key, created_by, updated_by)
    VALUES (p_intent_id, p_organization_id, v_provider_id, 'CUSTOMER_SESSION', p_plan_id, p_customer_user_id, v_subtotal, v_rate, v_tax, v_tax_code, v_tax_name, v_total, v_currency, 'PENDING', p_idempotency_key, p_customer_user_id, p_customer_user_id);
    INSERT INTO "${schemaName}".payment_attempts (payment_attempt_id, payment_intent_id, subtotal_amount, tax_rate, tax_amount, tax_code, tax_name, amount, currency_code, status, idempotency_key)
    VALUES (p_attempt_id, p_intent_id, v_subtotal, v_rate, v_tax, v_tax_code, v_tax_name, v_total, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING'::varchar, v_total::double precision, v_currency, NULL::varchar, p_plan_id, p_customer_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_customer_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar, p_plan_id varchar,
    p_customer_user_id varchar, p_provider_code varchar, p_idempotency_key varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar; v_subtotal numeric(12,2); v_rate numeric(7,4); v_tax numeric(12,2); v_total numeric(12,2);
    v_currency varchar(10); v_tax_code varchar(32); v_tax_name varchar(100); v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status, v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id, v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text FROM "${schemaName}".payment_provider_configs pc WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id; RETURN; END IF;
    SELECT "subtotalAmount", "taxRate", "taxAmount", "totalAmount", "currencyCode", "taxCode", "taxName" INTO v_subtotal, v_rate, v_tax, v_total, v_currency, v_tax_code, v_tax_name FROM "${schemaName}".membership_purchase_quote(p_organization_id, p_plan_id);
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (payment_intent_id, organization_id, payment_provider_config_id, authorization_mode, membership_plan_id, customer_user_id, subtotal_amount, tax_rate, tax_amount, tax_code, tax_name, amount, currency_code, status, idempotency_key, created_by, updated_by)
    VALUES (p_intent_id, p_organization_id, v_provider_id, 'CUSTOMER_SESSION', p_plan_id, p_customer_user_id, v_subtotal, v_rate, v_tax, v_tax_code, v_tax_name, v_total, v_currency, 'PENDING', p_idempotency_key, p_customer_user_id, p_customer_user_id);
    INSERT INTO "${schemaName}".payment_attempts (payment_attempt_id, payment_intent_id, subtotal_amount, tax_rate, tax_amount, tax_code, tax_name, amount, currency_code, status, idempotency_key)
    VALUES (p_attempt_id, p_intent_id, v_subtotal, v_rate, v_tax, v_tax_code, v_tax_name, v_total, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING'::varchar, v_total::double precision, v_currency, NULL::varchar, p_plan_id, p_customer_user_id, CURRENT_TIMESTAMP::text;
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
    i "${schemaName}".payment_intents%ROWTYPE; c "${schemaName}".business_otp_context%ROWTYPE; v_result record;
BEGIN
    SELECT * INTO i FROM "${schemaName}".payment_intents WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR (i.created_by IS DISTINCT FROM p_actor_user_id AND i.customer_user_id IS DISTINCT FROM p_actor_user_id) THEN RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501'; END IF;
    IF i.status <> 'SUCCEEDED' THEN RAISE EXCEPTION 'Payment has not succeeded' USING ERRCODE = '22023'; END IF;
    IF i.finalized_subscription_id IS NOT NULL THEN
        RETURN QUERY SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number, s.subscription_plan_id, s.subscription_date::text, s.start_date::text, s.end_date::text, s.subscription_status_id, s.total_amount::double precision, cur.currency_code FROM "${schemaName}".subscriptions s JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id WHERE s.subscription_id = i.finalized_subscription_id;
        RETURN;
    END IF;
    IF i.authorization_mode = 'CUSTOMER_SESSION' THEN
        SELECT * INTO v_result FROM "${schemaName}".purchase_membership_subscription(i.organization_id, i.membership_plan_id, i.customer_user_id, NULL, NULL, NULL, NULL, p_actor_user_id);
    ELSE
        SELECT * INTO c FROM "${schemaName}".business_otp_context WHERE otp_challenge_id = i.business_otp_challenge_id FOR UPDATE;
        IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.organization_id <> i.organization_id OR c.plan_id <> i.membership_plan_id THEN RAISE EXCEPTION 'Verified membership purchase authorization is unavailable' USING ERRCODE = '22023'; END IF;
        IF c.purpose = 'COUNTER_PURCHASE_VERIFY' THEN
            SELECT * INTO v_result FROM "${schemaName}".counter_purchase_subscription(i.organization_id, c.store_id, c.staff_id, c.plan_id, c.user_id, NULL, NULL, NULL, NULL, p_actor_user_id);
        ELSIF c.purpose = 'APP_MEMBERSHIP_PURCHASE_VERIFY' THEN
            SELECT * INTO v_result FROM "${schemaName}".purchase_membership_subscription(i.organization_id, c.plan_id, c.user_id, c.payload->>'firstName', c.payload->>'lastName', c.payload->>'primaryEmail', c.payload->>'primaryPhone', p_actor_user_id);
        ELSE RAISE EXCEPTION 'Payment does not authorize a membership purchase' USING ERRCODE = '22023'; END IF;
    END IF;
    IF v_result."subscriptionId" IS NULL THEN RAISE EXCEPTION 'Membership purchase was not created' USING ERRCODE = 'P0002'; END IF;
    UPDATE "${schemaName}".subscriptions
       SET subtotal_amount = i.subtotal_amount, tax_rate = i.tax_rate, tax_amount = i.tax_amount,
           tax_code = i.tax_code, tax_name = i.tax_name, total_amount = i.amount,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE subscription_id = v_result."subscriptionId";
    UPDATE "${schemaName}".payment_intents SET finalized_subscription_id = v_result."subscriptionId", updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id WHERE payment_intent_id = p_intent_id;
    UPDATE "${schemaName}".business_otp_context SET consumed_at = CURRENT_TIMESTAMP WHERE otp_challenge_id = i.business_otp_challenge_id;
    RETURN QUERY SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number, s.subscription_plan_id, s.subscription_date::text, s.start_date::text, s.end_date::text, s.subscription_status_id, s.total_amount::double precision, cur.currency_code FROM "${schemaName}".subscriptions s JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id WHERE s.subscription_id = v_result."subscriptionId";
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".country_tax_configurations FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".membership_purchase_quote(varchar, varchar, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".membership_purchase_quote(varchar, varchar, date) TO "${appRole}";
