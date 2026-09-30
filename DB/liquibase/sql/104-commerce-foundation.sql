-- Provider-neutral external-commerce catalog, mapping, and adjustment foundation.
-- Snapshot prices are informational only. A provider remains checkout authority.

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_product_snapshots (
    commerce_product_snapshot_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    integration_configuration_id varchar(64) NOT NULL REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    external_product_id varchar(160) NOT NULL,
    external_variant_id varchar(160),
    external_sku varchar(160),
    product_name varchar(200) NOT NULL,
    description varchar(2000),
    currency_code varchar(3) NOT NULL,
    unit_price_minor_snapshot bigint NOT NULL CHECK (unit_price_minor_snapshot >= 0),
    is_active boolean NOT NULL DEFAULT true,
    source_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_commerce_product_snapshot_currency CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_product_snapshots_external_identity
    ON "${schemaName}".commerce_product_snapshots (
        organization_id,
        integration_configuration_id,
        COALESCE(store_id, ''),
        external_product_id,
        COALESCE(external_variant_id, '')
    ) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS ix_commerce_product_snapshots_org_sync
    ON "${schemaName}".commerce_product_snapshots (organization_id, last_synced_at DESC)
    WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_product_mappings (
    commerce_product_mapping_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    integration_configuration_id varchar(64) NOT NULL REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    external_product_id varchar(160) NOT NULL,
    external_variant_id varchar(160),
    external_sku varchar(160),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_product_mappings_external_identity
    ON "${schemaName}".commerce_product_mappings (
        organization_id,
        integration_configuration_id,
        COALESCE(store_id, ''),
        external_product_id,
        COALESCE(external_variant_id, '')
    ) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS ix_commerce_product_mappings_org
    ON "${schemaName}".commerce_product_mappings (organization_id)
    WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_adjustments (
    commerce_adjustment_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    adjustment_type varchar(32) NOT NULL,
    percentage numeric(5,2),
    amount_minor bigint,
    currency_code varchar(3),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_commerce_adjustment_type CHECK (adjustment_type IN (
        'PRODUCT_FREE', 'PRODUCT_PERCENT_OFF', 'PRODUCT_FIXED_OFF',
        'PRODUCT_SPECIAL_PRICE', 'ORDER_PERCENT_OFF', 'ORDER_FIXED_OFF'
    )),
    CONSTRAINT ck_commerce_adjustment_value CHECK (
        (adjustment_type = 'PRODUCT_FREE' AND percentage IS NULL AND amount_minor IS NULL AND currency_code IS NULL)
        OR (adjustment_type IN ('PRODUCT_PERCENT_OFF', 'ORDER_PERCENT_OFF')
            AND percentage > 0 AND percentage <= 100 AND amount_minor IS NULL AND currency_code IS NULL)
        OR (adjustment_type IN ('PRODUCT_FIXED_OFF', 'PRODUCT_SPECIAL_PRICE', 'ORDER_FIXED_OFF')
            AND percentage IS NULL AND amount_minor >= 0 AND currency_code ~ '^[A-Z]{3}$')
    )
);

CREATE TABLE IF NOT EXISTS "${schemaName}".benefit_commerce_adjustments (
    benefit_commerce_adjustment_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    benefit_id varchar(64) NOT NULL REFERENCES "${schemaName}".benefits(benefit_id),
    commerce_adjustment_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_adjustments(commerce_adjustment_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_benefit_commerce_adjustments_benefit
    ON "${schemaName}".benefit_commerce_adjustments (benefit_id) WHERE NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS ux_benefit_commerce_adjustments_adjustment
    ON "${schemaName}".benefit_commerce_adjustments (commerce_adjustment_id) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".offer_commerce_adjustments (
    offer_commerce_adjustment_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    offer_id varchar(64) NOT NULL REFERENCES "${schemaName}".offer(offer_id),
    commerce_adjustment_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_adjustments(commerce_adjustment_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_commerce_adjustments_offer
    ON "${schemaName}".offer_commerce_adjustments (offer_id) WHERE NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_commerce_adjustments_adjustment
    ON "${schemaName}".offer_commerce_adjustments (commerce_adjustment_id) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_adjustment_product_mappings (
    commerce_adjustment_product_mapping_id varchar(64) PRIMARY KEY,
    commerce_adjustment_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_adjustments(commerce_adjustment_id),
    commerce_product_mapping_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_product_mappings(commerce_product_mapping_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_adjustment_product_mapping
    ON "${schemaName}".commerce_adjustment_product_mappings (commerce_adjustment_id, commerce_product_mapping_id)
    WHERE NOT is_deleted;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_commerce_integrations(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar,
    "integrationName" varchar,
    "providerCode" varchar,
    "integrationTypeCode" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT configuration.integration_configuration_id,
           configuration.integration_name,
           configuration.provider,
           type.integration_type_code
      FROM integration_configurations configuration
      JOIN integration_types type ON type.integration_type_id = configuration.integration_type_id
      JOIN entity_status status ON status.entity_status_id = configuration.integration_status_id
      JOIN statuses state ON state.status_id = status.status_id
     WHERE configuration.organization_id = p_organization_id
       AND NOT configuration.is_deleted
       AND NOT type.is_deleted
       AND type.integration_type_code IN ('POS', 'ECOMMERCE')
       AND status.is_active
       AND state.status_code = 'ACTIVE'
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY configuration.integration_name, configuration.integration_configuration_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_commerce_product_snapshots(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "snapshotId" varchar, "organizationId" varchar, "integrationConfigurationId" varchar,
    "storeId" varchar, "externalProductId" varchar, "externalVariantId" varchar,
    "externalSku" varchar, "productName" varchar, description varchar, "currencyCode" varchar,
    "unitPriceMinorSnapshot" bigint, active boolean, "sourceUpdatedAt" text,
    "lastSyncedAt" text, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT snapshot.commerce_product_snapshot_id, snapshot.organization_id,
           snapshot.integration_configuration_id, snapshot.store_id,
           snapshot.external_product_id, snapshot.external_variant_id, snapshot.external_sku,
           snapshot.product_name, snapshot.description, snapshot.currency_code,
           snapshot.unit_price_minor_snapshot, snapshot.is_active,
           snapshot.source_updated_at::text, snapshot.last_synced_at::text, snapshot.version_no
      FROM commerce_product_snapshots snapshot
     WHERE snapshot.organization_id = p_organization_id
       AND NOT snapshot.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY snapshot.product_name, snapshot.commerce_product_snapshot_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_commerce_product_mappings(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "mappingId" varchar, "organizationId" varchar, "integrationConfigurationId" varchar,
    "storeId" varchar, "externalProductId" varchar, "externalVariantId" varchar,
    "externalSku" varchar, active boolean, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT mapping.commerce_product_mapping_id, mapping.organization_id,
           mapping.integration_configuration_id, mapping.store_id,
           mapping.external_product_id, mapping.external_variant_id, mapping.external_sku,
           mapping.is_active, mapping.version_no
      FROM commerce_product_mappings mapping
     WHERE mapping.organization_id = p_organization_id
       AND NOT mapping.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY mapping.external_product_id, mapping.commerce_product_mapping_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_commerce_adjustment_mappings(
    p_organization_id varchar,
    p_adjustment_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "mappingId" varchar, "organizationId" varchar, "integrationConfigurationId" varchar,
    "storeId" varchar, "externalProductId" varchar, "externalVariantId" varchar,
    "externalSku" varchar, active boolean, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT mapping.commerce_product_mapping_id, mapping.organization_id,
           mapping.integration_configuration_id, mapping.store_id,
           mapping.external_product_id, mapping.external_variant_id, mapping.external_sku,
           mapping.is_active, mapping.version_no
      FROM commerce_adjustment_product_mappings link
      JOIN commerce_product_mappings mapping ON mapping.commerce_product_mapping_id = link.commerce_product_mapping_id
      JOIN commerce_adjustments adjustment ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
     WHERE adjustment.organization_id = p_organization_id
       AND adjustment.commerce_adjustment_id = p_adjustment_id
       AND NOT adjustment.is_deleted AND NOT link.is_deleted AND NOT mapping.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY mapping.external_product_id, mapping.commerce_product_mapping_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_benefit_commerce_applicability(
    p_organization_id varchar,
    p_benefit_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "adjustmentId" varchar, "organizationId" varchar, "adjustmentType" varchar,
    percentage double precision, "amountMinor" bigint, "currencyCode" varchar,
    active boolean, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT adjustment.commerce_adjustment_id, adjustment.organization_id, adjustment.adjustment_type,
           adjustment.percentage::double precision, adjustment.amount_minor, adjustment.currency_code,
           adjustment.is_active, adjustment.version_no
      FROM benefit_commerce_adjustments link
      JOIN commerce_adjustments adjustment ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
      JOIN benefits benefit ON benefit.benefit_id = link.benefit_id
     WHERE link.organization_id = p_organization_id
       AND link.benefit_id = p_benefit_id
       AND benefit.organization_id = p_organization_id
       AND NOT link.is_deleted AND NOT adjustment.is_deleted AND NOT benefit.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_offer_commerce_applicability(
    p_organization_id varchar,
    p_offer_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "adjustmentId" varchar, "organizationId" varchar, "adjustmentType" varchar,
    percentage double precision, "amountMinor" bigint, "currencyCode" varchar,
    active boolean, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT adjustment.commerce_adjustment_id, adjustment.organization_id, adjustment.adjustment_type,
           adjustment.percentage::double precision, adjustment.amount_minor, adjustment.currency_code,
           adjustment.is_active, adjustment.version_no
      FROM offer_commerce_adjustments link
      JOIN commerce_adjustments adjustment ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
      JOIN offer offer ON offer.offer_id = link.offer_id
     WHERE link.organization_id = p_organization_id
       AND link.offer_id = p_offer_id
       AND offer.organization_id = p_organization_id
       AND NOT link.is_deleted AND NOT adjustment.is_deleted AND NOT offer.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_snapshot(
    p_organization_id varchar, p_integration_configuration_id varchar, p_store_id varchar,
    p_external_product_id varchar, p_external_variant_id varchar, p_external_sku varchar,
    p_product_name varchar, p_description varchar, p_currency_code varchar,
    p_unit_price_minor_snapshot bigint, p_active boolean, p_source_updated_at timestamp with time zone,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT organization_user_id INTO v_actor_organization_user_id FROM organization_user
     WHERE organization_id = p_organization_id AND user_id = p_actor_user_id AND NOT is_deleted LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501'; END IF;
    IF NULLIF(btrim(p_external_product_id), '') IS NULL OR length(p_external_product_id) > 160
       OR COALESCE(length(p_external_variant_id), 0) > 160
       OR COALESCE(length(p_external_sku), 0) > 160
       OR NULLIF(btrim(p_product_name), '') IS NULL OR length(p_product_name) > 200
       OR COALESCE(length(p_description), 0) > 2000
       OR p_currency_code !~ '^[A-Z]{3}$' OR p_unit_price_minor_snapshot < 0 THEN
        RAISE EXCEPTION 'Invalid commerce product snapshot' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM integration_configurations configuration
        JOIN integration_types type ON type.integration_type_id = configuration.integration_type_id
        WHERE configuration.integration_configuration_id = p_integration_configuration_id
          AND configuration.organization_id = p_organization_id AND NOT configuration.is_deleted
          AND NOT type.is_deleted AND type.integration_type_code IN ('POS', 'ECOMMERCE')
    ) THEN RAISE EXCEPTION 'Commerce integration is not configured for organization' USING ERRCODE = '23503'; END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE store_id = p_store_id AND organization_id = p_organization_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Store is not in organization' USING ERRCODE = '23503';
    END IF;
    SELECT commerce_product_snapshot_id INTO v_id FROM commerce_product_snapshots
     WHERE organization_id=p_organization_id AND integration_configuration_id=p_integration_configuration_id
       AND COALESCE(store_id,'')=COALESCE(p_store_id,'') AND external_product_id=p_external_product_id
       AND COALESCE(external_variant_id,'')=COALESCE(p_external_variant_id,'') AND NOT is_deleted FOR UPDATE;
    IF v_id IS NULL THEN
        v_id := generate_runtime_id('CPS');
        INSERT INTO commerce_product_snapshots(
            commerce_product_snapshot_id, organization_id, integration_configuration_id, store_id,
            external_product_id, external_variant_id, external_sku, product_name, description,
            currency_code, unit_price_minor_snapshot, is_active, source_updated_at, last_synced_at,
            created_by, updated_by
        ) VALUES (
            v_id, p_organization_id, p_integration_configuration_id, p_store_id,
            btrim(p_external_product_id), NULLIF(btrim(p_external_variant_id), ''), NULLIF(btrim(p_external_sku), ''),
            btrim(p_product_name), NULLIF(btrim(p_description), ''), upper(p_currency_code),
            p_unit_price_minor_snapshot, COALESCE(p_active, true), p_source_updated_at, CURRENT_TIMESTAMP,
            v_actor_organization_user_id, v_actor_organization_user_id
        );
    ELSE
        UPDATE commerce_product_snapshots SET external_sku=NULLIF(btrim(p_external_sku), ''),
            product_name=btrim(p_product_name), description=NULLIF(btrim(p_description), ''),
            currency_code=upper(p_currency_code), unit_price_minor_snapshot=p_unit_price_minor_snapshot,
            is_active=COALESCE(p_active, true), source_updated_at=p_source_updated_at,
            last_synced_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP,
            updated_by=v_actor_organization_user_id, version_no=version_no+1
         WHERE commerce_product_snapshot_id=v_id;
    END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_mapping(
    p_organization_id varchar, p_integration_configuration_id varchar, p_store_id varchar,
    p_external_product_id varchar, p_external_variant_id varchar, p_external_sku varchar,
    p_active boolean, p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501'; END IF;
    SELECT organization_user_id INTO v_actor_organization_user_id FROM organization_user WHERE organization_id=p_organization_id AND user_id=p_actor_user_id AND NOT is_deleted LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501'; END IF;
    IF NULLIF(btrim(p_external_product_id),'') IS NULL OR length(p_external_product_id)>160
       OR COALESCE(length(p_external_variant_id),0)>160 OR COALESCE(length(p_external_sku),0)>160 THEN RAISE EXCEPTION 'Invalid commerce product mapping' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM integration_configurations configuration JOIN integration_types type ON type.integration_type_id=configuration.integration_type_id WHERE configuration.integration_configuration_id=p_integration_configuration_id AND configuration.organization_id=p_organization_id AND NOT configuration.is_deleted AND NOT type.is_deleted AND type.integration_type_code IN ('POS','ECOMMERCE')) THEN RAISE EXCEPTION 'Commerce integration is not configured for organization' USING ERRCODE='23503'; END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE store_id=p_store_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Store is not in organization' USING ERRCODE='23503'; END IF;
    SELECT commerce_product_mapping_id INTO v_id FROM commerce_product_mappings WHERE organization_id=p_organization_id AND integration_configuration_id=p_integration_configuration_id AND COALESCE(store_id,'')=COALESCE(p_store_id,'') AND external_product_id=p_external_product_id AND COALESCE(external_variant_id,'')=COALESCE(p_external_variant_id,'') AND NOT is_deleted FOR UPDATE;
    IF v_id IS NULL THEN
        v_id:=generate_runtime_id('CPM');
        INSERT INTO commerce_product_mappings(commerce_product_mapping_id,organization_id,integration_configuration_id,store_id,external_product_id,external_variant_id,external_sku,is_active,created_by,updated_by)
        VALUES(v_id,p_organization_id,p_integration_configuration_id,p_store_id,btrim(p_external_product_id),NULLIF(btrim(p_external_variant_id),''),NULLIF(btrim(p_external_sku),''),COALESCE(p_active,true),v_actor_organization_user_id,v_actor_organization_user_id);
    ELSE
        UPDATE commerce_product_mappings SET external_sku=NULLIF(btrim(p_external_sku),''),is_active=COALESCE(p_active,true),updated_at=CURRENT_TIMESTAMP,updated_by=v_actor_organization_user_id,version_no=version_no+1 WHERE commerce_product_mapping_id=v_id;
    END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_applicability_internal(
    p_entity_type varchar, p_organization_id varchar, p_entity_id varchar,
    p_adjustment_type varchar, p_percentage numeric, p_amount_minor bigint,
    p_currency_code varchar, p_active boolean, p_mapping_ids varchar[], p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_adjustment_id varchar(64);
    v_mapping_id varchar(64);
    v_requires_product boolean := p_adjustment_type IN ('PRODUCT_FREE','PRODUCT_PERCENT_OFF','PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE');
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE='42501'; END IF;
    SELECT organization_user_id INTO v_actor_organization_user_id FROM organization_user WHERE organization_id=p_organization_id AND user_id=p_actor_user_id AND NOT is_deleted LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN RAISE EXCEPTION 'Organization membership not found' USING ERRCODE='42501'; END IF;
    IF p_entity_type='BENEFIT' THEN
        IF NOT EXISTS (SELECT 1 FROM benefits WHERE benefit_id=p_entity_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Benefit is not in organization' USING ERRCODE='23503'; END IF;
        SELECT link.commerce_adjustment_id INTO v_adjustment_id FROM benefit_commerce_adjustments link WHERE link.organization_id=p_organization_id AND link.benefit_id=p_entity_id AND NOT link.is_deleted FOR UPDATE;
    ELSIF p_entity_type='OFFER' THEN
        IF NOT EXISTS (SELECT 1 FROM offer WHERE offer_id=p_entity_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Offer is not in organization' USING ERRCODE='23503'; END IF;
        SELECT link.commerce_adjustment_id INTO v_adjustment_id FROM offer_commerce_adjustments link WHERE link.organization_id=p_organization_id AND link.offer_id=p_entity_id AND NOT link.is_deleted FOR UPDATE;
    ELSE RAISE EXCEPTION 'Invalid commerce applicability entity' USING ERRCODE='22023'; END IF;
    IF p_adjustment_type NOT IN ('PRODUCT_FREE','PRODUCT_PERCENT_OFF','PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE','ORDER_PERCENT_OFF','ORDER_FIXED_OFF') OR (v_requires_product AND COALESCE(cardinality(p_mapping_ids),0)=0) OR (NOT v_requires_product AND COALESCE(cardinality(p_mapping_ids),0)<>0) THEN RAISE EXCEPTION 'Invalid commerce adjustment mapping' USING ERRCODE='22023'; END IF;
    IF (p_adjustment_type IN ('PRODUCT_PERCENT_OFF','ORDER_PERCENT_OFF') AND (p_percentage IS NULL OR p_percentage<=0 OR p_percentage>100 OR p_amount_minor IS NOT NULL OR p_currency_code IS NOT NULL)) OR (p_adjustment_type IN ('PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE','ORDER_FIXED_OFF') AND (p_percentage IS NOT NULL OR p_amount_minor IS NULL OR p_amount_minor<0 OR p_currency_code !~ '^[A-Z]{3}$')) OR (p_adjustment_type='PRODUCT_FREE' AND (p_percentage IS NOT NULL OR p_amount_minor IS NOT NULL OR p_currency_code IS NOT NULL)) THEN RAISE EXCEPTION 'Invalid commerce adjustment value' USING ERRCODE='22023'; END IF;
    IF p_mapping_ids IS NOT NULL AND (
        cardinality(p_mapping_ids) <> (
            SELECT count(DISTINCT selected_mapping.mapping_id)
            FROM unnest(p_mapping_ids) AS selected_mapping(mapping_id)
        )
        OR EXISTS (
            SELECT 1
            FROM unnest(p_mapping_ids) AS selected_mapping(mapping_id)
            WHERE NOT EXISTS (
                SELECT 1
                FROM commerce_product_mappings mapping
                WHERE mapping.commerce_product_mapping_id = selected_mapping.mapping_id
                  AND mapping.organization_id = p_organization_id
                  AND NOT mapping.is_deleted
            )
        )
    ) THEN RAISE EXCEPTION 'Commerce product mapping is not in organization' USING ERRCODE='23503'; END IF;
    IF v_adjustment_id IS NULL THEN
        v_adjustment_id:=generate_runtime_id('CMA');
        INSERT INTO commerce_adjustments(commerce_adjustment_id,organization_id,adjustment_type,percentage,amount_minor,currency_code,is_active,created_by,updated_by) VALUES(v_adjustment_id,p_organization_id,p_adjustment_type,p_percentage,p_amount_minor,upper(p_currency_code),COALESCE(p_active,true),v_actor_organization_user_id,v_actor_organization_user_id);
        IF p_entity_type='BENEFIT' THEN INSERT INTO benefit_commerce_adjustments(benefit_commerce_adjustment_id,organization_id,benefit_id,commerce_adjustment_id,created_by,updated_by) VALUES(generate_runtime_id('BCA'),p_organization_id,p_entity_id,v_adjustment_id,v_actor_organization_user_id,v_actor_organization_user_id); ELSE INSERT INTO offer_commerce_adjustments(offer_commerce_adjustment_id,organization_id,offer_id,commerce_adjustment_id,created_by,updated_by) VALUES(generate_runtime_id('OCA'),p_organization_id,p_entity_id,v_adjustment_id,v_actor_organization_user_id,v_actor_organization_user_id); END IF;
    ELSE
        UPDATE commerce_adjustments SET adjustment_type=p_adjustment_type,percentage=p_percentage,amount_minor=p_amount_minor,currency_code=upper(p_currency_code),is_active=COALESCE(p_active,true),updated_at=CURRENT_TIMESTAMP,updated_by=v_actor_organization_user_id,version_no=version_no+1 WHERE commerce_adjustment_id=v_adjustment_id;
        UPDATE commerce_adjustment_product_mappings SET is_deleted=true,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor_organization_user_id,version_no=version_no+1 WHERE commerce_adjustment_id=v_adjustment_id AND NOT is_deleted;
    END IF;
    FOREACH v_mapping_id IN ARRAY COALESCE(p_mapping_ids, ARRAY[]::varchar[]) LOOP
        INSERT INTO commerce_adjustment_product_mappings(commerce_adjustment_product_mapping_id,commerce_adjustment_id,commerce_product_mapping_id,created_by,updated_by) VALUES(generate_runtime_id('CAP'),v_adjustment_id,v_mapping_id,v_actor_organization_user_id,v_actor_organization_user_id);
    END LOOP;
    RETURN v_adjustment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_benefit_commerce_applicability(
    p_organization_id varchar,p_benefit_id varchar,p_adjustment_type varchar,p_percentage numeric,p_amount_minor bigint,p_currency_code varchar,p_active boolean,p_mapping_ids varchar[],p_actor_user_id varchar
) RETURNS varchar LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT save_commerce_applicability_internal('BENEFIT',p_organization_id,p_benefit_id,p_adjustment_type,p_percentage,p_amount_minor,p_currency_code,p_active,p_mapping_ids,p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_offer_commerce_applicability(
    p_organization_id varchar,p_offer_id varchar,p_adjustment_type varchar,p_percentage numeric,p_amount_minor bigint,p_currency_code varchar,p_active boolean,p_mapping_ids varchar[],p_actor_user_id varchar
) RETURNS varchar LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT save_commerce_applicability_internal('OFFER',p_organization_id,p_offer_id,p_adjustment_type,p_percentage,p_amount_minor,p_currency_code,p_active,p_mapping_ids,p_actor_user_id);
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_organization_commerce_integrations(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_commerce_product_snapshots(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_commerce_product_mappings(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_commerce_adjustment_mappings(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_benefit_commerce_applicability(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_offer_commerce_applicability(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_snapshot(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,bigint,boolean,timestamp with time zone,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_mapping(varchar,varchar,varchar,varchar,varchar,varchar,boolean,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_applicability_internal(varchar,varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar[],varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_benefit_commerce_applicability(varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar[],varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_offer_commerce_applicability(varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar[],varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_commerce_integrations(varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_commerce_product_snapshots(varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_commerce_product_mappings(varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_commerce_adjustment_mappings(varchar,varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_benefit_commerce_applicability(varchar,varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_offer_commerce_applicability(varchar,varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".save_commerce_product_snapshot(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,bigint,boolean,timestamp with time zone,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".save_commerce_product_mapping(varchar,varchar,varchar,varchar,varchar,varchar,boolean,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".save_benefit_commerce_applicability(varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar[],varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".save_offer_commerce_applicability(varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar[],varchar) TO "${appRole}";
    END IF;
END $grant$;
