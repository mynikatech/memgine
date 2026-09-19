CREATE OR REPLACE FUNCTION "${schemaName}".pos_register_device(
    p_device_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_device_name varchar,
    p_token_hash varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "deviceId" varchar,
    "organizationId" varchar,
    "storeId" varchar,
    "deviceName" varchar,
    "revokedAt" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id,
        p_organization_id,
        'ORG_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'POS device administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".stores s
        JOIN "${schemaName}".entity_status es
          ON es.entity_status_id = s.store_status_id
        JOIN "${schemaName}".statuses st
          ON st.status_id = es.status_id
        WHERE s.store_id = p_store_id
          AND s.organization_id = p_organization_id
          AND NOT s.is_deleted
          AND st.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Store is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}".pos_devices(
        pos_device_id,
        organization_id,
        store_id,
        device_name,
        device_token_hash,
        created_by,
        updated_by
    )
    VALUES(
        p_device_id,
        p_organization_id,
        p_store_id,
        trim(p_device_name),
        p_token_hash,
        p_actor_user_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        p_device_id,
        p_organization_id,
        p_store_id,
        trim(p_device_name)::varchar,
        NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".pos_register_device(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".pos_register_device(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
) TO "${appRole}";