-- Run with Liquibase property substitution (schemaName/appRole), or replace the
-- placeholders with your environment's schema and app role before using psql.
-- Read-only contract checks; no data updates or live order processing.
DO $checks$
DECLARE
  v_missing text;
  v_default jsonb;
BEGIN
  SELECT string_agg(name, ', ') INTO v_missing FROM (
    SELECT unnest(ARRAY[
      'fulfillment_workflow_rules','fulfillment_items','fulfillment_item_actions'
    ]) AS name
  ) n
  WHERE to_regclass(format('%I.%I', '${schemaName}', n.name)) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing tables: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='${schemaName}' AND p.proname='fulfillment_resolve_product_workflow'
      AND pg_get_function_identity_arguments(p.oid) LIKE 'p_organization_id%'
  ) THEN
    RAISE EXCEPTION 'Product workflow resolver missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='${schemaName}' AND p.proname='get_fulfillment_workflow_rules'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='${schemaName}' AND p.proname='save_fulfillment_workflow_rule'
  ) THEN RAISE EXCEPTION 'Admin workflow rule function missing'; END IF;

  IF has_table_privilege('${appRole}', format('%I.%I','${schemaName}', 'fulfillment_items'), 'INSERT')
     OR has_table_privilege('${appRole}', format('%I.%I','${schemaName}', 'fulfillment_items'), 'UPDATE')
     OR has_table_privilege('${appRole}', format('%I.%I','${schemaName}', 'fulfillment_workflow_rules'), 'INSERT')
     OR has_table_privilege('${appRole}', format('%I.%I','${schemaName}', 'fulfillment_workflow_rules'), 'UPDATE')
  THEN RAISE EXCEPTION 'Application role must not directly write fulfillment storage'; END IF;

  IF NOT has_function_privilege('${appRole}', format('%I.%I(varchar,varchar,varchar,varchar)',
     '${schemaName}', 'get_fulfillment_workflow_rules'), 'EXECUTE')
     OR NOT has_function_privilege('${appRole}', format('%I.%I(varchar,varchar,varchar,varchar,varchar,integer,varchar)',
     '${schemaName}', 'save_fulfillment_workflow_rule'), 'EXECUTE')
  THEN RAISE EXCEPTION 'Admin rule function grant missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f',p.proowner))
    ) grants
    WHERE ns.nspname='${schemaName}'
      AND p.proname='fulfillment_resolve_product_workflow'
      AND grants.grantee=0 AND grants.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'Workflow resolver must not be PUBLIC'; END IF;

  SELECT "${schemaName}".fulfillment_policy_defaults() INTO v_default;
  IF v_default #>> '{fulfillmentTypes,ORDER,workflow}' <> 'NONE'
     OR v_default #>> '{fulfillmentTypes,ORDER,partialHandoverEnabled}' <> 'false'
  THEN RAISE EXCEPTION 'Defaults are incorrect'; END IF;
  RAISE NOTICE '307a static contract checks passed';
END
$checks$;
