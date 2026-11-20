-- 307B: forward-only correction to 307A. Categories imported from Poynt are
-- snapshot-owned, NOT necessarily product.product_catalog_category_id.
-- NO live Counter/Customer fulfillment processing is introduced here.
-- Supports optional Store+verified-catalog-scoped POS_CATEGORY exceptions.
-- Organization default and existing Organization/Store CATEGORY/PRODUCT rules stay intact.

ALTER TABLE "${schemaName}".fulfillment_workflow_rules
  DROP CONSTRAINT IF EXISTS fulfillment_workflow_rules_target_kind_check;
ALTER TABLE "${schemaName}".fulfillment_workflow_rules
  ADD CONSTRAINT fulfillment_workflow_rules_target_kind_check
  CHECK (target_kind IN ('CATEGORY','PRODUCT','POS_CATEGORY'));

-- Future runtime should store the source mapping and the external category
-- snapshot used at acceptance, rather than trust a later re-sync.
ALTER TABLE "${schemaName}".fulfillment_items
  ADD COLUMN IF NOT EXISTS commerce_product_mapping_id varchar(64)
    REFERENCES "${schemaName}".commerce_product_mappings(commerce_product_mapping_id),
  ADD COLUMN IF NOT EXISTS external_categories_snapshot jsonb;
ALTER TABLE "${schemaName}".fulfillment_items
  ADD CONSTRAINT ck_fulfillment_item_external_categories_snapshot
  CHECK (external_categories_snapshot IS NULL OR jsonb_typeof(external_categories_snapshot) = 'array');

-- The rule key is unambiguous for a provider integration + external catalog
-- + external category. Names are intentionally NOT part of the identity.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_pos_category_key(
  p_integration_id varchar, p_external_catalog_id varchar, p_external_category_id varchar
) RETURNS varchar LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,"${schemaName}"
AS $function$
 SELECT ('PCAT-' || md5(
   length(p_integration_id)::text || ':' || p_integration_id ||
   length(p_external_catalog_id)::text || ':' || p_external_catalog_id ||
   length(p_external_category_id)::text || ':' || p_external_category_id
 ))::varchar;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_pos_category_key(varchar,varchar,varchar) FROM PUBLIC;

-- A snapshot is eligible only for the selected Store, linked canonical product,
-- active mapping/snapshot, and current verified Poynt catalog if provider=POYNT.
-- Other POS providers can use their mapped external categories when present.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_store_product_pos_categories(
 p_organization_id varchar, p_store_id varchar, p_product_id varchar,
 p_mapping_id varchar DEFAULT NULL
) RETURNS TABLE (target_id varchar, external_category_id varchar, category_name varchar,
                  integration_configuration_id varchar, external_catalog_id varchar,
                  mapping_id varchar)
LANGUAGE sql STABLE
SET search_path=pg_catalog,"${schemaName}"
AS $function$
 SELECT DISTINCT
   "${schemaName}".fulfillment_pos_category_key(m.integration_configuration_id,
     m.external_catalog_id, cat.value->>'externalCategoryId'),
   (cat.value->>'externalCategoryId')::varchar,
   NULLIF(btrim(cat.value->>'categoryName'),'')::varchar,
   m.integration_configuration_id, m.external_catalog_id,
   m.commerce_product_mapping_id
 FROM "${schemaName}".commerce_product_mappings m
 JOIN "${schemaName}".commerce_product_snapshots snap
   ON snap.commerce_product_mapping_id=m.commerce_product_mapping_id
  AND snap.organization_id=m.organization_id
  AND snap.store_id=m.store_id
  AND snap.integration_configuration_id=m.integration_configuration_id
  AND snap.external_catalog_id IS NOT DISTINCT FROM m.external_catalog_id
  AND snap.is_active AND NOT snap.is_deleted
 JOIN "${schemaName}".integration_configurations i
   ON i.integration_configuration_id=m.integration_configuration_id
  AND i.organization_id=m.organization_id AND NOT i.is_deleted
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(snap.external_categories)='array'
     THEN snap.external_categories ELSE '[]'::jsonb END
 ) cat(value)
 WHERE m.organization_id=p_organization_id
   AND m.store_id=p_store_id AND m.product_id=p_product_id
   AND (p_mapping_id IS NULL OR m.commerce_product_mapping_id=p_mapping_id)
   AND m.is_active AND NOT m.is_deleted
   AND snap.category_metadata_available
   AND NULLIF(btrim(cat.value->>'externalCategoryId'),'') IS NOT NULL
   AND NULLIF(btrim(m.external_catalog_id),'') IS NOT NULL
   AND (upper(i.provider) <> 'POYNT' OR EXISTS (
       SELECT 1 FROM "${schemaName}".commerce_store_catalog_sources source
       JOIN "${schemaName}".poynt_store_catalog_configurations config
         ON config.organization_id=source.organization_id
        AND config.store_id=source.store_id
        AND config.integration_configuration_id=source.integration_configuration_id
       WHERE source.organization_id=m.organization_id AND source.store_id=m.store_id
         AND source.integration_configuration_id=m.integration_configuration_id
         AND config.effective_catalog_id=m.external_catalog_id
   ));
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_store_product_pos_categories(varchar,varchar,varchar,varchar) FROM PUBLIC;

