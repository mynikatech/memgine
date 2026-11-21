CREATE FUNCTION "${schemaName}".fulfillment_counter_quote_route(
    p_organization_id varchar,p_store_id varchar
) RETURNS TABLE(provider_code varchar,integration_configuration_id varchar)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $route$
    SELECT route.provider_code, route.integration_configuration_id
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
$route$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_counter_quote_route(varchar,varchar) FROM PUBLIC,"${appRole}";

-- Resolve pricing from the Store's catalog selection. Only the local fallback
-- requires a TEST payment route. An assigned but unusable POS never falls back.
CREATE FUNCTION "${schemaName}".fulfillment_store_pricing_source(p_org varchar,p_store varchar)
RETURNS TABLE(provider_code varchar,integration_id varchar,catalog_id varchar)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    SELECT upper(i.provider)::varchar,i.integration_configuration_id,c.effective_catalog_id
    FROM commerce_store_catalog_sources src
    JOIN integration_configurations i ON i.integration_configuration_id=src.integration_configuration_id
      AND i.organization_id=src.organization_id AND NOT i.is_deleted
    JOIN entity_status es ON es.entity_status_id=i.integration_status_id AND es.is_active
    JOIN statuses st ON st.status_id=es.status_id AND st.status_code='ACTIVE' AND st.is_active
    -- Poynt is the registered external adapter. Its Store binding verifies catalog identity.
    JOIN poynt_store_catalog_configurations c ON upper(i.provider)='POYNT'
      AND c.organization_id=src.organization_id AND c.store_id=src.store_id
      AND c.integration_configuration_id=src.integration_configuration_id
      AND nullif(btrim(c.effective_catalog_id),'') IS NOT NULL
    JOIN commerce_provider_catalog_configurations verified ON verified.organization_id=src.organization_id
      AND verified.integration_configuration_id=i.integration_configuration_id AND NOT verified.is_deleted
      AND verified.connection_status='VERIFIED'
      AND nullif(btrim(verified.provider_business_id),'') IS NOT NULL
      AND nullif(btrim(verified.credential_secret_reference),'') IS NOT NULL
    WHERE src.organization_id=p_org AND src.store_id=p_store
    UNION ALL
    SELECT 'MEMGINE'::varchar,NULL::varchar,NULL::varchar
    WHERE EXISTS (SELECT 1 FROM fulfillment_counter_quote_route(p_org,p_store) r
                  WHERE r.provider_code='TEST' AND r.integration_configuration_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM commerce_store_catalog_sources src
                      WHERE src.organization_id=p_org AND src.store_id=p_store)
      AND NOT EXISTS (SELECT 1 FROM poynt_store_catalog_configurations c
                      JOIN integration_configurations i ON i.integration_configuration_id=c.integration_configuration_id
                        AND i.organization_id=c.organization_id AND NOT i.is_deleted
                      JOIN entity_status es ON es.entity_status_id=i.integration_status_id AND es.is_active
                      JOIN statuses st ON st.status_id=es.status_id AND st.status_code='ACTIVE' AND st.is_active
                      WHERE c.organization_id=p_org AND c.store_id=p_store
                        AND nullif(btrim(c.effective_catalog_id),'') IS NOT NULL);
$fn$;

CREATE FUNCTION "${schemaName}".fulfillment_store_product_prices(
    p_org varchar,p_store varchar,p_provider varchar,p_integration varchar,p_catalog varchar,p_products varchar[]
) RETURNS TABLE(product_id varchar,product_name varchar,product_code varchar,mapping_id varchar,selection_version integer,
                external_product_id varchar,external_variant_id varchar,price_minor bigint,currency varchar)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    WITH eligible AS (
        SELECT p.* FROM product p
        JOIN entity_status es ON es.entity_status_id=p.status_id AND es.is_active
        JOIN statuses st ON st.status_id=es.status_id AND st.status_code='ACTIVE' AND st.is_active
        WHERE p.organization_id=p_org AND NOT p.is_deleted AND p.product_id=ANY(p_products)
    ), mappings AS (
        SELECT m.*,count(*) OVER (PARTITION BY m.product_id) AS mapping_count
        FROM commerce_product_mappings m JOIN eligible p USING(product_id)
        WHERE p_provider<>'MEMGINE' AND m.organization_id=p_org AND m.store_id=p_store
          AND m.integration_configuration_id=p_integration AND m.external_catalog_id=p_catalog
          AND m.is_active AND NOT m.is_deleted
    )
    SELECT p.product_id,snap.product_name,p.product_code,m.commerce_product_mapping_id,m.version_no,
        m.external_product_id,m.external_variant_id,snap.unit_price_minor_snapshot,snap.currency_code
    FROM mappings m JOIN eligible p USING(product_id)
    JOIN commerce_product_snapshots snap ON snap.commerce_product_mapping_id=m.commerce_product_mapping_id
      AND snap.organization_id=m.organization_id AND snap.store_id=m.store_id
      AND snap.integration_configuration_id=m.integration_configuration_id AND snap.external_catalog_id=m.external_catalog_id
      AND snap.external_product_id=m.external_product_id AND snap.external_variant_id IS NOT DISTINCT FROM m.external_variant_id
      AND snap.is_active AND NOT snap.is_deleted
    WHERE m.mapping_count=1
    UNION ALL
    SELECT p.product_id,p.product_name,p.product_code,NULL::varchar,p.version_no,NULL::varchar,NULL::varchar,
           p.base_price_minor,p.currency_code
    FROM eligible p JOIN product_catalog c ON c.product_catalog_id=p.product_catalog_id
      AND c.organization_id=p_org AND c.is_active AND NOT c.is_deleted
      AND c.integration_configuration_id IS NULL AND c.external_catalog_id IS NULL
    WHERE p_provider='MEMGINE' AND p.base_price_minor>=0 AND p.currency_code ~ '^[A-Z]{3}$'
      AND NOT EXISTS (SELECT 1 FROM commerce_product_mappings m WHERE m.organization_id=p_org
                      AND m.store_id=p_store AND m.product_id=p.product_id AND m.is_active AND NOT m.is_deleted);
$fn$;

-- Published redemption membership/Store rules are checked by the callers.
-- Product identity itself always comes from the canonical active item links.
CREATE FUNCTION "${schemaName}".fulfillment_redemption_item_products(
    p_org varchar,p_kind varchar,p_item varchar
) RETURNS TABLE(product_id varchar)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    SELECT bp.product_id FROM benefit_product bp
    WHERE p_kind='BENEFIT' AND bp.organization_id=p_org AND bp.benefit_id=p_item AND bp.is_active AND NOT bp.is_deleted
    UNION
    SELECT op.product_id FROM offer_product op
    WHERE p_kind='OFFER' AND op.organization_id=p_org AND op.offer_id=p_item AND op.is_active AND NOT op.is_deleted;
$fn$;

CREATE FUNCTION "${schemaName}".fulfillment_redemption_item_adjustment(
    p_org varchar,p_kind varchar,p_item varchar
) RETURNS SETOF "${schemaName}".commerce_adjustments
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    WITH eligible AS MATERIALIZED (
        SELECT a.* FROM commerce_adjustments a
        WHERE a.organization_id=p_org AND a.is_active AND NOT a.is_deleted
          AND a.adjustment_type IN ('PRODUCT_FREE','PRODUCT_PERCENT_OFF','PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE')
          AND (EXISTS (
              SELECT 1 FROM benefit_commerce_adjustments b
              WHERE p_kind='BENEFIT' AND b.organization_id=p_org AND b.benefit_id=p_item
                AND b.commerce_adjustment_id=a.commerce_adjustment_id AND NOT b.is_deleted
          ) OR EXISTS (
              SELECT 1 FROM offer_commerce_adjustments o
              WHERE p_kind='OFFER' AND o.organization_id=p_org AND o.offer_id=p_item
                AND o.commerce_adjustment_id=a.commerce_adjustment_id AND NOT o.is_deleted
          ))
    )
    SELECT e.* FROM eligible e WHERE (SELECT count(*) FROM eligible)=1;
$fn$;

REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_store_pricing_source(varchar,varchar),
    "${schemaName}".fulfillment_store_product_prices(varchar,varchar,varchar,varchar,varchar,varchar[]),
    "${schemaName}".fulfillment_redemption_item_products(varchar,varchar,varchar),
    "${schemaName}".fulfillment_redemption_item_adjustment(varchar,varchar,varchar)
FROM PUBLIC,"${appRole}";
-- Share the existing Counter quote inputs with customer-authorized quotes.

CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_redemption_quote_rows(
    p_organization_id varchar,
    p_store_id varchar,

    p_subscription_id varchar,
    p_benefit_ids varchar[],
    p_offer_ids varchar[],
    p_product_selections jsonb

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
LANGUAGE plpgsql STABLE
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
    a commerce_adjustments%ROWTYPE;
    s record;
BEGIN
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

    SELECT source.provider_code,source.integration_id,source.catalog_id INTO v_provider,v_integration,v_catalog
    FROM fulfillment_store_pricing_source(p_organization_id,p_store_id) source;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No verified pricing source is configured for this Store' USING ERRCODE = '22023';
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
        IF NOT EXISTS (SELECT 1 FROM fulfillment_redemption_item_products(p_organization_id,v_item_type,v_item_id) p
                       WHERE p.product_id=v_product_id) THEN
            RAISE EXCEPTION 'Selected Product is not eligible for this redemption' USING ERRCODE = '23503';
        END IF;
        SELECT * INTO a FROM fulfillment_redemption_item_adjustment(p_organization_id,v_item_type,v_item_id);
        IF NOT FOUND THEN RAISE EXCEPTION 'Selected item has no unambiguous active product adjustment' USING ERRCODE = '23503'; END IF;
        SELECT * INTO s FROM fulfillment_store_product_prices(
            p_organization_id,p_store_id,v_provider,v_integration,v_catalog,ARRAY[v_product_id]);
        IF NOT FOUND THEN RAISE EXCEPTION 'Selected Product has no unambiguous Store price' USING ERRCODE = '23503'; END IF;
        RETURN QUERY SELECT v_item_type, v_item_id,
            CASE WHEN v_item_type = 'BENEFIT' THEN v_item_id END,
            CASE WHEN v_item_type = 'OFFER' THEN v_item_id END,
            v_product_id, s.mapping_id, s.selection_version, s.external_product_id, s.external_variant_id,
            s.product_name, s.price_minor, s.currency, v_provider, v_integration,
            a.commerce_adjustment_id, a.version_no, a.adjustment_type, a.percentage, a.amount_minor, a.currency_code;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_quote_poynt_catalog(
    p_organization_id varchar, p_store_id varchar,
    p_integration_configuration_id varchar
)
RETURNS TABLE("integrationConfigurationId" varchar, "organizationId" varchar, "applicationId" varchar,
              "businessId" varchar, "providerStoreId" varchar, "secretReference" varchar,
              "merchantCurrencyCode" varchar, "storeId" varchar, "lastFullSyncAt" text, "lastIncrementalSyncAt" text)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
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
           SELECT r.integration_id
             FROM fulfillment_store_pricing_source(p_organization_id,p_store_id) r
       );
END;
$function$;

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


LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, "${schemaName}", pg_temp
AS $function$
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT * FROM fulfillment_redemption_quote_rows(
        p_organization_id,p_store_id,p_subscription_id,p_benefit_ids,p_offer_ids,p_product_selections);
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_pre_otp_quote(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_actor_user_id varchar, p_integration_configuration_id varchar
)
RETURNS TABLE("integrationConfigurationId" varchar, "organizationId" varchar, "applicationId" varchar,
              "businessId" varchar, "providerStoreId" varchar, "secretReference" varchar,
              "merchantCurrencyCode" varchar, "storeId" varchar, "lastFullSyncAt" text, "lastIncrementalSyncAt" text)


LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, "${schemaName}", pg_temp
AS $function$
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT * FROM fulfillment_quote_poynt_catalog(p_organization_id,p_store_id,p_integration_configuration_id);
END;
$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".fulfillment_redemption_quote_rows(varchar,varchar,varchar,varchar[],varchar[],jsonb),
    "${schemaName}".fulfillment_quote_poynt_catalog(varchar,varchar,varchar)
FROM PUBLIC, "${appRole}";

-- Customer entry points use the authenticated global user id and keep store and
-- subscription checks distinct from the staff-only wrappers above.
CREATE FUNCTION "${schemaName}".customer_fulfillment_subscription_owned(
    p_org varchar,p_subscription varchar,p_actor varchar
) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT EXISTS (
      SELECT 1 FROM subscriptions sub JOIN organization_user u USING (organization_user_id)
      WHERE sub.subscription_id=p_subscription AND u.organization_id=p_org AND u.user_id=p_actor
        AND NOT sub.is_deleted AND NOT u.is_deleted
    );
