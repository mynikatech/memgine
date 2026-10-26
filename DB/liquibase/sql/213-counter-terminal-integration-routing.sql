--liquibase formatted sql

--changeset mynikatech:213-counter-terminal-integration-routing splitStatements:false

-- The four-argument legacy resolver is deliberately not replaced.
-- Paid Counter checkout must call this overload using the integration ID
-- read from its persisted Commerce transaction, not a client-provided value.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_resolve_counter_pos_device(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar,
    p_integration_configuration_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_count bigint;
    v_device_id varchar(64);
BEGIN
    IF p_organization_id IS NULL OR btrim(p_organization_id) = ''
       OR p_store_id IS NULL OR btrim(p_store_id) = ''
       OR p_staff_id IS NULL OR btrim(p_staff_id) = ''
       OR p_actor_user_id IS NULL OR btrim(p_actor_user_id) = ''
       OR p_integration_configuration_id IS NULL
       OR btrim(p_integration_configuration_id) = '' THEN
        RAISE EXCEPTION 'Counter terminal resolution requires organization, store, staff, actor and integration'
            USING ERRCODE = '22023';
    END IF;

    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    -- The requested integration must belong to this organization and be Poynt.
    IF NOT EXISTS (
        SELECT 1
          FROM integration_configurations ic
         WHERE ic.integration_configuration_id = p_integration_configuration_id
           AND ic.organization_id = p_organization_id
           AND upper(ic.provider) = 'POYNT'
           AND NOT ic.is_deleted
    ) THEN
        RAISE EXCEPTION 'Poynt integration is not configured for this organization'
            USING ERRCODE = '23503';
    END IF;

    SELECT count(*), min(d.pos_device_id)
      INTO v_count, v_device_id
      FROM pos_devices d
      JOIN poynt_terminal_bindings b
        ON b.pos_device_id = d.pos_device_id
       AND b.organization_id = d.organization_id
       AND b.store_id = d.store_id
       AND NOT b.is_deleted
     WHERE d.organization_id = p_organization_id
       AND d.store_id = p_store_id
       AND NOT d.is_deleted
       AND d.revoked_at IS NULL
       AND b.integration_configuration_id = p_integration_configuration_id
       AND b.poynt_terminal_id IS NOT NULL
       AND btrim(b.poynt_terminal_id) <> '';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No active Poynt terminal is paired to this store and integration'
            USING ERRCODE = '22023';
    END IF;

    IF v_count > 1 THEN
        RAISE EXCEPTION 'Multiple active Poynt terminals are paired to this store and integration'
            USING ERRCODE = '22023';
    END IF;

    RETURN v_device_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_resolve_counter_pos_device(
    varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_resolve_counter_pos_device(
    varchar, varchar, varchar, varchar, varchar
) TO "${appRole}";
