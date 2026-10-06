-- ============================================================================
-- 144 - Explicit existing global-user association for Platform Admin
-- organization maintenance.
--
-- Purpose:
--   1. Allow Platform Admin to look up an existing global user by phone.
--   2. Prevent silent reuse of an existing global user.
--   3. Require the frontend to explicitly confirm association by supplying
--      p_user_id.
--   4. Never overwrite global user profile fields while maintaining an
--      organization role.
--   5. Restrict this flow to BUSINESS_OWNER and ORG_ADMIN.
--
-- Rerunnable / idempotent: YES
-- ============================================================================


-- ============================================================================
-- Lookup an existing global Memgine user by phone.
--
-- Returns one row per active organization/role association. A user with no
-- organization association still returns one row with association fields null.
-- ============================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".platform_find_organization_user_by_phone(
    p_organization_id varchar,
    p_phone varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    user_id varchar,
    first_name varchar,
    last_name varchar,
    display_name varchar,
    primary_email varchar,
    primary_phone varchar,
    association_organization_id varchar,
    association_organization_name varchar,
    association_role_code varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN

    -- Platform Admin only.
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id,
        NULL,
        'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION
            'Platform organization maintenance is not permitted'
            USING ERRCODE = '42501';
    END IF;


    -- Target organization must exist.
    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id
          AND NOT o.is_deleted
    ) THEN
        RAISE EXCEPTION
            'Organization not found'
            USING ERRCODE = 'P0002';
    END IF;


    RETURN QUERY
    SELECT
        u.user_id,
        u.first_name,
        u.last_name,

        COALESCE(
            u.display_name,
            concat_ws(
                ' ',
                u.first_name,
                u.last_name
            )
        )::varchar AS display_name,

        u.primary_email,
        u.primary_phone,

        o.organization_id AS association_organization_id,

        COALESCE(
            o.organization_display_name,
            o.organization_name
        )::varchar AS association_organization_name,

        r.role_code AS association_role_code

    FROM "${schemaName}"."user" u

    LEFT JOIN "${schemaName}".organization_user ou
        ON ou.user_id = u.user_id
       AND NOT ou.is_deleted
       AND ou.organization_user_status_id =
           'entity-status-org-user-active'

    LEFT JOIN "${schemaName}".organization o
        ON o.organization_id = ou.organization_id
       AND NOT o.is_deleted

    LEFT JOIN "${schemaName}".organization_user_roles our
        ON our.organization_user_id = ou.organization_user_id
       AND NOT our.is_deleted
       AND our.assignment_status_id =
           'entity-status-org-user-role-active'
       AND our.effective_from <= CURRENT_TIMESTAMP
       AND (
            our.effective_to IS NULL
            OR our.effective_to > CURRENT_TIMESTAMP
       )

    LEFT JOIN "${schemaName}".role r
        ON r.role_id = our.role_id
       AND r.role_status_id = 'entity-status-role-active'

    WHERE u.primary_phone = p_phone

    ORDER BY
        o.organization_name NULLS LAST,
        r.role_code NULLS LAST;

END;
$function$;



