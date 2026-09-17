-- Batch 2B - Staff + Staff Store Assignment
-- Rerunnable/idempotent function deployment.

DROP FUNCTION IF EXISTS "${schemaName}".get_organization_staff(varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_organization_staff(varchar(64));
DROP FUNCTION IF EXISTS "${schemaName}".get_organization_staff_member(varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_organization_staff_member(varchar(64), varchar(64));
DROP FUNCTION IF EXISTS "${schemaName}".create_staff(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    date,
    date,
    varchar,
    varchar
);
DROP FUNCTION IF EXISTS "${schemaName}".update_staff(varchar, varchar, varchar, varchar, varchar, varchar, date, date, varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".delete_staff(varchar, varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_staff_store_assignments(varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_staff_store_assignments(varchar(64));
DROP FUNCTION IF EXISTS "${schemaName}".create_staff_store_assignment(varchar, varchar, varchar, varchar, varchar, date, date, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".update_staff_store_assignment(varchar, varchar, varchar, varchar, date, date, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".delete_staff_store_assignment(varchar, varchar, varchar);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'staff'
          AND column_name = 'staff_code'
          AND (
              data_type <> 'character varying'
              OR character_maximum_length IS DISTINCT FROM 64
          )
    ) THEN
        ALTER TABLE staff
            ALTER COLUMN staff_code TYPE VARCHAR(64);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_staff(
    p_organization_id varchar(64)
)
RETURNS TABLE (
    id varchar,
    organization_id varchar,
    organization_user_id varchar,
    staff_code varchar,
    designation varchar,
    store_id varchar,
    joining_date text,
    relieving_date text,
    staff_status_id varchar,
    role_code varchar,
    created_at text,
    created_by varchar,
    updated_at text,
    updated_by varchar,
    is_deleted boolean,
    version_no integer
)
LANGUAGE sql
STABLE
AS $function$
    SELECT
        s.staff_id::varchar,
        s.organization_id::varchar,
        s.organization_user_id::varchar,
        s.staff_code::varchar,
        s.designation::varchar,
        s.store_id::varchar,
        s.joining_date::text,
        s.relieving_date::text,
        s.staff_status_id::varchar,
        r.role_code::varchar,
        s.created_at::text,
        s.created_by::varchar,
        s.updated_at::text,
        s.updated_by::varchar,
        s.is_deleted,
        s.version_no
    FROM "${schemaName}".staff s
    JOIN "${schemaName}".role r
      ON r.role_id = s.role_id
    WHERE s.organization_id = p_organization_id
      AND s.is_deleted = FALSE
    ORDER BY s.staff_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_staff_member(
    p_organization_id varchar(64),
    p_staff_id varchar(64)
)
RETURNS TABLE (
    id varchar,
    organization_id varchar,
    organization_user_id varchar,
    staff_code varchar,
    designation varchar,
    store_id varchar,
    joining_date text,
    relieving_date text,
    staff_status_id varchar,
    role_code varchar,
    created_at text,
    created_by varchar,
    updated_at text,
    updated_by varchar,
    is_deleted boolean,
    version_no integer
)
LANGUAGE sql
STABLE
AS $function$
    SELECT *
    FROM "${schemaName}".get_organization_staff(p_organization_id)
    WHERE id = p_staff_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".create_staff(
    p_organization_id varchar(64),
    p_staff_id varchar(64),
    p_organization_user_id varchar(64),
    p_staff_code varchar,
    p_role_code varchar,
    p_designation varchar,
    p_store_id varchar(64),
    p_joining_date date,
    p_relieving_date date,
    p_staff_status_id varchar(64),
    p_actor_user_id varchar(64)
)
RETURNS TABLE (
    id varchar,
    organization_id varchar,
    organization_user_id varchar,
    staff_code varchar,
    designation varchar,
    store_id varchar,
    joining_date text,
    relieving_date text,
    staff_status_id varchar,
    role_code varchar,
    created_at text,
    created_by varchar,
    updated_at text,
    updated_by varchar,
    is_deleted boolean,
    version_no integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_id varchar(64);
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'User % cannot administer organization %',
            p_actor_user_id,
            p_organization_id
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".organization_user ou
        WHERE ou.organization_user_id = p_organization_user_id
          AND ou.organization_id = p_organization_id
          AND ou.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Organization user % does not belong to organization %',
            p_organization_user_id,
            p_organization_id
            USING ERRCODE = '23503';
    END IF;

    SELECT r.role_id
      INTO v_role_id
      FROM "${schemaName}".role r
     WHERE upper(r.role_code) = upper(p_role_code)
     LIMIT 1;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Unknown staff role: %', p_role_code
            USING ERRCODE = '23503';
    END IF;

    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".stores st
        WHERE st.store_id = p_store_id
          AND st.organization_id = p_organization_id
          AND st.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Store % does not belong to organization %',
            p_store_id,
            p_organization_id
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO "${schemaName}".staff (
        staff_id,
        organization_user_id,
        staff_code,
        organization_id,
        role_id,
        designation,
        store_id,
        joining_date,
        relieving_date,
        staff_status_id,
        created_at,
        created_by,
        updated_at,
        updated_by,
        is_deleted,
        version_no
    )
    VALUES (
        p_staff_id,
        p_organization_user_id,
        p_staff_code,
        p_organization_id,
        v_role_id,
        NULLIF(trim(p_designation), ''),
        p_store_id,
        COALESCE(p_joining_date, CURRENT_DATE),
        p_relieving_date,
        p_staff_status_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );

    RETURN QUERY
    SELECT
        s.staff_id::varchar,
        s.organization_id::varchar,
        s.organization_user_id::varchar,
        s.staff_code::varchar,
        s.designation::varchar,
        s.store_id::varchar,
        s.joining_date::text,
        s.relieving_date::text,
        s.staff_status_id::varchar,
        r.role_code::varchar,
        s.created_at::text,
        s.created_by::varchar,
        s.updated_at::text,
        s.updated_by::varchar,
        s.is_deleted,
        s.version_no
    FROM "${schemaName}".staff s
    JOIN "${schemaName}".role r
      ON r.role_id = s.role_id
    WHERE s.staff_id = p_staff_id
      AND s.organization_id = p_organization_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".update_staff(
    p_organization_id varchar(64),
    p_staff_id varchar(64),
    p_staff_code varchar,
    p_role_code varchar,
    p_designation varchar,
    p_store_id varchar(64),
    p_joining_date date,
    p_relieving_date date,
    p_staff_status_id varchar(64),
    p_actor_user_id varchar(64)
)
RETURNS TABLE (
    id varchar,
    organization_id varchar,
    organization_user_id varchar,
    staff_code varchar,
    designation varchar,
    store_id varchar,
    joining_date text,
    relieving_date text,
    staff_status_id varchar,
    role_code varchar,
    created_at text,
    created_by varchar,
    updated_at text,
    updated_by varchar,
    is_deleted boolean,
    version_no integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_id varchar(64);
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'User % cannot administer organization %',
            p_actor_user_id,
            p_organization_id
            USING ERRCODE = '42501';
    END IF;

    SELECT r.role_id
      INTO v_role_id
      FROM "${schemaName}".role r
     WHERE upper(r.role_code) = upper(p_role_code)
     LIMIT 1;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Unknown staff role: %', p_role_code
            USING ERRCODE = '23503';
    END IF;

    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".stores st
        WHERE st.store_id = p_store_id
          AND st.organization_id = p_organization_id
          AND st.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Store % does not belong to organization %',
            p_store_id,
            p_organization_id
            USING ERRCODE = '23503';
    END IF;

    UPDATE "${schemaName}".staff s
       SET staff_code = p_staff_code,
           role_id = v_role_id,
           designation = NULLIF(trim(p_designation), ''),
           store_id = p_store_id,
           joining_date = p_joining_date,
           relieving_date = p_relieving_date,
           staff_status_id = p_staff_status_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = s.version_no + 1
     WHERE s.staff_id = p_staff_id
       AND s.organization_id = p_organization_id
       AND s.is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff not found: %', p_staff_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT
        s.staff_id::varchar,
        s.organization_id::varchar,
        s.organization_user_id::varchar,
        s.staff_code::varchar,
        s.designation::varchar,
        s.store_id::varchar,
        s.joining_date::text,
        s.relieving_date::text,
        s.staff_status_id::varchar,
        r.role_code::varchar,
        s.created_at::text,
        s.created_by::varchar,
        s.updated_at::text,
        s.updated_by::varchar,
        s.is_deleted,
        s.version_no
    FROM "${schemaName}".staff s
    JOIN "${schemaName}".role r
      ON r.role_id = s.role_id
    WHERE s.staff_id = p_staff_id
      AND s.organization_id = p_organization_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_staff(
    p_organization_id varchar(64),
    p_staff_id varchar(64),
    p_actor_user_id varchar(64)
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;

    UPDATE "${schemaName}".staff_store_assignment a
       SET is_deleted = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = a.version_no + 1
     WHERE a.staff_id = p_staff_id
       AND a.is_deleted = FALSE;

    UPDATE "${schemaName}".staff s
       SET is_deleted = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = s.version_no + 1
     WHERE s.staff_id = p_staff_id
       AND s.organization_id = p_organization_id
       AND s.is_deleted = FALSE;

    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_staff_store_assignments(
    p_organization_id varchar(64)
)
RETURNS TABLE (
    id varchar,
    organization_id varchar,
    staff_id varchar,
    store_id varchar,
    assignment_status_id varchar,
    effective_date text,
    end_date text,
    created_at text,
    created_by varchar,
    updated_at text,
    updated_by varchar,
    is_deleted boolean,
    version_no integer
)
LANGUAGE sql
STABLE
AS $function$
    SELECT
        a.staff_store_assignment_id::varchar,
        s.organization_id::varchar,
        a.staff_id::varchar,
        a.store_id::varchar,
        a.status_id::varchar,
        a.effective_date::text,
        a.end_date::text,
        a.created_at::text,
        a.created_by::varchar,
        a.updated_at::text,
        a.updated_by::varchar,
        a.is_deleted,
        a.version_no
    FROM "${schemaName}".staff_store_assignment a
    JOIN "${schemaName}".staff s
      ON s.staff_id = a.staff_id
    WHERE s.organization_id = p_organization_id
      AND s.is_deleted = FALSE
      AND a.is_deleted = FALSE
    ORDER BY a.staff_id, a.effective_date, a.staff_store_assignment_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".create_staff_store_assignment(
    p_organization_id varchar(64),
    p_assignment_id varchar(64),
    p_staff_id varchar(64),
    p_store_id varchar(64),
    p_assignment_status_id varchar(64),
    p_effective_date date,
    p_end_date date,
    p_actor_user_id varchar(64)
)
RETURNS SETOF "${schemaName}".staff_store_assignment
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".staff s
        WHERE s.staff_id = p_staff_id
          AND s.organization_id = p_organization_id
          AND s.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Staff % does not belong to organization %', p_staff_id, p_organization_id
            USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores st
        WHERE st.store_id = p_store_id
          AND st.organization_id = p_organization_id
          AND st.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Store % does not belong to organization %', p_store_id, p_organization_id
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO "${schemaName}".staff_store_assignment (
        staff_store_assignment_id, staff_id, store_id, status_id,
        effective_date, end_date, created_at, created_by,
        updated_at, updated_by, is_deleted, version_no
    )
    VALUES (
        p_assignment_id, p_staff_id, p_store_id, p_assignment_status_id,
        p_effective_date, p_end_date, CURRENT_TIMESTAMP, p_actor_user_id,
        CURRENT_TIMESTAMP, p_actor_user_id, FALSE, 1
    );

    RETURN QUERY
    SELECT a.*
    FROM "${schemaName}".staff_store_assignment a
    WHERE a.staff_store_assignment_id = p_assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".update_staff_store_assignment(
    p_organization_id varchar(64),
    p_assignment_id varchar(64),
    p_store_id varchar(64),
    p_assignment_status_id varchar(64),
    p_effective_date date,
    p_end_date date,
    p_actor_user_id varchar(64)
)
RETURNS SETOF "${schemaName}".staff_store_assignment
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores st
        WHERE st.store_id = p_store_id
          AND st.organization_id = p_organization_id
          AND st.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Store % does not belong to organization %', p_store_id, p_organization_id
            USING ERRCODE = '23503';
    END IF;

    UPDATE "${schemaName}".staff_store_assignment a
       SET store_id = p_store_id,
           status_id = p_assignment_status_id,
           effective_date = p_effective_date,
           end_date = p_end_date,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = a.version_no + 1
     WHERE a.staff_store_assignment_id = p_assignment_id
       AND a.is_deleted = FALSE
       AND EXISTS (
           SELECT 1 FROM "${schemaName}".staff s
           WHERE s.staff_id = a.staff_id
             AND s.organization_id = p_organization_id
             AND s.is_deleted = FALSE
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff store assignment not found: %', p_assignment_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT a.*
    FROM "${schemaName}".staff_store_assignment a
    WHERE a.staff_store_assignment_id = p_assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_staff_store_assignment(
    p_organization_id varchar(64),
    p_assignment_id varchar(64),
    p_actor_user_id varchar(64)
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;

    UPDATE "${schemaName}".staff_store_assignment a
       SET is_deleted = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = a.version_no + 1
     WHERE a.staff_store_assignment_id = p_assignment_id
       AND a.is_deleted = FALSE
       AND EXISTS (
           SELECT 1 FROM "${schemaName}".staff s
           WHERE s.staff_id = a.staff_id
             AND s.organization_id = p_organization_id
             AND s.is_deleted = FALSE
       );

    RETURN FOUND;
END;
$function$;
