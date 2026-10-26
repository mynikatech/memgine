-- Server-authoritative, read-only input for Counter redemption review.  This
-- mirrors migration 206's eligibility and Store-specific mapping precedence
-- without creating a Commerce transaction, order, adjustment, or redemption.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_review_counter_redemption_checkout(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "redemptionTransactionId" varchar,
    "transactionNumber" varchar,
    "redemptionVersionNo" integer,
    "expiresAt" text,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    "redemptionItemId" varchar,
    "redemptionItemVersionNo" integer,
    "itemType" varchar,
    "benefitId" varchar,
    "offerId" varchar,
    "commerceProductMappingId" varchar,
    "mappingVersionNo" integer,
    "canonicalProductId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    "quantity" integer,
    "snapshotProductName" varchar,
    "snapshotUnitPriceMinor" bigint,
    "snapshotCurrencyCode" varchar,
    "commerceAdjustmentId" varchar,
    "adjustmentVersionNo" integer,
    "adjustmentType" varchar,
    "percentage" numeric,
    "amountMinor" bigint,
    "adjustmentCurrencyCode" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;
    a commerce_adjustments%ROWTYPE;
    m commerce_product_mappings%ROWTYPE;
    s record;
    v_reason text;
    v_provider varchar(32);
    v_integration varchar(64);
    v_mapping_count integer;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id
       AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE = 'P0002';
    END IF;
    IF t.store_id IS NOT NULL AND t.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store' USING ERRCODE = '42501';
    END IF;
    IF t.staff_id IS NOT NULL AND t.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another staff context' USING ERRCODE = '42501';
    END IF;
    IF t.status <> 'PENDING' OR (t.expires_at IS NOT NULL AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
        RAISE EXCEPTION 'Redemption transaction cannot be reviewed' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM commerce_transaction_redemptions x
          JOIN commerce_transactions c ON c.commerce_transaction_id = x.commerce_transaction_id
         WHERE x.redemption_transaction_id = t.redemption_transaction_id
           AND NOT x.is_deleted
           AND NOT c.is_deleted
    ) THEN
        RAISE EXCEPTION 'Redemption checkout has already started' USING ERRCODE = '23505';
    END IF;

    SELECT r.provider_code, r.integration_configuration_id
      INTO v_provider, v_integration
      FROM commerce_payment_provider_routes r
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = r.integration_configuration_id
       AND ic.organization_id = r.organization_id
       AND NOT ic.is_deleted
      LEFT JOIN entity_status ies ON ies.entity_status_id = ic.integration_status_id
      LEFT JOIN statuses ist ON ist.status_id = ies.status_id
     WHERE r.organization_id = p_organization_id
       AND r.source_channel = 'COUNTER'
       AND r.is_enabled
       AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
       AND r.provider_code IN ('TEST', 'POYNT')
       AND (r.provider_code = 'TEST' OR (
            ic.integration_configuration_id IS NOT NULL
            AND upper(ic.provider) = r.provider_code
            AND ies.is_active
            AND ist.status_code = 'ACTIVE'
       ))
     ORDER BY CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
              r.commerce_payment_provider_route_id
     LIMIT 1;
    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'No Counter payment provider is configured' USING ERRCODE = '22023';
    END IF;

    FOR i IN
        SELECT * FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         ORDER BY created_at, redemption_transaction_item_id
    LOOP
        v_reason := CASE WHEN i.item_type = 'BENEFIT'
            THEN counter_benefit_rejection(p_organization_id, t.subscription_id, i.benefit_id)
            ELSE counter_offer_rejection(p_organization_id, t.subscription_id, i.offer_id, p_store_id)
        END;
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505';
        END IF;

        SELECT ca.* INTO a
          FROM (SELECT bca.commerce_adjustment_id FROM benefit_commerce_adjustments bca
                 WHERE i.item_type = 'BENEFIT' AND bca.organization_id = p_organization_id
                   AND bca.benefit_id = i.benefit_id AND NOT bca.is_deleted
                UNION ALL
                SELECT oca.commerce_adjustment_id FROM offer_commerce_adjustments oca
                 WHERE i.item_type = 'OFFER' AND oca.organization_id = p_organization_id
                   AND oca.offer_id = i.offer_id AND NOT oca.is_deleted) link
          JOIN commerce_adjustments ca ON ca.commerce_adjustment_id = link.commerce_adjustment_id
         WHERE NOT ca.is_deleted AND ca.is_active
           AND ca.adjustment_type IN ('PRODUCT_FREE', 'PRODUCT_PERCENT_OFF', 'PRODUCT_FIXED_OFF', 'PRODUCT_SPECIAL_PRICE');
        IF a.commerce_adjustment_id IS NULL THEN
            RAISE EXCEPTION 'Selected % has no active POS product adjustment', lower(i.item_type) USING ERRCODE = '23503';
        END IF;

        IF i.commerce_product_mapping_id IS NOT NULL THEN
            SELECT pm.* INTO m
              FROM commerce_product_mappings pm
             WHERE pm.commerce_product_mapping_id = i.commerce_product_mapping_id
               AND pm.organization_id = p_organization_id
               AND pm.is_active AND NOT pm.is_deleted
               AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
               AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
               AND ((i.item_type = 'BENEFIT' AND EXISTS (
                    SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                      AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                      AND bp.is_active AND NOT bp.is_deleted
               )) OR (i.item_type = 'OFFER' AND EXISTS (
                    SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                      AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                      AND op.is_active AND NOT op.is_deleted
               )));
        ELSE
            WITH eligible AS (
                SELECT pm.* FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                          AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                          AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                          AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                          AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred AS (
                SELECT * FROM eligible WHERE store_id = p_store_id
                UNION ALL
                SELECT organization_mapping.* FROM eligible organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM eligible exact_mapping
                      WHERE exact_mapping.store_id = p_store_id
                        AND exact_mapping.product_id = organization_mapping.product_id
                        AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT count(*) INTO v_mapping_count FROM preferred;
            IF v_mapping_count = 0 THEN
                RAISE EXCEPTION 'No active POS mapping is configured for the eligible canonical Product' USING ERRCODE = '23503';
            ELSIF v_mapping_count > 1 THEN
                RAISE EXCEPTION 'Select a POS product for this redemption; multiple eligible mappings are configured' USING ERRCODE = '22023';
            END IF;
            WITH eligible AS (
                SELECT pm.* FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                          AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                          AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                          AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                          AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred AS (
                SELECT * FROM eligible WHERE store_id = p_store_id
                UNION ALL
                SELECT organization_mapping.* FROM eligible organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM eligible exact_mapping
                      WHERE exact_mapping.store_id = p_store_id
                        AND exact_mapping.product_id = organization_mapping.product_id
                        AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT * INTO m FROM preferred;
        END IF;
        IF m.commerce_product_mapping_id IS NULL THEN
            RAISE EXCEPTION 'Selected POS product is not eligible for this redemption checkout context' USING ERRCODE = '23503';
        END IF;

        SELECT product_name, unit_price_minor_snapshot, currency_code INTO s
          FROM commerce_product_snapshots
         WHERE organization_id = p_organization_id
           AND integration_configuration_id = m.integration_configuration_id
           AND COALESCE(store_id, '') = COALESCE(m.store_id, '')
           AND external_product_id = m.external_product_id
           AND COALESCE(external_variant_id, '') = COALESCE(m.external_variant_id, '')
           AND is_active AND NOT is_deleted
         ORDER BY last_synced_at DESC
         LIMIT 1;
        IF s.product_name IS NULL THEN
            RAISE EXCEPTION 'Selected POS product has no active catalog snapshot' USING ERRCODE = '23503';
        END IF;

        RETURN QUERY SELECT t.redemption_transaction_id, t.redemption_transaction_number, t.version_no,
            t.expires_at::text, v_provider, v_integration, i.redemption_transaction_item_id, i.version_no,
            i.item_type, i.benefit_id, i.offer_id, m.commerce_product_mapping_id, m.version_no,
            m.product_id, m.external_product_id, m.external_variant_id, 1, s.product_name,
            s.unit_price_minor_snapshot, s.currency_code, a.commerce_adjustment_id, a.version_no,
            a.adjustment_type, a.percentage, a.amount_minor, a.currency_code;
    END LOOP;
END;
$function$;

-- Counter staff require the same narrowly scoped credential lookup before a
-- Commerce transaction exists.  It authorizes only a pending redemption in
-- the supplied Store/staff context.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_redemption_review(
    p_organization_id varchar,
    p_redemption_transaction_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar, "organizationId" varchar, "applicationId" varchar,
    "businessId" varchar, "providerStoreId" varchar, "secretReference" varchar,
    "merchantCurrencyCode" varchar, "storeId" varchar, "lastFullSyncAt" text,
    "lastIncrementalSyncAt" text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE t redemption_transaction%ROWTYPE;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO t FROM redemption_transaction
     WHERE redemption_transaction_id = p_redemption_transaction_id AND organization_id = p_organization_id;
    IF NOT FOUND OR (t.store_id IS NOT NULL AND t.store_id IS DISTINCT FROM p_store_id)
       OR (t.staff_id IS NOT NULL AND t.staff_id IS DISTINCT FROM p_staff_id)
       OR t.status <> 'PENDING' OR (t.expires_at IS NOT NULL AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
        RAISE EXCEPTION 'Counter redemption review is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT cfg.integration_configuration_id, cfg.organization_id, cfg.application_id,
           cfg.provider_business_id, cfg.provider_store_id, cfg.credential_secret_reference,
           cfg.merchant_currency_code, sync.store_id, sync.last_full_sync_at::text, sync.last_incremental_sync_at::text
      FROM commerce_payment_provider_routes r
      JOIN commerce_provider_catalog_configurations cfg
        ON cfg.integration_configuration_id = r.integration_configuration_id
       AND cfg.organization_id = r.organization_id AND NOT cfg.is_deleted
      JOIN integration_configurations ic
        ON ic.integration_configuration_id = cfg.integration_configuration_id
       AND ic.organization_id = cfg.organization_id AND upper(ic.provider) = 'POYNT' AND NOT ic.is_deleted
      LEFT JOIN commerce_catalog_sync_states sync
        ON sync.integration_configuration_id = cfg.integration_configuration_id
       AND (sync.store_id = p_store_id OR sync.store_id IS NULL)
     WHERE r.organization_id = p_organization_id AND r.source_channel = 'COUNTER'
       AND r.provider_code = 'POYNT' AND r.is_enabled AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
     ORDER BY CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
              CASE WHEN sync.store_id = p_store_id THEN 0 ELSE 1 END
     LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_review_counter_redemption_checkout(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_redemption_review(varchar, varchar, varchar, varchar, varchar)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_review_counter_redemption_checkout(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_redemption_review(varchar, varchar, varchar, varchar, varchar)
TO "${appRole}";