-- For future acceptance code: the 4th argument is the exact *sale line mapping*.
-- Never silently guess from a different Store/catalog or from product name.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(
 p_organization_id varchar, p_store_id varchar, p_product_id varchar, p_mapping_id varchar
) RETURNS varchar LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
 v_category_id varchar(64);
 v_workflow varchar(16);
 v_store_rule_count integer;
 v_org_default jsonb;
 v_store_default jsonb;
 v_matching_mapping_count integer;
 v_effective_mapping_id varchar(64);
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "${schemaName}".stores s
  WHERE s.store_id=p_store_id AND s.organization_id=p_organization_id AND NOT s.is_deleted) THEN
  RAISE EXCEPTION 'Store not found for fulfillment workflow' USING ERRCODE='P0002'; END IF;
 SELECT p.product_catalog_category_id INTO v_category_id FROM "${schemaName}".product p
 WHERE p.product_id=p_product_id AND p.organization_id=p_organization_id AND NOT p.is_deleted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found for fulfillment workflow' USING ERRCODE='P0002'; END IF;

 IF p_mapping_id IS NOT NULL THEN
   SELECT m.commerce_product_mapping_id INTO v_effective_mapping_id
   FROM "${schemaName}".commerce_product_mappings m
   WHERE m.commerce_product_mapping_id=p_mapping_id AND m.organization_id=p_organization_id
     AND m.store_id=p_store_id AND m.product_id=p_product_id AND m.is_active AND NOT m.is_deleted;
   IF NOT FOUND THEN RAISE EXCEPTION 'Mapping does not belong to the Store and Product' USING ERRCODE='22023'; END IF;
 ELSE
   SELECT COUNT(*), MIN(m.commerce_product_mapping_id)
   INTO v_matching_mapping_count, v_effective_mapping_id
   FROM "${schemaName}".commerce_product_mappings m
   WHERE m.organization_id=p_organization_id AND m.store_id=p_store_id
     AND m.product_id=p_product_id AND m.is_active AND NOT m.is_deleted;
   IF v_matching_mapping_count > 1 THEN
     RAISE EXCEPTION 'Multiple Store catalog mappings; pass the exact mapping ID to resolve workflow' USING ERRCODE='22023';
   END IF;
 END IF;

 -- Product rules preserve 307A precedence, both scopes optional.
 SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND r.store_id=p_store_id
   AND r.target_kind='PRODUCT' AND r.target_id=p_product_id AND NOT r.is_deleted;
 IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
 SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND r.store_id IS NULL
   AND r.target_kind='PRODUCT' AND r.target_id=p_product_id AND NOT r.is_deleted;
 IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;

 -- POS categories are Store-specific because they derive from its catalog.
 -- If a product has multiple differently configured categories, reject the
 -- ambiguous override instead of picking one alphabetically.
 SELECT COUNT(DISTINCT rule.workflow_code), MIN(rule.workflow_code)
 INTO v_store_rule_count,v_workflow
 FROM "${schemaName}".fulfillment_store_product_pos_categories(
       p_organization_id,p_store_id,p_product_id,v_effective_mapping_id) cats
 JOIN "${schemaName}".fulfillment_workflow_rules rule
   ON rule.organization_id=p_organization_id AND rule.store_id=p_store_id
  AND rule.target_kind='POS_CATEGORY' AND rule.target_id=cats.target_id
  AND NOT rule.is_deleted;
 IF v_store_rule_count > 1 THEN
   RAISE EXCEPTION 'Conflicting POS category workflows for the same product in this Store' USING ERRCODE='22023';
 END IF;
 IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;

 -- Preserve canonical (manual/imported) category rules from 307A.
 IF v_category_id IS NOT NULL THEN
   SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
   WHERE r.organization_id=p_organization_id AND r.store_id=p_store_id
     AND r.target_kind='CATEGORY' AND r.target_id=v_category_id AND NOT r.is_deleted;
   IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
   SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
   WHERE r.organization_id=p_organization_id AND r.store_id IS NULL
     AND r.target_kind='CATEGORY' AND r.target_id=v_category_id AND NOT r.is_deleted;
   IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
 END IF;
 v_org_default := "${schemaName}".fulfillment_resolve_org_policy(p_organization_id);
 SELECT "${schemaName}".fulfillment_apply_store_overrides(v_org_default,s.fulfillment_overrides)
 INTO v_store_default FROM "${schemaName}".stores s
 WHERE s.organization_id=p_organization_id AND s.store_id=p_store_id;
 RETURN COALESCE(v_store_default #>> '{fulfillmentTypes,ORDER,workflow}',
                 v_org_default #>> '{fulfillmentTypes,ORDER,workflow}','NONE');
END;
$function$;

-- Compatibility signature, but fail closed if more than one Store product
-- mapping exists. Future 308/309 must supply mapping ID where available.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(
 p_organization_id varchar, p_store_id varchar, p_product_id varchar
) RETURNS varchar LANGUAGE sql STABLE
SET search_path=pg_catalog,"${schemaName}"
AS $function$
 SELECT "${schemaName}".fulfillment_resolve_product_workflow($1,$2,$3,NULL::varchar);
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(varchar,varchar,varchar,varchar) FROM "${appRole}";

-- Store-level POS category rules: existing 307A categories/products remain
-- administered by its original save function; only new rules go through this.
CREATE OR REPLACE FUNCTION "${schemaName}".save_fulfillment_pos_category_rule(
 p_organization_id varchar, p_store_id varchar, p_target_id varchar,
 p_workflow_code varchar, p_expected_version integer, p_actor_user_id varchar
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
 v_existing "${schemaName}".fulfillment_workflow_rules%ROWTYPE;
 v_next_version integer;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Fulfillment rule update denied' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<0 OR NULLIF(btrim(p_target_id),'') IS NULL
    OR NULLIF(btrim(p_store_id),'') IS NULL OR p_target_id !~ '^PCAT-[a-f0-9]{32}$' THEN
   RAISE EXCEPTION 'Invalid POS category rule request' USING ERRCODE='22023'; END IF;
 IF p_workflow_code IS NOT NULL AND p_workflow_code NOT IN ('NONE','SIMPLE','DETAILED') THEN
   RAISE EXCEPTION 'Invalid workflow' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM "${schemaName}".organization o WHERE o.organization_id=p_organization_id
   AND NOT o.is_deleted FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "${schemaName}".stores s
    WHERE s.organization_id=p_organization_id AND s.store_id=p_store_id AND NOT s.is_deleted) THEN
   RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 IF p_workflow_code IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".commerce_product_mappings m
   JOIN "${schemaName}".product p ON p.product_id=m.product_id
     AND p.organization_id=p_organization_id AND NOT p.is_deleted
   CROSS JOIN LATERAL "${schemaName}".fulfillment_store_product_pos_categories(
       p_organization_id,p_store_id,m.product_id,m.commerce_product_mapping_id) cat
   WHERE m.organization_id=p_organization_id AND m.store_id=p_store_id
     AND m.is_active AND NOT m.is_deleted AND cat.target_id=p_target_id
 ) THEN RAISE EXCEPTION 'POS category not available in the selected Store catalog' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_existing FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND r.store_id=p_store_id
   AND r.target_kind='POS_CATEGORY' AND r.target_id=p_target_id FOR UPDATE;
 IF NOT FOUND THEN
   IF p_expected_version<>0 THEN RAISE EXCEPTION 'Rule changed' USING ERRCODE='40001'; END IF;
   IF p_workflow_code IS NOT NULL THEN
     INSERT INTO "${schemaName}".fulfillment_workflow_rules
       (rule_id,organization_id,store_id,target_kind,target_id,workflow_code,created_by,updated_by)
     VALUES ("${schemaName}".generate_runtime_id('FWR'),p_organization_id,p_store_id,
       'POS_CATEGORY',p_target_id,p_workflow_code,p_actor_user_id,p_actor_user_id);
     v_next_version:=1;
   ELSE v_next_version:=0; END IF;
 ELSE
   IF (NOT v_existing.is_deleted AND p_expected_version<>v_existing.version_no)
       OR (v_existing.is_deleted AND p_expected_version<>0) THEN
     RAISE EXCEPTION 'Rule changed' USING ERRCODE='40001'; END IF;
   UPDATE "${schemaName}".fulfillment_workflow_rules SET
     workflow_code=COALESCE(p_workflow_code,workflow_code),
     is_deleted=(p_workflow_code IS NULL),
     updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC',updated_by=p_actor_user_id,
     version_no=version_no+1
   WHERE rule_id=v_existing.rule_id RETURNING version_no INTO v_next_version;
 END IF;
 RETURN jsonb_build_object('targetKind','POS_CATEGORY','targetId',p_target_id,
   'storeId',p_store_id,'workflow',p_workflow_code,'versionNo',v_next_version);
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".save_fulfillment_pos_category_rule(varchar,varchar,varchar,varchar,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_fulfillment_pos_category_rule(varchar,varchar,varchar,varchar,integer,varchar) TO "${appRole}";