-- ============================================================================
-- Save / associate an administrative user.
--
-- IMPORTANT:
--
-- p_user_id IS NULL:
--   This is a NEW global user request.
--   If the phone already exists globally, reject it. The UI must first display
--   the existing user and then explicitly confirm "Use Existing User".
--
-- p_user_id IS NOT NULL:
--   This is either:
--     - an existing administrative assignment being edited, OR
--     - an explicitly confirmed existing global user association.
--
--   In both cases, global identity fields are NOT overwritten.
-- ============================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_organization_administrative_user(
    p_organization_id varchar,
    p_user_id varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_primary_email varchar,
    p_primary_phone varchar,
    p_role_code varchar,
    p_effective_from timestamp without time zone,
    p_effective_to timestamp without time zone,
    p_actor_user_id varchar
)
RETURNS TABLE (
    assignment_id varchar,
    organization_user_id varchar,
    organization_id varchar,
    user_id varchar,
    first_name varchar,
    last_name varchar,
    display_name varchar,
    primary_email varchar,
    primary_phone varchar,
    role_code varchar,
    assignment_status_id varchar,
    effective_from timestamp without time zone,
    effective_to timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id varchar(64) :=
        NULLIF(trim(p_user_id), '');

    v_existing_user_id varchar(64);

    v_organization_user_id varchar(64);

    v_role_id varchar(64);

    v_other_role_id varchar(64);

    v_user_type_id varchar(64);

    v_phone varchar(20) :=
        regexp_replace(
            COALESCE(trim(p_primary_phone), ''),
            '[^0-9+]',
            '',
            'g'
        );

    v_assignment_id varchar(64);

    v_effective_from timestamp without time zone :=
        COALESCE(
            p_effective_from,
            CURRENT_TIMESTAMP
        );

BEGIN

    -- ------------------------------------------------------------------------
    -- Authorization
    -- ------------------------------------------------------------------------

    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id,
        NULL,
        'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION
            'Platform organization maintenance is not permitted'
            USING ERRCODE = '42501';
    END IF;


    -- ------------------------------------------------------------------------
    -- Validate target organization
    -- ------------------------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id
          AND NOT o.is_deleted
    ) THEN
        RAISE EXCEPTION
            'Organization not found'
            USING ERRCODE = 'P0002';
    END IF;


    -- ------------------------------------------------------------------------
    -- Resolve permitted role.
    --
    -- Platform Admin may manage only:
    --   BUSINESS_OWNER
    --   ORG_ADMIN
    -- ------------------------------------------------------------------------

    IF p_role_code = 'BUSINESS_OWNER' THEN

        v_role_id := 'role-owner';

        v_other_role_id := 'role-admin';

        v_user_type_id :=
            'organization-user-type-owner';

    ELSIF p_role_code = 'ORG_ADMIN' THEN

        v_role_id := 'role-admin';

        v_other_role_id := 'role-owner';

        v_user_type_id :=
            'organization-user-type-admin';

    ELSE

        RAISE EXCEPTION
            'Administrative role must be BUSINESS_OWNER or ORG_ADMIN'
            USING ERRCODE = '22023';

    END IF;


    -- ------------------------------------------------------------------------
    -- Common validation.
    --
    -- Phone and date range are always relevant.
    -- ------------------------------------------------------------------------

    IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN

        RAISE EXCEPTION
            'Invalid administrative user phone'
            USING ERRCODE = '22023';

    END IF;


    IF p_effective_to IS NOT NULL
       AND p_effective_to <= v_effective_from THEN

        RAISE EXCEPTION
            'Invalid administrative user effective date range'
            USING ERRCODE = '22023';

    END IF;


    -- ------------------------------------------------------------------------
    -- Profile validation is required ONLY for creation of a brand-new global
    -- user.
    --
    -- Existing-user association deliberately ignores submitted profile fields.
    -- ------------------------------------------------------------------------

    IF v_user_id IS NULL THEN

        IF NULLIF(trim(p_first_name), '') IS NULL
           OR length(trim(p_first_name)) > 100
           OR length(COALESCE(trim(p_last_name), '')) > 100 THEN

            RAISE EXCEPTION
                'Invalid administrative user name'
                USING ERRCODE = '22023';

        END IF;


        IF NULLIF(trim(p_primary_email), '') IS NOT NULL
           AND (
                length(trim(p_primary_email)) > 254
                OR lower(trim(p_primary_email))
                   !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           ) THEN

            RAISE EXCEPTION
                'Invalid administrative user email'
                USING ERRCODE = '22023';

        END IF;

    END IF;


    -- Serialize writes involving the same phone identity.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_phone,
            0
        )
    );


    -- =========================================================================
    -- NEW GLOBAL USER
    -- =========================================================================

    IF v_user_id IS NULL THEN

        -- Check whether this phone already belongs to a global Memgine user.
        SELECT
            u.user_id
        INTO
            v_existing_user_id
        FROM "${schemaName}"."user" u
        WHERE u.primary_phone = v_phone
        ORDER BY
            u.is_deleted,
            u.user_id
        LIMIT 1
        FOR UPDATE;


        -- Do NOT silently reuse it.
        --
        -- Frontend must first show the existing identity and explicitly submit
        -- that user's user_id after "Use Existing User" confirmation.
        IF v_existing_user_id IS NOT NULL THEN

            RAISE EXCEPTION
                'This phone already belongs to an existing Memgine user. Confirm Use Existing User before associating them with another organization.'
                USING ERRCODE = 'P0001';

        END IF;


        v_user_id :=
            "${schemaName}".generate_runtime_id(
                'USR'
            );


        INSERT INTO "${schemaName}"."user" (
            user_id,
            user_code,
            first_name,
            last_name,
            display_name,
            primary_email,
            primary_phone,
            preferred_language_id,
            user_status_id,
            created_by,
            updated_by
        )
        VALUES (
            v_user_id,

            "${schemaName}".generate_user_code(
                trim(p_first_name),
                NULLIF(trim(p_last_name), '')
            ),

            trim(p_first_name),

            NULLIF(
                trim(p_last_name),
                ''
            ),

            concat_ws(
                ' ',
                trim(p_first_name),
                NULLIF(
                    trim(p_last_name),
                    ''
                )
            ),

            NULLIF(
                lower(trim(p_primary_email)),
                ''
            ),

            v_phone,

            'language-en',

            'entity-status-user-active',

            p_actor_user_id,

            p_actor_user_id
        );


    -- =========================================================================
    -- EXISTING GLOBAL USER
    -- =========================================================================

    ELSE

        -- Explicit p_user_id must belong to the same phone entered/selected by
        -- the Platform Admin.
        IF NOT EXISTS (
            SELECT 1
            FROM "${schemaName}"."user" u
            WHERE u.user_id = v_user_id
              AND u.primary_phone = v_phone
        ) THEN

            RAISE EXCEPTION
                'The selected existing Memgine user does not match this phone number'
                USING ERRCODE = '22023';

        END IF;


        -- IMPORTANT:
        --
        -- Do NOT update:
        --   first_name
        --   last_name
        --   display_name
        --   primary_email
        --   primary_phone
        --
        -- Those fields belong to the GLOBAL Memgine identity.
        --
        -- This administrative-maintenance operation may only reactivate the
        -- identity if it was inactive/deleted.

        UPDATE "${schemaName}"."user" AS u
        SET
            user_status_id =
                'entity-status-user-active',

            is_deleted = FALSE,

            updated_at = CURRENT_TIMESTAMP,

            updated_by = p_actor_user_id,

            version_no =
                u.version_no + 1

        WHERE u.user_id = v_user_id

          AND (
              u.is_deleted
              OR u.user_status_id <>
                 'entity-status-user-active'
          );

    END IF;


    -- =========================================================================
    -- ORGANIZATION USER ASSOCIATION
    -- =========================================================================

    SELECT
        ou.organization_user_id
    INTO
        v_organization_user_id

    FROM "${schemaName}".organization_user ou

    WHERE ou.organization_id =
          p_organization_id

      AND ou.user_id =
          v_user_id

      AND ou.organization_user_type_id IN (
          'organization-user-type-owner',
          'organization-user-type-admin'
      )

    ORDER BY

        CASE
            WHEN ou.organization_user_type_id =
                 v_user_type_id
            THEN 0
            ELSE 1
        END,

        ou.is_deleted,

        ou.organization_user_id

    LIMIT 1
    FOR UPDATE;


    -- ------------------------------------------------------------------------
    -- No existing Owner/Admin relationship for this organization.
    -- Create one.
    -- ------------------------------------------------------------------------

    IF v_organization_user_id IS NULL THEN

        v_organization_user_id :=
            "${schemaName}".generate_runtime_id(
                'OUS'
            );


        INSERT INTO "${schemaName}".organization_user (
            organization_user_id,
            organization_id,
            user_id,
            organization_user_type_id,
            organization_user_status_id,
            joining_date,
            created_by,
            updated_by
        )
        VALUES (
            v_organization_user_id,

            p_organization_id,

            v_user_id,

            v_user_type_id,

            'entity-status-org-user-active',

            CURRENT_DATE,

            p_actor_user_id,

            p_actor_user_id
        );


    -- ------------------------------------------------------------------------
    -- Existing Owner/Admin organization relationship.
    --
    -- Reuse the relationship and change its administrative type if necessary.
    -- ------------------------------------------------------------------------

    ELSE

        UPDATE "${schemaName}".organization_user AS ou

        SET
            organization_user_type_id =
                v_user_type_id,

            organization_user_status_id =
                'entity-status-org-user-active',

            is_deleted =
                FALSE,

            updated_at =
                CURRENT_TIMESTAMP,

            updated_by =
                p_actor_user_id,

            version_no =
                ou.version_no + 1

        WHERE ou.organization_user_id =
              v_organization_user_id;

    END IF;


    -- =========================================================================
    -- ENSURE SELECTED ADMINISTRATIVE ROLE
    -- =========================================================================

    v_assignment_id :=
        "${schemaName}".rbac_ensure_organization_base_role(
            v_organization_user_id,
            v_role_id,
            p_actor_user_id
        );


    -- Apply effective dates.
    UPDATE "${schemaName}".organization_user_roles AS our

    SET
        effective_from =
            v_effective_from,

        effective_to =
            p_effective_to,

        assignment_reason =
            'Platform Admin organization maintenance',

        updated_at =
            CURRENT_TIMESTAMP,

        updated_by =
            p_actor_user_id,

        version_no =
            our.version_no + 1

    WHERE our.organization_user_role_id =
          v_assignment_id;


    -- =========================================================================
    -- REVOKE THE OTHER ADMINISTRATIVE ROLE
    --
    -- Business Owner <-> Org Admin remain mutually exclusive in this Platform
    -- Admin maintenance flow.
    -- =========================================================================

    UPDATE "${schemaName}".organization_user_roles AS our

    SET
        assignment_status_id =
            'entity-status-org-user-role-revoked',

        effective_to =
            CASE
                WHEN our.effective_from < CURRENT_TIMESTAMP
                    THEN CURRENT_TIMESTAMP
                ELSE NULL
            END,

        updated_at =
            CURRENT_TIMESTAMP,

        updated_by =
            p_actor_user_id,

        version_no =
            our.version_no + 1

    WHERE our.organization_user_id =
          v_organization_user_id

      AND our.role_id =
          v_other_role_id

      AND NOT our.is_deleted

      AND our.assignment_status_id <>
          'entity-status-org-user-role-revoked';


    -- =========================================================================
    -- RETURN EFFECTIVE SAVED ASSIGNMENT
    -- =========================================================================

    RETURN QUERY

    SELECT
        our.organization_user_role_id,

        ou.organization_user_id,

        ou.organization_id,

        u.user_id,

        u.first_name,

        u.last_name,

        COALESCE(
            u.display_name,
            concat_ws(
                ' ',
                u.first_name,
                u.last_name
            )
        )::varchar,

        u.primary_email,

        u.primary_phone,

        r.role_code,

        our.assignment_status_id,

        our.effective_from,

        our.effective_to

    FROM "${schemaName}".organization_user ou

    JOIN "${schemaName}"."user" u
      ON u.user_id =
         ou.user_id

    JOIN "${schemaName}".organization_user_roles our
      ON our.organization_user_id =
         ou.organization_user_id

    JOIN "${schemaName}".role r
      ON r.role_id =
         our.role_id

    WHERE ou.organization_user_id =
          v_organization_user_id

      AND our.organization_user_role_id =
          v_assignment_id;

END;
$function$;



-- ============================================================================
-- Permissions
-- ============================================================================

REVOKE ALL
ON FUNCTION "${schemaName}".platform_find_organization_user_by_phone(
    varchar,
    varchar,
    varchar
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION "${schemaName}".platform_find_organization_user_by_phone(
    varchar,
    varchar,
    varchar
)
TO "${appRole}";


REVOKE ALL
ON FUNCTION "${schemaName}".platform_save_organization_administrative_user(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    timestamp without time zone,
    timestamp without time zone,
    varchar
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION "${schemaName}".platform_save_organization_administrative_user(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    timestamp without time zone,
    timestamp without time zone,
    varchar
)
TO "${appRole}";