$body$;

CREATE FUNCTION "${schemaName}".customer_fulfillment_store_context(
    p_org varchar,p_subscription varchar,p_actor varchar
) RETURNS TABLE(store_id varchar,store_name varchar,timezone varchar,policy jsonb)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT s.store_id,s.store_name::varchar,s.timezone::varchar,
           fulfillment_apply_store_overrides(fulfillment_resolve_org_policy(p_org),s.fulfillment_overrides)
              #> '{fulfillmentTypes,ORDER}'
    FROM stores s
    JOIN entity_status es ON es.entity_status_id=s.store_status_id AND es.is_active
    JOIN statuses status ON status.status_id=es.status_id AND status.is_active AND status.status_code='ACTIVE'
    WHERE s.organization_id=p_org AND NOT s.is_deleted
      AND customer_fulfillment_subscription_owned(p_org,p_subscription,p_actor);
$body$;


-- Customer payment routing is independent of the Store's catalog source.
CREATE FUNCTION "${schemaName}".fulfillment_collect_route(p_org varchar,p_store varchar)
RETURNS TABLE(integration_id varchar,config_id varchar,currency varchar)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    WITH route AS MATERIALIZED (
        SELECT r.provider_code,r.integration_configuration_id
        FROM commerce_payment_provider_routes r
        WHERE r.organization_id=p_org AND r.source_channel='CUSTOMER' AND NOT r.is_deleted AND r.is_enabled
          AND (r.store_id=p_store OR r.store_id IS NULL)
        ORDER BY (r.store_id IS NULL),r.commerce_payment_provider_route_id LIMIT 1
    ), config AS MATERIALIZED (
        SELECT pc.payment_provider_config_id,pc.is_enabled FROM payment_provider_configs pc
        WHERE pc.provider_code='POYNT_COLLECT' AND (pc.organization_id=p_org OR pc.organization_id IS NULL)
        ORDER BY (pc.organization_id IS NULL) LIMIT 1
    )
    SELECT c.integration_configuration_id,pc.payment_provider_config_id,c.merchant_currency_code
    FROM route r JOIN integration_configurations i ON i.integration_configuration_id=r.integration_configuration_id
      AND i.organization_id=p_org AND upper(i.provider)='POYNT' AND NOT i.is_deleted
    JOIN entity_status es ON es.entity_status_id=i.integration_status_id AND es.is_active
    JOIN statuses st ON st.status_id=es.status_id AND st.status_code='ACTIVE' AND st.is_active
    JOIN commerce_provider_catalog_configurations c ON c.integration_configuration_id=i.integration_configuration_id
      AND c.organization_id=p_org AND NOT c.is_deleted AND c.connection_status='VERIFIED'
      AND nullif(btrim(c.application_id),'') IS NOT NULL AND nullif(btrim(c.provider_business_id),'') IS NOT NULL
      AND nullif(btrim(c.provider_store_id),'') IS NOT NULL AND nullif(btrim(c.credential_secret_reference),'') IS NOT NULL
    CROSS JOIN config pc
    WHERE r.provider_code='POYNT' AND pc.is_enabled
      AND EXISTS (SELECT 1 FROM currencies money WHERE money.currency_code=c.merchant_currency_code
                  AND money.decimal_places=2);
