--liquibase formatted sql

--changeset mynikatech:209-poynt-store-configuration-status-fix splitStatements:false

CREATE OR REPLACE FUNCTION "${schemaName}".organization_list_poynt_store_catalog_configurations(
    p_organization_id varchar,
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "storeId" varchar,
    "storeName" varchar,
    "poyntStoreId" varchar,
    "effectiveCatalogId" varchar,
    "effectiveCatalogName" varchar,
    "configurationStatus" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization Poynt configuration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM integration_configurations i
        WHERE i.integration_configuration_id = p_integration_id
          AND i.organization_id = p_organization_id
          AND upper(i.provider) = 'POYNT'
          AND NOT i.is_deleted
    ) THEN
        RAISE EXCEPTION 'Poynt integration not found' USING ERRCODE = '23503';
    END IF;
    RETURN QUERY
    SELECT s.store_id,
           s.store_name,
           c.poynt_store_id,
           c.effective_catalog_id,
           c.effective_catalog_name,
           (CASE WHEN c.id IS NULL THEN 'NOT_CONFIGURED' ELSE 'CONFIGURED' END)::varchar
      FROM stores s
      LEFT JOIN poynt_store_catalog_configurations c
        ON c.organization_id = s.organization_id
       AND c.integration_configuration_id = p_integration_id
       AND c.store_id = s.store_id
     WHERE s.organization_id = p_organization_id
       AND NOT s.is_deleted
     ORDER BY s.store_name, s.store_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".organization_list_poynt_store_catalog_configurations(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".organization_list_poynt_store_catalog_configurations(varchar,varchar,varchar) TO "${appRole}";
