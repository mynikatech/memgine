-- Read-only Counter redemption quote before an OTP-authorized redemption
-- transaction exists.  It validates the same Counter, eligibility, selected
-- canonical Product, route, Store/catalog and adjustment facts used later by
-- checkout.  Provider prices remain read-only Kotlin catalog GETs.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_quote_counter_redemption(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_subscription_id varchar,
    p_benefit_ids varchar[],
    p_offer_ids varchar[],
    p_product_selections jsonb,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "itemType" varchar,
    "itemId" varchar,
    "benefitId" varchar,
    "offerId" varchar,
    "canonicalProductId" varchar,
    "commerceProductMappingId" varchar,
    "mappingVersionNo" integer,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    "snapshotProductName" varchar,
    "snapshotUnitPriceMinor" bigint,
    "snapshotCurrencyCode" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    "commerceAdjustmentId" varchar,
    "adjustmentVersionNo" integer,
    "adjustmentType" varchar,
    "percentage" numeric,
    "amountMinor" bigint,
    "adjustmentCurrencyCode" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_provider varchar(32);
    v_integration varchar(64);
    v_catalog varchar(160);
    v_item_type varchar(16);
    v_item_id varchar(64);
    v_product_id varchar(64);
    v_key text;
    v_reason text;
    v_expected_count integer;
    v_selection_count integer;
    v_mapping_count integer;
    a commerce_adjustments%ROWTYPE;
    m commerce_product_mappings%ROWTYPE;
    s record;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_subscription_id IS NULL OR btrim(p_subscription_id) = '' OR NOT EXISTS (
        SELECT 1 FROM subscriptions subscription
        JOIN organization_user membership_user
          ON membership_user.organization_user_id = subscription.organization_user_id
         AND membership_user.organization_id = p_organization_id
         AND NOT membership_user.is_deleted
        JOIN entity_status subscription_status
          ON subscription_status.entity_status_id = subscription.subscription_status_id
        JOIN statuses status ON status.status_id = subscription_status.status_id
        WHERE subscription.subscription_id = p_subscription_id
          AND NOT subscription.is_deleted
          AND status.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Subscription is not active in this organization' USING ERRCODE = '23503';
    END IF;
    IF p_product_selections IS NULL OR jsonb_typeof(p_product_selections) <> 'object' THEN
        RAISE EXCEPTION 'Product selections are required' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(array_length(p_benefit_ids, 1), 0) + COALESCE(array_length(p_offer_ids, 1), 0) = 0
       OR COALESCE(array_length(p_benefit_ids, 1), 0) + COALESCE(array_length(p_offer_ids, 1), 0) > 100
       OR COALESCE(array_length(p_benefit_ids, 1), 0) <> COALESCE(array_length(ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_benefit_ids, ARRAY[]::varchar[])) x), 1), 0)
       OR COALESCE(array_length(p_offer_ids, 1), 0) <> COALESCE(array_length(ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_offer_ids, ARRAY[]::varchar[])) x), 1), 0) THEN
        RAISE EXCEPTION 'Select distinct benefits or offers' USING ERRCODE = '22023';
    END IF;
    v_expected_count := COALESCE(array_length(p_benefit_ids, 1), 0) + COALESCE(array_length(p_offer_ids, 1), 0);
    SELECT count(*) INTO v_selection_count FROM jsonb_object_keys(p_product_selections);
    IF v_selection_count <> v_expected_count THEN
        RAISE EXCEPTION 'Select one product for every Benefit or Offer' USING ERRCODE = '22023';
    END IF;

    SELECT route.provider_code, route.integration_configuration_id
      INTO v_provider, v_integration
      FROM commerce_payment_provider_routes route
      LEFT JOIN integration_configurations integration
        ON integration.integration_configuration_id = route.integration_configuration_id
       AND integration.organization_id = route.organization_id
       AND NOT integration.is_deleted
      LEFT JOIN entity_status integration_status
        ON integration_status.entity_status_id = integration.integration_status_id
      LEFT JOIN statuses status ON status.status_id = integration_status.status_id
     WHERE route.organization_id = p_organization_id
       AND route.source_channel = 'COUNTER'
       AND route.is_enabled AND NOT route.is_deleted
       AND (route.store_id = p_store_id OR route.store_id IS NULL)
       AND route.provider_code IN ('TEST', 'POYNT')
       AND (route.provider_code = 'TEST' OR (
           integration.integration_configuration_id IS NOT NULL
           AND upper(integration.provider) = route.provider_code
           AND integration_status.is_active AND status.status_code = 'ACTIVE'
       ))
     ORDER BY CASE WHEN route.store_id = p_store_id THEN 0 ELSE 1 END,
              route.commerce_payment_provider_route_id
     LIMIT 1;
    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'No Counter payment provider is configured' USING ERRCODE = '22023';
    END IF;
    IF v_provider = 'POYNT' THEN
        SELECT configuration.effective_catalog_id INTO v_catalog
          FROM commerce_store_catalog_sources source
          JOIN poynt_store_catalog_configurations configuration
            ON configuration.organization_id = source.organization_id
           AND configuration.store_id = source.store_id
           AND configuration.integration_configuration_id = source.integration_configuration_id
         WHERE source.organization_id = p_organization_id
           AND source.store_id = p_store_id
           AND source.integration_configuration_id = v_integration
           AND NULLIF(btrim(configuration.effective_catalog_id), '') IS NOT NULL;
        IF v_catalog IS NULL THEN
            RAISE EXCEPTION 'Counter Store has no verified Poynt catalog configuration' USING ERRCODE = '23503';
        END IF;
    END IF;

    FOR v_item_type, v_item_id IN
        SELECT 'BENEFIT'::varchar, value FROM unnest(COALESCE(p_benefit_ids, ARRAY[]::varchar[])) value
        UNION ALL
        SELECT 'OFFER'::varchar, value FROM unnest(COALESCE(p_offer_ids, ARRAY[]::varchar[])) value
    LOOP
        v_key := v_item_type || ':' || v_item_id;
        v_product_id := NULLIF(btrim(p_product_selections ->> v_key), '');
        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Select a product for every Benefit or Offer' USING ERRCODE = '22023';
        END IF;
        v_reason := CASE WHEN v_item_type = 'BENEFIT'
            THEN counter_benefit_rejection(p_organization_id, p_subscription_id, v_item_id, p_store_id)
            ELSE counter_offer_rejection(p_organization_id, p_subscription_id, v_item_id, p_store_id)
        END;
        IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505'; END IF;
        IF NOT EXISTS (
            SELECT 1 FROM product p WHERE p.product_id = v_product_id AND p.organization_id = p_organization_id AND NOT p.is_deleted
              AND ((v_item_type = 'BENEFIT' AND EXISTS (SELECT 1 FROM benefit_product bp WHERE bp.organization_id = p_organization_id AND bp.benefit_id = v_item_id AND bp.product_id = p.product_id AND bp.is_active AND NOT bp.is_deleted))
                OR (v_item_type = 'OFFER' AND EXISTS (SELECT 1 FROM offer_product op WHERE op.organization_id = p_organization_id AND op.offer_id = v_item_id AND op.product_id = p.product_id AND op.is_active AND NOT op.is_deleted)))
        ) THEN RAISE EXCEPTION 'Selected Product is not eligible for this redemption' USING ERRCODE = '23503'; END IF;
        SELECT adjustment.* INTO a
          FROM (SELECT bca.commerce_adjustment_id FROM benefit_commerce_adjustments bca WHERE v_item_type = 'BENEFIT' AND bca.organization_id = p_organization_id AND bca.benefit_id = v_item_id AND NOT bca.is_deleted
                UNION ALL SELECT oca.commerce_adjustment_id FROM offer_commerce_adjustments oca WHERE v_item_type = 'OFFER' AND oca.organization_id = p_organization_id AND oca.offer_id = v_item_id AND NOT oca.is_deleted) link
          JOIN commerce_adjustments adjustment ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
         WHERE adjustment.is_active AND NOT adjustment.is_deleted
           AND adjustment.adjustment_type IN ('PRODUCT_FREE', 'PRODUCT_PERCENT_OFF', 'PRODUCT_FIXED_OFF', 'PRODUCT_SPECIAL_PRICE');
        IF a.commerce_adjustment_id IS NULL THEN RAISE EXCEPTION 'Selected item has no active POS product adjustment' USING ERRCODE = '23503'; END IF;
        SELECT count(*) INTO v_mapping_count
          FROM commerce_product_mappings mapping
         WHERE mapping.organization_id = p_organization_id AND mapping.product_id = v_product_id
           AND mapping.integration_configuration_id = v_integration
           AND mapping.store_id = p_store_id AND mapping.is_active AND NOT mapping.is_deleted
           AND (v_provider <> 'POYNT' OR mapping.external_catalog_id = v_catalog);
        IF v_mapping_count <> 1 THEN
            RAISE EXCEPTION 'Selected Product mapping is missing or ambiguous for this Counter Store catalog' USING ERRCODE = '22023';
        END IF;
        SELECT * INTO m FROM commerce_product_mappings mapping
         WHERE mapping.organization_id = p_organization_id AND mapping.product_id = v_product_id
           AND mapping.integration_configuration_id = v_integration AND mapping.store_id = p_store_id
           AND mapping.is_active AND NOT mapping.is_deleted
           AND (v_provider <> 'POYNT' OR mapping.external_catalog_id = v_catalog);
        SELECT snapshot.product_name, snapshot.unit_price_minor_snapshot, snapshot.currency_code INTO s
          FROM commerce_product_snapshots snapshot
         WHERE snapshot.organization_id = p_organization_id
           AND snapshot.integration_configuration_id = m.integration_configuration_id
           AND snapshot.store_id = p_store_id AND snapshot.external_product_id = m.external_product_id
           AND COALESCE(snapshot.external_variant_id, '') = COALESCE(m.external_variant_id, '')
           AND (v_provider <> 'POYNT' OR snapshot.external_catalog_id = v_catalog)
           AND snapshot.is_active AND NOT snapshot.is_deleted
         ORDER BY snapshot.last_synced_at DESC LIMIT 1;
        IF s.product_name IS NULL THEN RAISE EXCEPTION 'Selected Product has no active catalog snapshot' USING ERRCODE = '23503'; END IF;
        RETURN QUERY SELECT v_item_type, v_item_id,
            CASE WHEN v_item_type = 'BENEFIT' THEN v_item_id END,
            CASE WHEN v_item_type = 'OFFER' THEN v_item_id END,
            v_product_id, m.commerce_product_mapping_id, m.version_no, m.external_product_id, m.external_variant_id,
            s.product_name, s.unit_price_minor_snapshot, s.currency_code, v_provider, v_integration,
            a.commerce_adjustment_id, a.version_no, a.adjustment_type, a.percentage, a.amount_minor, a.currency_code;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_pre_otp_quote(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_actor_user_id varchar, p_integration_configuration_id varchar
)
RETURNS TABLE("integrationConfigurationId" varchar, "organizationId" varchar, "applicationId" varchar,
              "businessId" varchar, "providerStoreId" varchar, "secretReference" varchar,
              "merchantCurrencyCode" varchar, "storeId" varchar, "lastFullSyncAt" text, "lastIncrementalSyncAt" text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT configuration.integration_configuration_id, configuration.organization_id, configuration.application_id,
           configuration.provider_business_id, configuration.provider_store_id, configuration.credential_secret_reference,
           configuration.merchant_currency_code, sync.store_id, sync.last_full_sync_at::text, sync.last_incremental_sync_at::text
      FROM commerce_store_catalog_sources source
      JOIN poynt_store_catalog_configurations store_catalog
        ON store_catalog.organization_id = source.organization_id AND store_catalog.store_id = source.store_id
       AND store_catalog.integration_configuration_id = source.integration_configuration_id
      JOIN commerce_provider_catalog_configurations configuration
        ON configuration.organization_id = source.organization_id AND configuration.integration_configuration_id = source.integration_configuration_id
       AND NOT configuration.is_deleted
      JOIN integration_configurations integration
        ON integration.organization_id = source.organization_id AND integration.integration_configuration_id = source.integration_configuration_id
       AND upper(integration.provider) = 'POYNT' AND NOT integration.is_deleted
      JOIN entity_status integration_status
        ON integration_status.entity_status_id = integration.integration_status_id
       AND integration_status.is_active
      JOIN statuses integration_state
        ON integration_state.status_id = integration_status.status_id
       AND integration_state.status_code = 'ACTIVE'
      LEFT JOIN LATERAL (
          SELECT sync_state.store_id,
                 sync_state.last_full_sync_at,
                 sync_state.last_incremental_sync_at
            FROM commerce_catalog_sync_states sync_state
           WHERE sync_state.integration_configuration_id = configuration.integration_configuration_id
             AND sync_state.store_id = p_store_id
           ORDER BY sync_state.integration_configuration_id
           LIMIT 1
      ) sync ON true
     WHERE source.organization_id = p_organization_id AND source.store_id = p_store_id
       AND source.integration_configuration_id = p_integration_configuration_id
       AND configuration.connection_status = 'VERIFIED'
       AND NULLIF(btrim(configuration.provider_business_id), '') IS NOT NULL
       AND NULLIF(btrim(configuration.credential_secret_reference), '') IS NOT NULL
       AND NULLIF(btrim(store_catalog.effective_catalog_id), '') IS NOT NULL
       AND p_integration_configuration_id = (
           SELECT route.integration_configuration_id
             FROM commerce_payment_provider_routes route
             LEFT JOIN integration_configurations route_integration
               ON route_integration.integration_configuration_id = route.integration_configuration_id
              AND route_integration.organization_id = route.organization_id
              AND NOT route_integration.is_deleted
             LEFT JOIN entity_status route_integration_status
               ON route_integration_status.entity_status_id = route_integration.integration_status_id
             LEFT JOIN statuses route_integration_state
               ON route_integration_state.status_id = route_integration_status.status_id
            WHERE route.organization_id = p_organization_id
              AND route.source_channel = 'COUNTER'
              AND route.is_enabled
              AND NOT route.is_deleted
              AND (route.store_id = p_store_id OR route.store_id IS NULL)
              AND route.provider_code IN ('TEST', 'POYNT')
              AND (
                  route.provider_code = 'TEST'
                  OR (
                      route_integration.integration_configuration_id IS NOT NULL
                      AND upper(route_integration.provider) = route.provider_code
                      AND route_integration_status.is_active
                      AND route_integration_state.status_code = 'ACTIVE'
                  )
              )
            ORDER BY CASE WHEN route.store_id = p_store_id THEN 0 ELSE 1 END,
                     route.commerce_payment_provider_route_id
            LIMIT 1
       );
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_quote_counter_redemption(varchar,varchar,varchar,varchar,varchar[],varchar[],jsonb,varchar),
    "${schemaName}".commerce_get_poynt_catalog_configuration_for_pre_otp_quote(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_quote_counter_redemption(varchar,varchar,varchar,varchar,varchar[],varchar[],jsonb,varchar),
    "${schemaName}".commerce_get_poynt_catalog_configuration_for_pre_otp_quote(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
