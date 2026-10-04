-- Remote Collect is distinct from the POYNT physical terminal Commerce provider.
-- OAuth private keys remain in the integration's Secrets Manager reference.
INSERT INTO "${schemaName}".payment_provider_configs (
    payment_provider_config_id, organization_id, provider_code, configuration_reference,
    display_name, is_enabled, is_test_mode, created_by, updated_by
) VALUES (
    'payment-provider-poynt-collect', NULL, 'POYNT_COLLECT', 'commerce_provider_catalog_configurations',
    'Poynt Collect', true, false, 'system', 'system'
) ON CONFLICT (payment_provider_config_id) DO NOTHING;

-- Only the owner of this payment intent may resolve its organization's Collect credentials.
-- An organization with more than one active Poynt integration must be configured
-- explicitly before remote Collect can be used; no integration is guessed.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_poynt_collect_configuration(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "integrationConfigurationId" varchar, "organizationId" varchar,
    "applicationId" varchar, "businessId" varchar, "providerStoreId" varchar,
    "secretReference" varchar, "merchantCurrencyCode" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM payment_intents pi
        JOIN payment_provider_configs pc ON pc.payment_provider_config_id = pi.payment_provider_config_id
        WHERE pi.payment_intent_id = p_intent_id
          AND pi.organization_id = p_organization_id
          AND pc.provider_code = 'POYNT_COLLECT'
          AND pi.authorization_mode = 'CUSTOMER_SESSION'
          AND payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id)
    ) THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_count
      FROM commerce_provider_catalog_configurations c
      JOIN integration_configurations ic ON ic.integration_configuration_id = c.integration_configuration_id
     WHERE c.organization_id = p_organization_id AND upper(ic.provider) = 'POYNT'
       AND NOT c.is_deleted AND NOT ic.is_deleted;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Exactly one Poynt Collect integration is required' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT c.integration_configuration_id, c.organization_id, c.application_id,
           c.provider_business_id, c.provider_store_id, c.credential_secret_reference,
           c.merchant_currency_code
      FROM commerce_provider_catalog_configurations c
      JOIN integration_configurations ic ON ic.integration_configuration_id = c.integration_configuration_id
      JOIN payment_intents pi ON pi.payment_intent_id = p_intent_id
         AND pi.organization_id = p_organization_id
     WHERE c.organization_id = p_organization_id AND upper(ic.provider) = 'POYNT'
       AND NOT c.is_deleted AND NOT ic.is_deleted
       AND NULLIF(btrim(c.provider_store_id), '') IS NOT NULL
       AND c.merchant_currency_code = pi.currency_code;
END;
$function$;

-- A local claim prevents parallel confirmation requests from charging twice.
-- Ambiguous provider outcomes remain PROCESSING for reconciliation, not blind retry.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_claim_poynt_collect_charge(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_intent payment_intents%ROWTYPE;
BEGIN
    SELECT * INTO v_intent FROM payment_intents
     WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id)
       OR v_intent.authorization_mode <> 'CUSTOMER_SESSION'
       OR NOT EXISTS (
           SELECT 1 FROM payment_provider_configs pc
            WHERE pc.payment_provider_config_id = v_intent.payment_provider_config_id
              AND pc.provider_code = 'POYNT_COLLECT'
       ) THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;
    IF v_intent.status <> 'PENDING' OR v_intent.provider_reference_id IS NOT NULL THEN
        RETURN false;
    END IF;
    UPDATE payment_intents SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id WHERE payment_intent_id = p_intent_id;
    UPDATE payment_attempts SET status = 'PROCESSING'
        WHERE payment_intent_id = p_intent_id AND status = 'PENDING';
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_get_poynt_collect_configuration(varchar,varchar,varchar),
    "${schemaName}".payment_claim_poynt_collect_charge(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_get_poynt_collect_configuration(varchar,varchar,varchar),
    "${schemaName}".payment_claim_poynt_collect_charge(varchar,varchar,varchar) TO "${appRole}";
