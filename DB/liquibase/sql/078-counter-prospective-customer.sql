-- Counter-safe prospective customer creation.
-- Keeps create_organization_prospective_customer() admin-only.
-- Counter callers must pass a valid organization/store/staff/actor context.

CREATE OR REPLACE FUNCTION "${schemaName}".counter_create_prospective_customer(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_first_name varchar,
    p_middle_name varchar,
    p_last_name varchar,
    p_display_name varchar,
    p_primary_email varchar,
    p_primary_phone varchar,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql AS $function$
DECLARE
    v_email varchar := NULLIF(lower(trim(p_primary_email)), '');
    v_phone varchar := trim(p_primary_phone);
    v_user_id varchar;
    v_organization_user_id varchar;
    v_customer_type_id varchar;
    v_user_status_id varchar;
    v_relationship_status_id varchar;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(trim(p_first_name), '') IS NULL OR length(p_first_name) > 100
       OR NULLIF(trim(p_last_name), '') IS NULL OR length(p_last_name) > 100
       OR NULLIF(v_phone, '') IS NULL OR length(v_phone) > 20
       OR (v_email IS NOT NULL AND length(v_email) > 254)
       OR (p_middle_name IS NOT NULL AND length(p_middle_name) > 100)
       OR (p_display_name IS NOT NULL AND length(p_display_name) > 150) THEN
        RAISE EXCEPTION 'Invalid prospective customer fields'
            USING ERRCODE = '22023';
    END IF;

    SELECT organization_user_type_id
    INTO STRICT v_customer_type_id
    FROM "${schemaName}".organization_user_types
    WHERE organization_user_type_code = 'CUSTOMER'
      AND is_active = true;

    SELECT es.entity_status_id
    INTO STRICT v_user_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'USER'
      AND st.status_code = 'ACTIVE'
      AND es.is_active = true;

    SELECT es.entity_status_id
    INTO STRICT v_relationship_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'ORGANIZATION_USER'
      AND st.status_code = 'ACTIVE'
      AND es.is_active = true;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));

    SELECT user_id
    INTO v_user_id
    FROM "${schemaName}"."user"
    WHERE primary_phone = v_phone
      AND is_deleted = false
    FOR UPDATE;

    IF v_email IS NOT NULL AND EXISTS (
        SELECT 1
        FROM "${schemaName}"."user"
        WHERE lower(primary_email) = v_email
          AND is_deleted = false
          AND (v_user_id IS NULL OR user_id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Email belongs to another user; resolve identity before linking'
            USING ERRCODE = '23505';
    END IF;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid()::text;

        INSERT INTO "${schemaName}"."user" (
            user_id,
            user_code,
            first_name,
            middle_name,
            last_name,
            display_name,
            primary_email,
            primary_phone,
            user_status_id,
            created_by,
            updated_by
        ) VALUES (
            v_user_id,
            'USR-' || replace(v_user_id, '-', ''),
            trim(p_first_name),
            NULLIF(trim(p_middle_name), ''),
            trim(p_last_name),
            COALESCE(
                NULLIF(trim(p_display_name), ''),
                trim(p_first_name) || ' ' || trim(p_last_name)
            ),
            v_email,
            v_phone,
            v_user_status_id,
            p_actor_user_id,
            p_actor_user_id
        );
    END IF;

    SELECT organization_user_id
    INTO v_organization_user_id
    FROM "${schemaName}".organization_user
    WHERE organization_id = p_organization_id
      AND user_id = v_user_id
      AND organization_user_type_id = v_customer_type_id
    ORDER BY is_deleted, organization_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        v_organization_user_id := gen_random_uuid()::text;

        INSERT INTO "${schemaName}".organization_user (
            organization_user_id,
            organization_id,
            user_id,
            organization_user_type_id,
            organization_user_status_id,
            created_by,
            updated_by
        ) VALUES (
            v_organization_user_id,
            p_organization_id,
            v_user_id,
            v_customer_type_id,
            v_relationship_status_id,
            p_actor_user_id,
            p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user
        SET is_deleted = false,
            organization_user_status_id = v_relationship_status_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE organization_user_id = v_organization_user_id
          AND is_deleted = true;
    END IF;

    RETURN v_organization_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".counter_create_prospective_customer(
    varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".counter_create_prospective_customer(
    varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar, varchar, varchar
) TO "${appRole}";