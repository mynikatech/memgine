-- 307B read-only contract checks. Run on LOCAL after replacing Liquibase properties.
-- This does NOT create/update business data or trigger live fulfillment.
DO $checks$
DECLARE
 v_count integer;
 v_org varchar;
 v_store varchar;
 v_product varchar;
 v_mapping varchar;
 v_pos_categories integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
   WHERE n.nspname='${schemaName}' AND c.conname='fulfillment_workflow_rules_target_kind_check'
     AND pg_get_constraintdef(c.oid) LIKE '%POS_CATEGORY%') THEN
   RAISE EXCEPTION 'POS_CATEGORY rule kind constraint is missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='${schemaName}' AND table_name='fulfillment_items'
     AND column_name='commerce_product_mapping_id') THEN
   RAISE EXCEPTION 'fulfillment_items mapping snapshot identity column missing'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='${schemaName}' AND table_name='fulfillment_items'
     AND column_name='external_categories_snapshot') THEN
   RAISE EXCEPTION 'fulfillment_items category snapshot column missing'; END IF;
 IF NOT has_function_privilege('${appRole}',format('%I.%I(varchar,varchar,varchar,varchar,integer,varchar)',
     '${schemaName}','save_fulfillment_pos_category_rule'),'EXECUTE') THEN
   RAISE EXCEPTION 'App role cannot save POS category rules'; END IF;
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE ns.nspname='${schemaName}'
     AND p.proname='fulfillment_resolve_product_workflow'
     AND p.pronargs=4 AND a.grantee=0 AND a.privilege_type='EXECUTE'
 ) THEN RAISE EXCEPTION 'Internal 4-argument resolver must not be PUBLIC'; END IF;
 IF has_table_privilege('${appRole}',format('%I.%I','${schemaName}','fulfillment_workflow_rules'),'UPDATE')
   OR has_table_privilege('${appRole}',format('%I.%I','${schemaName}','fulfillment_items'),'UPDATE') THEN
   RAISE EXCEPTION 'Application role must not update fulfillment tables directly'; END IF;
 IF "${schemaName}".fulfillment_pos_category_key('a','b','c') <>
    "${schemaName}".fulfillment_pos_category_key('a','b','c')
    OR "${schemaName}".fulfillment_pos_category_key('a','b','c') =
       "${schemaName}".fulfillment_pos_category_key('a','d','c') THEN
    RAISE EXCEPTION 'Category identity hashing is not stable or scoped'; END IF;
 RAISE NOTICE '307B schema and permission checks PASSED';

 -- Find one existing active Store mapping for a representative sanity read.
 SELECT m.organization_id,m.store_id,m.product_id,m.commerce_product_mapping_id
 INTO v_org,v_store,v_product,v_mapping
 FROM "${schemaName}".commerce_product_mappings m
 WHERE m.store_id IS NOT NULL AND m.product_id IS NOT NULL
   AND m.is_active AND NOT m.is_deleted
 ORDER BY m.organization_id,m.store_id,m.commerce_product_mapping_id LIMIT 1;
 IF FOUND THEN
   SELECT COUNT(*) INTO v_pos_categories FROM "${schemaName}".fulfillment_store_product_pos_categories(
     v_org,v_store,v_product,v_mapping);
   RAISE NOTICE 'Representative Store mapping has % category references (0 can be valid if no metadata)',v_pos_categories;
 ELSE RAISE NOTICE 'No Store-linked product mapping available for representative check'; END IF;
END
$checks$;
