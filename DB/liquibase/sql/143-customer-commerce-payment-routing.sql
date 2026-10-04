-- An authenticated customer checkout has no store. Its provider is selected
-- from exactly one enabled organization-scoped CUSTOMER route, never from a
-- client parameter or an arbitrary store-specific route.
-- Bind Collect's merchant integration to the intent so a later route edit
-- cannot redirect bootstrap or a charge to another Poynt merchant.
ALTER TABLE "${schemaName}".payment_intents
    ADD COLUMN IF NOT EXISTS collect_integration_configuration_id varchar(64)
        REFERENCES "${schemaName}".integration_configurations(integration_configuration_id);

CREATE OR REPLACE FUNCTION "${schemaName}".payment_intent_guard_collect_integration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.collect_integration_configuration_id IS NOT NULL
           AND NEW.collect_integration_configuration_id IS DISTINCT FROM
               OLD.collect_integration_configuration_id THEN
            RAISE EXCEPTION 'Collect payment integration is immutable' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.collect_integration_configuration_id IS NOT NULL
       AND (
           NEW.authorization_mode IS DISTINCT FROM 'CUSTOMER_SESSION'
           OR NOT EXISTS (
               SELECT 1 FROM payment_provider_configs pc
                WHERE pc.payment_provider_config_id = NEW.payment_provider_config_id
                  AND pc.provider_code = 'POYNT_COLLECT'
           )
           OR NOT EXISTS (
               SELECT 1 FROM integration_configurations ic
                WHERE ic.integration_configuration_id = NEW.collect_integration_configuration_id
                  AND ic.organization_id = NEW.organization_id
                  AND upper(ic.provider) = 'POYNT'
                  AND NOT ic.is_deleted
           )
       ) THEN
        RAISE EXCEPTION 'Collect payment integration does not match the intent'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_intent_guard_collect_integration
    ON "${schemaName}".payment_intents;
CREATE TRIGGER trg_payment_intent_guard_collect_integration
    BEFORE INSERT OR UPDATE OF collect_integration_configuration_id,
        organization_id, payment_provider_config_id, authorization_mode
    ON "${schemaName}".payment_intents
    FOR EACH ROW EXECUTE FUNCTION "${schemaName}".payment_intent_guard_collect_integration();

REVOKE ALL ON FUNCTION "${schemaName}".payment_intent_guard_collect_integration()
    FROM PUBLIC;

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
BEGIN
    IF p_actor_user_id IS DISTINCT FROM p_customer_user_id
       OR NOT customer_can_start_membership_purchase(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is unavailable' USING ERRCODE = '42501';
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

    -- The Collect configuration must belong to the selected route's integration.
    -- Read it here instead of calling the STABLE configuration reader, which
    -- cannot reliably see an intent inserted earlier in this same SQL statement.
    -- The existing authorized reader serves later bootstrap/confirmation calls.
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
            -- An older, already existing Collect intent has no trustworthy
            -- integration binding; do not assign one from today's route.
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

REVOKE ALL ON FUNCTION "${schemaName}".payment_start_customer_routed_commerce_membership_intent(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_customer_routed_commerce_membership_intent(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar
) TO "${appRole}";

-- The original 142 reader chose from all Poynt integrations in the org.
-- Bootstrap and confirmation now use the immutable intent binding instead.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_poynt_collect_configuration(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "integrationConfigurationId" varchar, "organizationId" varchar,
    "applicationId" varchar, "businessId" varchar, "providerStoreId" varchar,
    "secretReference" varchar, "merchantCurrencyCode" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
BEGIN
    SELECT pi.* INTO v_intent
      FROM payment_intents pi
      JOIN payment_provider_configs pc
        ON pc.payment_provider_config_id = pi.payment_provider_config_id
     WHERE pi.payment_intent_id = p_intent_id
       AND pi.organization_id = p_organization_id
       AND pc.provider_code = 'POYNT_COLLECT'
       AND pi.authorization_mode = 'CUSTOMER_SESSION'
       AND payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;
    IF v_intent.collect_integration_configuration_id IS NULL THEN
        RAISE EXCEPTION 'Collect payment integration is unavailable' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT c.integration_configuration_id, c.organization_id, c.application_id,
           c.provider_business_id, c.provider_store_id, c.credential_secret_reference,
           c.merchant_currency_code
      FROM commerce_provider_catalog_configurations c
      JOIN integration_configurations ic
        ON ic.integration_configuration_id = c.integration_configuration_id
       AND ic.organization_id = c.organization_id
      JOIN entity_status integration_status
        ON integration_status.entity_status_id = ic.integration_status_id
      JOIN statuses integration_state
        ON integration_state.status_id = integration_status.status_id
     WHERE c.integration_configuration_id = v_intent.collect_integration_configuration_id
       AND c.organization_id = p_organization_id
       AND upper(ic.provider) = 'POYNT'
       AND integration_status.is_active
       AND integration_state.status_code = 'ACTIVE'
       AND NOT c.is_deleted AND NOT ic.is_deleted
       AND NULLIF(btrim(c.application_id), '') IS NOT NULL
       AND NULLIF(btrim(c.provider_business_id), '') IS NOT NULL
       AND NULLIF(btrim(c.provider_store_id), '') IS NOT NULL
       AND NULLIF(btrim(c.credential_secret_reference), '') IS NOT NULL
       AND c.merchant_currency_code = v_intent.currency_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Collect payment integration is unavailable' USING ERRCODE = '22023';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_get_poynt_collect_configuration(
    varchar,varchar,varchar
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_get_poynt_collect_configuration(
    varchar,varchar,varchar
) TO "${appRole}";