$fn$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_collect_route(varchar,varchar) FROM PUBLIC,"${appRole}";

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_stores(
    p_org varchar,p_subscription varchar,p_benefits varchar[],p_offers varchar[],p_actor varchar,p_advance boolean,p_test boolean,p_collect boolean
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH items AS MATERIALIZED (
        SELECT 'BENEFIT'::varchar AS kind,id FROM unnest(p_benefits) id
        UNION ALL SELECT 'OFFER'::varchar,id FROM unnest(p_offers) id
    ), candidates AS MATERIALIZED (
        SELECT s.*,source.provider_code,source.integration_id,source.catalog_id,
            (source.provider_code<>'MEMGINE' AND source.integration_id=route.integration_configuration_id
                AND (route.provider_code<>'TEST' OR p_test)
                AND s.policy #> '{journeys,IMMEDIATE_PAY_AT_COUNTER}'='true') AS immediate,
            (p_advance AND (route.provider_code<>'TEST' OR p_test)
                AND s.policy #> '{journeys,ADVANCE_PAY_AT_COUNTER}'='true') AS advance,
            CASE WHEN p_advance AND p_collect AND s.policy #> '{journeys,ADVANCE_PAY_NOW}'='true'
                 THEN collect.currency END AS collect_currency
        FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s
        CROSS JOIN LATERAL fulfillment_store_pricing_source(p_org,s.store_id) source
        LEFT JOIN LATERAL fulfillment_counter_quote_route(p_org,s.store_id) route ON true
        LEFT JOIN LATERAL fulfillment_collect_route(p_org,s.store_id) collect ON p_advance AND p_collect
        WHERE s.policy @> '{"enabled":true}'
          AND EXISTS (SELECT 1 FROM items)
          AND NOT EXISTS (
            SELECT 1 FROM items i WHERE (CASE WHEN i.kind='BENEFIT'
              THEN counter_benefit_rejection(p_org,p_subscription,i.id,s.store_id)
              ELSE counter_offer_rejection(p_org,p_subscription,i.id,s.store_id) END) IS NOT NULL
          )
    ), products AS MATERIALIZED (
        SELECT i.kind,i.id,p.product_id,adjustment.currency_code
        FROM items i CROSS JOIN LATERAL fulfillment_redemption_item_products(p_org,i.kind,i.id) p
        CROSS JOIN LATERAL fulfillment_redemption_item_adjustment(p_org,i.kind,i.id) adjustment
    ), available AS (
        SELECT c.store_id,p.kind,p.id,price.product_id,price.product_name,price.product_code,
               price.currency=c.collect_currency AS can_pay_now
        FROM candidates c
        CROSS JOIN LATERAL fulfillment_store_product_prices(p_org,c.store_id,c.provider_code,c.integration_id,c.catalog_id,
            ARRAY(SELECT DISTINCT product_id FROM products)) price
        JOIN products p ON p.product_id=price.product_id
        WHERE (c.immediate OR c.advance OR price.currency=c.collect_currency)
          AND (p.currency_code IS NULL OR p.currency_code=price.currency)
    ), choices AS (
        SELECT a.store_id,a.kind,a.id,jsonb_agg(product ORDER BY a.product_name,a.product_id) AS options,
            jsonb_agg(product ORDER BY a.product_name,a.product_id) FILTER (WHERE a.can_pay_now) AS pay_now_options
        FROM available a CROSS JOIN LATERAL (SELECT jsonb_build_object(
            'productId',a.product_id,'productName',a.product_name,'productCode',a.product_code) AS product) v
        GROUP BY a.store_id,a.kind,a.id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',c.store_id,'name',c.store_name,
        'journeys',(CASE WHEN c.immediate
                        THEN '["IMMEDIATE_PAY_AT_COUNTER"]'::jsonb ELSE '[]'::jsonb END) ||
                   (CASE WHEN c.advance
                        THEN '["ADVANCE_PAY_AT_COUNTER"]'::jsonb ELSE '[]'::jsonb END) ||
                   (CASE WHEN p.collect_count=p.count
                        THEN '["ADVANCE_PAY_NOW"]'::jsonb ELSE '[]'::jsonb END),
        'products',p.options,'payNowProducts',p.pay_now_options
    ) ORDER BY c.store_name,c.store_id),'[]')::text
    FROM candidates c CROSS JOIN LATERAL (
        SELECT count(*) AS count,count(ch.pay_now_options) AS collect_count,
            jsonb_object_agg(ch.kind||':'||ch.id,ch.options) AS options,
            jsonb_object_agg(ch.kind||':'||ch.id,ch.pay_now_options) FILTER (WHERE ch.pay_now_options IS NOT NULL) AS pay_now_options
        FROM choices ch WHERE ch.store_id=c.store_id
    ) p WHERE p.count=(SELECT count(*) FROM items) AND (c.immediate OR c.advance OR p.collect_count=p.count);
$body$;

CREATE FUNCTION "${schemaName}".create_store_customer_redemption(
    p_org varchar,p_store varchar,p_subscription varchar,p_benefits varchar[],p_offers varchar[],
    p_products jsonb,p_actor varchar,p_test boolean
) RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"expiresAt" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE created record; options jsonb;
BEGIN
    SELECT s->'products' INTO options
    FROM jsonb_array_elements(get_customer_fulfillment_stores(p_org,p_subscription,p_benefits,p_offers,p_actor,false,p_test,false)::jsonb) s
    WHERE s->>'id'=p_store;
    IF options IS NULL OR jsonb_typeof(p_products) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Selected Store is no longer eligible' USING ERRCODE='22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_each(options) item
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(item.value) product
        WHERE product->>'productId'=p_products->>item.key
      )
    ) THEN RAISE EXCEPTION 'Selected product is not available at this Store' USING ERRCODE='22023'; END IF;
    SELECT * INTO STRICT created FROM create_customer_redemption_transaction_with_products(
        p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_QR',p_products,p_actor);
    UPDATE redemption_transaction SET store_id=p_store WHERE redemption_transaction_id=created."transactionId";
    RETURN QUERY SELECT created."transactionId"::varchar,created."transactionNumber"::varchar,created.status::varchar,created."expiresAt"::text;
END;
$body$;

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_quote_context(
    p_org varchar,p_store varchar,p_subscription varchar,p_actor varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT jsonb_build_object('storeName',s.store_name,'timezone',s.timezone,'policy',s.policy,'counterPaymentProvider',route.provider_code,
        'collectCurrency',collect.currency)::text
    FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s
    LEFT JOIN LATERAL fulfillment_counter_quote_route(p_org,s.store_id) route ON true
    LEFT JOIN LATERAL fulfillment_collect_route(p_org,s.store_id) collect ON true
    WHERE s.store_id=p_store AND s.policy @> '{"enabled":true}';
$body$;

CREATE FUNCTION "${schemaName}".quote_customer_fulfillment_redemption(
    p_org varchar,p_store varchar,p_subscription varchar,p_benefits varchar[],p_offers varchar[],
    p_products jsonb,p_actor varchar
) RETURNS TABLE (
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
BEGIN
    IF get_customer_fulfillment_quote_context(p_org,p_store,p_subscription,p_actor) IS NULL THEN
        RAISE EXCEPTION 'Store or subscription is unavailable' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT * FROM fulfillment_redemption_quote_rows(p_org,p_store,p_subscription,p_benefits,p_offers,p_products);
END;
$body$;

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_quote_catalog(
    p_org varchar,p_store varchar,p_subscription varchar,p_actor varchar,p_integration varchar
) RETURNS TABLE("integrationConfigurationId" varchar, "organizationId" varchar, "applicationId" varchar,
              "businessId" varchar, "providerStoreId" varchar, "secretReference" varchar,
              "merchantCurrencyCode" varchar, "storeId" varchar, "lastFullSyncAt" text, "lastIncrementalSyncAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT c.* FROM fulfillment_quote_poynt_catalog(p_org,p_store,p_integration) c
    WHERE get_customer_fulfillment_quote_context(p_org,p_store,p_subscription,p_actor) IS NOT NULL;
$body$;

REVOKE ALL ON FUNCTION
    "${schemaName}".customer_fulfillment_subscription_owned(varchar,varchar,varchar),
    "${schemaName}".customer_fulfillment_store_context(varchar,varchar,varchar)
FROM PUBLIC,"${appRole}";
REVOKE ALL ON FUNCTION
    "${schemaName}".get_customer_fulfillment_stores(varchar,varchar,varchar[],varchar[],varchar,boolean,boolean,boolean),
    "${schemaName}".create_store_customer_redemption(varchar,varchar,varchar,varchar[],varchar[],jsonb,varchar,boolean),
    "${schemaName}".get_customer_fulfillment_quote_context(varchar,varchar,varchar,varchar),
    "${schemaName}".quote_customer_fulfillment_redemption(varchar,varchar,varchar,varchar[],varchar[],jsonb,varchar),
    "${schemaName}".get_customer_fulfillment_quote_catalog(varchar,varchar,varchar,varchar,varchar)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_customer_fulfillment_stores(varchar,varchar,varchar[],varchar[],varchar,boolean,boolean,boolean),
    "${schemaName}".create_store_customer_redemption(varchar,varchar,varchar,varchar[],varchar[],jsonb,varchar,boolean),
    "${schemaName}".get_customer_fulfillment_quote_context(varchar,varchar,varchar,varchar),
    "${schemaName}".quote_customer_fulfillment_redemption(varchar,varchar,varchar,varchar[],varchar[],jsonb,varchar),
    "${schemaName}".get_customer_fulfillment_quote_catalog(varchar,varchar,varchar,varchar,varchar)
TO "${appRole}";

-- Advance redemption holds remain outside all existing PENDING QR and Counter paths.
ALTER TABLE "${schemaName}".redemption_transaction DROP CONSTRAINT ck_redemption_transaction_status;
ALTER TABLE "${schemaName}".redemption_transaction ADD CONSTRAINT ck_redemption_transaction_status
    CHECK (status IN ('PENDING','RESERVED','SUCCESS','FAILED','EXPIRED','CANCELLED'));

ALTER TABLE "${schemaName}".commerce_transaction_lines DROP CONSTRAINT ck_commerce_transaction_lines_price_source;
ALTER TABLE "${schemaName}".commerce_transaction_lines ADD CONSTRAINT ck_commerce_transaction_lines_price_source
    CHECK (price_source IN ('UNRESOLVED','EXTERNAL_SNAPSHOT','MEMGINE_MEMBERSHIP','PROVIDER_FINAL','MEMGINE_PRODUCT'));

ALTER TABLE "${schemaName}".payment_intents
    ALTER COLUMN membership_plan_id DROP NOT NULL,
    ADD COLUMN fulfillment_checkout jsonb,
    ADD CONSTRAINT ck_payment_intent_fulfillment_purpose CHECK (
        (membership_plan_id IS NOT NULL AND fulfillment_checkout IS NULL) OR
        (membership_plan_id IS NULL AND fulfillment_checkout IS NOT NULL AND jsonb_typeof(fulfillment_checkout)='object'
          AND commerce_transaction_id IS NOT NULL AND store_id IS NOT NULL AND customer_user_id IS NOT NULL
          AND finalized_subscription_id IS NULL AND authorization_mode='CUSTOMER_SESSION' AND amount>0)
    );
CREATE UNIQUE INDEX uq_fulfillment_payment_commerce ON "${schemaName}".payment_intents(commerce_transaction_id)
    WHERE fulfillment_checkout IS NOT NULL;

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_replay(
    p_org varchar,p_actor varchar,p_key varchar,p_hash varchar
) RETURNS varchar LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE existing record;
BEGIN
    SELECT f.fulfillment_id,f.effective_policy_snapshot->>'requestHash' AS request_hash INTO existing
    FROM commerce_transactions c JOIN fulfillments f ON f.commerce_transaction_id=c.commerce_transaction_id
      AND f.organization_id=c.organization_id AND f.customer_user_id=c.customer_user_id
    WHERE c.organization_id=p_org AND c.customer_user_id=p_actor AND c.idempotency_key=p_key
      AND c.source_channel='CUSTOMER_FULFILLMENT' AND NOT c.is_deleted;
    IF FOUND AND existing.request_hash IS DISTINCT FROM p_hash THEN
        RAISE EXCEPTION 'This order request key has already been used' USING ERRCODE='23505';
    END IF;
    RETURN existing.fulfillment_id;
END;
$body$;

CREATE FUNCTION "${schemaName}".accept_customer_fulfillment(
    p_org varchar,p_store varchar,p_subscription varchar,p_actor varchar,p_key varchar,p_hash varchar,
    p_benefits varchar[],p_offers varchar[],p_products jsonb,p_quote jsonb,
    p_expected_completion timestamptz,p_expected_collection timestamptz,p_intent varchar DEFAULT NULL
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
    replay varchar; organization_user_key varchar; policy jsonb; shop record; created record;
    f_id varchar; commerce_id varchar; line_id varchar; row_data record; money_line jsonb;
    line_evidence jsonb := '[]'; line_workflow varchar; workflow varchar := 'NONE';
    item_count integer := 0; inserted_item_count integer := 0; integration_id varchar; placed varchar; source_type varchar; now_utc timestamp;
    local_pricing boolean; payment_provider varchar; payment_integration varchar;
    payment_timing varchar; pay_now boolean; collect record; payment payment_intents%ROWTYPE;
    quote_total bigint := (p_quote->>'totalMinor')::bigint; quote_currency varchar := p_quote->>'currencyCode';
    checkout jsonb;
BEGIN
    -- Serialize retries by organization and request key, and reservation decisions by subscription.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org||':'||p_key,308));
    replay := get_customer_fulfillment_replay(p_org,p_actor,p_key,p_hash);
    IF replay IS NOT NULL THEN RETURN replay; END IF;
    pay_now := coalesce(p_quote->>'journey'='ADVANCE_PAY_NOW',false);
    payment_timing := CASE WHEN pay_now THEN 'PAY_NOW' ELSE 'PAY_AT_COUNTER' END;
    IF quote_total IS NULL OR quote_total<0 OR quote_currency IS NULL THEN
        RAISE EXCEPTION 'Authoritative quote totals are unavailable' USING ERRCODE='22023';
    END IF;
    SELECT s.organization_user_id INTO organization_user_key
    FROM subscriptions s JOIN organization_user u USING (organization_user_id)
    WHERE s.subscription_id=p_subscription AND u.organization_id=p_org AND u.user_id=p_actor
      AND NOT s.is_deleted AND NOT u.is_deleted FOR UPDATE OF s;
    IF NOT FOUND OR NOT customer_has_active_relationship(p_org,p_actor) THEN
        RAISE EXCEPTION 'Subscription is unavailable' USING ERRCODE='42501';
    END IF;
    IF p_intent IS NULL AND pay_now THEN
        SELECT i.* INTO payment FROM payment_intents i
        WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND i.idempotency_key=p_key
          AND i.fulfillment_checkout IS NOT NULL;
        IF FOUND THEN
            IF payment.fulfillment_checkout->>'requestHash' IS DISTINCT FROM p_hash THEN
                RAISE EXCEPTION 'This request key has already been used' USING ERRCODE='23505';
            END IF;
            RETURN payment.payment_intent_id;
        END IF;
    END IF;
    IF p_intent IS NULL AND EXISTS (
        SELECT 1 FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
        WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND c.subscription_id=p_subscription
          AND i.fulfillment_checkout IS NOT NULL AND i.status='PROCESSING' AND i.idempotency_key<>p_key
    ) THEN RAISE EXCEPTION 'An existing checkout requires payment confirmation' USING ERRCODE='23505'; END IF;
    SELECT * INTO shop FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s WHERE s.store_id=p_store;
    policy := shop.policy;
    IF NOT coalesce(policy @> '{"enabled":true}' AND policy->'journeys'->(
        CASE WHEN pay_now THEN 'ADVANCE_PAY_NOW' ELSE 'ADVANCE_PAY_AT_COUNTER' END)='true',false) THEN
        RAISE EXCEPTION 'Advance fulfillment is unavailable at this Store' USING ERRCODE='22023';
    END IF;
    IF policy IS DISTINCT FROM p_quote->'policy' OR shop.timezone IS DISTINCT FROM p_quote->>'timezone' THEN
        RAISE EXCEPTION 'Collection policy changed. Review the updated quote.' USING ERRCODE='23505';
    END IF;
    IF pay_now THEN
        IF p_intent IS NULL THEN
            SELECT * INTO collect FROM fulfillment_collect_route(p_org,p_store) r WHERE r.currency=quote_currency;
            IF NOT FOUND THEN RAISE EXCEPTION 'Customer payment is unavailable at this Store' USING ERRCODE='22023'; END IF;
            payment_integration := collect.integration_id;
        ELSE
            SELECT i.* INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
            JOIN poynt_collect_verified_captures capture ON capture.payment_intent_id=i.payment_intent_id
              AND capture.organization_id=i.organization_id AND capture.provider_transaction_id=i.provider_reference_id
              AND capture.amount_minor=quote_total AND capture.currency_code=quote_currency
              AND capture.merchant_business_id IS NOT NULL AND capture.merchant_store_id IS NOT NULL
            WHERE i.payment_intent_id=p_intent AND i.organization_id=p_org AND i.customer_user_id=p_actor
              AND i.store_id=p_store AND i.status='PROCESSING' AND i.fulfillment_checkout IS NOT NULL
              AND i.amount*100=quote_total AND i.currency_code=quote_currency
              AND i.fulfillment_checkout->'quote'=p_quote
              AND i.fulfillment_checkout->'products'=p_products
              AND i.fulfillment_checkout->'benefits'=to_jsonb(p_benefits)
              AND i.fulfillment_checkout->'offers'=to_jsonb(p_offers)
              AND (i.fulfillment_checkout->>'expectedCompletion')::timestamptz=p_expected_completion
              AND (i.fulfillment_checkout->>'expectedCollection')::timestamptz=p_expected_collection
              AND c.organization_id=p_org AND c.customer_user_id=p_actor AND c.store_id=p_store
              AND c.subscription_id=p_subscription AND c.source_channel='CUSTOMER_FULFILLMENT'
              AND c.status='DRAFT' AND c.idempotency_key=p_key AND NOT c.is_deleted FOR UPDATE OF i;
            IF NOT FOUND THEN RAISE EXCEPTION 'Verified fulfillment capture is unavailable' USING ERRCODE='23505'; END IF;
            IF EXISTS (SELECT 1 FROM payment_refunds r WHERE r.payment_intent_id=p_intent AND r.approval_status<>'REJECTED') THEN
                RAISE EXCEPTION 'Captured fulfillment payment has a refund under review' USING ERRCODE='23505';
            END IF;
            payment_integration := payment.collect_integration_configuration_id;
        END IF;
        payment_provider := 'POYNT_COLLECT';
    ELSE
        SELECT route.provider_code,route.integration_configuration_id INTO payment_provider,payment_integration
        FROM fulfillment_counter_quote_route(p_org,p_store) route;
        IF p_intent IS NOT NULL OR payment_provider IS NULL OR payment_provider IS DISTINCT FROM p_quote->>'counterPaymentProvider' THEN
            RAISE EXCEPTION 'Counter payment route changed. Review the updated quote.' USING ERRCODE='23505';
        END IF;
    END IF;
    IF p_expected_completion IS NULL OR p_expected_collection IS NULL OR p_expected_collection<p_expected_completion
       OR p_expected_collection<transaction_timestamp() THEN
        RAISE EXCEPTION 'Collection time is no longer available' USING ERRCODE='22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM redemption_entitlement_reservations r
        JOIN statuses rs ON rs.status_id=r.reservation_status_id AND rs.status_code='RESERVED'
        JOIN redemption_transaction_item i USING (redemption_transaction_item_id)
        JOIN redemption_transaction t USING (redemption_transaction_id)
        WHERE t.organization_id=p_org AND t.subscription_id=p_subscription
          AND (i.benefit_id=ANY(p_benefits) OR i.offer_id=ANY(p_offers))
          AND r.reserved_quantity>r.consumed_quantity+r.released_quantity
    ) THEN RAISE EXCEPTION 'An existing order already reserves a selected item' USING ERRCODE='23505'; END IF;

    now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    SELECT status_id INTO STRICT placed FROM statuses WHERE status_code='PLACED';
    f_id := generate_runtime_id('FUL');
    commerce_id := coalesce(payment.commerce_transaction_id,generate_runtime_id('CTX'));
    local_pricing := p_quote->>'providerCode' = 'MEMGINE';

    FOR row_data IN SELECT * FROM fulfillment_redemption_quote_rows(p_org,p_store,p_subscription,p_benefits,p_offers,p_products) LOOP
        item_count := item_count+1;
        SELECT element INTO STRICT money_line FROM jsonb_array_elements(p_quote->'lines') element
        WHERE element->>'itemType'=row_data."itemType" AND element->>'itemId'=row_data."itemId";
        IF money_line->>'mappingId' IS DISTINCT FROM row_data."commerceProductMappingId"
           OR (money_line->>'mappingVersion')::integer IS DISTINCT FROM row_data."mappingVersionNo"
           OR money_line->>'adjustmentId' IS DISTINCT FROM row_data."commerceAdjustmentId"
           OR (money_line->>'adjustmentVersion')::integer IS DISTINCT FROM row_data."adjustmentVersionNo"
           OR p_quote->>'providerCode' IS DISTINCT FROM row_data."providerCode"
           OR p_quote->>'integrationId' IS DISTINCT FROM row_data."integrationConfigurationId"
           OR (local_pricing AND ((money_line->>'unitPriceMinor')::bigint IS DISTINCT FROM row_data."snapshotUnitPriceMinor"
               OR p_quote->>'currencyCode' IS DISTINCT FROM row_data."snapshotCurrencyCode")) THEN
            RAISE EXCEPTION 'Prices changed. Review the updated quote.' USING ERRCODE='23505';
        END IF;
        integration_id := row_data."integrationConfigurationId";
        line_workflow := fulfillment_resolve_product_workflow(p_org,p_store,row_data."canonicalProductId",row_data."commerceProductMappingId");
        IF line_workflow='DETAILED' OR (line_workflow='SIMPLE' AND workflow='NONE') THEN workflow := line_workflow; END IF;
        line_evidence := line_evidence || jsonb_build_array(money_line || jsonb_build_object(
            'productId',row_data."canonicalProductId",'workflow',line_workflow,
            'externalProductId',row_data."externalProductId",'externalVariantId',row_data."externalVariantId",
            'catalogId',(SELECT m.external_catalog_id FROM commerce_product_mappings m WHERE m.commerce_product_mapping_id=row_data."commerceProductMappingId"),
            'categoryIds',(SELECT coalesce(jsonb_agg(c.target_id ORDER BY c.target_id),'[]') FROM
                fulfillment_store_product_pos_categories(p_org,p_store,row_data."canonicalProductId",row_data."commerceProductMappingId") c),
            'canonicalCategoryId',(SELECT p.product_catalog_category_id FROM product p WHERE p.product_id=row_data."canonicalProductId"),
            'adjustmentType',row_data."adjustmentType",'percentage',row_data.percentage,'amountMinor',row_data."amountMinor",
            'snapshotPriceMinor',row_data."snapshotUnitPriceMinor"));
    END LOOP;
    IF item_count=0 OR item_count<>jsonb_array_length(p_quote->'lines') THEN
        RAISE EXCEPTION 'Prices changed. Review the updated quote.' USING ERRCODE='23505';
    END IF;
    IF p_intent IS NULL THEN
        IF pay_now AND quote_total>0 THEN
            -- The subscription lock serializes checkout initiation across request keys.
            SELECT i.* INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
            WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND c.subscription_id=p_subscription
              AND c.organization_id=p_org AND i.fulfillment_checkout IS NOT NULL
              AND i.status IN ('PENDING','PROCESSING') AND NOT c.is_deleted;
            IF FOUND THEN
                IF payment.fulfillment_checkout->>'requestHash'=p_hash THEN RETURN payment.payment_intent_id; END IF;
                RAISE EXCEPTION 'Resume or cancel the existing checkout before starting a new one' USING ERRCODE='23505';
            END IF;
        END IF;
        INSERT INTO commerce_transactions(
        commerce_transaction_id,organization_id,store_id,customer_user_id,subscription_id,integration_configuration_id,
        source_channel,status,currency_code,subtotal_minor,adjustment_total_minor,tax_total_minor,total_minor,idempotency_key,created_by,updated_by
    ) VALUES (
        commerce_id,p_org,p_store,p_actor,p_subscription,integration_id,'CUSTOMER_FULFILLMENT',
        CASE WHEN pay_now AND quote_total>0 THEN 'DRAFT' ELSE 'ORDER_CREATED' END,
        p_quote->>'currencyCode',(p_quote->>'subtotalMinor')::bigint,(p_quote->>'adjustmentTotalMinor')::bigint,
        (p_quote->>'taxTotalMinor')::bigint,(p_quote->>'totalMinor')::bigint,p_key,organization_user_key,organization_user_key
        );
    ELSE
        UPDATE commerce_transactions SET status='PROVIDER_SUCCEEDED',provider_transaction_id=payment.provider_reference_id,
            updated_at=CURRENT_TIMESTAMP,updated_by=organization_user_key,version_no=version_no+1
        WHERE commerce_transaction_id=commerce_id AND currency_code=quote_currency AND total_minor=quote_total;
        IF NOT FOUND THEN RAISE EXCEPTION 'Commerce totals conflict with captured payment' USING ERRCODE='23505'; END IF;
    END IF;
    IF pay_now AND quote_total>0 AND p_intent IS NULL THEN
        checkout := jsonb_build_object('requestHash',p_hash,'quote',p_quote,
            'benefits',to_jsonb(p_benefits),'offers',to_jsonb(p_offers),'products',p_products,
            'expectedCompletion',p_expected_completion,'expectedCollection',p_expected_collection,
            'paymentBusinessId',(SELECT c.provider_business_id FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=payment_integration),
            'paymentStoreId',(SELECT c.provider_store_id FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=payment_integration));
        payment.payment_intent_id := generate_runtime_id('PAY');
        INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,authorization_mode,
            customer_user_id,store_id,amount,currency_code,idempotency_key,created_by,updated_by,
            commerce_transaction_id,collect_integration_configuration_id,fulfillment_checkout)
        VALUES (payment.payment_intent_id,p_org,collect.config_id,'CUSTOMER_SESSION',p_actor,p_store,quote_total::numeric/100,
            quote_currency,p_key,p_actor,p_actor,commerce_id,payment_integration,checkout);
        INSERT INTO payment_attempts(payment_attempt_id,payment_intent_id,amount,currency_code,idempotency_key)
        VALUES (generate_runtime_id('PAT'),payment.payment_intent_id,quote_total::numeric/100,quote_currency,p_key);
        RETURN payment.payment_intent_id;
    END IF;
    IF local_pricing THEN
        SELECT * INTO STRICT created FROM create_customer_redemption_transaction(
            p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_FULFILLMENT',p_actor);
        UPDATE redemption_transaction_item item SET selected_product_id=evidence->>'productId',updated_at=now_utc,updated_by=p_actor
        FROM jsonb_array_elements(line_evidence) evidence
        WHERE item.redemption_transaction_id=created."transactionId" AND item.item_type=evidence->>'itemType'
          AND coalesce(item.benefit_id,item.offer_id)=evidence->>'itemId';
    ELSE
        SELECT * INTO STRICT created FROM create_customer_redemption_transaction_with_products(
            p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_FULFILLMENT',p_products,p_actor);
    END IF;
    UPDATE redemption_transaction SET status='RESERVED',store_id=p_store,expires_at=NULL,updated_at=now_utc
    WHERE redemption_transaction_id=created."transactionId";
    FOR money_line IN SELECT value FROM jsonb_array_elements(line_evidence) LOOP
        line_id := generate_runtime_id('CTL');
        source_type := money_line->>'itemType';
        INSERT INTO commerce_transaction_lines(
            commerce_transaction_line_id,commerce_transaction_id,line_type,source_entity_type,source_entity_id,
            commerce_product_mapping_id,external_product_id,external_variant_id,description,quantity,
            unit_price_minor_snapshot,unit_price_minor_authoritative,line_subtotal_minor,currency_code,price_source,metadata_json,created_by,updated_by
        ) VALUES (
            line_id,commerce_id,CASE WHEN local_pricing THEN 'CUSTOM_ITEM' ELSE 'EXTERNAL_PRODUCT' END,
            source_type,money_line->>'itemId',money_line->>'mappingId',
            money_line->>'externalProductId',money_line->>'externalVariantId',money_line->>'productName',1,
            (money_line->>'snapshotPriceMinor')::bigint,(money_line->>'unitPriceMinor')::bigint,
            (money_line->>'subtotalMinor')::bigint,p_quote->>'currencyCode',
            CASE WHEN local_pricing THEN 'MEMGINE_PRODUCT' ELSE 'PROVIDER_FINAL' END,
            jsonb_build_object('canonicalProductId',money_line->>'productId'),organization_user_key,organization_user_key
        );
        INSERT INTO commerce_transaction_adjustments(
            commerce_transaction_adjustment_id,commerce_transaction_id,target_line_id,commerce_adjustment_id,
            source_type,source_id,adjustment_type,percentage,requested_amount_minor,applied_amount_minor,currency_code,
            status,created_by,updated_by
        ) VALUES (
            generate_runtime_id('CTA'),commerce_id,line_id,money_line->>'adjustmentId',source_type,money_line->>'itemId',
            money_line->>'adjustmentType',(money_line->>'percentage')::numeric,(money_line->>'amountMinor')::bigint,
            NULL,p_quote->>'currencyCode','REQUESTED',organization_user_key,organization_user_key
        );
    END LOOP;
    INSERT INTO commerce_transaction_redemptions(
        commerce_transaction_redemption_id,commerce_transaction_id,redemption_transaction_id,created_by,updated_by
    ) VALUES (generate_runtime_id('CTR'),commerce_id,created."transactionId",organization_user_key,organization_user_key);
    INSERT INTO fulfillments (
        fulfillment_id,organization_id,store_id,customer_user_id,redemption_transaction_id,commerce_transaction_id,fulfillment_number,
        request_channel_status_id,request_timing_status_id,payment_timing_status_id,fulfillment_type_status_id,
        workflow_mode_status_id,fulfillment_status_id,effective_policy_snapshot,
        original_expected_completion_at,expected_completion_at,original_expected_collection_at,expected_collection_at,created_by,updated_by
    )
    SELECT f_id,p_org,p_store,p_actor,created."transactionId",commerce_id,created."transactionNumber",
        (SELECT status_id FROM statuses WHERE status_code='CUSTOMER_APP'),(SELECT status_id FROM statuses WHERE status_code='ADVANCE'),
        (SELECT status_id FROM statuses WHERE status_code=payment_timing),(SELECT status_id FROM statuses WHERE status_code='ORDER'),
        (SELECT status_id FROM statuses WHERE status_code=workflow),placed,
        policy || jsonb_build_object('collectionTimeZone',shop.timezone,'requestHash',p_hash,'lines',line_evidence,
                                    'pricingSource',p_quote->>'providerCode','counterPaymentProvider',payment_provider,
                                    'counterPaymentIntegrationId',payment_integration),
        p_expected_completion AT TIME ZONE 'UTC',p_expected_completion AT TIME ZONE 'UTC',
        p_expected_collection AT TIME ZONE 'UTC',p_expected_collection AT TIME ZONE 'UTC',p_actor,p_actor;
    -- Persist the per-line operational obligations introduced by 307A/307B.
    -- Link exact Commerce and redemption lines; never infer product/category from a name.
    INSERT INTO fulfillment_items(
        fulfillment_item_id,fulfillment_id,line_reference,product_id,product_catalog_category_id,
        redemption_transaction_item_id,product_name_snapshot,quantity,workflow_code_snapshot,
        commerce_product_mapping_id,external_categories_snapshot,policy_snapshot,created_by,updated_by
    )
    SELECT generate_runtime_id('FUI'),f_id,l.commerce_transaction_line_id,p.product_id,p.product_catalog_category_id,
        item.redemption_transaction_item_id,left(l.description,200),l.quantity,
        (evidence.value->>'workflow')::varchar,l.commerce_product_mapping_id,
        CASE WHEN local_pricing THEN NULL ELSE (
            SELECT jsonb_agg(DISTINCT cat.external_category_id ORDER BY cat.external_category_id)
            FROM fulfillment_store_product_pos_categories(
                p_org,p_store,p.product_id,l.commerce_product_mapping_id) cat
        ) END,
        jsonb_build_object('pricingSource',p_quote->>'providerCode',
            'integrationConfigurationId',p_quote->>'integrationId',
            'externalCatalogId',evidence.value->>'catalogId',
            'externalCategoryKeys',evidence.value->'categoryIds',
            'workflow',evidence.value->>'workflow'),
        p_actor,p_actor
    FROM commerce_transaction_lines l
    JOIN redemption_transaction_item item
      ON item.redemption_transaction_id=created."transactionId"
     AND item.item_type=l.source_entity_type AND coalesce(item.benefit_id,item.offer_id)=l.source_entity_id
    JOIN product p ON p.product_id=(l.metadata_json->>'canonicalProductId')
      AND p.organization_id=p_org AND NOT p.is_deleted
    JOIN LATERAL jsonb_array_elements(line_evidence) evidence(value)
      ON evidence.value->>'itemType'=l.source_entity_type
     AND evidence.value->>'itemId'=l.source_entity_id
     AND evidence.value->>'productId'=p.product_id
    WHERE l.commerce_transaction_id=commerce_id AND NOT l.is_deleted;
    GET DIAGNOSTICS inserted_item_count = ROW_COUNT;
    IF inserted_item_count<>item_count THEN
        RAISE EXCEPTION 'Fulfillment item snapshots are inconsistent' USING ERRCODE='23505';
    END IF;
    INSERT INTO redemption_entitlement_reservations(
        redemption_entitlement_reservation_id,fulfillment_id,redemption_transaction_item_id,reservation_status_id,
        usage_window_key,reserved_quantity,created_by,updated_by
    ) SELECT generate_runtime_id('RES'),f_id,i.redemption_transaction_item_id,s.status_id,
        p_subscription||':'||i.item_type||':'||coalesce(i.benefit_id,i.offer_id),i.quantity,p_actor,p_actor
    FROM redemption_transaction_item i CROSS JOIN statuses s
    WHERE i.redemption_transaction_id=created."transactionId" AND s.status_code='RESERVED';
    INSERT INTO fulfillment_actions (
        fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,new_fulfillment_status_id,created_by
    ) SELECT generate_runtime_id('FAC'),f_id,status_id,p_actor,placed,p_actor FROM statuses WHERE status_code='ACCEPTED';
    IF p_intent IS NOT NULL THEN
        IF NOT payment_record_result(p_intent,NULL,'SUCCEEDED',payment.provider_reference_id,NULL,NULL,p_actor) THEN
            RAISE EXCEPTION 'Could not finalize captured fulfillment payment' USING ERRCODE='23505';
        END IF;
    END IF;
    RETURN f_id;
END;
$body$;

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_orders(
    p_org varchar,p_actor varchar,p_fulfillment varchar,p_subscription varchar,p_limit integer,p_offset integer
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
WITH page AS MATERIALIZED (
    SELECT f.*, s.store_name, st.status_code AS state, w.status_code AS workflow, pt.status_code AS payment_timing,
           t.status_code AS fulfillment_type, rt_kind.status_code AS request_timing,
           c.subscription_id AS commerce_subscription, rt.subscription_id AS redemption_subscription,
           c.status AS commerce_status,c.total_minor,c.currency_code,c.provider_transaction_id,
           rt.status AS redemption_status,r.transaction_receipt_id,
           c.commerce_transaction_id AS owned_commerce_id,rt.redemption_transaction_id AS owned_redemption_id
    FROM fulfillments f
    JOIN stores s ON s.store_id=f.store_id AND s.organization_id=f.organization_id
    JOIN statuses st ON st.status_id=f.fulfillment_status_id
    JOIN statuses w ON w.status_id=f.workflow_mode_status_id
    JOIN statuses pt ON pt.status_id=f.payment_timing_status_id
    JOIN statuses t ON t.status_id=f.fulfillment_type_status_id
    JOIN statuses rt_kind ON rt_kind.status_id=f.request_timing_status_id
    LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id AND c.organization_id=f.organization_id
      AND c.customer_user_id=f.customer_user_id AND c.store_id=f.store_id AND NOT c.is_deleted
    LEFT JOIN redemption_transaction rt ON rt.redemption_transaction_id=f.redemption_transaction_id
      AND rt.organization_id=f.organization_id AND rt.store_id=f.store_id
      AND customer_fulfillment_subscription_owned(f.organization_id,rt.subscription_id,f.customer_user_id)
    LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id=c.commerce_transaction_id
      AND r.organization_id=f.organization_id AND r.customer_user_id=f.customer_user_id
    WHERE f.organization_id=p_org AND f.customer_user_id=p_actor
      AND (p_fulfillment IS NULL OR f.fulfillment_id=p_fulfillment)
      AND (p_subscription IS NULL OR (p_subscription=coalesce(rt.subscription_id,c.subscription_id)
        AND (f.redemption_transaction_id IS NULL OR rt.redemption_transaction_id IS NOT NULL)
        AND (f.commerce_transaction_id IS NULL OR c.commerce_transaction_id IS NOT NULL)
        AND (rt.subscription_id IS NULL OR c.subscription_id IS NULL OR rt.subscription_id=c.subscription_id)
        AND customer_fulfillment_subscription_owned(p_org,p_subscription,p_actor)))
    ORDER BY f.accepted_at DESC,f.fulfillment_id DESC
    LIMIT greatest(1,least(coalesce(p_limit,25),51)) OFFSET greatest(coalesce(p_offset,0),0)
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',f.fulfillment_id,'customerLabel',coalesce(f.effective_policy_snapshot->>'customerLabel','Order'),
    'referenceNumber',f.fulfillment_number,'storeName',f.store_name,'status',f.state,
    'workflow',f.workflow,'fulfillmentType',f.fulfillment_type,'requestTiming',f.request_timing,
    'paymentTiming',f.payment_timing,'commerceId',f.owned_commerce_id,
    'redemptionId',f.owned_redemption_id,'redemptionState',f.redemption_status,'receiptId',f.transaction_receipt_id,
    'acceptedAt',f.accepted_at AT TIME ZONE 'UTC','fulfilledAt',f.fulfilled_at AT TIME ZONE 'UTC',
    'expectedCollectionAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCollection' IS DISTINCT FROM 'false'
      THEN f.expected_collection_at AT TIME ZONE 'UTC' END,
    'collectionWindowEndsAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCollection' IS DISTINCT FROM 'false'
      THEN (f.expected_collection_at + make_interval(mins=>(f.effective_policy_snapshot->>'collectionWindowMinutes')::integer)) AT TIME ZONE 'UTC' END,
    'expectedCompletionAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCompletion' IS DISTINCT FROM 'false'
      THEN f.expected_completion_at AT TIME ZONE 'UTC' END,
    'timezone',coalesce(f.effective_policy_snapshot->>'collectionTimeZone',(SELECT timezone FROM stores WHERE store_id=f.store_id)),'currencyCode',f.currency_code,'totalMinor',f.total_minor,
    'verifiedSavingsMinor',verified.net_savings_minor,
    'paymentState',CASE WHEN f.total_minor=0 THEN 'NO_PAYMENT_REQUIRED'
        WHEN f.transaction_receipt_id IS NOT NULL AND f.commerce_status='COMPLETED' THEN 'PAID'
        WHEN EXISTS (
            SELECT 1 FROM payment_intents i JOIN poynt_collect_verified_captures v USING(payment_intent_id)
            WHERE i.commerce_transaction_id=f.owned_commerce_id AND i.organization_id=f.organization_id
              AND i.customer_user_id=f.customer_user_id AND i.status='SUCCEEDED' AND i.fulfillment_checkout IS NOT NULL
              AND v.organization_id=i.organization_id AND v.provider_transaction_id=f.provider_transaction_id
              AND v.amount_minor=f.total_minor AND v.currency_code=f.currency_code
        ) THEN 'PAID'
        WHEN f.commerce_status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING') AND EXISTS (
            SELECT 1 FROM commerce_provider_payment_attempts a
            WHERE a.commerce_transaction_id=f.owned_commerce_id AND a.provider_status='SUCCEEDED'
            HAVING count(*)=1 AND count(*) FILTER (WHERE a.amount_minor=f.total_minor AND a.currency_code=f.currency_code
              AND a.provider_transaction_id=f.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),'') IS NOT NULL)=1
        ) THEN 'PAYMENT_RECEIVED'
        WHEN f.commerce_status='PROVIDER_IN_PROGRESS' THEN 'PAYMENT_PENDING'
        WHEN f.commerce_status='PROVIDER_FAILED' THEN 'PAYMENT_FAILED'
        WHEN f.commerce_status='CANCELLED' THEN 'PAYMENT_CANCELLED'
        WHEN f.payment_timing='PAY_AT_COUNTER' AND f.commerce_status='ORDER_CREATED' THEN 'UNPAID'
        ELSE 'PAYMENT_UNCONFIRMED' END,
    'refundStates',coalesce((SELECT jsonb_agg(DISTINCT pr.execution_status) FROM payment_refunds pr
        WHERE pr.organization_id=p_org AND f.commerce_status IS NOT NULL AND (
          pr.commerce_transaction_id=f.owned_commerce_id OR EXISTS (
            SELECT 1 FROM payment_intents i WHERE i.payment_intent_id=pr.payment_intent_id
              AND i.commerce_transaction_id=f.owned_commerce_id AND i.customer_user_id=f.customer_user_id
          )
        )),'[]'),
    'lines',CASE WHEN p_fulfillment IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',l.commerce_transaction_line_id,'name',l.description,'quantity',l.quantity,
        'fulfilledQuantity',(SELECT sum(res.consumed_quantity)::integer FROM redemption_entitlement_reservations res
          JOIN redemption_transaction_item item USING (redemption_transaction_item_id)
          WHERE res.fulfillment_id=f.fulfillment_id AND item.redemption_transaction_id=f.redemption_transaction_id
            AND item.item_type=l.source_entity_type AND coalesce(item.benefit_id,item.offer_id)=l.source_entity_id),
        'unitPriceMinor',l.unit_price_minor_authoritative,'discountMinor',coalesce((SELECT sum(a.applied_amount_minor)
            FROM commerce_transaction_adjustments a WHERE a.commerce_transaction_id=l.commerce_transaction_id
              AND a.target_line_id=l.commerce_transaction_line_id AND a.status='APPLIED' AND NOT a.is_deleted),0)
     ) ORDER BY l.created_at,l.commerce_transaction_line_id)
        FROM commerce_transaction_lines l WHERE l.commerce_transaction_id=f.commerce_transaction_id AND NOT l.is_deleted
        AND f.commerce_status IS NOT NULL),'[]') END,
    'timeline',CASE WHEN p_fulfillment IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',a.fulfillment_action_id,'type',action.status_code,'at',a.action_at AT TIME ZONE 'UTC'
    ) ORDER BY a.action_at,a.fulfillment_action_id) FROM fulfillment_actions a JOIN statuses action ON action.status_id=a.action_type_status_id
      WHERE a.fulfillment_id=f.fulfillment_id),'[]') END,
    'version',f.version_no,
    'canRequestCancellation',f.state IN ('PLACED','PREPARING','READY')
        AND f.effective_policy_snapshot @> '{"customerCancellationRequestsEnabled":true}'
        AND (f.expected_collection_at IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')<=f.expected_collection_at
          - make_interval(mins=>coalesce((f.effective_policy_snapshot->>'cancellationCutoffMinutes')::integer,0))),
    'canRequestCollectionChange',f.state IN ('PLACED','PREPARING','READY')
        AND f.effective_policy_snapshot @> '{"customerExtensionRequestsEnabled":true}'
        AND (SELECT ast.status_code FROM fulfillment_actions a JOIN statuses ast ON ast.status_id=a.action_type_status_id
            WHERE a.fulfillment_id=f.fulfillment_id AND ast.status_code IN
              ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED')
            ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1) IS DISTINCT FROM 'COLLECTION_CHANGE_REQUESTED'
) ORDER BY f.accepted_at DESC,f.fulfillment_id DESC),'[]')::text
FROM page f
LEFT JOIN LATERAL get_customer_transaction_actual_savings(p_actor,ARRAY[f.commerce_transaction_id]) verified
    ON p_fulfillment IS NOT NULL AND f.state='FULFILLED' AND verified.verification_state='VERIFIED'
    AND verified.currency_code=f.currency_code;
