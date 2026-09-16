-- ============================================================
-- Memgine - Organization Lifecycle
--
-- Phase 1B
--
-- Organization lifecycle status is server controlled.
-- Generic organization updates must not change lifecycle status.
-- ============================================================


-- ------------------------------------------------------------
-- Resolve an Organization EntityStatus from a generic
-- status code such as ACTIVE / INACTIVE.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "${schemaName}".set_organization_lifecycle_status(
    p_organization_id varchar(64),
    p_status_code varchar,
    p_actor_user_id varchar(40)
)
RETURNS varchar(64)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_entity_status_id varchar(64);
BEGIN

    IF p_actor_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."user" u
        WHERE u."user_id" = p_actor_user_id
          AND u."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION 'Invalid actor user_id: %', p_actor_user_id
            USING ERRCODE = '23503';
    END IF;


    IF p_organization_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."organization" o
        WHERE o."organization_id" = p_organization_id
          AND o."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION 'Organization not found: %', p_organization_id
            USING ERRCODE = 'P0002';
    END IF;


    SELECT es."entity_status_id"
      INTO v_entity_status_id
    FROM "${schemaName}"."entity_status" es
    JOIN "${schemaName}"."entity_type" et
      ON et."entity_type_id" = es."entity_type_id"
    JOIN "${schemaName}"."statuses" s
      ON s."status_id" = es."status_id"
    WHERE UPPER(et."entity_type_code") = 'ORGANIZATION'
      AND UPPER(s."status_code") = UPPER(p_status_code)
      AND et."is_active" = TRUE
      AND s."is_active" = TRUE
      AND es."is_active" = TRUE
    ORDER BY es."display_order"
    LIMIT 1;


    IF v_entity_status_id IS NULL THEN
        RAISE EXCEPTION
            'Organization lifecycle status could not be resolved for status code: %',
            p_status_code
            USING ERRCODE = 'P0002';
    END IF;


    UPDATE "${schemaName}"."organization"
    SET
        "organization_status_id" = v_entity_status_id,
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "version_no" = "version_no" + 1
    WHERE "organization_id" = p_organization_id
      AND "is_deleted" = FALSE;


    RETURN v_entity_status_id;

END;
$function$;


REVOKE ALL ON FUNCTION "${schemaName}".set_organization_lifecycle_status(
    varchar,
    varchar,
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".set_organization_lifecycle_status(
    varchar,
    varchar,
    varchar
) TO "${appRole}";