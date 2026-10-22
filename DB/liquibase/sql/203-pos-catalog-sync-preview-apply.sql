-- P3 POS catalog synchronization preview and controlled apply.
CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_catalog_sync_previews (
    catalog_sync_preview_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    integration_configuration_id varchar(64) NOT NULL REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    product_catalog_id varchar(64) NOT NULL REFERENCES "${schemaName}".product_catalog(product_catalog_id),
    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    status varchar(16) NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','APPLYING','APPLIED','EXPIRED','CANCELLED','FAILED')),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz NOT NULL,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    applied_at timestamptz,
    applied_by varchar(64) REFERENCES "${schemaName}".organization_user(organization_user_id),
    apply_idempotency_key varchar(160),
    apply_result jsonb,
    version_no integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_sync_preview_apply_key
  ON "${schemaName}".commerce_catalog_sync_previews (organization_id, apply_idempotency_key)
  WHERE apply_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_catalog_sync_preview_scope
  ON "${schemaName}".commerce_catalog_sync_previews (organization_id, integration_configuration_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_catalog_sync_preview_rows (
    catalog_sync_preview_row_id varchar(64) PRIMARY KEY,
    catalog_sync_preview_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_catalog_sync_previews(catalog_sync_preview_id) ON DELETE CASCADE,
    row_number integer NOT NULL,
    external_product_id varchar(160) NOT NULL,
    external_variant_id varchar(160),
    external_sku varchar(160),
    product_name varchar(200) NOT NULL,
    description varchar(2000),
    currency_code varchar(3) NOT NULL,
    unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
    active boolean NOT NULL,
    source_updated_at timestamptz,
    canonical_product_id varchar(64) REFERENCES "${schemaName}".product(product_id),
    canonical_product_version_no integer,
    commerce_product_mapping_id varchar(64) REFERENCES "${schemaName}".commerce_product_mappings(commerce_product_mapping_id),
    mapping_version_no integer,
    proposed_action varchar(16) NOT NULL CHECK (proposed_action IN ('NEW','MATCHED','UPDATE','UNCHANGED','INACTIVE','MISSING','CONFLICT','INVALID')),
    reason varchar(1000),
    has_dependent_business_rules boolean NOT NULL DEFAULT false,
    eligible_for_apply boolean NOT NULL DEFAULT false,
    previous_attributes jsonb,
    proposed_attributes jsonb,
    UNIQUE (catalog_sync_preview_id, row_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_sync_preview_row_identity
  ON "${schemaName}".commerce_catalog_sync_preview_rows (catalog_sync_preview_id, external_product_id, COALESCE(external_variant_id,''));

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(
    p_organization_id varchar, p_integration_configuration_id varchar, p_product_catalog_id varchar,
    p_store_id varchar, p_rows jsonb, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64); v_preview varchar(64); r record;
BEGIN
    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
        RAISE EXCEPTION 'Catalog preview is invalid or exceeds the maximum size' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)) > 2000 THEN
        RAISE EXCEPTION 'Catalog preview is invalid or exceeds the maximum size' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM integration_configurations i
         WHERE i.integration_configuration_id=p_integration_configuration_id AND i.organization_id=p_organization_id
           AND NOT i.is_deleted
    ) THEN RAISE EXCEPTION 'Commerce integration is unavailable' USING ERRCODE='23503'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM product_catalog c WHERE c.product_catalog_id=p_product_catalog_id
          AND c.organization_id=p_organization_id AND NOT c.is_deleted AND c.is_active
          AND (c.integration_configuration_id IS NULL OR c.integration_configuration_id=p_integration_configuration_id)
    ) THEN RAISE EXCEPTION 'Product catalog is unavailable for this integration' USING ERRCODE='23503'; END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE store_id=p_store_id AND organization_id=p_organization_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Store is not in organization' USING ERRCODE='23503';
    END IF;
    v_preview := generate_runtime_id('CSP');
    INSERT INTO commerce_catalog_sync_previews(catalog_sync_preview_id,organization_id,integration_configuration_id,product_catalog_id,store_id,expires_at,created_by)
    VALUES(v_preview,p_organization_id,p_integration_configuration_id,p_product_catalog_id,p_store_id,CURRENT_TIMESTAMP + interval '30 minutes',v_actor);
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(
        "rowNumber" integer, "externalProductId" varchar, "externalVariantId" varchar, "externalSku" varchar,
        "productName" varchar, description varchar, "currencyCode" varchar, "unitPriceMinor" bigint, active boolean,
        "sourceUpdatedAt" timestamptz, "canonicalProductId" varchar, "canonicalProductVersionNo" integer,
        "mappingId" varchar, "mappingVersionNo" integer, action varchar, reason varchar, "hasDependentBusinessRules" boolean, "eligibleForApply" boolean, "previousAttributes" jsonb, "proposedAttributes" jsonb
    ) LOOP
        INSERT INTO commerce_catalog_sync_preview_rows(
          catalog_sync_preview_row_id,catalog_sync_preview_id,row_number,external_product_id,external_variant_id,external_sku,
          product_name,description,currency_code,unit_price_minor,active,source_updated_at,canonical_product_id,canonical_product_version_no,
          commerce_product_mapping_id,mapping_version_no,proposed_action,reason,has_dependent_business_rules,eligible_for_apply,previous_attributes,proposed_attributes
        ) VALUES (
          generate_runtime_id('CSR'),v_preview,r."rowNumber",btrim(r."externalProductId"),NULLIF(btrim(r."externalVariantId"),''),NULLIF(btrim(r."externalSku"),''),
          btrim(r."productName"),NULLIF(btrim(r.description),''),upper(btrim(r."currencyCode")),r."unitPriceMinor",COALESCE(r.active,true),r."sourceUpdatedAt",NULLIF(btrim(r."canonicalProductId"),''),r."canonicalProductVersionNo",
          NULLIF(btrim(r."mappingId"),''),r."mappingVersionNo",upper(btrim(r.action)),NULLIF(btrim(r.reason),''),COALESCE(r."hasDependentBusinessRules",false),COALESCE(r."eligibleForApply",false),r."previousAttributes",r."proposedAttributes"
        );
    END LOOP;
    RETURN v_preview;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_apply_catalog_sync_preview(
  p_organization_id varchar,p_preview_id varchar,p_idempotency_key varchar,p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
  v_actor varchar(64); v_preview commerce_catalog_sync_previews%ROWTYPE; r commerce_catalog_sync_preview_rows%ROWTYPE;
  v_product varchar(64); v_mapping varchar(64); v_count integer:=0; v_created integer:=0; v_mapped integer:=0;
BEGIN
  v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id);
  IF NULLIF(btrim(p_idempotency_key),'') IS NULL OR length(p_idempotency_key)>160 THEN RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_preview FROM commerce_catalog_sync_previews
   WHERE catalog_sync_preview_id=p_preview_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog preview was not found' USING ERRCODE='23503'; END IF;
  IF v_preview.status='APPLIED' THEN
    IF v_preview.apply_idempotency_key=p_idempotency_key THEN RETURN v_preview.apply_result; END IF;
    RAISE EXCEPTION 'Catalog preview was already applied' USING ERRCODE='23505';
  END IF;
  IF v_preview.expires_at <= CURRENT_TIMESTAMP THEN
    -- Do not update status here: the exception below rolls back this function's
    -- transaction. Expiry is derived authoritatively from expires_at on every
    -- apply attempt until a caller creates a replacement preview.
    RAISE EXCEPTION 'Catalog preview has expired; generate a new preview' USING ERRCODE='22023';
  END IF;
  IF v_preview.status <> 'READY' THEN RAISE EXCEPTION 'Catalog preview is unavailable' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM integration_configurations i WHERE i.integration_configuration_id=v_preview.integration_configuration_id AND i.organization_id=p_organization_id AND NOT i.is_deleted)
     OR NOT EXISTS (SELECT 1 FROM product_catalog c WHERE c.product_catalog_id=v_preview.product_catalog_id AND c.organization_id=p_organization_id AND c.is_active AND NOT c.is_deleted AND (c.integration_configuration_id IS NULL OR c.integration_configuration_id=v_preview.integration_configuration_id)) THEN
    RAISE EXCEPTION 'Catalog or integration changed since preview; regenerate preview' USING ERRCODE='40001';
  END IF;
  IF v_preview.store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stores
     WHERE store_id=v_preview.store_id AND organization_id=p_organization_id AND NOT is_deleted
  ) THEN
    RAISE EXCEPTION 'Store changed since preview; regenerate preview' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce_catalog_sync_preview_rows WHERE catalog_sync_preview_id=p_preview_id AND proposed_action IN ('CONFLICT','INVALID')) THEN
    RAISE EXCEPTION 'Catalog preview has unresolved conflicts or invalid records' USING ERRCODE='23505';
  END IF;
  FOR r IN SELECT * FROM commerce_catalog_sync_preview_rows WHERE catalog_sync_preview_id=p_preview_id AND eligible_for_apply ORDER BY row_number FOR UPDATE LOOP
    IF r.proposed_action NOT IN ('NEW','MATCHED','UPDATE','UNCHANGED') OR NOT r.active THEN CONTINUE; END IF;
    IF r.canonical_product_id IS NOT NULL THEN
      SELECT product_id INTO v_product FROM product WHERE product_id=r.canonical_product_id AND organization_id=p_organization_id AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND OR (r.canonical_product_version_no IS NOT NULL AND (SELECT version_no FROM product WHERE product_id=v_product)<>r.canonical_product_version_no) THEN
        RAISE EXCEPTION 'Canonical product changed since preview; regenerate preview' USING ERRCODE='40001';
      END IF;
    ELSE
      IF r.proposed_action <> 'NEW' THEN RAISE EXCEPTION 'Preview contains an unsafe product mapping' USING ERRCODE='23505'; END IF;
      v_product:=generate_runtime_id('PRD');
      INSERT INTO product(product_id,organization_id,product_code,product_name,description,status_id,product_catalog_id,sku,base_price_minor,currency_code,created_by,updated_by)
      VALUES(v_product,p_organization_id,'POS-' || upper(substr(md5(v_preview.integration_configuration_id || ':' || r.external_product_id || ':' || coalesce(r.external_variant_id,'')),1,24)),r.product_name,r.description,'entity-status-product-active',v_preview.product_catalog_id,r.external_sku,r.unit_price_minor,r.currency_code,p_actor_user_id,p_actor_user_id);
      v_created:=v_created+1;
    END IF;
    IF r.commerce_product_mapping_id IS NOT NULL THEN
      SELECT commerce_product_mapping_id INTO v_mapping
        FROM commerce_product_mappings
       WHERE commerce_product_mapping_id=r.commerce_product_mapping_id
         AND organization_id=p_organization_id
         AND integration_configuration_id=v_preview.integration_configuration_id
         AND store_id IS NOT DISTINCT FROM v_preview.store_id
         AND external_product_id=r.external_product_id
         AND external_variant_id IS NOT DISTINCT FROM r.external_variant_id
         AND NOT is_deleted
       FOR UPDATE;
      IF NOT FOUND OR r.mapping_version_no IS NULL
         OR (SELECT product_id FROM commerce_product_mappings WHERE commerce_product_mapping_id=v_mapping) IS DISTINCT FROM v_product
         OR (SELECT version_no FROM commerce_product_mappings WHERE commerce_product_mapping_id=v_mapping)<>r.mapping_version_no THEN
        RAISE EXCEPTION 'Commerce mapping changed since preview; regenerate preview' USING ERRCODE='40001';
      END IF;
      UPDATE commerce_product_mappings
         SET external_sku=r.external_sku,is_active=true,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1
       WHERE commerce_product_mapping_id=v_mapping
         AND (external_sku IS DISTINCT FROM r.external_sku OR NOT is_active);
    ELSE
      SELECT commerce_product_mapping_id INTO v_mapping
        FROM commerce_product_mappings
       WHERE organization_id=p_organization_id AND integration_configuration_id=v_preview.integration_configuration_id
         AND store_id IS NOT DISTINCT FROM v_preview.store_id AND external_product_id=r.external_product_id
         AND external_variant_id IS NOT DISTINCT FROM r.external_variant_id AND NOT is_deleted
       FOR UPDATE;
      IF FOUND THEN
        RAISE EXCEPTION 'Commerce mapping changed since preview; regenerate preview' USING ERRCODE='40001';
      END IF;
      v_mapping:=generate_runtime_id('CPM');
      INSERT INTO commerce_product_mappings(commerce_product_mapping_id,organization_id,product_id,integration_configuration_id,store_id,external_product_id,external_variant_id,external_sku,is_active,created_by,updated_by)
      VALUES(v_mapping,p_organization_id,v_product,v_preview.integration_configuration_id,v_preview.store_id,r.external_product_id,r.external_variant_id,r.external_sku,true,v_actor,v_actor);
    END IF;
    INSERT INTO commerce_product_snapshots(commerce_product_snapshot_id,organization_id,integration_configuration_id,store_id,external_product_id,external_variant_id,external_sku,product_name,description,currency_code,unit_price_minor_snapshot,is_active,source_updated_at,created_by,updated_by)
    VALUES(generate_runtime_id('CPS'),p_organization_id,v_preview.integration_configuration_id,v_preview.store_id,r.external_product_id,r.external_variant_id,r.external_sku,r.product_name,r.description,r.currency_code,r.unit_price_minor,r.active,r.source_updated_at,v_actor,v_actor)
    ON CONFLICT (organization_id,integration_configuration_id,(COALESCE(store_id,'')),external_product_id,(COALESCE(external_variant_id,''))) WHERE NOT is_deleted DO UPDATE
      SET external_sku=EXCLUDED.external_sku,product_name=EXCLUDED.product_name,description=EXCLUDED.description,
          currency_code=EXCLUDED.currency_code,unit_price_minor_snapshot=EXCLUDED.unit_price_minor_snapshot,
          is_active=EXCLUDED.is_active,source_updated_at=EXCLUDED.source_updated_at,last_synced_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=commerce_product_snapshots.version_no+1
      WHERE commerce_product_snapshots.external_sku IS DISTINCT FROM EXCLUDED.external_sku
         OR commerce_product_snapshots.product_name IS DISTINCT FROM EXCLUDED.product_name
         OR commerce_product_snapshots.description IS DISTINCT FROM EXCLUDED.description
         OR commerce_product_snapshots.currency_code IS DISTINCT FROM EXCLUDED.currency_code
         OR commerce_product_snapshots.unit_price_minor_snapshot IS DISTINCT FROM EXCLUDED.unit_price_minor_snapshot
         OR commerce_product_snapshots.is_active IS DISTINCT FROM EXCLUDED.is_active
         OR commerce_product_snapshots.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at;
    v_mapped:=v_mapped+1; v_count:=v_count+1;
  END LOOP;
  UPDATE commerce_catalog_sync_previews SET status='APPLIED',applied_at=CURRENT_TIMESTAMP,applied_by=v_actor,apply_idempotency_key=p_idempotency_key,apply_result=jsonb_build_object('previewId',p_preview_id,'createdCount',v_created,'appliedCount',v_count,'mappedCount',v_mapped),version_no=version_no+1 WHERE catalog_sync_preview_id=p_preview_id;
  RETURN (SELECT apply_result FROM commerce_catalog_sync_previews WHERE catalog_sync_preview_id=p_preview_id);
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".commerce_catalog_sync_previews,"${schemaName}".commerce_catalog_sync_preview_rows FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(varchar,varchar,varchar,varchar,jsonb,varchar),"${schemaName}".commerce_apply_catalog_sync_preview(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(varchar,varchar,varchar,varchar,jsonb,varchar),"${schemaName}".commerce_apply_catalog_sync_preview(varchar,varchar,varchar,varchar) TO "${appRole}";