$body$;

CREATE FUNCTION "${schemaName}".request_customer_fulfillment_change(
    p_org varchar,p_actor varchar,p_order varchar,p_version integer,p_collection timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; details jsonb; action_code varchar; target varchar; action_id varchar;
        zone text; policy jsonb; local_collection timestamp; local_end timestamp; hours jsonb;
BEGIN
    SELECT * INTO f FROM fulfillments WHERE fulfillment_id=p_order AND organization_id=p_org AND customer_user_id=p_actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
    IF f.version_no IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Order status changed' USING ERRCODE='23505'; END IF;
    details := get_customer_fulfillment_orders(p_org,p_actor,p_order,NULL,1,0)::jsonb->0;
    IF p_collection IS NULL THEN
        IF details->'canRequestCancellation' IS DISTINCT FROM 'true'::jsonb THEN
            RAISE EXCEPTION 'Cancellation request is unavailable' USING ERRCODE='22023';
        END IF;
        action_code := 'CANCELLATION_REQUESTED';
        SELECT status_id INTO STRICT target FROM statuses WHERE status_code='CANCEL_REQUESTED';
    ELSE
        IF details->'canRequestCollectionChange' IS DISTINCT FROM 'true'::jsonb
           OR p_collection <= CURRENT_TIMESTAMP
           OR p_collection AT TIME ZONE 'UTC' <= coalesce(f.expected_collection_at,f.accepted_at) THEN
            RAISE EXCEPTION 'Collection change request is unavailable' USING ERRCODE='22023';
        END IF;
        policy := f.effective_policy_snapshot;
        zone := policy->>'collectionTimeZone';
        IF zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name=zone)
           OR p_collection > CURRENT_TIMESTAMP + make_interval(mins=>(policy->>'maximumHorizonMinutes')::integer) THEN
            RAISE EXCEPTION 'Choose an available collection time' USING ERRCODE='22023';
        END IF;
        hours := policy->'collectionHours';
        IF jsonb_typeof(hours)='object' THEN
            local_collection := p_collection AT TIME ZONE zone;
            local_end := (p_collection + make_interval(mins=>(policy->>'collectionWindowMinutes')::integer)) AT TIME ZONE zone;
            IF local_collection::date IS DISTINCT FROM local_end::date OR NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(coalesce(hours -> ((ARRAY['MONDAY','TUESDAY','WEDNESDAY',
                  'THURSDAY','FRIDAY','SATURDAY','SUNDAY'])[extract(isodow FROM local_collection)::integer]),'[]')) h
                WHERE local_collection::time >= (h->>'start')::time AND local_collection::time < (h->>'end')::time
                  AND local_end::time <= (h->>'end')::time
            ) THEN RAISE EXCEPTION 'Choose an available collection time' USING ERRCODE='22023'; END IF;
        END IF;
        action_code := 'COLLECTION_CHANGE_REQUESTED';
        target := f.fulfillment_status_id;
        IF (SELECT st.status_code FROM fulfillment_actions x JOIN statuses st ON st.status_id=x.action_type_status_id
            WHERE x.fulfillment_id=p_order AND st.status_code IN ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED')
            ORDER BY x.action_at DESC,x.fulfillment_action_id DESC LIMIT 1)='COLLECTION_CHANGE_REQUESTED' THEN
            RAISE EXCEPTION 'A collection change request is already pending' USING ERRCODE='23505';
        END IF;
    END IF;
    SELECT status_id INTO STRICT action_id FROM statuses WHERE status_code=action_code;
    UPDATE fulfillments SET fulfillment_status_id=target,updated_by=p_actor,
        updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC',version_no=version_no+1,
        cancellation_requested_at=CASE WHEN p_collection IS NULL THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' ELSE cancellation_requested_at END
    WHERE fulfillment_id=p_order;
    INSERT INTO fulfillment_actions (
        fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,prior_fulfillment_status_id,new_fulfillment_status_id,
        previous_expected_collection_at,proposed_expected_collection_at,created_by
    ) VALUES (
        generate_runtime_id('FAC'),p_order,action_id,p_actor,f.fulfillment_status_id,target,
        f.expected_collection_at,p_collection AT TIME ZONE 'UTC',p_actor
    );
    RETURN true;
