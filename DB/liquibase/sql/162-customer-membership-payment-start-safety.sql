-- Prevent a second customer checkout from reaching a provider when the existing
-- membership rules already make fulfillment impossible. This is intentionally
-- read/guard-only: it never changes an existing payment, subscription, or case.

CREATE OR REPLACE FUNCTION "${schemaName}".payment_find_customer_membership_start_recovery(
    p_organization_id varchar,
    p_subscription_plan_id varchar,
    p_customer_user_id varchar,
    p_payment_idempotency_key varchar,
    p_explicit_offer_id varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_membership_product_id varchar(64);
    v_recovery_intent_id varchar(64);
    v_recovery_plan_id varchar(64);
    v_recovery_offer_id varchar(64);
    v_recovery_count bigint;
BEGIN
    IF p_actor_user_id IS DISTINCT FROM p_customer_user_id
       OR NOT customer_can_start_membership_purchase(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is unavailable' USING ERRCODE = '42501';
    END IF;

    SELECT mp.membership_product_id INTO v_membership_product_id
      FROM subscription_plans sp
      JOIN membership_products mp
        ON mp.membership_product_id = sp.membership_product_id
       AND mp.organization_id = p_organization_id
     WHERE sp.subscription_plan_id = p_subscription_plan_id
       AND NOT sp.is_deleted
       AND NOT mp.is_deleted;
    IF v_membership_product_id IS NULL THEN
        RAISE EXCEPTION 'Membership plan is unavailable for this organization' USING ERRCODE = '22023';
    END IF;

    -- Serializes starts for the customer and membership product. Hash collisions
    -- can only serialize unrelated starts; they cannot admit a duplicate charge.
    PERFORM pg_advisory_xact_lock(hashtext(
        'customer-membership-start:' || p_organization_id || ':' ||
        p_customer_user_id || ':' || v_membership_product_id
    ));

    -- The established idempotency key always owns its existing checkout, even
    -- after a membership becomes active. Let the existing start function perform
    -- its normal immutable-intent consistency checks for this key.
    IF EXISTS (
        SELECT 1
          FROM payment_intents i
         WHERE i.organization_id = p_organization_id
           AND i.idempotency_key = p_payment_idempotency_key
           AND i.customer_user_id = p_customer_user_id
           AND i.membership_plan_id = p_subscription_plan_id
           AND i.authorization_mode = 'CUSTOMER_SESSION'
    ) THEN
        RETURN NULL;
    END IF;

    -- A verified captured-but-unfulfilled payment must remain recoverable. For
    -- the same plan, return its existing intent so the caller can reconcile it;
    -- never create a second payment. More than one case, or a different-plan
    -- checkout for the same product, is intentionally left for manual review.
    -- This temporary payment gate follows the current finalization behavior;
    -- it must be reconsidered if multi-plan ownership becomes supported.
    SELECT count(*), min(i.payment_intent_id), min(i.membership_plan_id),
           min(t.membership_offer_id)
      INTO v_recovery_count, v_recovery_intent_id, v_recovery_plan_id,
           v_recovery_offer_id
      FROM poynt_collect_financial_exceptions e
      JOIN payment_intents i ON i.payment_intent_id = e.payment_intent_id
      LEFT JOIN commerce_transactions t
        ON t.commerce_transaction_id = i.commerce_transaction_id
       AND t.organization_id = i.organization_id
       AND NOT t.is_deleted
      JOIN subscription_plans existing_plan
        ON existing_plan.subscription_plan_id = i.membership_plan_id
     WHERE e.organization_id = p_organization_id
       AND e.customer_user_id = p_customer_user_id
       AND e.case_status IN ('OPEN', 'UNDER_REVIEW')
       AND i.organization_id = p_organization_id
       AND i.customer_user_id = p_customer_user_id
       AND i.authorization_mode = 'CUSTOMER_SESSION'
       AND existing_plan.membership_product_id = v_membership_product_id;
    IF v_recovery_count > 0 THEN
        IF v_recovery_count = 1
           AND v_recovery_plan_id = p_subscription_plan_id
           AND (p_explicit_offer_id IS NULL
                OR v_recovery_offer_id IS NOT DISTINCT FROM p_explicit_offer_id) THEN
            RETURN v_recovery_intent_id;
        END IF;
        RAISE EXCEPTION 'Existing membership payment terms require review before another purchase'
            USING ERRCODE = '22023';
    END IF;

    -- Resolve an outstanding financial-exception case before applying the
    -- active-subscription guard. This preserves the existing payment ID for
    -- read-only reconciliation and case lookup instead of hiding it behind a
    -- later subscription state.

    -- This is the current active-membership rule enforced by
    -- purchase_membership_subscription, moved before payment creation/charge.
    -- It is a fulfillment safety check, not a new or permanent assertion that
    -- a customer may never own more than one plan for a membership product.
    IF EXISTS (
        SELECT 1
          FROM organization_user ou
          JOIN subscriptions s ON s.organization_user_id = ou.organization_user_id
          JOIN subscription_plans existing_plan
            ON existing_plan.subscription_plan_id = s.subscription_plan_id
          JOIN entity_status existing_status
            ON existing_status.entity_status_id = s.subscription_status_id
          JOIN statuses existing_state
            ON existing_state.status_id = existing_status.status_id
         WHERE ou.organization_id = p_organization_id
           AND ou.user_id = p_customer_user_id
           AND NOT ou.is_deleted
           AND NOT s.is_deleted
           AND existing_plan.membership_product_id = v_membership_product_id
           AND existing_state.status_code = 'ACTIVE'
           AND s.end_date >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Customer already has an active subscription for this membership'
            USING ERRCODE = '22023';
    END IF;

    -- Pending, processing, and not-yet-fulfilled succeeded intents have no
    -- automatic expiry here. A same-plan retry resumes the persisted intent;
    -- a different-plan checkout for the same membership product is blocked
    -- only because current finalization would reject it once either payment
    -- creates the active subscription. It does not create a durable
    -- product/plan purchase restriction.
    SELECT count(*), min(i.payment_intent_id), min(i.membership_plan_id),
           min(t.membership_offer_id)
      INTO v_recovery_count, v_recovery_intent_id, v_recovery_plan_id,
           v_recovery_offer_id
      FROM payment_intents i
      LEFT JOIN commerce_transactions t
        ON t.commerce_transaction_id = i.commerce_transaction_id
       AND t.organization_id = i.organization_id
       AND NOT t.is_deleted
      JOIN subscription_plans existing_plan
        ON existing_plan.subscription_plan_id = i.membership_plan_id
     WHERE i.organization_id = p_organization_id
       AND i.customer_user_id = p_customer_user_id
       AND i.authorization_mode = 'CUSTOMER_SESSION'
       AND i.status IN ('PENDING', 'PROCESSING', 'SUCCEEDED')
       AND i.finalized_subscription_id IS NULL
       AND i.idempotency_key <> p_payment_idempotency_key
       AND existing_plan.membership_product_id = v_membership_product_id;
    IF v_recovery_count > 0 THEN
        IF v_recovery_count = 1
           AND v_recovery_plan_id = p_subscription_plan_id
           AND (p_explicit_offer_id IS NULL
                OR v_recovery_offer_id IS NOT DISTINCT FROM p_explicit_offer_id) THEN
            RETURN v_recovery_intent_id;
        END IF;
        RAISE EXCEPTION 'Existing membership payment terms require review before another purchase'
            USING ERRCODE = '22023';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_customer_routed_commerce_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_subscription_plan_id varchar,
    p_customer_user_id varchar,
    p_payment_idempotency_key varchar,
    p_explicit_offer_id varchar,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_route_count bigint;
    v_route_provider varchar(64);
    v_integration_id varchar(64);
    v_payment_provider varchar(64);
    v_started record;
    v_collect_count bigint;
    v_collect_integration_id varchar(64);
    v_collect_currency varchar(3);
    v_collect_complete boolean;
    v_bound_integration_id varchar(64);
    v_intent_status varchar(32);
    v_provider_reference_id varchar(160);
    v_recovery_intent_id varchar(64);
BEGIN
    IF p_actor_user_id IS DISTINCT FROM p_customer_user_id
       OR NOT customer_can_start_membership_purchase(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is unavailable' USING ERRCODE = '42501';
    END IF;

    SELECT payment_find_customer_membership_start_recovery(
        p_organization_id, p_subscription_plan_id, p_customer_user_id,
        p_payment_idempotency_key, p_explicit_offer_id, p_actor_user_id
    ) INTO v_recovery_intent_id;
    IF v_recovery_intent_id IS NOT NULL THEN
        RETURN QUERY
        SELECT i.payment_intent_id, pc.provider_code, i.status,
               i.amount::double precision, i.currency_code,
               i.provider_reference_id, i.membership_plan_id,
               i.customer_user_id, i.created_at::text,
               i.commerce_transaction_id
          FROM payment_intents i
          JOIN payment_provider_configs pc
            ON pc.payment_provider_config_id = i.payment_provider_config_id
         WHERE i.payment_intent_id = v_recovery_intent_id
           AND i.organization_id = p_organization_id
           AND i.customer_user_id = p_customer_user_id
           AND i.membership_plan_id = p_subscription_plan_id
           AND i.authorization_mode = 'CUSTOMER_SESSION';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Existing membership payment is unavailable' USING ERRCODE = '42501';
        END IF;
        RETURN;
    END IF;

    SELECT count(*), min(route.provider_code), min(route.integration_configuration_id)
      INTO v_route_count, v_route_provider, v_integration_id
      FROM commerce_payment_provider_routes route
      LEFT JOIN integration_configurations integration
        ON integration.integration_configuration_id = route.integration_configuration_id
       AND integration.organization_id = route.organization_id
       AND NOT integration.is_deleted
      LEFT JOIN entity_status integration_status
        ON integration_status.entity_status_id = integration.integration_status_id
      LEFT JOIN statuses integration_state
        ON integration_state.status_id = integration_status.status_id
     WHERE route.organization_id = p_organization_id
       AND route.source_channel = 'CUSTOMER'
       AND route.store_id IS NULL
       AND route.is_enabled AND NOT route.is_deleted
       AND (
            (route.provider_code = 'TEST' AND route.integration_configuration_id IS NULL)
            OR (
                route.provider_code IN ('POYNT', 'STRIPE', 'MONERIS')
                AND integration.integration_configuration_id IS NOT NULL
                AND upper(integration.provider) = route.provider_code
                AND integration_status.is_active
                AND integration_state.status_code = 'ACTIVE'
            )
       );
    IF v_route_count <> 1 THEN
        RAISE EXCEPTION 'Exactly one organization-scoped Customer payment route is required'
            USING ERRCODE = '22023';
    END IF;
    v_payment_provider := CASE v_route_provider
        WHEN 'POYNT' THEN 'POYNT_COLLECT'
        ELSE v_route_provider
    END;

    SELECT * INTO v_started
      FROM payment_start_customer_commerce_membership_intent(
          p_intent_id, p_attempt_id, p_organization_id, p_subscription_plan_id,
          p_customer_user_id, v_payment_provider, p_payment_idempotency_key,
          p_explicit_offer_id, p_actor_user_id
      );
    IF v_started."paymentIntentId" IS NULL THEN
        RAISE EXCEPTION 'Customer payment was not started' USING ERRCODE = '23505';
    END IF;

    IF v_payment_provider = 'POYNT_COLLECT' THEN
        SELECT count(*), min(c.integration_configuration_id),
               min(c.merchant_currency_code),
               bool_and(NULLIF(btrim(c.application_id), '') IS NOT NULL
                    AND NULLIF(btrim(c.provider_business_id), '') IS NOT NULL
                    AND NULLIF(btrim(c.provider_store_id), '') IS NOT NULL
                    AND NULLIF(btrim(c.credential_secret_reference), '') IS NOT NULL)
          INTO v_collect_count, v_collect_integration_id,
               v_collect_currency, v_collect_complete
          FROM commerce_provider_catalog_configurations c
          JOIN integration_configurations ic
            ON ic.integration_configuration_id = c.integration_configuration_id
           AND ic.organization_id = c.organization_id
         WHERE c.organization_id = p_organization_id
           AND c.integration_configuration_id = v_integration_id
           AND upper(ic.provider) = 'POYNT'
           AND NOT c.is_deleted AND NOT ic.is_deleted;
        IF v_collect_count <> 1
           OR v_collect_integration_id IS DISTINCT FROM v_integration_id
           OR v_collect_currency IS DISTINCT FROM v_started."currencyCode"
           OR v_collect_complete IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'Customer Poynt Collect configuration is unavailable'
                USING ERRCODE = '22023';
        END IF;

        SELECT pi.collect_integration_configuration_id, pi.status,
               pi.provider_reference_id
          INTO v_bound_integration_id, v_intent_status, v_provider_reference_id
          FROM payment_intents pi
         WHERE pi.payment_intent_id = v_started."paymentIntentId"
           AND pi.organization_id = p_organization_id
           AND pi.customer_user_id = p_customer_user_id
           AND pi.authorization_mode = 'CUSTOMER_SESSION'
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer Collect payment intent is unavailable'
                USING ERRCODE = '42501';
        END IF;
        IF v_bound_integration_id IS NULL THEN
            IF v_started."paymentIntentId" IS DISTINCT FROM p_intent_id
               OR v_intent_status IS DISTINCT FROM 'PENDING'
               OR v_provider_reference_id IS NOT NULL THEN
                RAISE EXCEPTION 'Unbound Collect payment cannot change integration'
                    USING ERRCODE = '22023';
            END IF;
            UPDATE payment_intents
               SET collect_integration_configuration_id = v_integration_id,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id
             WHERE payment_intent_id = v_started."paymentIntentId"
               AND organization_id = p_organization_id;
        ELSIF v_bound_integration_id IS DISTINCT FROM v_integration_id THEN
            RAISE EXCEPTION 'Customer Collect route changed for this payment'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    RETURN QUERY SELECT v_started."paymentIntentId"::varchar,
        v_started."providerCode"::varchar, v_started."status"::varchar,
        v_started."amount"::double precision, v_started."currencyCode"::varchar,
        v_started."providerReferenceId"::varchar,
        v_started."membershipPlanId"::varchar,
        v_started."customerUserId"::varchar, v_started."createdAt"::text,
        v_started."commerceTransactionId"::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_find_customer_membership_start_recovery(
    varchar,varchar,varchar,varchar,varchar,varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_start_customer_routed_commerce_membership_intent(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_find_customer_membership_start_recovery(
    varchar,varchar,varchar,varchar,varchar,varchar
) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_customer_routed_commerce_membership_intent(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar
) TO "${appRole}";

-- Final charge boundary. A historical PENDING intent can reach this function
-- without returning through payment-start (for example, an already-open tab).
-- Therefore start-time eligibility alone is not sufficient.
-- Acquire the same customer/product advisory lock BEFORE the intent row lock.
-- The lock lasts only for this database transaction, never for the provider call.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_claim_poynt_collect_charge(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_membership_product_id varchar(64);
BEGIN
    -- Read a stable key for the lock without first taking an intent row lock.
    SELECT sp.membership_product_id INTO v_membership_product_id
      FROM payment_intents i
      JOIN subscription_plans sp ON sp.subscription_plan_id = i.membership_plan_id
     WHERE i.payment_intent_id = p_intent_id
       AND i.organization_id = p_organization_id
       AND i.customer_user_id = p_actor_user_id
       AND i.authorization_mode = 'CUSTOMER_SESSION';
    IF v_membership_product_id IS NULL THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(
        'customer-membership-start:' || p_organization_id || ':' ||
        p_actor_user_id || ':' || v_membership_product_id
    ));

    SELECT * INTO v_intent FROM payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id)
       OR v_intent.customer_user_id IS DISTINCT FROM p_actor_user_id
       OR v_intent.authorization_mode <> 'CUSTOMER_SESSION'
       OR NOT EXISTS (
           SELECT 1 FROM payment_provider_configs pc
            WHERE pc.payment_provider_config_id = v_intent.payment_provider_config_id
              AND (pc.organization_id = v_intent.organization_id OR pc.organization_id IS NULL)
              AND pc.provider_code = 'POYNT_COLLECT'
       ) THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;
    IF v_intent.status <> 'PENDING' OR v_intent.provider_reference_id IS NOT NULL THEN
        RETURN false;
    END IF;

    -- Guard against an old pending checkout after another purchase fulfilled.
    IF EXISTS (
        SELECT 1
          FROM organization_user ou
          JOIN subscriptions s ON s.organization_user_id = ou.organization_user_id
          JOIN subscription_plans existing_plan
            ON existing_plan.subscription_plan_id = s.subscription_plan_id
          JOIN entity_status es ON es.entity_status_id = s.subscription_status_id
          JOIN statuses st ON st.status_id = es.status_id
         WHERE ou.organization_id = p_organization_id
           AND ou.user_id = p_actor_user_id
           AND NOT ou.is_deleted AND NOT s.is_deleted
           AND existing_plan.membership_product_id = v_membership_product_id
           AND st.status_code = 'ACTIVE'
           AND s.end_date >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Customer already has an active subscription for this membership'
            USING ERRCODE = '22023';
    END IF;

    -- Old independent intents may predate the start guard. Do not let an
    -- additional pending intent charge while another same-product capture or
    -- in-flight Collect payment has not been reconciled/finalized.
    IF EXISTS (
        SELECT 1 FROM payment_intents other
          JOIN subscription_plans op ON op.subscription_plan_id = other.membership_plan_id
         WHERE other.organization_id = p_organization_id
           AND other.customer_user_id = p_actor_user_id
           AND other.payment_intent_id <> p_intent_id
           AND other.authorization_mode = 'CUSTOMER_SESSION'
           AND op.membership_product_id = v_membership_product_id
           AND other.finalized_subscription_id IS NULL
           AND (
               other.status = 'PROCESSING'
               OR (other.status = 'SUCCEEDED')
               OR EXISTS (
                   SELECT 1 FROM poynt_collect_verified_captures c
                    WHERE c.organization_id = other.organization_id
                      AND c.payment_intent_id = other.payment_intent_id
               )
           )
    ) THEN
        RAISE EXCEPTION 'Existing membership payment requires review before another purchase'
            USING ERRCODE = '22023';
    END IF;

    UPDATE payment_intents SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id WHERE payment_intent_id = p_intent_id;
    UPDATE payment_attempts SET status = 'PROCESSING'
        WHERE payment_intent_id = p_intent_id AND status = 'PENDING';
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_claim_poynt_collect_charge(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_claim_poynt_collect_charge(varchar,varchar,varchar) TO "${appRole}";
