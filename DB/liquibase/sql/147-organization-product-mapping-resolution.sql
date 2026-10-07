--liquibase formatted sql

--changeset mynikatech:147-organization-product-mapping-resolution runOnChange:true splitStatements:false
CREATE OR REPLACE FUNCTION "${schemaName}".resolve_organization_product_mapping(
    p_organization_id varchar,
    p_product_id varchar,
    p_selected_mapping_id varchar,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_integration_configuration_id varchar(64);
    v_store_id varchar(64);
    v_active_mapping_count integer;
BEGIN
    v_actor_organization_user_id := organization_product_actor(
        p_organization_id,
        p_actor_user_id
    );

    PERFORM 1
      FROM product
     WHERE product_id = p_product_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found'
            USING ERRCODE = '23503';
    END IF;

    -- Prevent a concurrent mapping save/deactivation from changing this scope
    -- between validation and the sibling soft-deactivation below.
    LOCK TABLE commerce_product_mappings IN SHARE ROW EXCLUSIVE MODE;

    SELECT integration_configuration_id, store_id
      INTO v_integration_configuration_id, v_store_id
      FROM commerce_product_mappings
     WHERE commerce_product_mapping_id = p_selected_mapping_id
       AND organization_id = p_organization_id
       AND product_id = p_product_id
       AND is_active
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected active mapping is unavailable; refresh and retry'
            USING ERRCODE = '40001';
    END IF;

    SELECT count(*)
      INTO v_active_mapping_count
      FROM commerce_product_mappings
     WHERE organization_id = p_organization_id
       AND product_id = p_product_id
       AND integration_configuration_id = v_integration_configuration_id
       AND store_id IS NOT DISTINCT FROM v_store_id
       AND is_active
       AND NOT is_deleted;
    IF v_active_mapping_count < 2 THEN
        RAISE EXCEPTION 'Active mapping set changed; refresh and retry'
            USING ERRCODE = '40001';
    END IF;

    UPDATE commerce_product_mappings
       SET is_active = false,
           is_deleted = true,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE organization_id = p_organization_id
       AND product_id = p_product_id
       AND integration_configuration_id = v_integration_configuration_id
       AND store_id IS NOT DISTINCT FROM v_store_id
       AND commerce_product_mapping_id <> p_selected_mapping_id
       AND is_active
       AND NOT is_deleted;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".resolve_organization_product_mapping(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".resolve_organization_product_mapping(varchar,varchar,varchar,varchar) TO "${appRole}";
