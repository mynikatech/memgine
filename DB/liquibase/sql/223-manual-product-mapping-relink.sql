-- W223 DRAFT: manual relink of one catalog-qualified commerce mapping.
-- REVIEW AGAINST CURRENT LOCAL W222 BEFORE MIGRATING. DO NOT DEPLOY UNREVIEWED.
-- Never merges/deletes Products and never rewrites historical transactions.

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_product_mapping_relink_audit (
  relink_audit_id varchar(64) PRIMARY KEY,
  organization_id varchar(64) NOT NULL,
  commerce_product_mapping_id varchar(64) NOT NULL,
  integration_configuration_id varchar(64) NOT NULL,
  store_id varchar(64) NOT NULL,
  external_catalog_id varchar(160) NOT NULL,
  external_product_id varchar(160) NOT NULL,
  external_variant_id varchar(160),
  old_product_id varchar(64) NOT NULL,
  new_product_id varchar(64) NOT NULL,
  old_mapping_version_no integer NOT NULL,
  new_mapping_version_no integer NOT NULL,
  actor_user_id varchar(64) NOT NULL,
  actor_organization_user_id varchar(64) NOT NULL,
  reason varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_commerce_relink_mapping FOREIGN KEY(commerce_product_mapping_id)
    REFERENCES "${schemaName}".commerce_product_mappings(commerce_product_mapping_id)
);
CREATE INDEX IF NOT EXISTS ix_commerce_mapping_relink_audit_org_mapping
  ON "${schemaName}".commerce_product_mapping_relink_audit
  (organization_id, commerce_product_mapping_id, created_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_preview_manual_product_relink(
  p_organization_id varchar,
  p_mapping_id varchar,
  p_target_product_id varchar,
  p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
  m commerce_product_mappings%ROWTYPE;
  t product%ROWTYPE;
  o product%ROWTYPE;
  v_pending integer;
BEGIN
  IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE='42501';
  END IF;
  SELECT * INTO m FROM commerce_product_mappings
   WHERE organization_id=p_organization_id AND commerce_product_mapping_id=p_mapping_id
     AND is_active AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active mapping not found' USING ERRCODE='23503'; END IF;
  IF m.store_id IS NULL OR NULLIF(btrim(m.external_catalog_id),'') IS NULL THEN
    RAISE EXCEPTION 'Legacy or unqualified mappings cannot be manually relinked' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM product WHERE product_id=p_target_product_id
    AND organization_id=p_organization_id AND NOT is_deleted
    AND status_id='entity-status-product-active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target must be an active Product in this organization' USING ERRCODE='23503'; END IF;
  SELECT * INTO o FROM product WHERE product_id=m.product_id
    AND organization_id=p_organization_id AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current canonical Product is missing' USING ERRCODE='23503'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM commerce_store_catalog_sources s
    JOIN poynt_store_catalog_configurations c
      ON c.organization_id=s.organization_id AND c.store_id=s.store_id
     AND c.integration_configuration_id=s.integration_configuration_id
    WHERE s.organization_id=p_organization_id AND s.store_id=m.store_id
      AND s.integration_configuration_id=m.integration_configuration_id
      AND c.effective_catalog_id=m.external_catalog_id
  ) THEN
    RAISE EXCEPTION 'Store effective catalog does not match mapping; refresh configuration' USING ERRCODE='40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM commerce_product_mappings duplicate
    WHERE duplicate.organization_id=m.organization_id
      AND duplicate.integration_configuration_id=m.integration_configuration_id
      AND duplicate.store_id IS NOT DISTINCT FROM m.store_id
      AND duplicate.external_catalog_id IS NOT DISTINCT FROM m.external_catalog_id
      AND duplicate.external_product_id=m.external_product_id
      AND duplicate.external_variant_id IS NOT DISTINCT FROM m.external_variant_id
      AND duplicate.commerce_product_mapping_id<>m.commerce_product_mapping_id
      AND duplicate.is_active AND NOT duplicate.is_deleted
  ) THEN
    RAISE EXCEPTION 'Ambiguous external product identity' USING ERRCODE='23505';
  END IF;
  SELECT count(*) INTO v_pending FROM commerce_catalog_sync_preview_rows r
    JOIN commerce_catalog_sync_previews p ON p.catalog_sync_preview_id=r.catalog_sync_preview_id
    WHERE r.commerce_product_mapping_id=m.commerce_product_mapping_id
      AND p.organization_id=p_organization_id AND p.status='READY'
      AND p.expires_at>CURRENT_TIMESTAMP;
  RETURN jsonb_build_object(
    'mappingId',m.commerce_product_mapping_id,
    'organizationId',m.organization_id,
    'storeId',m.store_id,
    'integrationConfigurationId',m.integration_configuration_id,
    'externalCatalogId',m.external_catalog_id,
    'externalProductId',m.external_product_id,
    'externalVariantId',m.external_variant_id,
    'externalSku',m.external_sku,
    'expectedMappingVersionNo',m.version_no,
    'currentProductId',m.product_id,
    'currentProductName',o.product_name,
    'targetProductId',t.product_id,
    'targetProductName',t.product_name,
    'targetProductVersionNo',t.version_no,
    'alreadyLinked',m.product_id=t.product_id,
    'pendingCatalogPreviewCount',v_pending,
    'warning','Existing Benefits and Offers referencing the old Product are not migrated'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_confirm_manual_product_relink(
  p_organization_id varchar,
  p_mapping_id varchar,
  p_target_product_id varchar,
  p_expected_mapping_version_no integer,
  p_expected_target_product_version_no integer,
  p_reason varchar,
  p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
  m commerce_product_mappings%ROWTYPE;
  t product%ROWTYPE;
  v_actor varchar(64);
  v_preview jsonb;
  v_audit_id varchar(64);
BEGIN
  IF NULLIF(btrim(p_reason),'') IS NULL OR length(p_reason)>500 THEN
    RAISE EXCEPTION 'A reconciliation reason (1-500 characters) is required' USING ERRCODE='22023';
  END IF;
  IF p_expected_mapping_version_no IS NULL OR p_expected_target_product_version_no IS NULL THEN
    RAISE EXCEPTION 'Expected versions are required' USING ERRCODE='22023';
  END IF;
  v_actor := commerce_actor_organization_user(p_organization_id,p_actor_user_id);
  SELECT * INTO m FROM commerce_product_mappings WHERE organization_id=p_organization_id
    AND commerce_product_mapping_id=p_mapping_id FOR UPDATE;
  IF NOT FOUND OR m.is_deleted OR NOT m.is_active THEN
    RAISE EXCEPTION 'Active mapping not found' USING ERRCODE='23503';
  END IF;
  SELECT * INTO t FROM product WHERE organization_id=p_organization_id
    AND product_id=p_target_product_id FOR UPDATE;
  IF NOT FOUND OR t.is_deleted OR t.status_id<>'entity-status-product-active' THEN
    RAISE EXCEPTION 'Target must be an active Product in this organization' USING ERRCODE='23503';
  END IF;
  IF m.version_no<>p_expected_mapping_version_no OR t.version_no<>p_expected_target_product_version_no THEN
    RAISE EXCEPTION 'Mapping or target Product changed; preview again' USING ERRCODE='40001';
  END IF;
  -- Recheck all catalog and duplicate-identity requirements while holding mapping lock.
  v_preview := commerce_preview_manual_product_relink(p_organization_id,p_mapping_id,p_target_product_id,p_actor_user_id);
  IF m.product_id=p_target_product_id THEN
    RETURN jsonb_build_object('changed',false,'mappingId',p_mapping_id,
      'productId',p_target_product_id,'versionNo',m.version_no);
  END IF;
  UPDATE commerce_product_mappings SET product_id=p_target_product_id,
    updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1
   WHERE commerce_product_mapping_id=m.commerce_product_mapping_id;
  v_audit_id:=generate_runtime_id('CPR');
  INSERT INTO commerce_product_mapping_relink_audit (
    relink_audit_id,organization_id,commerce_product_mapping_id,
    integration_configuration_id,store_id,external_catalog_id,external_product_id,
    external_variant_id,old_product_id,new_product_id,old_mapping_version_no,
    new_mapping_version_no,actor_user_id,actor_organization_user_id,reason)
  VALUES(v_audit_id,p_organization_id,m.commerce_product_mapping_id,
    m.integration_configuration_id,m.store_id,m.external_catalog_id,m.external_product_id,
    m.external_variant_id,m.product_id,p_target_product_id,m.version_no,
    m.version_no+1,p_actor_user_id,v_actor,btrim(p_reason));
  -- All pending previews referencing the prior mapping version become stale.
  -- Pending previews are NOT modified. Their existing version/product assertions
  -- make stale apply fail, requiring administrator to generate a new preview.
  RETURN jsonb_build_object('changed',true,'mappingId',p_mapping_id,
    'previousProductId',m.product_id,'productId',p_target_product_id,
    'versionNo',m.version_no+1,'auditId',v_audit_id);
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_preview_manual_product_relink(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_confirm_manual_product_relink(varchar,varchar,varchar,integer,integer,varchar,varchar) FROM PUBLIC;
