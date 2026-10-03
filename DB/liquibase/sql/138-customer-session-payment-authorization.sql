-- CUSTOMER_SESSION payment ownership is global-user based. It deliberately
-- does not require organization_user before the successful purchase creates it.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_actor_is_authorized(
    p_payment_intent_id varchar,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM payment_intents i
         WHERE i.payment_intent_id = p_payment_intent_id
           AND (
               (
                   i.authorization_mode = 'CUSTOMER_SESSION'
                   AND i.customer_user_id = p_actor_user_id
                   AND (
                       i.commerce_transaction_id IS NULL
                       OR EXISTS (
                           SELECT 1
                             FROM commerce_transactions t
                            WHERE t.commerce_transaction_id = i.commerce_transaction_id
                              AND t.organization_id = i.organization_id
                              AND t.source_channel = 'CUSTOMER_MEMBERSHIP'
                              AND t.customer_user_id = i.customer_user_id
                              AND NOT t.is_deleted
                       )
                   )
               )
               OR (
                   i.authorization_mode <> 'CUSTOMER_SESSION'
                   AND (
                       i.created_by = p_actor_user_id
                       OR i.customer_user_id = p_actor_user_id
                   )
               )
           )
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_intent(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar,
    "providerReferenceId" varchar, "failureCode" varchar,
    "failureMessage" varchar, "membershipPlanId" varchar,
    "customerUserId" varchar, "finalizedSubscriptionId" varchar,
    "createdAt" text, "commerceTransactionId" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT i.payment_intent_id, pc.provider_code, i.status,
           i.amount::double precision, i.currency_code,
           i.provider_reference_id, i.failure_code, i.failure_message,
           i.membership_plan_id, i.customer_user_id,
           i.finalized_subscription_id, i.created_at::text,
           i.commerce_transaction_id
      FROM payment_intents i
      JOIN payment_provider_configs pc
        ON pc.payment_provider_config_id = i.payment_provider_config_id
     WHERE i.organization_id = p_organization_id
       AND i.payment_intent_id = p_intent_id
       AND payment_actor_is_authorized(i.payment_intent_id, p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_result(
    p_intent_id varchar, p_attempt_id varchar, p_status varchar,
    p_provider_reference varchar, p_failure_code varchar,
    p_failure_message varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_attempt_id varchar;
BEGIN
    SELECT * INTO v_intent FROM payment_intents
     WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;
    IF v_intent.status IN ('SUCCEEDED', 'CANCELED') THEN
        RETURN v_intent.status = p_status;
    END IF;
    IF p_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED') THEN
        RAISE EXCEPTION 'Invalid payment result' USING ERRCODE = '22023';
    END IF;
    SELECT payment_attempt_id INTO v_attempt_id FROM payment_attempts
     WHERE payment_intent_id = p_intent_id
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF v_attempt_id IS NULL THEN
        RAISE EXCEPTION 'Payment attempt is unavailable' USING ERRCODE = '22023';
    END IF;
    UPDATE payment_intents
       SET status = p_status,
           provider_reference_id = COALESCE(p_provider_reference, provider_reference_id),
           failure_code = p_failure_code, failure_message = p_failure_message,
           cancelled_at = CASE WHEN p_status = 'CANCELED' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id
     WHERE payment_intent_id = p_intent_id;
    UPDATE payment_attempts
       SET status = p_status,
           provider_reference_id = COALESCE(p_provider_reference, provider_reference_id),
           failure_code = p_failure_code, failure_message = p_failure_message,
           processed_at = CURRENT_TIMESTAMP
     WHERE payment_attempt_id = COALESCE(p_attempt_id, v_attempt_id)
       AND payment_intent_id = p_intent_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment attempt is unavailable' USING ERRCODE = '22023';
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_set_provider_reference(
    p_intent_id varchar,
    p_expected_provider_code varchar,
    p_provider_reference_id varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
BEGIN
    IF p_provider_reference_id IS NULL OR btrim(p_provider_reference_id) = ''
       OR length(p_provider_reference_id) > 160 THEN
        RAISE EXCEPTION 'Payment provider reference is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_intent
      FROM payment_intents
     WHERE payment_intent_id = p_intent_id
     FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    SELECT provider_code INTO v_provider_code
      FROM payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;
    IF NOT FOUND OR v_provider_code <> p_expected_provider_code THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    IF v_intent.provider_reference_id IS NOT NULL THEN
        RETURN v_intent.provider_reference_id;
    END IF;
    IF v_intent.status NOT IN ('PENDING', 'PROCESSING') THEN
        RAISE EXCEPTION 'Payment cannot start provider checkout' USING ERRCODE = '22023';
    END IF;

    UPDATE payment_intents
       SET provider_reference_id = p_provider_reference_id,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id
     WHERE payment_intent_id = p_intent_id;
    UPDATE payment_attempts
       SET provider_reference_id = p_provider_reference_id
     WHERE payment_attempt_id = (
         SELECT payment_attempt_id FROM payment_attempts
          WHERE payment_intent_id = p_intent_id
          ORDER BY created_at DESC LIMIT 1
     );
    RETURN p_provider_reference_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_confirm_successful_membership(
    p_intent_id varchar,
    p_expected_provider_code varchar,
    p_provider_reference varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_provider_code varchar;
BEGIN
    SELECT pc.provider_code INTO v_provider_code
      FROM payment_intents i
      JOIN payment_provider_configs pc
        ON pc.payment_provider_config_id = i.payment_provider_config_id
     WHERE i.payment_intent_id = p_intent_id
     FOR UPDATE OF i;
    IF NOT FOUND OR v_provider_code <> p_expected_provider_code
       OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment provider does not match the requested confirmation'
            USING ERRCODE = '42501';
    END IF;
    IF NOT payment_record_result(
        p_intent_id, NULL, 'SUCCEEDED', p_provider_reference, NULL, NULL, p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Payment cannot be confirmed' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT * FROM payment_finalize_membership(p_intent_id, p_actor_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_finalize_membership(
    p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    i payment_intents%ROWTYPE;
    c business_otp_context%ROWTYPE;
    v_result record;
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
    ELSE
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
    UPDATE business_otp_context
       SET consumed_at = CURRENT_TIMESTAMP
     WHERE otp_challenge_id = i.business_otp_challenge_id;
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

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_finalized_membership(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number,
           s.subscription_plan_id, s.subscription_date::text, s.start_date::text,
           s.end_date::text, s.subscription_status_id, s.total_amount::double precision,
           cur.currency_code
      FROM payment_intents i
      JOIN subscriptions s ON s.subscription_id = i.finalized_subscription_id
      JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
      JOIN subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN currencies cur ON cur.currency_id = sp.currency_id
     WHERE i.organization_id = p_organization_id
       AND i.payment_intent_id = p_intent_id
       AND payment_actor_is_authorized(i.payment_intent_id, p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_confirm_provider_success(
    p_intent_id varchar, p_organization_id varchar, p_expected_provider_code varchar,
    p_provider_reference_id varchar, p_amount_minor bigint, p_currency_code varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_actor_user_id varchar;
BEGIN
    SELECT * INTO v_intent FROM payment_intents
     WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provider payment does not match the payment intent' USING ERRCODE = '42501';
    END IF;
    SELECT provider_code INTO v_provider_code FROM payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;
    IF NOT FOUND OR v_provider_code <> p_expected_provider_code
       OR v_intent.provider_reference_id IS DISTINCT FROM p_provider_reference_id
       OR round(v_intent.amount * 100)::bigint <> p_amount_minor
       OR upper(v_intent.currency_code) <> upper(p_currency_code) THEN
        RAISE EXCEPTION 'Provider payment does not match the payment intent' USING ERRCODE = '42501';
    END IF;
    v_actor_user_id := CASE WHEN v_intent.authorization_mode = 'CUSTOMER_SESSION'
                            THEN v_intent.customer_user_id
                            ELSE COALESCE(v_intent.created_by, v_intent.customer_user_id) END;
    IF v_actor_user_id IS NULL OR NOT payment_actor_is_authorized(p_intent_id, v_actor_user_id) THEN
        RAISE EXCEPTION 'Payment actor is unavailable' USING ERRCODE = '42501';
    END IF;
    IF NOT payment_record_result(p_intent_id, NULL, 'SUCCEEDED', p_provider_reference_id,
                                 NULL, NULL, v_actor_user_id) THEN
        RAISE EXCEPTION 'Payment cannot be confirmed' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT * FROM payment_finalize_membership(p_intent_id, v_actor_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_provider_failure(
    p_intent_id varchar, p_organization_id varchar, p_expected_provider_code varchar,
    p_provider_reference_id varchar, p_status varchar, p_failure_code varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_actor_user_id varchar;
BEGIN
    SELECT * INTO v_intent FROM payment_intents
     WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provider payment does not match the payment intent' USING ERRCODE = '42501';
    END IF;
    SELECT provider_code INTO v_provider_code FROM payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;
    IF NOT FOUND OR v_provider_code <> p_expected_provider_code
       OR v_intent.provider_reference_id IS DISTINCT FROM p_provider_reference_id
       OR p_status NOT IN ('FAILED', 'CANCELED') THEN
        RAISE EXCEPTION 'Provider payment does not match the payment intent' USING ERRCODE = '42501';
    END IF;
    v_actor_user_id := CASE WHEN v_intent.authorization_mode = 'CUSTOMER_SESSION'
                            THEN v_intent.customer_user_id
                            ELSE COALESCE(v_intent.created_by, v_intent.customer_user_id) END;
    IF v_actor_user_id IS NULL OR NOT payment_actor_is_authorized(p_intent_id, v_actor_user_id) THEN
        RAISE EXCEPTION 'Payment actor is unavailable' USING ERRCODE = '42501';
    END IF;
    RETURN payment_record_result(p_intent_id, NULL, p_status, p_provider_reference_id,
                                 p_failure_code, NULL, v_actor_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_actor_is_authorized(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_get_intent(varchar, varchar, varchar),
    "${schemaName}".payment_record_result(varchar, varchar, varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".payment_cancel_intent(varchar, varchar, varchar),
    "${schemaName}".payment_set_provider_reference(varchar, varchar, varchar, varchar),
    "${schemaName}".payment_confirm_successful_membership(varchar, varchar, varchar, varchar),
    "${schemaName}".payment_finalize_membership(varchar, varchar),
    "${schemaName}".payment_get_finalized_membership(varchar, varchar, varchar),
    "${schemaName}".payment_confirm_provider_success(varchar, varchar, varchar, varchar, bigint, varchar),
    "${schemaName}".payment_record_provider_failure(varchar, varchar, varchar, varchar, varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".payment_actor_is_authorized(varchar, varchar),
    "${schemaName}".payment_get_intent(varchar, varchar, varchar),
    "${schemaName}".payment_record_result(varchar, varchar, varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".payment_cancel_intent(varchar, varchar, varchar),
    "${schemaName}".payment_set_provider_reference(varchar, varchar, varchar, varchar),
    "${schemaName}".payment_confirm_successful_membership(varchar, varchar, varchar, varchar),
    "${schemaName}".payment_finalize_membership(varchar, varchar),
    "${schemaName}".payment_get_finalized_membership(varchar, varchar, varchar),
    "${schemaName}".payment_confirm_provider_success(varchar, varchar, varchar, varchar, bigint, varchar),
    "${schemaName}".payment_record_provider_failure(varchar, varchar, varchar, varchar, varchar, varchar)
TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".payment_cancel_intent(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_payment payment_intents%ROWTYPE;
BEGIN
    SELECT * INTO v_payment FROM payment_intents
     WHERE organization_id = p_organization_id
       AND payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;
    IF v_payment.status = 'CANCELED' THEN RETURN true; END IF;
    IF v_payment.status NOT IN ('PENDING', 'PROCESSING') THEN RETURN false; END IF;
    UPDATE payment_intents
       SET status = 'CANCELED', cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id
     WHERE payment_intent_id = p_intent_id;
    RETURN true;
END;
$function$;