-- Products and POS categories use the same Store/catalog-qualified mappings
-- and snapshots as the Organization Admin Products tab.
CREATE OR REPLACE FUNCTION "${schemaName}".get_fulfillment_workflow_rules(
 p_organization_id varchar, p_store_id varchar, p_search varchar, p_actor_user_id varchar
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE v_categories jsonb; v_products jsonb; v_rules jsonb; v_store_id varchar(64);
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Fulfillment rules access denied' USING ERRCODE='42501'; END IF;
 v_store_id:=NULLIF(btrim(p_store_id),'');
 IF v_store_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".stores s WHERE s.store_id=v_store_id
      AND s.organization_id=p_organization_id AND NOT s.is_deleted
 ) THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;

 -- Preserve canonical catalog categories, including manual catalogs.
 -- Store scope narrows categories to products linked to that Store; if a manual
 -- product has no mapping, Organization scope can still hold its category rule.
 WITH canonical AS (
   SELECT cat.product_catalog_category_id AS category_id,cat.category_name,
     cat.product_catalog_id AS catalog_id,pc.catalog_name,
     COUNT(DISTINCT p.product_id)::integer AS product_count
   FROM "${schemaName}".product_catalog_category cat
   JOIN "${schemaName}".product_catalog pc ON pc.product_catalog_id=cat.product_catalog_id
     AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
   LEFT JOIN "${schemaName}".product p ON p.product_catalog_category_id=cat.product_catalog_category_id
     AND p.organization_id=p_organization_id AND NOT p.is_deleted
   WHERE cat.organization_id=p_organization_id AND NOT cat.is_deleted
     AND (v_store_id IS NULL OR EXISTS (
       SELECT 1 FROM "${schemaName}".commerce_product_mappings m
       WHERE m.organization_id=p_organization_id AND m.store_id=v_store_id
         AND m.product_id=p.product_id AND m.is_active AND NOT m.is_deleted
     ))
   GROUP BY cat.product_catalog_category_id,cat.category_name,cat.product_catalog_id,pc.catalog_name
 ), pos AS (
   SELECT c.target_id AS category_id,
          COALESCE(MIN(c.category_name),MIN(c.external_category_id)) AS category_name,
          (c.integration_configuration_id || '|' || c.external_catalog_id)::varchar AS catalog_id,
          COALESCE(cfg.effective_catalog_name,c.external_catalog_id)::varchar AS catalog_name,
          COUNT(DISTINCT m.product_id)::integer AS product_count
   FROM "${schemaName}".commerce_product_mappings m
   JOIN "${schemaName}".product p ON p.product_id=m.product_id
    AND p.organization_id=p_organization_id AND NOT p.is_deleted
   CROSS JOIN LATERAL "${schemaName}".fulfillment_store_product_pos_categories(
        p_organization_id,v_store_id,m.product_id,m.commerce_product_mapping_id) c
   LEFT JOIN "${schemaName}".poynt_store_catalog_configurations cfg
     ON cfg.organization_id=p_organization_id AND cfg.store_id=v_store_id
    AND cfg.integration_configuration_id=c.integration_configuration_id
    AND cfg.effective_catalog_id=c.external_catalog_id
   WHERE v_store_id IS NOT NULL AND m.organization_id=p_organization_id
     AND m.store_id=v_store_id AND m.is_active AND NOT m.is_deleted
   GROUP BY c.target_id,c.integration_configuration_id,
     c.external_catalog_id,cfg.effective_catalog_name
 ), combined AS (
   SELECT 'CATEGORY'::varchar AS kind,canonical.category_id,canonical.category_name,
     canonical.catalog_id,canonical.catalog_name,canonical.product_count FROM canonical
   UNION ALL
   SELECT 'POS_CATEGORY'::varchar,pos.category_id,pos.category_name,
     pos.catalog_id,pos.catalog_name,pos.product_count FROM pos
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'targetKind',kind,'categoryId',category_id,'categoryName',category_name,
    'catalogId',catalog_id,'catalogName',catalog_name,'productCount',product_count)
    ORDER BY catalog_name,category_name,category_id),'[]'::jsonb)
 INTO v_categories FROM combined;

 WITH store_products AS (
   SELECT DISTINCT ON (p.product_id)
      p.product_id, COALESCE(NULLIF(btrim(snap.product_name),''),p.product_name) AS product_name,
      CASE WHEN snap.category_metadata_available THEN (
        SELECT string_agg(COALESCE(NULLIF(catref.value->>'categoryName',''),catref.value->>'externalCategoryId'),', ')
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(snap.external_categories)='array'
          THEN snap.external_categories ELSE '[]'::jsonb END) catref(value)
      ) ELSE cat.category_name END AS category_name,
      p.product_catalog_category_id,
      COALESCE(cfg.effective_catalog_name,m.external_catalog_id,pc.catalog_name) AS catalog_name,
      p.product_code,p.sku,m.external_sku
   FROM "${schemaName}".commerce_product_mappings m
   JOIN "${schemaName}".product p ON p.product_id=m.product_id
     AND p.organization_id=p_organization_id AND NOT p.is_deleted
   JOIN "${schemaName}".integration_configurations i
     ON i.integration_configuration_id=m.integration_configuration_id
    AND i.organization_id=p_organization_id AND NOT i.is_deleted
   LEFT JOIN "${schemaName}".product_catalog pc ON pc.product_catalog_id=p.product_catalog_id
     AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
   LEFT JOIN "${schemaName}".product_catalog_category cat
     ON cat.product_catalog_category_id=p.product_catalog_category_id AND NOT cat.is_deleted
   LEFT JOIN "${schemaName}".commerce_product_snapshots snap
     ON snap.commerce_product_mapping_id=m.commerce_product_mapping_id
       AND snap.organization_id=m.organization_id AND snap.store_id=m.store_id
       AND snap.integration_configuration_id=m.integration_configuration_id
       AND snap.external_catalog_id IS NOT DISTINCT FROM m.external_catalog_id
       AND NOT snap.is_deleted
   LEFT JOIN "${schemaName}".poynt_store_catalog_configurations cfg
     ON cfg.organization_id=m.organization_id AND cfg.store_id=m.store_id
       AND cfg.integration_configuration_id=m.integration_configuration_id
       AND cfg.effective_catalog_id=m.external_catalog_id
   WHERE v_store_id IS NOT NULL AND m.organization_id=p_organization_id
     AND m.store_id=v_store_id AND m.is_active AND NOT m.is_deleted
     AND (upper(i.provider)<>'POYNT' OR EXISTS (
       SELECT 1 FROM "${schemaName}".commerce_store_catalog_sources src
       JOIN "${schemaName}".poynt_store_catalog_configurations cfg_current
         ON cfg_current.organization_id=src.organization_id
        AND cfg_current.store_id=src.store_id
        AND cfg_current.integration_configuration_id=src.integration_configuration_id
       WHERE src.organization_id=m.organization_id AND src.store_id=m.store_id
         AND src.integration_configuration_id=m.integration_configuration_id
         AND cfg_current.effective_catalog_id=m.external_catalog_id
     ))
     AND (NULLIF(btrim(p_search),'') IS NULL
       OR COALESCE(snap.product_name,p.product_name) ILIKE '%'||btrim(p_search)||'%'
       OR p.product_name ILIKE '%'||btrim(p_search)||'%'
       OR p.product_code ILIKE '%'||btrim(p_search)||'%'
       OR COALESCE(p.sku,'') ILIKE '%'||btrim(p_search)||'%'
       OR COALESCE(m.external_sku,'') ILIKE '%'||btrim(p_search)||'%')
   ORDER BY p.product_id,snap.updated_at DESC NULLS LAST,m.commerce_product_mapping_id
 ), chosen AS (
   SELECT p.product_id,p.product_name,cat.category_name,
          p.product_catalog_category_id,pc.catalog_name,
          p.product_code,p.sku,NULL::varchar AS external_sku
   FROM "${schemaName}".product p
   JOIN "${schemaName}".product_catalog pc ON pc.product_catalog_id=p.product_catalog_id
       AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
   LEFT JOIN "${schemaName}".product_catalog_category cat
      ON cat.product_catalog_category_id=p.product_catalog_category_id AND NOT cat.is_deleted
   WHERE v_store_id IS NULL AND p.organization_id=p_organization_id AND NOT p.is_deleted
     AND (NULLIF(btrim(p_search),'') IS NULL
       OR p.product_name ILIKE '%'||btrim(p_search)||'%'
       OR p.product_code ILIKE '%'||btrim(p_search)||'%'
       OR COALESCE(p.sku,'') ILIKE '%'||btrim(p_search)||'%')
   UNION ALL
   SELECT product_id,product_name,category_name,product_catalog_category_id,
     catalog_name,product_code,sku,external_sku FROM store_products
 ), limited AS (
   SELECT product_id,product_name,product_catalog_category_id AS category_id,
       category_name,catalog_name FROM chosen
   ORDER BY product_name,product_id LIMIT 100
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'productId',product_id,'productName',product_name,'categoryId',category_id,
     'categoryName',category_name,'catalogName',catalog_name)
     ORDER BY product_name,product_id),'[]'::jsonb)
 INTO v_products FROM limited;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'targetKind',r.target_kind,'targetId',r.target_id,'storeId',r.store_id,
   'workflow',r.workflow_code,'versionNo',r.version_no)
   ORDER BY r.target_kind,r.target_id,r.store_id),'[]'::jsonb)
 INTO v_rules FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND NOT r.is_deleted
   AND (r.store_id IS NULL OR r.store_id=v_store_id);
 RETURN jsonb_build_object('categories',v_categories,'products',v_products,'rules',v_rules);
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".get_fulfillment_workflow_rules(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_fulfillment_workflow_rules(varchar,varchar,varchar,varchar) TO "${appRole}";
