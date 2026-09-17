CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_integration_configurations(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "organizationId" varchar, "integrationName" varchar,
    "integrationTypeId" varchar, provider varchar, "integrationStatusId" varchar,
    "createdAt" text, "createdBy" varchar, "updatedAt" text,
    "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT i.integration_configuration_id, i.organization_id,
        i.integration_name, i.integration_type_id, i.provider,
        i.integration_status_id, i.created_at::text, i.created_by,
        i.updated_at::text, i.updated_by, i.is_deleted, i.version_no
    FROM "${schemaName}".integration_configurations i
    WHERE i.organization_id = p_organization_id AND i.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
    ORDER BY i.integration_name, i.integration_configuration_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_integration_configuration(
    p_organization_id varchar, p_id varchar, p_name varchar,
    p_type_id varchar, p_provider varchar, p_status_id varchar,
    p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
     SELECT ou.organization_user_id
      INTO v_actor_organization_user_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = p_organization_id
      AND ou.user_id = p_actor_user_id
      AND ou.is_deleted = false
    LIMIT 1;

    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Actor organization membership not found'
            USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 40
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR nullif(trim(p_provider), '') IS NULL OR length(p_provider) > 100
       OR p_version_no IS NULL OR p_version_no < 1 THEN
        RAISE EXCEPTION 'Invalid Integration Configuration fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".integration_types it
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = it.status_id
        JOIN "${schemaName}".statuses s ON s.status_id = es.status_id
        WHERE it.integration_type_id = p_type_id AND it.is_deleted = false
          AND es.is_active AND s.status_code = 'ACTIVE'
    ) OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'INTEGRATION_CONFIGURATION' AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid Integration Configuration type or status' USING ERRCODE = '22023';
    END IF;
    IF p_create THEN
        INSERT INTO "${schemaName}".integration_configurations (
            integration_configuration_id, organization_id, integration_name,
            integration_type_id, provider, integration_status_id,
            created_by, updated_at, updated_by
        ) VALUES (
            p_id, p_organization_id, p_name, p_type_id, p_provider,
                        p_status_id, v_actor_organization_user_id, CURRENT_TIMESTAMP,
            v_actor_organization_user_id
        );
    ELSE
        UPDATE "${schemaName}".integration_configurations SET
            integration_name = p_name, integration_type_id = p_type_id,
            provider = p_provider, integration_status_id = p_status_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor_organization_user_id,
            version_no = version_no + 1
        WHERE integration_configuration_id = p_id
          AND organization_id = p_organization_id AND is_deleted = false
          AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Integration Configuration not found or changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_integration_configuration(
    p_organization_id varchar, p_id varchar, p_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
        SELECT ou.organization_user_id
      INTO v_actor_organization_user_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = p_organization_id
      AND ou.user_id = p_actor_user_id
      AND ou.is_deleted = false
    LIMIT 1;

    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Actor organization membership not found'
            USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".integration_configurations SET
        is_deleted = true, updated_at = CURRENT_TIMESTAMP,
        updated_by = v_actor_organization_user_id,
        version_no = version_no + 1
    WHERE integration_configuration_id = p_id
      AND organization_id = p_organization_id AND is_deleted = false
      AND version_no = p_version_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Integration Configuration not found or changed since load'
            USING ERRCODE = '40001';
    END IF;
    RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_integration_configurations(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_integration_configuration(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, boolean) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".delete_organization_integration_configuration(varchar, varchar, integer, varchar) TO "${appRole}";
