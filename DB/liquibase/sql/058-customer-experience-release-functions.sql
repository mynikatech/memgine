-- ============================================================================
-- CUSTOMER EXPERIENCE / CUSTOMER EXPERIENCE RELEASE REFERENCE DATA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generic statuses
-- ----------------------------------------------------------------------------

INSERT INTO "${schemaName}".statuses (
    status_id,
    status_code,
    status_name,
    description,
    display_order,
    is_active
)
VALUES (
    'status-published',
    'PUBLISHED',
    'Published',
    'Entity or publication is currently published and customer-facing',
    16,
    TRUE
)
ON CONFLICT (status_id) DO UPDATE SET
    status_code = EXCLUDED.status_code,
    status_name = EXCLUDED.status_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;


INSERT INTO "${schemaName}".statuses (
    status_id,
    status_code,
    status_name,
    description,
    display_order,
    is_active
)
VALUES (
    'status-archived',
    'ARCHIVED',
    'Archived',
    'Historical record retained but no longer current',
    17,
    TRUE
)
ON CONFLICT (status_id) DO UPDATE SET
    status_code = EXCLUDED.status_code,
    status_name = EXCLUDED.status_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;


-- ----------------------------------------------------------------------------
-- Entity Types
-- ----------------------------------------------------------------------------

INSERT INTO "${schemaName}".entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
VALUES (
    'entity-type-customer-experience',
    'CUSTOMER_EXPERIENCE',
    'Customer Experience',
    'Represents the organization-specific customer-facing experience configuration.',
    28,
    TRUE
)
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;


INSERT INTO "${schemaName}".entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
VALUES (
    'entity-type-customer-experience-release',
    'CUSTOMER_EXPERIENCE_RELEASE',
    'Customer Experience Release',
    'Represents an immutable published customer experience snapshot.',
    29,
    TRUE
)
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;


-- ----------------------------------------------------------------------------
-- Customer Experience Entity Statuses
-- DRAFT, PUBLISHED, INACTIVE, RETIRED
-- ----------------------------------------------------------------------------

INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-experience-draft',
    'entity-type-customer-experience',
    'status-draft',
    1,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-experience-published',
    'entity-type-customer-experience',
    'status-published',
    2,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-experience-inactive',
    'entity-type-customer-experience',
    'status-inactive',
    3,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-experience-retired',
    'entity-type-customer-experience',
    'status-retired',
    4,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


-- ----------------------------------------------------------------------------
-- Customer Experience Release Entity Statuses
-- PUBLISHED, ARCHIVED
-- ----------------------------------------------------------------------------

INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-experience-release-published',
    'entity-type-customer-experience-release',
    'status-published',
    1,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-experience-release-archived',
    'entity-type-customer-experience-release',
    'status-archived',
    2,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;

CREATE OR REPLACE FUNCTION "${schemaName}".get_published_customer_experience_release(
    p_organization_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "releaseNumber" integer,
    "releaseStatus" varchar,
    "snapshotJson" text,
    "publishedAt" text,
    "publishedBy" varchar,
    "createdAt" text,
    "createdBy" varchar,
    "versionNo" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
    SELECT
        cer.customer_experience_release_id,
        cer.organization_id,
        cer.release_number,
        st.status_code,
        cer.snapshot_data::text,
        cer.published_at::text,
        cer.published_by,
        cer.created_at::text,
        cer.created_by,
        cer.version_no
    FROM "${schemaName}".organization o
    JOIN "${schemaName}".customer_experience_release cer
      ON cer.customer_experience_release_id =
         o.published_customer_experience_release_id
    JOIN "${schemaName}".entity_status es
      ON es.entity_status_id = cer.release_status_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE o.organization_id = p_organization_id
    AND o.is_deleted = false
    AND cer.is_deleted = false
    AND st.status_code = 'PUBLISHED'
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".publish_customer_experience_release(
    p_organization_id varchar,
    p_snapshot_data jsonb,
    p_published_by varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "releaseNumber" integer,
    "releaseStatus" varchar,
    "snapshotJson" text,
    "publishedAt" text,
    "publishedBy" varchar,
    "createdAt" text,
    "createdBy" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
DECLARE
    v_release_id varchar;
    v_release_number integer;
    v_published_status_id varchar;
    v_archived_status_id varchar;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id
          AND o.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Organization not found'
            USING ERRCODE = '22023';
    END IF;

    SELECT es.entity_status_id
      INTO v_published_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'CUSTOMER_EXPERIENCE_RELEASE'
       AND st.status_code = 'PUBLISHED'
       AND es.is_active = true;

    SELECT es.entity_status_id
      INTO v_archived_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'CUSTOMER_EXPERIENCE_RELEASE'
       AND st.status_code = 'ARCHIVED'
       AND es.is_active = true;

    IF v_published_status_id IS NULL
       OR v_archived_status_id IS NULL THEN
        RAISE EXCEPTION
            'Customer Experience Release statuses are not configured'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_organization_id, 0)
    );

    UPDATE "${schemaName}".customer_experience_release
       SET release_status_id = v_archived_status_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_published_by,
           version_no = version_no + 1
     WHERE organization_id = p_organization_id
       AND release_status_id = v_published_status_id
       AND is_deleted = false;

    SELECT COALESCE(MAX(release_number), 0) + 1
      INTO v_release_number
      FROM "${schemaName}".customer_experience_release
     WHERE organization_id = p_organization_id;

    v_release_id := gen_random_uuid()::text;

   INSERT INTO "${schemaName}".customer_experience_release (
    customer_experience_release_id,
    organization_id,
    release_number,
    release_status_id,
    snapshot_data,
    published_at,
    published_by,
    created_at,
    created_by,
    updated_at,
    updated_by
)
VALUES (
    v_release_id,
    p_organization_id,
    v_release_number,
    v_published_status_id,
    p_snapshot_data,
    CURRENT_TIMESTAMP,
    p_published_by,
    CURRENT_TIMESTAMP,
    p_published_by,
    CURRENT_TIMESTAMP,
    p_published_by
);

    UPDATE "${schemaName}".organization
       SET published_customer_experience_release_id = v_release_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_published_by,
           version_no = version_no + 1
     WHERE organization_id = p_organization_id;

    RETURN QUERY
    SELECT
        cer.customer_experience_release_id,
        cer.organization_id,
        cer.release_number,
        st.status_code,
        cer.snapshot_data::text,
        cer.published_at::text,
        cer.published_by,
        cer.created_at::text,
        cer.created_by,
        cer.version_no
    FROM "${schemaName}".customer_experience_release cer
    JOIN "${schemaName}".entity_status es
      ON es.entity_status_id = cer.release_status_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE cer.customer_experience_release_id = v_release_id;
END;
$function$;

REVOKE ALL
ON FUNCTION "${schemaName}".get_published_customer_experience_release(varchar)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION "${schemaName}".publish_customer_experience_release(varchar, jsonb, varchar)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "${schemaName}".get_published_customer_experience_release(varchar)
TO "${appRole}";

GRANT EXECUTE
ON FUNCTION "${schemaName}".publish_customer_experience_release(varchar, jsonb, varchar)
TO "${appRole}";