-- Phase 3D-B stable Counter purchase identity.
-- 112-114 are already applied and remain immutable.
--
-- One logical Counter membership checkout now has one durable counter_purchase_id.
-- OTP challenges remain verification evidence only and may change on resend.

CREATE TABLE "${schemaName}".counter_purchases (
    counter_purchase_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".stores(store_id),
    staff_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".staff(staff_id),
    customer_user_id varchar(64) NOT NULL
        REFERENCES "${schemaName}"."user"(user_id),
    subscription_plan_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".subscription_plans(subscription_plan_id),
    status varchar(32) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'COMPLETED', 'ABANDONED')),
    created_by varchar(64) NOT NULL,
    created_at timestamp without time zone NOT NULL
        DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at timestamp without time zone NOT NULL
        DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

CREATE INDEX ix_counter_purchases_organization_customer
    ON "${schemaName}".counter_purchases (organization_id, customer_user_id, created_at DESC);

ALTER TABLE "${schemaName}".business_otp_context
    ADD COLUMN counter_purchase_id varchar(64)
        REFERENCES "${schemaName}".counter_purchases(counter_purchase_id);

CREATE INDEX ix_business_otp_context_counter_purchase
    ON "${schemaName}".business_otp_context (counter_purchase_id)
    WHERE counter_purchase_id IS NOT NULL;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_prepare_purchase_identity(
    p_counter_purchase_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_purchase counter_purchases%ROWTYPE;
    v_id varchar(64);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_staff_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Counter purchase identity request'
            USING ERRCODE = '22023';
    END IF;

    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(btrim(p_counter_purchase_id), '') IS NULL THEN
        v_id := generate_runtime_id('CPU');

        INSERT INTO counter_purchases (
            counter_purchase_id,
            organization_id,
            store_id,
            staff_id,
            customer_user_id,
            subscription_plan_id,
            status,
            created_by
        ) VALUES (
            v_id,
            p_organization_id,
            p_store_id,
            p_staff_id,
            p_customer_user_id,
            p_subscription_plan_id,
            'OPEN',
            p_actor_user_id
        );

        RETURN v_id;
    END IF;

    SELECT *
      INTO v_purchase
      FROM counter_purchases
     WHERE counter_purchase_id = p_counter_purchase_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_purchase.status IS DISTINCT FROM 'OPEN'
       OR v_purchase.organization_id IS DISTINCT FROM p_organization_id
       OR v_purchase.store_id IS DISTINCT FROM p_store_id
       OR v_purchase.staff_id IS DISTINCT FROM p_staff_id
       OR v_purchase.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_purchase.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id THEN
        RAISE EXCEPTION 'Counter purchase identity does not match this checkout'
            USING ERRCODE = '23505';
    END IF;

    UPDATE counter_purchases
       SET updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     WHERE counter_purchase_id = v_purchase.counter_purchase_id;

    RETURN v_purchase.counter_purchase_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_bind_purchase_otp_context(
    p_counter_purchase_id varchar,
    p_challenge_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_purchase counter_purchases%ROWTYPE;
    v_context business_otp_context%ROWTYPE;
BEGIN
    SELECT *
      INTO v_purchase
      FROM counter_purchases
     WHERE counter_purchase_id = p_counter_purchase_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_purchase.status IS DISTINCT FROM 'OPEN'
       OR v_purchase.organization_id IS DISTINCT FROM p_organization_id
       OR v_purchase.store_id IS DISTINCT FROM p_store_id
       OR v_purchase.staff_id IS DISTINCT FROM p_staff_id
       OR v_purchase.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_purchase.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id THEN
        RAISE EXCEPTION 'Counter purchase identity does not match OTP context'
            USING ERRCODE = '23505';
    END IF;

    SELECT *
      INTO v_context
      FROM business_otp_context
     WHERE otp_challenge_id = p_challenge_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_context.purpose IS DISTINCT FROM 'COUNTER_PURCHASE_VERIFY'
       OR v_context.organization_id IS DISTINCT FROM p_organization_id
       OR v_context.store_id IS DISTINCT FROM p_store_id
       OR v_context.staff_id IS DISTINCT FROM p_staff_id
       OR v_context.user_id IS DISTINCT FROM p_customer_user_id
       OR v_context.plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_context.consumed_at IS NOT NULL
       OR (v_context.counter_purchase_id IS NOT NULL
           AND v_context.counter_purchase_id IS DISTINCT FROM p_counter_purchase_id)
       OR NOT EXISTS (
           SELECT 1
             FROM otp_challenges o
            WHERE o.otp_challenge_id = p_challenge_id
              AND o.purpose = 'COUNTER_PURCHASE_VERIFY'
              AND o.status = 'PENDING'
       ) THEN
        RAISE EXCEPTION 'Counter purchase OTP context is invalid'
            USING ERRCODE = '22023';
    END IF;

    UPDATE business_otp_context
       SET counter_purchase_id = p_counter_purchase_id
     WHERE otp_challenge_id = p_challenge_id;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_challenge_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_provider_code varchar,
    p_payment_idempotency_key varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar,
    "providerCode" varchar,
    "status" varchar,
    "amount" double precision,
    "currencyCode" varchar,
    "providerReferenceId" varchar,
    "membershipPlanId" varchar,
    "customerUserId" varchar,
    "createdAt" text,
    "commerceTransactionId" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_context_plan_id varchar;
    v_context_user_id varchar;
    v_context_store_id varchar;
    v_context_staff_id varchar;
    v_counter_purchase_id varchar(64);
    v_purchase counter_purchases%ROWTYPE;
    v_commerce record;
    v_payment payment_intents%ROWTYPE;
    v_started record;
    v_provider_code varchar;
    v_commerce_idempotency_key varchar(128);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_challenge_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_staff_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_provider_code), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR p_payment_idempotency_key IS NULL
       OR btrim(p_payment_idempotency_key) = ''
       OR length(p_payment_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid Counter membership payment request'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        c.plan_id,
        c.user_id,
        c.store_id,
        c.staff_id,
        c.counter_purchase_id
      INTO
        v_context_plan_id,
        v_context_user_id,
        v_context_store_id,
        v_context_staff_id,
        v_counter_purchase_id
      FROM business_otp_context c
      JOIN otp_challenges o
        ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose = 'COUNTER_PURCHASE_VERIFY'
       AND o.status = 'CONSUMED'
     FOR UPDATE OF c;

    IF v_context_plan_id IS NULL
       OR NULLIF(btrim(v_counter_purchase_id), '') IS NULL
       OR v_context_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_context_user_id IS DISTINCT FROM p_customer_user_id
       OR v_context_store_id IS DISTINCT FROM p_store_id
       OR v_context_staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Verified Counter membership purchase authorization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_purchase
      FROM counter_purchases
     WHERE counter_purchase_id = v_counter_purchase_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_purchase.status IS DISTINCT FROM 'OPEN'
       OR v_purchase.organization_id IS DISTINCT FROM p_organization_id
       OR v_purchase.store_id IS DISTINCT FROM p_store_id
       OR v_purchase.staff_id IS DISTINCT FROM p_staff_id
       OR v_purchase.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_purchase.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id THEN
        RAISE EXCEPTION 'Counter purchase identity is inconsistent'
            USING ERRCODE = '23505';
    END IF;

    v_commerce_idempotency_key := 'COUNTER_MEMBERSHIP:' || v_counter_purchase_id;

    SELECT *
      INTO v_commerce
      FROM commerce_prepare_internal_membership_order(
          p_organization_id,
          p_store_id,
          p_staff_id,
          p_customer_user_id,
          p_subscription_plan_id,
          v_commerce_idempotency_key,
          p_actor_user_id
      );

    IF v_commerce."commerceTransactionId" IS NULL
       OR v_commerce."status" IS DISTINCT FROM 'ORDER_CREATED'
       OR v_commerce."amountMinor" IS NULL
       OR NULLIF(btrim(v_commerce."currencyCode"), '') IS NULL THEN
        RAISE EXCEPTION 'Counter membership Commerce order is not prepared'
            USING ERRCODE = '23505';
    END IF;

    SELECT *
      INTO v_payment
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_payment_idempotency_key
     FOR UPDATE;

    IF NOT FOUND THEN
        SELECT *
          INTO v_started
          FROM payment_start_membership_intent(
              p_intent_id,
              p_attempt_id,
              p_organization_id,
              p_challenge_id,
              p_provider_code,
              p_payment_idempotency_key,
              p_actor_user_id
          );

        IF v_started."paymentIntentId" IS NULL THEN
            RAISE EXCEPTION 'Payment was not started' USING ERRCODE = '23505';
        END IF;

        SELECT *
          INTO v_payment
          FROM payment_intents
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND organization_id = p_organization_id
         FOR UPDATE;
    END IF;

    IF v_payment.payment_intent_id IS NULL
       OR v_payment.business_otp_challenge_id IS DISTINCT FROM p_challenge_id
       OR v_payment.membership_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_payment.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_payment.store_id IS DISTINCT FROM p_store_id
       OR v_payment.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Existing payment conflicts with the Counter membership purchase'
            USING ERRCODE = '23505';
    END IF;

    IF v_payment.commerce_transaction_id IS NOT NULL
       AND v_payment.commerce_transaction_id IS DISTINCT FROM v_commerce."commerceTransactionId" THEN
        RAISE EXCEPTION 'Payment is already associated with another Commerce transaction'
            USING ERRCODE = '23505';
    END IF;

    SELECT pc.provider_code
      INTO v_provider_code
      FROM payment_provider_configs pc
     WHERE pc.payment_provider_config_id = v_payment.payment_provider_config_id;

    IF v_provider_code IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable'
            USING ERRCODE = '23505';
    END IF;

    IF v_provider_code IS DISTINCT FROM p_provider_code THEN
        RAISE EXCEPTION 'Existing payment provider conflicts with the requested payment provider'
            USING ERRCODE = '23505';
    END IF;

    IF round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_commerce."amountMinor"
       OR v_payment.currency_code IS DISTINCT FROM v_commerce."currencyCode" THEN
        RAISE EXCEPTION 'Payment amount or currency does not match the Commerce order'
            USING ERRCODE = '23505';
    END IF;

    UPDATE payment_intents
       SET commerce_transaction_id = v_commerce."commerceTransactionId",
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = v_payment.payment_intent_id
       AND organization_id = p_organization_id;

    RETURN QUERY
    SELECT
        v_payment.payment_intent_id,
        v_provider_code,
        v_payment.status,
        v_payment.amount::double precision,
        v_payment.currency_code,
        v_payment.provider_reference_id,
        v_payment.membership_plan_id,
        v_payment.customer_user_id,
        v_payment.created_at::text,
        v_commerce."commerceTransactionId"::varchar;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_complete_purchase_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_counter_purchase_id varchar(64);
BEGIN
    IF NEW.finalized_subscription_id IS NULL
       OR NEW.finalized_subscription_id IS NOT DISTINCT FROM OLD.finalized_subscription_id
       OR NEW.business_otp_challenge_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT counter_purchase_id
      INTO v_counter_purchase_id
      FROM business_otp_context
     WHERE otp_challenge_id = NEW.business_otp_challenge_id;

    IF v_counter_purchase_id IS NOT NULL THEN
        UPDATE counter_purchases
           SET status = 'COMPLETED',
               updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
         WHERE counter_purchase_id = v_counter_purchase_id
           AND status = 'OPEN';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_counter_complete_purchase_from_payment
    ON "${schemaName}".payment_intents;

CREATE TRIGGER trg_counter_complete_purchase_from_payment
    AFTER UPDATE OF finalized_subscription_id
    ON "${schemaName}".payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".counter_complete_purchase_from_payment();

REVOKE ALL ON TABLE "${schemaName}".counter_purchases FROM PUBLIC;
REVOKE ALL ON TABLE "${schemaName}".counter_purchases FROM "${appRole}";

REVOKE ALL ON FUNCTION
    "${schemaName}".counter_prepare_purchase_identity(
        varchar,varchar,varchar,varchar,varchar,varchar,varchar
    ),
    "${schemaName}".counter_bind_purchase_otp_context(
        varchar,varchar,varchar,varchar,varchar,varchar,varchar
    ),
    "${schemaName}".counter_complete_purchase_from_payment()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".counter_prepare_purchase_identity(
        varchar,varchar,varchar,varchar,varchar,varchar,varchar
    ),
    "${schemaName}".counter_bind_purchase_otp_context(
        varchar,varchar,varchar,varchar,varchar,varchar,varchar
    )
TO "${appRole}";