END;
$body$;

REVOKE ALL ON FUNCTION
    "${schemaName}".get_customer_fulfillment_replay(varchar,varchar,varchar,varchar),
    "${schemaName}".accept_customer_fulfillment(varchar,varchar,varchar,varchar,varchar,varchar,varchar[],varchar[],jsonb,jsonb,timestamptz,timestamptz,varchar),
    "${schemaName}".get_customer_fulfillment_orders(varchar,varchar,varchar,varchar,integer,integer),
    "${schemaName}".request_customer_fulfillment_change(varchar,varchar,varchar,integer,timestamptz)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_customer_fulfillment_replay(varchar,varchar,varchar,varchar),
    "${schemaName}".accept_customer_fulfillment(varchar,varchar,varchar,varchar,varchar,varchar,varchar[],varchar[],jsonb,jsonb,timestamptz,timestamptz,varchar),
    "${schemaName}".get_customer_fulfillment_orders(varchar,varchar,varchar,varchar,integer,integer),
    "${schemaName}".request_customer_fulfillment_change(varchar,varchar,varchar,integer,timestamptz)
TO "${appRole}";

CREATE FUNCTION "${schemaName}".issue_customer_fulfillment_pickup(
    p_org varchar,p_actor varchar,p_order varchar,p_hash varchar
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; qr_type varchar; now_utc timestamp; expires timestamp;
BEGIN
    SELECT f0.* INTO f FROM fulfillments f0 JOIN statuses st ON st.status_id=f0.fulfillment_status_id
    WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.customer_user_id=p_actor
      AND st.status_code='READY' FOR UPDATE OF f0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pickup credential is unavailable' USING ERRCODE='P0002'; END IF;
    IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid pickup credential' USING ERRCODE='22023';
    END IF;
    SELECT status_id INTO STRICT qr_type FROM statuses WHERE status_code='PICKUP_QR';
    now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    expires := now_utc+interval '5 minutes';
    UPDATE fulfillment_credentials SET revoked_at=now_utc,updated_at=now_utc,updated_by=p_actor,version_no=version_no+1
    WHERE fulfillment_id=p_order AND credential_type_status_id=qr_type AND revoked_at IS NULL AND used_at IS NULL;
    INSERT INTO fulfillment_credentials (
        fulfillment_credential_id,fulfillment_id,credential_type_status_id,token_hash,expires_at,created_by,updated_by
    ) VALUES (generate_runtime_id('FQR'),p_order,qr_type,p_hash,expires,p_actor,p_actor);
    RETURN to_char(expires,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".issue_customer_fulfillment_pickup(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".issue_customer_fulfillment_pickup(varchar,varchar,varchar,varchar) TO "${appRole}";


-- The existing Collect session, claim evidence, and reconciliation use this
-- ownership check. Membership authorization keeps its original source condition.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_actor_is_authorized(p_payment_intent_id varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM payment_intents i WHERE i.payment_intent_id=p_payment_intent_id AND (
          (i.authorization_mode='CUSTOMER_SESSION' AND i.customer_user_id=p_actor_user_id AND (
              i.commerce_transaction_id IS NULL OR EXISTS (
                SELECT 1 FROM commerce_transactions c WHERE c.commerce_transaction_id=i.commerce_transaction_id
                  AND c.organization_id=i.organization_id AND c.customer_user_id=i.customer_user_id AND NOT c.is_deleted
                  AND ((i.fulfillment_checkout IS NULL AND c.source_channel='CUSTOMER_MEMBERSHIP')
                    OR (i.fulfillment_checkout IS NOT NULL AND c.source_channel='CUSTOMER_FULFILLMENT' AND c.store_id=i.store_id))
              )
          )) OR (i.authorization_mode<>'CUSTOMER_SESSION' AND (i.created_by=p_actor_user_id OR i.customer_user_id=p_actor_user_id))
        )
    );
$fn$;

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_payment(
    p_org varchar,p_actor varchar,p_intent varchar,p_key varchar,p_subscription varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
    SELECT jsonb_build_object('paymentIntentId',i.payment_intent_id,'status',i.status,'fulfillmentId',f.fulfillment_id,
        'subscriptionId',c.subscription_id,'requestHash',i.fulfillment_checkout->>'requestHash',
        'customerLabel',coalesce(i.fulfillment_checkout#>>'{quote,policy,customerLabel}','Order'),
        'verifiedCapture',i.status='PROCESSING' AND EXISTS (
          SELECT 1 FROM poynt_collect_verified_captures evidence WHERE evidence.payment_intent_id=i.payment_intent_id
        ),'requiresReconciliation',i.status='PROCESSING' AND EXISTS (
          SELECT 1 FROM poynt_collect_financial_exceptions e WHERE e.payment_intent_id=i.payment_intent_id
            AND e.case_status IN ('OPEN','UNDER_REVIEW')
        ))::text
    FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
    LEFT JOIN fulfillments f ON f.commerce_transaction_id=c.commerce_transaction_id
      AND f.organization_id=i.organization_id AND f.customer_user_id=i.customer_user_id
    WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND i.fulfillment_checkout IS NOT NULL
      AND payment_actor_is_authorized(i.payment_intent_id,p_actor)
      AND (p_intent IS NULL OR i.payment_intent_id=p_intent)
      AND (p_key IS NULL OR i.idempotency_key=p_key)
      AND (p_subscription IS NULL OR c.subscription_id=p_subscription)
      AND (p_intent IS NOT NULL OR p_key IS NOT NULL OR (p_subscription IS NOT NULL AND i.status IN ('PENDING','PROCESSING')))
    ORDER BY i.created_at DESC,i.payment_intent_id DESC LIMIT 1;
$fn$;

CREATE FUNCTION "${schemaName}".claim_customer_fulfillment_collect(
    p_org varchar,p_intent varchar,p_actor varchar,p_business varchar,p_provider_store varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
DECLARE i payment_intents%ROWTYPE; sub_id varchar; route record; draft jsonb; quote jsonb; shop record;
        benefits varchar[]; offers varchar[]; price record; line jsonb; line_count integer := 0;
BEGIN
    SELECT c.subscription_id INTO sub_id FROM payment_intents p JOIN commerce_transactions c USING(commerce_transaction_id)
    WHERE p.payment_intent_id=p_intent AND p.organization_id=p_org AND p.fulfillment_checkout IS NOT NULL
      AND c.status='DRAFT' AND payment_actor_is_authorized(p_intent,p_actor);
    IF NOT FOUND THEN RETURN false; END IF;
    PERFORM 1 FROM subscriptions WHERE subscription_id=sub_id FOR UPDATE;
    SELECT * INTO STRICT i FROM payment_intents WHERE payment_intent_id=p_intent FOR UPDATE;
    IF i.status<>'PENDING' OR i.provider_reference_id IS NOT NULL THEN RETURN false; END IF;
    draft := i.fulfillment_checkout;
    quote := draft->'quote';
    IF draft->>'paymentBusinessId' IS DISTINCT FROM p_business OR draft->>'paymentStoreId' IS DISTINCT FROM p_provider_store THEN
        RAISE EXCEPTION 'Checkout merchant does not match the payment intent' USING ERRCODE='23505';
    END IF;
    IF i.created_at < CURRENT_TIMESTAMP - interval '10 minutes' OR (draft->>'expectedCollection')::timestamptz<=CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Checkout expired. Cancel it and review a new quote.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO shop FROM customer_fulfillment_store_context(p_org,sub_id,p_actor) s WHERE s.store_id=i.store_id;
    IF NOT FOUND OR shop.policy IS DISTINCT FROM quote->'policy' OR shop.timezone IS DISTINCT FROM quote->>'timezone' THEN
        RAISE EXCEPTION 'Store configuration changed. Review a new quote.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO route FROM fulfillment_collect_route(p_org,i.store_id);
    IF NOT FOUND OR route.integration_id IS DISTINCT FROM i.collect_integration_configuration_id
       OR route.config_id IS DISTINCT FROM i.payment_provider_config_id OR route.currency IS DISTINCT FROM i.currency_code
       OR NOT EXISTS (
          SELECT 1 FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=route.integration_id
            AND c.provider_business_id=draft->>'paymentBusinessId' AND c.provider_store_id=draft->>'paymentStoreId'
       ) THEN RAISE EXCEPTION 'Store payment configuration changed' USING ERRCODE='22023'; END IF;
    benefits := ARRAY(SELECT jsonb_array_elements_text(draft->'benefits')::varchar);
    offers := ARRAY(SELECT jsonb_array_elements_text(draft->'offers')::varchar);
    IF EXISTS (
        SELECT 1 FROM redemption_entitlement_reservations r
        JOIN statuses rs ON rs.status_id=r.reservation_status_id AND rs.status_code='RESERVED'
        JOIN redemption_transaction_item item USING(redemption_transaction_item_id)
        JOIN redemption_transaction tx USING(redemption_transaction_id)
        WHERE tx.organization_id=p_org AND tx.subscription_id=sub_id
          AND (item.benefit_id=ANY(benefits) OR item.offer_id=ANY(offers))
          AND r.reserved_quantity>r.consumed_quantity+r.released_quantity
    ) THEN RAISE EXCEPTION 'A selected item is already reserved' USING ERRCODE='23505'; END IF;
    FOR price IN SELECT * FROM fulfillment_redemption_quote_rows(p_org,i.store_id,sub_id,benefits,offers,draft->'products') LOOP
        SELECT entry INTO STRICT line FROM jsonb_array_elements(quote->'lines') entry
          WHERE entry->>'itemType'=price."itemType" AND entry->>'itemId'=price."itemId";
        line_count := line_count+1;
        IF line->>'mappingId' IS DISTINCT FROM price."commerceProductMappingId"
          OR (line->>'mappingVersion')::integer IS DISTINCT FROM price."mappingVersionNo"
          OR line->>'adjustmentId' IS DISTINCT FROM price."commerceAdjustmentId"
          OR (line->>'adjustmentVersion')::integer IS DISTINCT FROM price."adjustmentVersionNo"
          OR quote->>'providerCode' IS DISTINCT FROM price."providerCode"
          OR quote->>'integrationId' IS DISTINCT FROM price."integrationConfigurationId"
          OR (price."providerCode"='MEMGINE' AND ((line->>'unitPriceMinor')::bigint IS DISTINCT FROM price."snapshotUnitPriceMinor"
              OR i.currency_code IS DISTINCT FROM price."snapshotCurrencyCode"))
        THEN RAISE EXCEPTION 'Prices changed. Review a new quote.' USING ERRCODE='23505'; END IF;
    END LOOP;
    IF line_count=0 OR line_count<>jsonb_array_length(quote->'lines') THEN
        RAISE EXCEPTION 'Checkout items changed' USING ERRCODE='23505';
    END IF;
    UPDATE payment_intents SET status='PROCESSING',updated_at=CURRENT_TIMESTAMP,updated_by=p_actor WHERE payment_intent_id=p_intent;
    UPDATE payment_attempts SET status='PROCESSING' WHERE payment_intent_id=p_intent AND status='PENDING';
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment attempt is unavailable' USING ERRCODE='23505'; END IF;
    RETURN true;
END;
$fn$;

CREATE FUNCTION "${schemaName}".finalize_customer_fulfillment_collect(p_org varchar,p_intent varchar,p_actor varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
DECLARE payment record; draft jsonb; result varchar;
BEGIN
    SELECT i.*,c.subscription_id INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
    WHERE i.payment_intent_id=p_intent AND i.organization_id=p_org AND i.fulfillment_checkout IS NOT NULL
      AND payment_actor_is_authorized(p_intent,p_actor);
    IF NOT FOUND THEN RAISE EXCEPTION 'Fulfillment payment is unavailable' USING ERRCODE='42501'; END IF;
    draft := payment.fulfillment_checkout;
    result := get_customer_fulfillment_replay(p_org,p_actor,payment.idempotency_key,draft->>'requestHash');
    IF result IS NOT NULL THEN RETURN result; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM poynt_collect_verified_captures v WHERE v.payment_intent_id=p_intent AND v.organization_id=p_org
          AND v.merchant_business_id=draft->>'paymentBusinessId' AND v.merchant_store_id=draft->>'paymentStoreId'
    ) THEN RAISE EXCEPTION 'Verified merchant capture is unavailable' USING ERRCODE='23505'; END IF;
    result := accept_customer_fulfillment(p_org,payment.store_id,payment.subscription_id,p_actor,
        payment.idempotency_key,(draft->>'requestHash')::varchar,
        ARRAY(SELECT jsonb_array_elements_text(draft->'benefits')::varchar),
        ARRAY(SELECT jsonb_array_elements_text(draft->'offers')::varchar),draft->'products',draft->'quote',
        (draft->>'expectedCompletion')::timestamptz,(draft->>'expectedCollection')::timestamptz,p_intent);
    UPDATE poynt_collect_financial_exceptions SET case_status='RESOLVED',resolved_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP,provider_outcome='CAPTURED',
        provider_transaction_id=payment.provider_reference_id,provider_reference_id=payment.provider_reference_id,
        classification_reason='Verified capture was reconciled and the fulfillment was accepted.'
    WHERE payment_intent_id=p_intent AND source_channel='CUSTOMER_FULFILLMENT' AND case_status IN ('OPEN','UNDER_REVIEW')
      AND NOT EXISTS (SELECT 1 FROM payment_refunds r WHERE r.payment_intent_id=p_intent AND r.approval_status<>'REJECTED');
    RETURN result;
END;
$fn$;

ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions DROP CONSTRAINT ck_financial_exception_source_channel;
ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions ADD CONSTRAINT ck_financial_exception_source_channel
    CHECK (source_channel IN ('CUSTOMER_MEMBERSHIP','CUSTOMER_FULFILLMENT','COUNTER','COUNTER_REDEMPTION'));

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_fulfillment_payment(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".claim_customer_fulfillment_collect(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".finalize_customer_fulfillment_collect(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_fulfillment_payment(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".claim_customer_fulfillment_collect(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".finalize_customer_fulfillment_collect(varchar,varchar,varchar) TO "${appRole}";
CREATE OR REPLACE FUNCTION "${schemaName}".payment_open_collect_financial_exception(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_case_id varchar;
BEGIN
    SELECT * INTO v_intent
      FROM payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_intent.payment_provider_config_id
           AND (pc.organization_id = v_intent.organization_id OR pc.organization_id IS NULL)
           AND pc.provider_code = 'POYNT_COLLECT'
    )
       OR v_intent.authorization_mode <> 'CUSTOMER_SESSION'
       OR v_intent.customer_user_id IS NULL
       OR v_intent.status <> 'PROCESSING'
       OR v_intent.finalized_subscription_id IS NOT NULL THEN
        RAISE EXCEPTION 'Payment is not eligible for exception review' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_capture
      FROM poynt_collect_verified_captures
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id;

    IF NOT FOUND AND v_intent.fulfillment_checkout IS NOT NULL THEN
        -- Give an in-flight provider response time to commit before opening a case.
        IF v_intent.updated_at > CURRENT_TIMESTAMP - interval '2 minutes' THEN RETURN NULL; END IF;
        INSERT INTO poynt_collect_financial_exceptions (
            financial_exception_id,payment_intent_id,organization_id,customer_user_id,amount_minor,currency_code,
            classification,source_channel,provider_code,provider_reference_id,provider_outcome,fulfillment_outcome,evidence_reason
        ) VALUES (
            generate_runtime_id('PFE'),p_intent_id,p_organization_id,v_intent.customer_user_id,
            round(v_intent.amount*100)::bigint,v_intent.currency_code,'PROVIDER_OUTCOME_UNRESOLVED',
            'CUSTOMER_FULFILLMENT','POYNT_COLLECT',v_intent.provider_reference_id,'UNRESOLVED','UNFULFILLED',
            'Collect payment was claimed and the provider outcome cannot yet be verified.'
        ) ON CONFLICT (payment_intent_id) DO NOTHING;
        SELECT financial_exception_id INTO v_case_id FROM poynt_collect_financial_exceptions
        WHERE payment_intent_id=p_intent_id AND organization_id=p_organization_id;
        RETURN v_case_id;
    END IF;

    IF NOT FOUND
       OR v_capture.provider_transaction_id IS DISTINCT FROM v_intent.provider_reference_id
       OR round(v_intent.amount * 100)::bigint <> v_capture.amount_minor
       OR upper(v_intent.currency_code) <> upper(v_capture.currency_code) THEN
        RAISE EXCEPTION 'Verified capture is unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO poynt_collect_financial_exceptions (
        financial_exception_id, payment_intent_id, organization_id,
        customer_user_id, membership_plan_id, provider_transaction_id,
        amount_minor, currency_code, source_channel, provider_code,
        provider_reference_id, provider_outcome, fulfillment_outcome,
        evidence_reason
    ) VALUES (
        'PFE_' || gen_random_uuid()::text, p_intent_id, p_organization_id,
        v_intent.customer_user_id, v_intent.membership_plan_id,
        v_capture.provider_transaction_id, v_capture.amount_minor,
        upper(v_capture.currency_code), CASE WHEN v_intent.fulfillment_checkout IS NULL THEN 'CUSTOMER_MEMBERSHIP' ELSE 'CUSTOMER_FULFILLMENT' END, 'POYNT_COLLECT',
        v_intent.provider_reference_id, 'CAPTURED', 'UNFULFILLED',
        'Verified Poynt Collect capture evidence matches the persisted payment intent.'
    ) ON CONFLICT (payment_intent_id) DO UPDATE SET
        provider_transaction_id=EXCLUDED.provider_transaction_id,provider_reference_id=EXCLUDED.provider_reference_id,
        provider_outcome='CAPTURED',classification='CAPTURED_UNFULFILLED',
        evidence_reason=EXCLUDED.evidence_reason,updated_at=CURRENT_TIMESTAMP
    WHERE poynt_collect_financial_exceptions.source_channel='CUSTOMER_FULFILLMENT'
      AND poynt_collect_financial_exceptions.provider_outcome='UNRESOLVED'
      AND poynt_collect_financial_exceptions.case_status IN ('OPEN','UNDER_REVIEW');

    SELECT financial_exception_id INTO v_case_id
      FROM poynt_collect_financial_exceptions
     WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id;
    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'Exception case was not created' USING ERRCODE = '23514';
    END IF;
    RETURN v_case_id;
END;
$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".receipt_customer_transaction_history(
    p_customer_user_id varchar, p_organization_id varchar, p_status varchar,
    p_transaction_type varchar, p_search varchar, p_limit integer, p_offset integer
)
RETURNS TABLE(
  transaction_id varchar, transaction_number varchar, organization_id varchar,
  organization_name varchar, store_id varchar, store_name varchar,
  customer_user_id varchar, transaction_type varchar, status varchar,
  payment_method varchar, currency_code varchar, total_minor bigint,
  occurred_at text, receipt_id varchar, receipt_number varchar,
  receipt_available boolean, refund_status varchar,
  subscription_id varchar, item_description text, canonical_order_id varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH commerce AS (
  SELECT t.commerce_transaction_id AS transaction_id,
    COALESCE(r.receipt_number, rt.redemption_transaction_number,
      'ORDER-' || upper(right(t.commerce_transaction_id, 8)))::varchar AS transaction_number,
    t.organization_id,o.organization_name,t.store_id,s.store_name,t.customer_user_id,
    CASE WHEN t.source_channel = 'CUSTOMER_FULFILLMENT' THEN 'CUSTOMER_FULFILLMENT'
         WHEN rt.redemption_transaction_number IS NOT NULL THEN 'COUNTER_REDEMPTION'
         ELSE t.source_channel END::varchar AS transaction_type,
    t.status::varchar,
    CASE WHEN COALESCE(t.total_minor,0)=0 THEN 'NO_PAYMENT'
         WHEN pa.payment_channel='CASH' THEN 'CASH'
         WHEN pa.payment_channel='REMOTE_TERMINAL' THEN 'POYNT_TERMINAL'
         WHEN pa.payment_channel='LEGACY_PAYMENT_INTENT' THEN 'CONFIGURED_PROVIDER'
         WHEN pa.payment_channel IS NOT NULL THEN pa.payment_channel
         ELSE 'PAYMENT_METHOD_NOT_RECORDED' END::varchar AS payment_method,
    COALESCE(t.currency_code,'CAD')::varchar AS currency_code,COALESCE(t.total_minor,0)::bigint AS total_minor,
    COALESCE(t.completed_at,t.updated_at,t.created_at)::text AS occurred_at,
    r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,
    (SELECT CASE WHEN count(*) FILTER (WHERE pr.execution_status='SUCCEEDED')>0 THEN 'REFUNDED' WHEN count(*)>0 THEN max(pr.execution_status) END
      FROM payment_refunds pr WHERE pr.commerce_transaction_id=t.commerce_transaction_id)::varchar AS refund_status,
    'COMMERCE'::text AS source_kind
  FROM commerce_transactions t JOIN organization o ON o.organization_id=t.organization_id
    LEFT JOIN stores s ON s.store_id=t.store_id
    -- Choose one immutable receipt before applying history pagination. A legacy
    -- duplicate receipt must not duplicate or displace an order in the page.
    LEFT JOIN LATERAL (
      SELECT receipt.transaction_receipt_id, receipt.receipt_number
        FROM transaction_receipts receipt
       WHERE receipt.source_commerce_transaction_id=t.commerce_transaction_id
         AND receipt.organization_id=t.organization_id
         AND receipt.customer_user_id=$1
       ORDER BY receipt.issued_at DESC, receipt.transaction_receipt_id DESC
       LIMIT 1
    ) r ON true
    -- Keep legacy search on any linked redemption number when there is no receipt.
    -- Reduce the link to one stable row before filtering and pagination.
    LEFT JOIN LATERAL (
      SELECT linked.redemption_transaction_number
        FROM commerce_transaction_redemptions cx
        JOIN redemption_transaction linked USING (redemption_transaction_id)
       WHERE cx.commerce_transaction_id=t.commerce_transaction_id AND NOT cx.is_deleted
       ORDER BY (r.receipt_number IS NULL AND $5 IS NOT NULL
                 AND linked.redemption_transaction_number ILIKE '%'||$5||'%') DESC,
                linked.redemption_transaction_id
       LIMIT 1
    ) rt ON true
    LEFT JOIN LATERAL (SELECT a.payment_channel FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=t.commerce_transaction_id AND a.provider_status='SUCCEEDED'
      ORDER BY a.created_at DESC,a.commerce_provider_payment_attempt_id DESC LIMIT 1) pa ON true
  WHERE NOT t.is_deleted AND t.customer_user_id=$1 AND ($2 IS NULL OR t.organization_id=$2)
    AND (t.source_channel <> 'CUSTOMER_FULFILLMENT' OR ($2 IS NULL AND EXISTS (
      SELECT 1 FROM fulfillments f WHERE f.commerce_transaction_id=t.commerce_transaction_id
        AND f.organization_id=t.organization_id AND f.customer_user_id=$1
    )))
), intents AS (
  SELECT p.payment_intent_id AS transaction_id,COALESCE(r.receipt_number,'ORDER-' || upper(right(p.payment_intent_id,8)))::varchar AS transaction_number,
    p.organization_id,o.organization_name,p.store_id,s.store_name,p.customer_user_id,
    'MEMBERSHIP_PURCHASE'::varchar AS transaction_type,p.status::varchar,pc.provider_code::varchar AS payment_method,p.currency_code::varchar,
    round(p.amount*100)::bigint AS total_minor,p.updated_at::text AS occurred_at,r.transaction_receipt_id AS receipt_id,r.receipt_number,
    (r.transaction_receipt_id IS NOT NULL) AS receipt_available,
    (SELECT CASE WHEN count(*) FILTER (WHERE pr.execution_status='SUCCEEDED')>0 THEN 'REFUNDED' WHEN count(*)>0 THEN max(pr.execution_status) END FROM payment_refunds pr WHERE pr.payment_intent_id=p.payment_intent_id)::varchar AS refund_status,
    'INTENT'::text AS source_kind
  FROM payment_intents p JOIN organization o ON o.organization_id=p.organization_id JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id
    LEFT JOIN stores s ON s.store_id=p.store_id
    LEFT JOIN LATERAL (
      SELECT receipt.transaction_receipt_id, receipt.receipt_number
        FROM transaction_receipts receipt
       WHERE receipt.source_payment_intent_id=p.payment_intent_id
         AND receipt.organization_id=p.organization_id
         AND receipt.customer_user_id=$1
       ORDER BY receipt.issued_at DESC, receipt.transaction_receipt_id DESC
       LIMIT 1
    ) r ON true
  WHERE p.fulfillment_checkout IS NULL AND p.customer_user_id=$1 AND ($2 IS NULL OR p.organization_id=$2)
    AND NOT EXISTS (SELECT 1 FROM commerce_transactions t WHERE NOT t.is_deleted AND t.organization_id=p.organization_id AND t.customer_user_id=p.customer_user_id AND t.subscription_id IS NOT NULL AND t.subscription_id=p.finalized_subscription_id)
), refunds AS (
  SELECT pr.payment_refund_id AS transaction_id,COALESCE(r.receipt_number,'REFUND-' || upper(right(pr.payment_refund_id,8)))::varchar AS transaction_number,
    pr.organization_id,o.organization_name,pr.original_store_id AS store_id,s.store_name,COALESCE(ct.customer_user_id,pi.customer_user_id) AS customer_user_id,
    'REFUND'::varchar AS transaction_type,pr.execution_status::varchar AS status,pr.original_provider_code::varchar AS payment_method,pr.currency_code::varchar,
    (-pr.refund_amount_minor)::bigint AS total_minor,COALESCE(pr.executed_at,pr.updated_at,pr.requested_at)::text AS occurred_at,
    r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,pr.execution_status::varchar AS refund_status,
    'REFUND'::text AS source_kind
  FROM payment_refunds pr JOIN organization o ON o.organization_id=pr.organization_id LEFT JOIN stores s ON s.store_id=pr.original_store_id
    LEFT JOIN commerce_transactions ct ON ct.commerce_transaction_id=pr.commerce_transaction_id LEFT JOIN payment_intents pi ON pi.payment_intent_id=pr.payment_intent_id
    LEFT JOIN LATERAL (
      SELECT receipt.transaction_receipt_id, receipt.receipt_number
        FROM transaction_receipts receipt
       WHERE receipt.source_refund_id=pr.payment_refund_id
         AND receipt.organization_id=pr.organization_id
         AND receipt.customer_user_id=$1
       ORDER BY receipt.issued_at DESC, receipt.transaction_receipt_id DESC
       LIMIT 1
    ) r ON true
  WHERE COALESCE(ct.customer_user_id,pi.customer_user_id)=$1 AND ($2 IS NULL OR pr.organization_id=$2)
), history_page AS MATERIALIZED (
  SELECT x.*
    FROM (SELECT * FROM commerce UNION ALL SELECT * FROM intents UNION ALL SELECT * FROM refunds) x
   WHERE ($3 IS NULL OR x.status=$3) AND ($4 IS NULL OR x.transaction_type=$4)
     AND ($5 IS NULL OR x.transaction_number ILIKE '%'||$5||'%' OR x.receipt_number ILIKE '%'||$5||'%')
   ORDER BY x.occurred_at DESC,x.transaction_id DESC LIMIT $6 OFFSET $7
), originals AS (
  SELECT h.*, p.finalized_subscription_id, c.subscription_id AS commerce_subscription_id,
         c.commerce_transaction_id, c.is_deleted AS commerce_deleted,
         (h.source_kind = 'REFUND' AND (
             f.organization_id IS DISTINCT FROM h.organization_id
             OR (f.commerce_transaction_id IS NOT NULL AND f.payment_intent_id IS NOT NULL
                 AND p.commerce_transaction_id IS NOT NULL
                 AND f.commerce_transaction_id <> p.commerce_transaction_id)
           )
          OR (c.commerce_transaction_id IS NOT NULL AND c.is_deleted)
          OR p.payment_intent_id IS NOT NULL AND
            (p.organization_id IS DISTINCT FROM h.organization_id OR p.customer_user_id IS DISTINCT FROM $1)
          OR c.commerce_transaction_id IS NOT NULL AND
            (c.organization_id IS DISTINCT FROM h.organization_id OR c.customer_user_id IS DISTINCT FROM $1)
          OR p.finalized_subscription_id IS NOT NULL AND c.subscription_id IS NOT NULL
            AND p.finalized_subscription_id <> c.subscription_id
          OR EXISTS (
            SELECT 1 FROM commerce_transaction_redemptions cx
            JOIN redemption_transaction rt USING (redemption_transaction_id)
            WHERE cx.commerce_transaction_id = c.commerce_transaction_id AND NOT cx.is_deleted
              AND (rt.organization_id IS DISTINCT FROM h.organization_id OR
                   rt.subscription_id IS DISTINCT FROM coalesce(c.subscription_id, p.finalized_subscription_id))
          )
          OR EXISTS (
            SELECT 1 FROM payment_intents linked
            WHERE linked.commerce_transaction_id = c.commerce_transaction_id
              AND (linked.organization_id IS DISTINCT FROM h.organization_id OR
                   linked.customer_user_id IS DISTINCT FROM $1 OR
                   (linked.finalized_subscription_id IS NOT NULL
                    AND coalesce(c.subscription_id, p.finalized_subscription_id) IS NOT NULL
                    AND linked.finalized_subscription_id <> coalesce(c.subscription_id, p.finalized_subscription_id)))
          )) AS evidence_conflicts
    FROM history_page h
    LEFT JOIN payment_refunds f ON h.source_kind = 'REFUND' AND f.payment_refund_id = h.transaction_id
    LEFT JOIN payment_intents p ON p.payment_intent_id = CASE
        WHEN h.source_kind = 'INTENT' THEN h.transaction_id ELSE f.payment_intent_id END
    LEFT JOIN commerce_transactions c ON c.commerce_transaction_id = CASE
        WHEN h.source_kind = 'COMMERCE' THEN h.transaction_id
        ELSE coalesce(f.commerce_transaction_id, p.commerce_transaction_id) END
)
SELECT h.transaction_id::varchar, h.transaction_number::varchar, h.organization_id::varchar,
       h.organization_name::varchar, h.store_id::varchar, h.store_name::varchar, h.customer_user_id::varchar,
       h.transaction_type::varchar, h.status::varchar, h.payment_method::varchar, h.currency_code::varchar,
       h.total_minor::bigint, h.occurred_at::text, h.receipt_id::varchar, h.receipt_number::varchar,
       h.receipt_available::boolean, h.refund_status::varchar,
       s.subscription_id::varchar,
       nullif(btrim(r.receipt_snapshot #>> '{lines,0,description}'), ''),
       CASE WHEN h.source_kind = 'INTENT' AND NOT h.evidence_conflicts AND h.commerce_deleted IS FALSE
                 AND (coalesce(h.finalized_subscription_id, h.commerce_subscription_id) IS NULL OR s.subscription_id IS NOT NULL)
            THEN h.commerce_transaction_id ELSE h.transaction_id END::varchar
  FROM originals h
  LEFT JOIN subscriptions s ON NOT h.evidence_conflicts AND NOT s.is_deleted
    AND s.subscription_id = coalesce(h.finalized_subscription_id, h.commerce_subscription_id)
    AND EXISTS (
      SELECT 1 FROM organization_user ou
       WHERE ou.organization_user_id = s.organization_user_id AND ou.organization_id = h.organization_id
         AND ou.user_id = $1 AND NOT ou.is_deleted
    )
  LEFT JOIN transaction_receipts r ON r.transaction_receipt_id = h.receipt_id
    AND r.organization_id = h.organization_id AND r.customer_user_id = $1
 ORDER BY h.occurred_at DESC,h.transaction_id DESC;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_verified_collect_capture(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar,
    p_transaction_id varchar,
    p_amount_minor bigint,
    p_currency_code varchar,
    p_verified_business_id varchar,
    p_verified_store_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_saved poynt_collect_verified_captures%ROWTYPE;
    v_business_id varchar;
    v_store_id varchar;
BEGIN
    IF p_transaction_id IS NULL OR length(p_transaction_id) NOT BETWEEN 1 AND 160
       OR p_transaction_id !~ '^[A-Za-z0-9_-]+$'
       OR p_amount_minor IS NULL OR p_amount_minor <= 0
       OR p_currency_code IS NULL OR length(p_currency_code) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Invalid verified capture' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_intent
      FROM payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    SELECT provider_code INTO v_provider_code
      FROM payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;
    IF v_provider_code IS DISTINCT FROM 'POYNT_COLLECT'
       OR v_intent.provider_reference_id IS DISTINCT FROM p_transaction_id
       OR round(v_intent.amount * 100)::bigint <> p_amount_minor
       OR upper(v_intent.currency_code) <> upper(p_currency_code)
       OR v_intent.status NOT IN ('PROCESSING', 'SUCCEEDED') THEN
        RAISE EXCEPTION 'Verified capture conflicts with payment' USING ERRCODE = '23514';
    END IF;

    IF v_intent.fulfillment_checkout IS NOT NULL AND (p_verified_business_id IS NULL OR p_verified_store_id IS NULL) THEN
        RAISE EXCEPTION 'Verified merchant evidence is required for fulfillment' USING ERRCODE='23514';
    END IF;
    IF (p_verified_business_id IS NULL) <> (p_verified_store_id IS NULL) THEN
        RAISE EXCEPTION 'Verified capture merchant identity is incomplete' USING ERRCODE = '22023';
    END IF;
    IF p_verified_business_id IS NOT NULL THEN
        IF NULLIF(btrim(p_verified_business_id), '') IS NULL
           OR NULLIF(btrim(p_verified_store_id), '') IS NULL
           OR length(p_verified_business_id) > 160
           OR length(p_verified_store_id) > 160 THEN
            RAISE EXCEPTION 'Verified capture merchant identity is invalid' USING ERRCODE = '22023';
        END IF;
        IF v_intent.fulfillment_checkout IS NOT NULL THEN
            IF v_intent.fulfillment_checkout->>'paymentBusinessId' IS DISTINCT FROM p_verified_business_id
               OR v_intent.fulfillment_checkout->>'paymentStoreId' IS DISTINCT FROM p_verified_store_id THEN
                RAISE EXCEPTION 'Verified capture does not match the fulfillment merchant' USING ERRCODE='23514';
            END IF;
        ELSE
        SELECT c.provider_business_id, c.provider_store_id
          INTO v_business_id, v_store_id
          FROM commerce_provider_catalog_configurations c
          JOIN integration_configurations ic
            ON ic.integration_configuration_id = c.integration_configuration_id
           AND ic.organization_id = c.organization_id
         WHERE c.integration_configuration_id = v_intent.collect_integration_configuration_id
           AND c.organization_id = p_organization_id
           AND upper(ic.provider) = 'POYNT'
           AND NOT c.is_deleted
           AND NOT ic.is_deleted
           AND c.provider_business_id = p_verified_business_id
           AND c.provider_store_id = p_verified_store_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Verified capture merchant identity conflicts with payment configuration' USING ERRCODE = '23514';
        END IF;
        END IF;
    END IF;

    SELECT * INTO v_saved
      FROM poynt_collect_verified_captures
     WHERE payment_intent_id = p_intent_id
     FOR UPDATE;
    IF FOUND THEN
        IF v_saved.organization_id <> p_organization_id
           OR v_saved.provider_transaction_id <> p_transaction_id
           OR v_saved.amount_minor <> p_amount_minor
           OR upper(v_saved.currency_code) <> upper(p_currency_code)
           OR (v_saved.merchant_business_id IS NOT NULL
               AND p_verified_business_id IS NOT NULL
               AND v_saved.merchant_business_id IS DISTINCT FROM p_verified_business_id)
           OR (v_saved.merchant_store_id IS NOT NULL
               AND p_verified_store_id IS NOT NULL
               AND v_saved.merchant_store_id IS DISTINCT FROM p_verified_store_id) THEN
            RAISE EXCEPTION 'Conflicting verified capture' USING ERRCODE = '23514';
        END IF;
        RETURN true;
    END IF;

    INSERT INTO poynt_collect_verified_captures (
        payment_intent_id, organization_id, provider_transaction_id,
        amount_minor, currency_code, merchant_business_id, merchant_store_id
    ) VALUES (
        p_intent_id, p_organization_id, p_transaction_id,
        p_amount_minor, upper(p_currency_code), p_verified_business_id, p_verified_store_id
    );
    RETURN true;
END;
$function$;
