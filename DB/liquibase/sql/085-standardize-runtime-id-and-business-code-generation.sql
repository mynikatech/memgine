-- ============================================================================
-- Memgine - Runtime ID and business-code standardization foundation
--
-- Technical runtime ID format:
--     <3-char-prefix>_<36-char UUID>
--
-- Approved prefixes covered by this migration:
--     ORG ODT OBR USR OUS OUR PUR STR STF SSA MPR SPL BEN PRD OFF
--     SUB RDM PMT PAT POS SES
--
-- Business-code formats implemented in DB-owned generation paths:
--     Organization       ORG_<ORG4>_<0001>
--     User               USR_<F2L2>_<000001>
--     Store              <ORG_CODE>_STR_<NAME4>_<001>
--     Staff              <STORE_CODE>_STF_<F2L2>_<001>
--     Membership Product <ORG_CODE>_MPR_<NAME4>_<001>
--     Subscription Plan  <MPR_CODE>_SPL_<NAME4>_<001>
--     Benefit            <ORG_CODE>_BEN_<NAME4>_<001>
--     Offer              <ORG_CODE>_OFF_<NAME4>_<001>
--     Subscription       <ORG_CODE>_SUB_<USER_CODE without USR_>_<001>
--     Redemption         <SUBSCRIPTION_NUMBER>_RDM_<001>
--
-- Notes:
--   * Business codes are immutable once created. Renaming an entity does not
--     rewrite its code.
--   * Sequences are allocated atomically through business_code_sequence.
--   * Functions that currently receive IDs from Kotlin keep their signatures;
--     DB-owned generation paths are standardized here. Kotlin-owned generators
--     for PMT/PAT/POS/SES and other caller-supplied IDs must use the same ID
--     convention before actual deployment.
--   * Safe to rerun: DDL is guarded and functions use CREATE OR REPLACE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "${schemaName}".business_code_sequence (
    sequence_type varchar(64) NOT NULL,
    scope_key varchar(64) NOT NULL,
    current_value bigint NOT NULL DEFAULT 0,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_business_code_sequence PRIMARY KEY (sequence_type, scope_key),
    CONSTRAINT ck_business_code_sequence_nonnegative CHECK (current_value >= 0)
);

CREATE OR REPLACE FUNCTION "${schemaName}".next_business_sequence(
    p_sequence_type varchar(64),
    p_scope_key varchar(64)
) RETURNS bigint
LANGUAGE plpgsql
AS $function$
DECLARE
    v_next bigint;
BEGIN
    IF NULLIF(trim(p_sequence_type), '') IS NULL
       OR NULLIF(trim(p_scope_key), '') IS NULL THEN
        RAISE EXCEPTION 'Business sequence type and scope are required'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}".business_code_sequence (
        sequence_type, scope_key, current_value, updated_at
    ) VALUES (
        upper(trim(p_sequence_type)), trim(p_scope_key), 1, CURRENT_TIMESTAMP
    )
    ON CONFLICT (sequence_type, scope_key) DO UPDATE
       SET current_value = "${schemaName}".business_code_sequence.current_value + 1,
           updated_at = CURRENT_TIMESTAMP
    RETURNING current_value INTO v_next;

    RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".generate_runtime_id(
    p_prefix varchar(3)
) RETURNS varchar(64)
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
    v_prefix varchar(3) := upper(trim(p_prefix));
BEGIN
    IF v_prefix !~ '^[A-Z0-9]{3}$' THEN
        RAISE EXCEPTION 'Runtime ID prefix must be exactly three alphanumeric characters: %', p_prefix
            USING ERRCODE = '22023';
    END IF;
    RETURN (v_prefix || '_' || gen_random_uuid()::text)::varchar(64);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".business_name_fragment(
    p_value varchar
) RETURNS varchar(4)
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT rpad(
        left(
            regexp_replace(upper(COALESCE(p_value, '')), '[^A-Z0-9]', '', 'g'),
            4
        ),
        4,
        'X'
    )::varchar(4);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".business_user_fragment(
    p_first_name varchar,
    p_last_name varchar
) RETURNS varchar(4)
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    v_first varchar := regexp_replace(upper(COALESCE(p_first_name, '')), '[^A-Z0-9]', '', 'g');
    v_last varchar := regexp_replace(upper(COALESCE(p_last_name, '')), '[^A-Z0-9]', '', 'g');
    v_fragment varchar;
BEGIN
    IF length(v_first) >= 2 AND length(v_last) >= 2 THEN
        v_fragment := left(v_first, 2) || left(v_last, 2);
    ELSE
        v_fragment := left(v_first || v_last, 4);
    END IF;
    RETURN rpad(v_fragment, 4, 'X')::varchar(4);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".generate_user_code(
    p_first_name varchar,
    p_last_name varchar
) RETURNS varchar(64)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_seq bigint;
BEGIN
    v_seq := "${schemaName}".next_business_sequence('USER', 'GLOBAL');
    RETURN (
        'USR_' || "${schemaName}".business_user_fragment(p_first_name, p_last_name)
        || '_' || lpad(v_seq::text, 6, '0')
    )::varchar(64);
END;
$function$;

-- --------------------------------------------------------------------------
-- Organization creation: DB owns aggregate IDs and organization code.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".create_organization(
    p_organization jsonb,
    p_details jsonb,
    p_branding jsonb,
    p_actor_user_id varchar(64)
)
RETURNS TABLE (
    organization_id varchar(64),
    organization_details_id varchar(64),
    organization_branding_id varchar(64)
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_organization_id varchar(64);
    v_organization_details_id varchar(64);
    v_organization_branding_id varchar(64);
    v_organization_code varchar(64);
    v_org_seq bigint;
    v_primary_phone varchar(20);
    v_support_phone varchar(20);
BEGIN
    IF p_actor_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}"."user" u
        WHERE u.user_id = p_actor_user_id AND u.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Invalid actor user_id: %', p_actor_user_id
            USING ERRCODE = '23503';
    END IF;

    IF NULLIF(trim(p_organization->>'name'), '') IS NULL THEN
        RAISE EXCEPTION 'Organization name is required'
            USING ERRCODE = '22023';
    END IF;

    v_organization_id := "${schemaName}".generate_runtime_id('ORG');
    v_organization_details_id := "${schemaName}".generate_runtime_id('ODT');
    v_organization_branding_id := "${schemaName}".generate_runtime_id('OBR');
    v_org_seq := "${schemaName}".next_business_sequence('ORGANIZATION', 'GLOBAL');
    v_organization_code := (
        'ORG_' || "${schemaName}".business_name_fragment(p_organization->>'name')
        || '_' || lpad(v_org_seq::text, 4, '0')
    )::varchar(64);

    v_primary_phone := COALESCE(p_organization#>>'{primaryPhone,callingCode}', '')
                       || COALESCE(p_organization#>>'{primaryPhone,number}', '');

    IF NULLIF(TRIM(p_details#>>'{supportPhone,number}'), '') IS NULL THEN
        v_support_phone := NULL;
    ELSE
        v_support_phone := COALESCE(p_details#>>'{supportPhone,callingCode}', '')
                           || TRIM(p_details#>>'{supportPhone,number}');
    END IF;

    INSERT INTO "${schemaName}"."organization" (
        organization_id, organization_code, organization_name,
        published_customer_experience_release_id, organization_display_name,
        legal_name, organization_type_id, organization_status_id,
        primary_email, primary_phone, primary_phone_country_id,
        primary_phone_calling_code, website_url,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_id, v_organization_code, p_organization->>'name', NULL,
        NULLIF(p_organization->>'displayName', ''), NULL,
        p_organization->>'organizationTypeId', 'entity-status-org-active',
        p_organization->>'primaryEmail', v_primary_phone,
        NULLIF(p_organization#>>'{primaryPhone,countryId}', ''),
        NULLIF(p_organization#>>'{primaryPhone,callingCode}', ''),
        NULLIF(p_organization->>'website', ''),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    );

    INSERT INTO "${schemaName}"."organization_details" (
        organization_details_id, organization_id, registration_number, gst_number,
        support_email, support_phone, support_phone_country_id,
        support_phone_calling_code, address_line1, address_line2, city, state,
        postal_code, country, about_organization,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_details_id, v_organization_id,
        NULLIF(p_details->>'registrationNumber', ''),
        NULLIF(p_details->>'gstNumber', ''),
        NULLIF(p_details->>'supportEmail', ''),
        v_support_phone,
        CASE WHEN v_support_phone IS NULL THEN NULL ELSE NULLIF(p_details#>>'{supportPhone,countryId}', '') END,
        CASE WHEN v_support_phone IS NULL THEN NULL ELSE NULLIF(p_details#>>'{supportPhone,callingCode}', '') END,
        COALESCE(p_details#>>'{address,line1}', ''),
        NULLIF(p_details#>>'{address,line2}', ''),
        COALESCE(p_details#>>'{address,city}', ''),
        COALESCE(p_details#>>'{address,region}', ''),
        COALESCE(p_details#>>'{address,postalCode}', ''),
        COALESCE(p_details#>>'{address,countryCode}', ''),
        NULLIF(p_details->>'aboutOrganization', ''),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    );

    INSERT INTO "${schemaName}"."organization_branding" (
        organization_branding_id, organization_id, branding_name, theme_template_id,
        primary_color, secondary_color, accent_color, logo_url,
        dark_theme_logo_url, favicon_url, splash_screen_image_url,
        branding_status_id, tagline, hero_image_url,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_branding_id, v_organization_id,
        p_branding->>'brandingName', p_branding->>'themeTemplateId',
        NULLIF(p_branding->>'primaryColor', ''),
        NULLIF(p_branding->>'secondaryColor', ''),
        NULLIF(p_branding->>'accentColor', ''),
        NULLIF(p_branding->>'logoUrl', ''),
        NULLIF(p_branding->>'darkThemeLogoUrl', ''),
        NULLIF(p_branding->>'faviconUrl', ''),
        NULLIF(p_branding->>'splashScreenImageUrl', ''),
        'entity-status-org-branding-active',
        NULLIF(p_branding->>'tagline', ''),
        NULLIF(p_branding->>'heroImageUrl', ''),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    );

    RETURN QUERY SELECT v_organization_id, v_organization_details_id, v_organization_branding_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Organization-user upsert: generate missing runtime IDs and immutable user code.
-- Existing caller-supplied IDs remain supported for compatibility during the
-- Kotlin migration; new code should use the approved prefixes.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".upsert_organization_user(
    p_organization_id varchar,
    p_payload jsonb,
    p_actor_user_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id varchar(64) := NULLIF(trim(p_payload->>'userId'), '');
    v_ou_id varchar(64) := NULLIF(trim(p_payload->>'organizationUserId'), '');
    v_role_id varchar(64) := NULLIF(p_payload->>'roleId', '');
    v_user_code varchar(64);
    v_user_exists boolean;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;

    IF v_user_id IS NULL THEN
        v_user_id := "${schemaName}".generate_runtime_id('USR');
    END IF;
    IF v_ou_id IS NULL THEN
        v_ou_id := "${schemaName}".generate_runtime_id('OUS');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM "${schemaName}"."user" u WHERE u.user_id = v_user_id
    ) INTO v_user_exists;

    IF v_user_exists THEN
        SELECT u.user_code INTO v_user_code
        FROM "${schemaName}"."user" u WHERE u.user_id = v_user_id;
    ELSE
        v_user_code := "${schemaName}".generate_user_code(
            p_payload->>'firstName', p_payload->>'lastName'
        );
    END IF;

    INSERT INTO "${schemaName}"."user" (
        user_id, user_code, first_name, middle_name, last_name, display_name,
        primary_email, primary_phone, preferred_language_id, user_status_id,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_user_id, v_user_code,
        p_payload->>'firstName', NULLIF(p_payload->>'middleName', ''),
        NULLIF(p_payload->>'lastName', ''), NULLIF(p_payload->>'displayName', ''),
        NULLIF(p_payload->>'primaryEmail', ''), p_payload->>'primaryPhone',
        NULLIF(p_payload->>'preferredLanguageId', ''),
        COALESCE(NULLIF(p_payload->>'userStatusId', ''), 'entity-status-user-active'),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    )
    ON CONFLICT (user_id) DO UPDATE SET
        user_code = "${schemaName}"."user".user_code,
        first_name = EXCLUDED.first_name,
        middle_name = EXCLUDED.middle_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        primary_email = EXCLUDED.primary_email,
        primary_phone = EXCLUDED.primary_phone,
        preferred_language_id = EXCLUDED.preferred_language_id,
        user_status_id = EXCLUDED.user_status_id,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        is_deleted = FALSE,
        version_no = "${schemaName}"."user".version_no + 1;

    INSERT INTO "${schemaName}".organization_user (
        organization_user_id, organization_id, user_id,
        organization_user_type_id, organization_user_status_id, joining_date,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_ou_id, p_organization_id, v_user_id,
        p_payload->>'organizationUserTypeId',
        COALESCE(NULLIF(p_payload->>'organizationUserStatusId', ''), 'entity-status-org-user-active'),
        COALESCE(NULLIF(p_payload->>'joiningDate', '')::date, CURRENT_DATE),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    )
    ON CONFLICT (organization_id, user_id, organization_user_type_id) DO UPDATE SET
        organization_user_status_id = EXCLUDED.organization_user_status_id,
        joining_date = EXCLUDED.joining_date,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        is_deleted = FALSE,
        version_no = "${schemaName}".organization_user.version_no + 1
    RETURNING organization_user_id INTO v_ou_id;

    IF v_role_id IS NOT NULL THEN
        INSERT INTO "${schemaName}".organization_user_roles (
            organization_user_role_id, organization_user_id, role_id,
            assignment_status_id, created_at, created_by, updated_at, updated_by,
            is_deleted, version_no
        ) VALUES (
            "${schemaName}".generate_runtime_id('OUR'), v_ou_id, v_role_id,
            'entity-status-org-user-role-active', CURRENT_TIMESTAMP, p_actor_user_id,
            CURRENT_TIMESTAMP, p_actor_user_id, FALSE, 1
        )
        ON CONFLICT (organization_user_id, role_id) DO UPDATE SET
            assignment_status_id = 'entity-status-org-user-role-active',
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            is_deleted = FALSE,
            version_no = "${schemaName}".organization_user_roles.version_no + 1;
    END IF;

    RETURN (
        SELECT elem
        FROM jsonb_array_elements("${schemaName}".get_organization_users(p_organization_id)) elem
        WHERE elem->>'organizationUserId' = v_ou_id
        LIMIT 1
    );
END;
$function$;

-- --------------------------------------------------------------------------
-- Relationship assignment IDs.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".rbac_ensure_organization_base_role(
    p_organization_user_id varchar, p_role_id varchar, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_assignment_id varchar(64);
BEGIN
    IF p_role_id NOT IN ('role-owner','role-admin','role-staff','role-customer')
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}".role r
           WHERE r.role_id = p_role_id
             AND r.role_status_id = 'entity-status-role-active'
       ) THEN
        RAISE EXCEPTION 'Active base role is unavailable' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization_user ou
        WHERE ou.organization_user_id = p_organization_user_id
          AND ou.organization_user_status_id = 'entity-status-org-user-active'
          AND NOT ou.is_deleted
    ) THEN
        RAISE EXCEPTION 'Active organization user not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO "${schemaName}".organization_user_roles (
        organization_user_role_id, organization_user_id, role_id,
        assignment_status_id, effective_from, effective_to,
        assignment_reason, created_by, updated_by
    ) VALUES (
        "${schemaName}".generate_runtime_id('OUR'), p_organization_user_id, p_role_id,
        'entity-status-org-user-role-active', CURRENT_TIMESTAMP, NULL,
        'Base role assigned by business onboarding', p_actor_user_id, p_actor_user_id
    )
    ON CONFLICT (organization_user_id, role_id) DO UPDATE SET
        assignment_status_id = 'entity-status-org-user-role-active',
        effective_from = CURRENT_TIMESTAMP, effective_to = NULL,
        assignment_reason = EXCLUDED.assignment_reason,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        is_deleted = FALSE,
        version_no = "${schemaName}".organization_user_roles.version_no + 1
    RETURNING organization_user_role_id INTO v_assignment_id;
    RETURN v_assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_assign_platform_role(
    p_user_id varchar, p_effective_from timestamp without time zone,
    p_effective_to timestamp without time zone, p_assignment_reason varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql
AS $function$
DECLARE
    v_assignment_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform role assignment is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}"."user"
        WHERE user_id = p_user_id AND NOT is_deleted
          AND user_status_id = 'entity-status-user-active'
    ) THEN
        RAISE EXCEPTION 'Active user not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_effective_to IS NOT NULL
       AND p_effective_to <= COALESCE(p_effective_from, CURRENT_TIMESTAMP) THEN
        RAISE EXCEPTION 'Effective end must be after effective start' USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}".platform_user_role (
        platform_user_role_id, user_id, role_id, status_id,
        effective_from, effective_to, assignment_reason,
        created_at, created_by, updated_at, updated_by
    ) VALUES (
        "${schemaName}".generate_runtime_id('PUR'), p_user_id,
        'role-platform-admin', 'entity-status-platfrm-user-role-active',
        COALESCE(p_effective_from, CURRENT_TIMESTAMP), p_effective_to,
        p_assignment_reason, CURRENT_TIMESTAMP, p_actor_user_id,
        CURRENT_TIMESTAMP, p_actor_user_id
    )
    ON CONFLICT (user_id, role_id) DO UPDATE SET
        status_id = 'entity-status-platfrm-user-role-active',
        effective_from = EXCLUDED.effective_from,
        effective_to = EXCLUDED.effective_to,
        assignment_reason = EXCLUDED.assignment_reason,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        is_deleted = FALSE,
        version_no = "${schemaName}".platform_user_role.version_no + 1
    RETURNING platform_user_role_id INTO v_assignment_id;

    RETURN v_assignment_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Platform onboarding: owner identity/link uses USR/OUS and readable user code.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".onboard_organization(
    p_organization jsonb, p_details jsonb, p_branding jsonb,
    p_owner jsonb, p_actor_user_id varchar
) RETURNS TABLE (
    organization_id varchar, organization_details_id varchar,
    organization_branding_id varchar, owner_user_id varchar,
    owner_organization_user_id varchar, owner_role_assignment_id varchar
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_organization_id varchar(64);
    v_details_id varchar(64);
    v_branding_id varchar(64);
    v_owner_user_id varchar(64);
    v_owner_ou_id varchar(64);
    v_owner_assignment_id varchar(64);
    v_owner_type_id varchar(64);
    v_owner_first_name varchar(100) := NULLIF(trim(p_owner->>'firstName'), '');
    v_owner_last_name varchar(100) := NULLIF(trim(p_owner->>'lastName'), '');
    v_owner_email varchar(254) := NULLIF(lower(trim(p_owner->>'email')), '');
    v_owner_phone varchar(20) := regexp_replace(
        COALESCE(trim(p_owner#>>'{phone,callingCode}'), '') ||
        COALESCE(trim(p_owner#>>'{phone,number}'), ''), '\s+', '', 'g'
    );
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform organization onboarding is not permitted' USING ERRCODE = '42501';
    END IF;
    IF v_owner_first_name IS NULL OR length(v_owner_first_name) > 100
       OR length(COALESCE(v_owner_last_name, '')) > 100
       OR NULLIF(v_owner_phone, '') IS NULL OR length(v_owner_phone) > 20
       OR (v_owner_email IS NOT NULL AND
           (length(v_owner_email) > 254 OR v_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) THEN
        RAISE EXCEPTION 'Invalid Business Owner identity fields' USING ERRCODE = '22023';
    END IF;

    SELECT created.organization_id, created.organization_details_id,
           created.organization_branding_id
      INTO STRICT v_organization_id, v_details_id, v_branding_id
      FROM "${schemaName}".create_organization(
          p_organization, p_details, p_branding, p_actor_user_id
      ) created;

    SELECT organization_user_type_id INTO STRICT v_owner_type_id
    FROM "${schemaName}".organization_user_types
    WHERE organization_user_type_code = 'OWNER' AND is_active = TRUE;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_phone, 0));
    SELECT u.user_id INTO v_owner_user_id
    FROM "${schemaName}"."user" u
    WHERE u.primary_phone = v_owner_phone
    ORDER BY u.is_deleted, u.user_id LIMIT 1 FOR UPDATE;

    IF v_owner_user_id IS NULL THEN
        v_owner_user_id := "${schemaName}".generate_runtime_id('USR');
        INSERT INTO "${schemaName}"."user" (
            user_id, user_code, first_name, last_name, display_name,
            primary_email, primary_phone, preferred_language_id,
            user_status_id, created_by, updated_by
        ) VALUES (
            v_owner_user_id,
            "${schemaName}".generate_user_code(v_owner_first_name, v_owner_last_name),
            v_owner_first_name, v_owner_last_name,
            concat_ws(' ', v_owner_first_name, v_owner_last_name),
            v_owner_email, v_owner_phone, 'language-en',
            'entity-status-user-active', p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}"."user"
        SET user_status_id = 'entity-status-user-active', is_deleted = FALSE,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE user_id = v_owner_user_id
          AND (is_deleted OR user_status_id <> 'entity-status-user-active');
    END IF;

    SELECT ou.organization_user_id INTO v_owner_ou_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = v_organization_id
      AND ou.user_id = v_owner_user_id
      AND ou.organization_user_type_id = v_owner_type_id
    ORDER BY ou.is_deleted, ou.organization_user_id LIMIT 1 FOR UPDATE;

    IF v_owner_ou_id IS NULL THEN
        v_owner_ou_id := "${schemaName}".generate_runtime_id('OUS');
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id,
            joining_date, created_by, updated_by
        ) VALUES (
            v_owner_ou_id, v_organization_id, v_owner_user_id,
            v_owner_type_id, 'entity-status-org-user-active', CURRENT_DATE,
            p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user
        SET organization_user_status_id = 'entity-status-org-user-active',
            is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE organization_user_id = v_owner_ou_id
          AND (is_deleted OR organization_user_status_id <> 'entity-status-org-user-active');
    END IF;

    v_owner_assignment_id := "${schemaName}".rbac_ensure_organization_base_role(
        v_owner_ou_id, 'role-owner', p_actor_user_id
    );

    RETURN QUERY SELECT v_organization_id, v_details_id, v_branding_id,
        v_owner_user_id, v_owner_ou_id, v_owner_assignment_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Prospective customer identity/link generation.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".create_organization_prospective_customer(
    p_organization_id varchar, p_first_name varchar, p_middle_name varchar,
    p_last_name varchar, p_display_name varchar, p_primary_email varchar,
    p_primary_phone varchar, p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
AS $function$
DECLARE
    v_email varchar := NULLIF(lower(trim(p_primary_email)), '');
    v_phone varchar := trim(p_primary_phone);
    v_user_id varchar(64);
    v_organization_user_id varchar(64);
    v_customer_type_id varchar;
    v_user_status_id varchar;
    v_relationship_status_id varchar;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(p_first_name), '') IS NULL OR length(p_first_name) > 100
       OR NULLIF(trim(p_last_name), '') IS NULL OR length(p_last_name) > 100
       OR NULLIF(v_phone, '') IS NULL OR length(v_phone) > 20
       OR (v_email IS NOT NULL AND length(v_email) > 254)
       OR (p_middle_name IS NOT NULL AND length(p_middle_name) > 100)
       OR (p_display_name IS NOT NULL AND length(p_display_name) > 150) THEN
        RAISE EXCEPTION 'Invalid prospective customer fields' USING ERRCODE = '22023';
    END IF;

    SELECT organization_user_type_id INTO STRICT v_customer_type_id
    FROM "${schemaName}".organization_user_types
    WHERE organization_user_type_code = 'CUSTOMER' AND is_active = true;
    SELECT es.entity_status_id INTO STRICT v_user_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    SELECT es.entity_status_id INTO STRICT v_relationship_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'ORGANIZATION_USER'
      AND st.status_code = 'ACTIVE' AND es.is_active = true;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));
    SELECT user_id INTO v_user_id FROM "${schemaName}"."user"
    WHERE primary_phone = v_phone AND is_deleted = false FOR UPDATE;

    IF v_email IS NOT NULL AND EXISTS (
        SELECT 1 FROM "${schemaName}"."user"
        WHERE lower(primary_email) = v_email AND is_deleted = false
          AND (v_user_id IS NULL OR user_id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Email belongs to another user; resolve identity before linking'
            USING ERRCODE = '23505';
    END IF;

    IF v_user_id IS NULL THEN
        v_user_id := "${schemaName}".generate_runtime_id('USR');
        INSERT INTO "${schemaName}"."user" (
            user_id, user_code, first_name, middle_name, last_name,
            display_name, primary_email, primary_phone, user_status_id,
            created_by, updated_by
        ) VALUES (
            v_user_id, "${schemaName}".generate_user_code(p_first_name, p_last_name),
            trim(p_first_name), NULLIF(trim(p_middle_name), ''), trim(p_last_name),
            COALESCE(NULLIF(trim(p_display_name), ''), trim(p_first_name) || ' ' || trim(p_last_name)),
            v_email, v_phone, v_user_status_id, p_actor_user_id, p_actor_user_id
        );
    END IF;

    SELECT organization_user_id INTO v_organization_user_id
    FROM "${schemaName}".organization_user
    WHERE organization_id = p_organization_id AND user_id = v_user_id
      AND organization_user_type_id = v_customer_type_id
    ORDER BY is_deleted, organization_user_id LIMIT 1 FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        v_organization_user_id := "${schemaName}".generate_runtime_id('OUS');
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id,
            created_by, updated_by
        ) VALUES (
            v_organization_user_id, p_organization_id, v_user_id,
            v_customer_type_id, v_relationship_status_id,
            p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user
        SET is_deleted = false, organization_user_status_id = v_relationship_status_id,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE organization_user_id = v_organization_user_id AND is_deleted = true;
    END IF;

    RETURN v_organization_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".link_customer_for_purchase(
    p_organization_id varchar, p_first_name varchar, p_last_name varchar,
    p_primary_email varchar, p_primary_phone varchar
) RETURNS varchar
LANGUAGE plpgsql
AS $function$
DECLARE
    v_phone varchar := trim(p_primary_phone);
    v_email varchar := NULLIF(lower(trim(p_primary_email)), '');
    v_user_id varchar(64);
    v_org_user_id varchar(64);
    v_type_id varchar;
    v_user_status varchar;
    v_relation_status varchar;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization o
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = o.organization_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE o.organization_id = p_organization_id AND o.is_deleted = false
          AND st.status_code = 'ACTIVE'
    ) OR NULLIF(trim(p_first_name), '') IS NULL OR length(p_first_name) > 100
       OR NULLIF(trim(p_last_name), '') IS NULL OR length(p_last_name) > 100
       OR NULLIF(v_phone, '') IS NULL OR length(v_phone) > 20
       OR (v_email IS NOT NULL AND length(v_email) > 254) THEN
        RAISE EXCEPTION 'Invalid organization or customer details' USING ERRCODE = '22023';
    END IF;

    SELECT organization_user_type_id INTO STRICT v_type_id
    FROM "${schemaName}".organization_user_types
    WHERE organization_user_type_code = 'CUSTOMER' AND is_active = true;
    SELECT es.entity_status_id INTO STRICT v_user_status
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    SELECT es.entity_status_id INTO STRICT v_relation_status
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'ORGANIZATION_USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));
    SELECT user_id INTO v_user_id FROM "${schemaName}"."user"
    WHERE primary_phone = v_phone AND is_deleted = false FOR UPDATE;

    IF v_email IS NOT NULL AND EXISTS (
        SELECT 1 FROM "${schemaName}"."user"
        WHERE lower(primary_email) = v_email AND is_deleted = false
          AND (v_user_id IS NULL OR user_id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Email belongs to another user' USING ERRCODE = '23505';
    END IF;

    IF v_user_id IS NULL THEN
        v_user_id := "${schemaName}".generate_runtime_id('USR');
        INSERT INTO "${schemaName}"."user" (
            user_id, user_code, first_name, last_name, display_name,
            primary_email, primary_phone, user_status_id, created_by, updated_by
        ) VALUES (
            v_user_id, "${schemaName}".generate_user_code(p_first_name, p_last_name),
            trim(p_first_name), trim(p_last_name), trim(p_first_name) || ' ' || trim(p_last_name),
            v_email, v_phone, v_user_status, v_user_id, v_user_id
        );
    END IF;

    SELECT organization_user_id INTO v_org_user_id
    FROM "${schemaName}".organization_user
    WHERE organization_id = p_organization_id AND user_id = v_user_id
      AND organization_user_type_id = v_type_id
    ORDER BY is_deleted, organization_user_id LIMIT 1 FOR UPDATE;

    IF v_org_user_id IS NULL THEN
        v_org_user_id := "${schemaName}".generate_runtime_id('OUS');
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id,
            created_by, updated_by
        ) VALUES (
            v_org_user_id, p_organization_id, v_user_id, v_type_id,
            v_relation_status, v_user_id, v_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user
        SET is_deleted = false, organization_user_status_id = v_relation_status,
            updated_at = CURRENT_TIMESTAMP, updated_by = v_user_id,
            version_no = version_no + 1
        WHERE organization_user_id = v_org_user_id AND is_deleted = true;
    END IF;

    RETURN v_org_user_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Store business-code generation. Existing function signature is preserved.
-- p_store_code is retained for API compatibility but ignored on CREATE.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".create_store(
    p_organization_id varchar(64), p_store_id varchar(64), p_store_code varchar,
    p_store_name varchar, p_store_type_id varchar(64), p_phone_number varchar,
    p_email_address varchar, p_address_line1 varchar, p_address_line2 varchar,
    p_city varchar, p_state varchar, p_postal_code varchar, p_country varchar,
    p_timezone varchar, p_store_status_id varchar(64), p_opening_date date,
    p_closing_date date, p_actor_user_id varchar(64)
)
RETURNS TABLE (
    "id" varchar, "organizationId" varchar, "storeCode" varchar, "name" varchar,
    "storeTypeId" varchar, "phoneNumber" varchar, "emailAddress" varchar,
    "addressLine1" varchar, "addressLine2" varchar, "city" varchar,
    "state" varchar, "postalCode" varchar, "country" varchar, "timezone" varchar,
    "storeStatusId" varchar, "openingDate" varchar, "closingDate" varchar,
    "createdAt" varchar, "createdBy" varchar, "updatedAt" varchar,
    "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_store_id varchar(64) := NULLIF(trim(p_store_id), '');
    v_org_code varchar(64);
    v_store_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_code INTO v_org_code
    FROM "${schemaName}".organization
    WHERE organization_id = p_organization_id AND is_deleted = FALSE;
    IF v_org_code IS NULL THEN
        RAISE EXCEPTION 'Organization not found: %', p_organization_id USING ERRCODE = '23503';
    END IF;

    IF v_store_id IS NULL THEN
        v_store_id := "${schemaName}".generate_runtime_id('STR');
    END IF;
    IF length(v_store_id) > 64 THEN
        RAISE EXCEPTION 'Invalid store id' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM "${schemaName}".stores WHERE store_id = v_store_id) THEN
        RAISE EXCEPTION 'Store already exists: %', v_store_id USING ERRCODE = '23505';
    END IF;
    IF NULLIF(trim(p_store_name), '') IS NULL THEN
        RAISE EXCEPTION 'Store name is required' USING ERRCODE = '22023';
    END IF;
    IF p_closing_date IS NOT NULL AND p_opening_date IS NOT NULL
       AND p_closing_date < p_opening_date THEN
        RAISE EXCEPTION 'Closing date cannot be before opening date' USING ERRCODE = '22023';
    END IF;

    v_seq := "${schemaName}".next_business_sequence('STORE', p_organization_id);
    v_store_code := (
        v_org_code || '_STR_' || "${schemaName}".business_name_fragment(p_store_name)
        || '_' || lpad(v_seq::text, 3, '0')
    )::varchar(64);

    INSERT INTO "${schemaName}".stores (
        store_id, organization_id, store_code, store_name, store_type_id,
        phone_number, email_address, address_line1, address_line2, city, state,
        postal_code, country, timezone, store_status_id, opening_date, closing_date,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_store_id, p_organization_id, v_store_code, p_store_name, p_store_type_id,
        NULLIF(trim(p_phone_number), ''), NULLIF(trim(p_email_address), ''),
        p_address_line1, NULLIF(trim(p_address_line2), ''), p_city, p_state,
        p_postal_code, p_country, p_timezone, p_store_status_id,
        p_opening_date, p_closing_date, CURRENT_TIMESTAMP, p_actor_user_id,
        CURRENT_TIMESTAMP, p_actor_user_id, FALSE, 1
    );

    RETURN QUERY SELECT * FROM "${schemaName}".get_organization_store(p_organization_id, v_store_id);
END;
$function$;

-- --------------------------------------------------------------------------
-- Staff-store assignment ID fallback.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".create_staff_store_assignment(
    p_organization_id varchar(64), p_assignment_id varchar(64),
    p_staff_id varchar(64), p_store_id varchar(64),
    p_assignment_status_id varchar(64), p_effective_date date,
    p_end_date date, p_actor_user_id varchar(64)
)
RETURNS SETOF "${schemaName}".staff_store_assignment
LANGUAGE plpgsql
AS $function$
DECLARE
    v_assignment_id varchar(64) := NULLIF(trim(p_assignment_id), '');
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'User % cannot administer organization %', p_actor_user_id, p_organization_id
            USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".staff s
        WHERE s.staff_id = p_staff_id AND s.organization_id = p_organization_id AND s.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Staff % does not belong to organization %', p_staff_id, p_organization_id
            USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores st
        WHERE st.store_id = p_store_id AND st.organization_id = p_organization_id AND st.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Store % does not belong to organization %', p_store_id, p_organization_id
            USING ERRCODE = '23503';
    END IF;
    IF v_assignment_id IS NULL THEN
        v_assignment_id := "${schemaName}".generate_runtime_id('SSA');
    END IF;

    INSERT INTO "${schemaName}".staff_store_assignment (
        staff_store_assignment_id, staff_id, store_id, status_id,
        effective_date, end_date, created_at, created_by,
        updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_assignment_id, p_staff_id, p_store_id, p_assignment_status_id,
        p_effective_date, p_end_date, CURRENT_TIMESTAMP, p_actor_user_id,
        CURRENT_TIMESTAMP, p_actor_user_id, FALSE, 1
    );

    RETURN QUERY SELECT a.* FROM "${schemaName}".staff_store_assignment a
    WHERE a.staff_store_assignment_id = v_assignment_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Membership Product: 64-char validation + generated immutable business code.
-- Caller-supplied p_id remains the persisted ID until Kotlin generation is
-- switched to MPR_<uuid> because this legacy function returns boolean only.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_membership_product(
    p_organization_id varchar, p_id varchar, p_code varchar, p_name varchar,
    p_display_name varchar, p_category_id varchar, p_type_id varchar,
    p_tier varchar, p_tier_sequence integer, p_description varchar,
    p_status_id varchar, p_effective_date date, p_expiry_date date,
    p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_effective_date IS NULL OR p_expiry_date < p_effective_date
       OR p_tier_sequence < 1 THEN
        RAISE EXCEPTION 'Invalid membership product fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".product_categories
                   WHERE product_category_id = p_category_id AND is_active = true)
       OR NOT EXISTS (SELECT 1 FROM "${schemaName}".product_types
                      WHERE product_type_id = p_type_id AND is_active = true)
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}".entity_status es
           JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
           WHERE es.entity_status_id = p_status_id
             AND et.entity_type_code = 'MEMBERSHIP_PRODUCT' AND es.is_active = true
       ) THEN
        RAISE EXCEPTION 'Invalid membership category, type or status' USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('MEMBERSHIP_PRODUCT', p_organization_id);
        v_code := (v_org_code || '_MPR_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);

        INSERT INTO "${schemaName}".membership_products (
            membership_product_id, organization_id, membership_product_code,
            membership_product_name, display_name, product_category_id,
            product_type_id, tier, tier_sequence, description, product_status_id,
            effective_date, expiry_date, created_by, updated_by
        ) VALUES (
            p_id, p_organization_id, v_code, p_name, p_display_name, p_category_id,
            p_type_id, p_tier, p_tier_sequence, p_description, p_status_id,
            p_effective_date, p_expiry_date, p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".membership_products SET
            membership_product_name = p_name, display_name = p_display_name,
            product_category_id = p_category_id, product_type_id = p_type_id,
            tier = p_tier, tier_sequence = p_tier_sequence, description = p_description,
            product_status_id = p_status_id, effective_date = p_effective_date,
            expiry_date = p_expiry_date, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE membership_product_id = p_id AND organization_id = p_organization_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Membership product not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_subscription_plan(
    p_organization_id varchar, p_membership_product_id varchar, p_id varchar,
    p_code varchar, p_name varchar, p_description varchar, p_period integer,
    p_period_unit varchar, p_price numeric, p_currency_id varchar,
    p_status_id varchar, p_effective_date date, p_expiry_date date,
    p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_membership_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    SELECT mp.membership_product_code INTO v_membership_code
    FROM "${schemaName}".membership_products mp
    WHERE mp.membership_product_id = p_membership_product_id
      AND mp.organization_id = p_organization_id AND mp.is_deleted = false;
    IF v_membership_code IS NULL THEN
        RAISE EXCEPTION 'Membership product not found in organization' USING ERRCODE = 'P0002';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_period IS NULL OR p_period < 1 OR nullif(trim(p_period_unit), '') IS NULL
       OR p_price IS NULL OR p_price < 0 OR p_effective_date IS NULL
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid subscription plan fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".currencies
                   WHERE currency_id = p_currency_id AND is_active = true)
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}".entity_status es
           JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
           WHERE es.entity_status_id = p_status_id
             AND et.entity_type_code = 'SUBSCRIPTION_PLAN' AND es.is_active = true
       ) THEN
        RAISE EXCEPTION 'Invalid subscription plan currency or status' USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        v_seq := "${schemaName}".next_business_sequence('SUBSCRIPTION_PLAN', p_membership_product_id);
        v_code := (v_membership_code || '_SPL_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".subscription_plans (
            subscription_plan_id, membership_product_id, subscription_plan_code,
            subscription_plan_name, description, subscription_period,
            subscription_period_unit, price, currency_id,
            subscription_plan_status_id, effective_date, expiry_date,
            created_by, updated_by
        ) VALUES (
            p_id, p_membership_product_id, v_code, p_name, p_description, p_period,
            p_period_unit, p_price, p_currency_id, p_status_id,
            p_effective_date, p_expiry_date, p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".subscription_plans SET
            subscription_plan_name = p_name, description = p_description,
            subscription_period = p_period, subscription_period_unit = p_period_unit,
            price = p_price, currency_id = p_currency_id,
            subscription_plan_status_id = p_status_id, effective_date = p_effective_date,
            expiry_date = p_expiry_date, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE subscription_plan_id = p_id
          AND membership_product_id = p_membership_product_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Subscription plan not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

-- --------------------------------------------------------------------------
-- Benefit and Offer: generated immutable codes; ID limit raised to 64.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_benefit(
    p_organization_id varchar, p_benefit_id varchar, p_code varchar,
    p_name varchar, p_display_name varchar, p_category_id varchar,
    p_type_id varchar, p_description varchar, p_status_id varchar,
    p_product_id varchar, p_retail_price numeric, p_cost numeric,
    p_effective_date date, p_expiry_date date, p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF length(p_benefit_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid Benefit fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'BENEFIT'
    ) THEN
        RAISE EXCEPTION 'Benefit status does not belong to BENEFIT' USING ERRCODE = '22023';
    END IF;
    IF p_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".product p
        WHERE p.product_id = p_product_id AND p.organization_id = p_organization_id
          AND p.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Product does not belong to organization' USING ERRCODE = '23503';
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('BENEFIT', p_organization_id);
        v_code := (v_org_code || '_BEN_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".benefits (
            benefit_id, organization_id, benefit_code, benefit_name, display_name,
            benefit_category_id, benefit_type_id, description, benefit_status_id,
            product_id, retail_price, cost, effective_date, expiry_date,
            created_at, created_by, updated_at, updated_by, is_deleted, version_no
        ) VALUES (
            p_benefit_id, p_organization_id, v_code, p_name, p_display_name,
            p_category_id, p_type_id, p_description, p_status_id, p_product_id,
            p_retail_price, p_cost, p_effective_date, p_expiry_date,
            CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
            false, 1
        );
    ELSE
        UPDATE "${schemaName}".benefits SET
            benefit_name = p_name, display_name = p_display_name,
            benefit_category_id = p_category_id, benefit_type_id = p_type_id,
            description = p_description, benefit_status_id = p_status_id,
            product_id = p_product_id, retail_price = p_retail_price, cost = p_cost,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE benefit_id = p_benefit_id AND organization_id = p_organization_id
          AND is_deleted = false;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Benefit not found in organization' USING ERRCODE = 'P0002';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_offer(
    p_organization_id varchar, p_id varchar, p_code varchar, p_name varchar,
    p_description varchar, p_membership_product_id varchar, p_store_id varchar,
    p_promotion_image_url varchar, p_badge_text varchar, p_availability_text varchar,
    p_cta_label varchar, p_cta_type varchar, p_cta_target varchar,
    p_discount_percentage numeric, p_effective_date date, p_expiry_date date,
    p_status_id varchar, p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 150
       OR length(coalesce(p_description, '')) > 1000
       OR nullif(trim(p_promotion_image_url), '') IS NULL OR length(p_promotion_image_url) > 500
       OR length(coalesce(p_badge_text, '')) > 50
       OR length(coalesce(p_availability_text, '')) > 100
       OR nullif(trim(p_cta_label), '') IS NULL OR length(p_cta_label) > 50
       OR p_cta_type NOT IN ('REDEEM_OFFER', 'SHOP') OR length(coalesce(p_cta_target, '')) > 500
       OR p_effective_date IS NULL OR p_expiry_date < p_effective_date
       OR (p_discount_percentage IS NOT NULL AND (p_discount_percentage <= 0 OR p_discount_percentage > 100)) THEN
        RAISE EXCEPTION 'Invalid Offer fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'OFFER' AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid Offer status' USING ERRCODE = '22023';
    END IF;
    IF p_membership_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".membership_products mp
        WHERE mp.membership_product_id = p_membership_product_id
          AND mp.organization_id = p_organization_id AND mp.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Membership Product does not belong to organization' USING ERRCODE = '23503';
    END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores s
        WHERE s.store_id = p_store_id AND s.organization_id = p_organization_id AND s.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Store does not belong to organization' USING ERRCODE = '23503';
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('OFFER', p_organization_id);
        v_code := (v_org_code || '_OFF_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".offer (
            offer_id, organization_id, offer_code, offer_name, description,
            membership_product_id, store_id, promotion_image_url, badge_text,
            availability_text, cta_label, cta_type, cta_target,
            discount_percentage, effective_date, expiry_date, status_id,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            p_id, p_organization_id, v_code, p_name, p_description,
            p_membership_product_id, p_store_id, p_promotion_image_url, p_badge_text,
            p_availability_text, p_cta_label, p_cta_type, p_cta_target,
            p_discount_percentage, p_effective_date, p_expiry_date, p_status_id,
            CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".offer SET
            offer_name = p_name, description = p_description,
            membership_product_id = p_membership_product_id, store_id = p_store_id,
            promotion_image_url = p_promotion_image_url, badge_text = p_badge_text,
            availability_text = p_availability_text, cta_label = p_cta_label,
            cta_type = p_cta_type, cta_target = p_cta_target,
            discount_percentage = p_discount_percentage,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            status_id = p_status_id, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE offer_id = p_id AND organization_id = p_organization_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Offer not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

-- --------------------------------------------------------------------------
-- Subscription ID + customer-readable subscription number.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".purchase_membership_subscription(
    p_organization_id varchar,
    p_plan_id varchar, p_customer_user_id varchar, p_first_name varchar,
    p_last_name varchar, p_primary_email varchar, p_primary_phone varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar,
    "subscriptionDate" text, "startDate" text, "endDate" text,
    "subscriptionStatusId" varchar, "totalAmount" double precision,
    "currencyCode" varchar
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_organization_user_id varchar;
    v_user_id varchar;
    v_user_code varchar(64);
    v_org_code varchar(64);
    v_product_id varchar;
    v_period integer;
    v_unit varchar;
    v_price numeric(12,2);
    v_currency varchar;
    v_status_id varchar;
    v_subscription_id varchar(64);
    v_subscription_number varchar(64);
    v_subscription_number_candidate text;
    v_subscription_seq bigint;
    v_end_date date;
BEGIN
    SELECT mp.membership_product_id, sp.subscription_period, sp.subscription_period_unit,
           sp.price, c.currency_code, o.organization_code
      INTO v_product_id, v_period, v_unit, v_price, v_currency, v_org_code
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".organization o ON o.organization_id = mp.organization_id
      JOIN "${schemaName}".currencies c ON c.currency_id = sp.currency_id AND c.is_active = true
      JOIN "${schemaName}".entity_status pse ON pse.entity_status_id = sp.subscription_plan_status_id
      JOIN "${schemaName}".statuses ps ON ps.status_id = pse.status_id
      JOIN "${schemaName}".entity_status mse ON mse.entity_status_id = mp.product_status_id
      JOIN "${schemaName}".statuses ms ON ms.status_id = mse.status_id
     WHERE sp.subscription_plan_id = p_plan_id AND mp.organization_id = p_organization_id
       AND sp.is_deleted = false AND mp.is_deleted = false
       AND ps.status_code = 'ACTIVE' AND ms.status_code = 'ACTIVE'
       AND sp.effective_date <= CURRENT_DATE AND (sp.expiry_date IS NULL OR sp.expiry_date >= CURRENT_DATE)
       AND mp.effective_date <= CURRENT_DATE AND (mp.expiry_date IS NULL OR mp.expiry_date >= CURRENT_DATE);
    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Membership plan is unavailable for this organization' USING ERRCODE = '22023';
    END IF;
    IF v_period < 1 OR lower(v_unit) NOT IN ('day','days','week','weeks','month','months','year','years') THEN
        RAISE EXCEPTION 'Membership plan has an invalid subscription period' USING ERRCODE = '22023';
    END IF;

    SELECT es.entity_status_id INTO v_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'SUBSCRIPTION' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'Active subscription status is not configured' USING ERRCODE = '22023';
    END IF;

    IF p_customer_user_id IS NULL THEN
        v_organization_user_id := "${schemaName}".link_customer_for_purchase(
            p_organization_id, p_first_name, p_last_name, p_primary_email, p_primary_phone
        );
    ELSE
        SELECT ou.organization_user_id INTO v_organization_user_id
        FROM "${schemaName}".organization_user ou
        JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
        JOIN "${schemaName}".organization_user_types ot ON ot.organization_user_type_id = ou.organization_user_type_id
        JOIN "${schemaName}".entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
        JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
        WHERE ou.organization_id = p_organization_id AND ou.user_id = p_customer_user_id
          AND ot.organization_user_type_code = 'CUSTOMER'
          AND ou.is_deleted = false AND u.is_deleted = false AND os.status_code = 'ACTIVE'
        FOR UPDATE OF ou;
        IF v_organization_user_id IS NULL THEN
            RAISE EXCEPTION 'Customer is not active in this organization' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT ou.user_id, u.user_code INTO v_user_id, v_user_code
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    WHERE ou.organization_user_id = v_organization_user_id
    FOR UPDATE OF ou;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}"."user" u
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = u.user_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE u.user_id = v_user_id AND u.is_deleted = false AND st.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Customer account is not active' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "${schemaName}".subscriptions s
        JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = s.subscription_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE s.organization_user_id = v_organization_user_id
          AND sp.membership_product_id = v_product_id AND s.is_deleted = false
          AND st.status_code = 'ACTIVE' AND s.end_date >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Customer already has an active subscription for this membership' USING ERRCODE = '23505';
    END IF;

    v_end_date := CURRENT_DATE + CASE lower(v_unit)
        WHEN 'day' THEN make_interval(days => v_period)
        WHEN 'days' THEN make_interval(days => v_period)
        WHEN 'week' THEN make_interval(days => v_period * 7)
        WHEN 'weeks' THEN make_interval(days => v_period * 7)
        WHEN 'month' THEN make_interval(months => v_period)
        WHEN 'months' THEN make_interval(months => v_period)
        WHEN 'year' THEN make_interval(years => v_period)
        ELSE make_interval(years => v_period) END;

    v_subscription_id := "${schemaName}".generate_runtime_id('SUB');
    v_subscription_seq := "${schemaName}".next_business_sequence(
        'SUBSCRIPTION', v_organization_user_id
    );
    v_subscription_number_candidate :=
        v_org_code || '_SUB_' || regexp_replace(v_user_code, '^USR_', '')
        || '_' || lpad(v_subscription_seq::text, 3, '0');

    IF length(v_subscription_number_candidate) > 64 THEN
        RAISE EXCEPTION
            'Generated subscription number exceeds 64 characters: %',
            v_subscription_number_candidate
            USING ERRCODE = '22023';
    END IF;

    v_subscription_number := v_subscription_number_candidate::varchar(64);

    INSERT INTO "${schemaName}".subscriptions (
        subscription_id, subscription_number, subscription_plan_id,
        organization_user_id, subscription_date, start_date, end_date,
        subscription_status_id, total_amount, created_by, updated_by
    ) VALUES (
        v_subscription_id, v_subscription_number, p_plan_id,
        v_organization_user_id, CURRENT_DATE, CURRENT_DATE, v_end_date,
        v_status_id, v_price,
        COALESCE(p_actor_user_id, v_user_id), COALESCE(p_actor_user_id, v_user_id)
    );

    RETURN QUERY SELECT v_subscription_id, v_organization_user_id, v_user_id,
        v_subscription_number, p_plan_id, CURRENT_DATE::text, CURRENT_DATE::text,
        v_end_date::text, v_status_id, v_price::double precision, v_currency;
END;
$function$;

-- --------------------------------------------------------------------------
-- Redemption ID + subscription-hierarchical redemption number.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".counter_redeem_benefits(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_subscription_id varchar, p_benefit_ids varchar[], p_actor_user_id varchar
) RETURNS TABLE ("redemptionId" varchar, "benefitId" varchar, "redemptionNumber" varchar)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_benefit_id varchar;
    v_redemption_id varchar(64);
    v_redemption_number varchar(64);
    v_redemption_number_candidate text;
    v_subscription_number varchar(64);
    v_status_id varchar;
    v_reason text;
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_benefit_ids IS NULL OR cardinality(p_benefit_ids) = 0 OR
       EXISTS (SELECT 1 FROM unnest(p_benefit_ids) id WHERE id IS NULL OR trim(id) = '') OR
       (SELECT count(DISTINCT id) FROM unnest(p_benefit_ids) id) <> cardinality(p_benefit_ids) THEN
        RAISE EXCEPTION 'Select one or more distinct benefits' USING ERRCODE = '22023';
    END IF;

    SELECT s.subscription_number INTO v_subscription_number
    FROM "${schemaName}".subscriptions s
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    WHERE s.subscription_id = p_subscription_id
      AND ou.organization_id = p_organization_id
    FOR UPDATE OF s;
    IF v_subscription_number IS NULL THEN
        RAISE EXCEPTION 'Subscription not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT es.entity_status_id INTO v_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'REDEMPTION' AND st.status_code = 'SUCCESS' AND es.is_active = true;
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'Successful redemption status is not configured' USING ERRCODE = '22023';
    END IF;

    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_reason := "${schemaName}".counter_benefit_rejection(
            p_organization_id, p_subscription_id, v_benefit_id
        );
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505';
        END IF;
    END LOOP;

    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_redemption_id := "${schemaName}".generate_runtime_id('RDM');
        v_seq := "${schemaName}".next_business_sequence('REDEMPTION', p_subscription_id);
        v_redemption_number_candidate :=
            v_subscription_number || '_RDM_' || lpad(v_seq::text, 3, '0');

        IF length(v_redemption_number_candidate) > 64 THEN
            RAISE EXCEPTION
                'Generated redemption number exceeds 64 characters: %',
                v_redemption_number_candidate
                USING ERRCODE = '22023';
        END IF;

        v_redemption_number := v_redemption_number_candidate::varchar(64);

        INSERT INTO "${schemaName}".redemptions (
            redemption_id, redemption_number, subscription_id, benefit_id,
            store_id, staff_id, redemption_status_id, created_by, updated_by
        ) VALUES (
            v_redemption_id, v_redemption_number, p_subscription_id, v_benefit_id,
            p_store_id, p_staff_id, v_status_id, p_actor_user_id, p_actor_user_id
        );

        RETURN QUERY SELECT v_redemption_id, v_benefit_id, v_redemption_number;
    END LOOP;
END;
$function$;

-- --------------------------------------------------------------------------
-- Counter Operator staff creation: STF_<uuid> and hierarchical Staff code.
-- Staff sequence remains organization-wide; the code records the primary store
-- at the time the Staff profile is created and is thereafter immutable.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_set_counter_operator(
    p_organization_id varchar, p_organization_user_id varchar,
    p_payload jsonb, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_enabled boolean := COALESCE((p_payload->>'enabled')::boolean, FALSE);
    v_staff_id varchar(64);
    v_staff_code varchar(64);
    v_store_id varchar(64);
    v_store_code varchar(64);
    v_first_name varchar(100);
    v_last_name varchar(100);
    v_next_staff_number bigint;
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization_user
        WHERE organization_user_id = p_organization_user_id
          AND organization_id = p_organization_id AND NOT is_deleted
          AND organization_user_status_id = 'entity-status-org-user-active'
    ) THEN
        RAISE EXCEPTION 'Active organization user not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT s.staff_id, s.staff_code INTO v_staff_id, v_staff_code
    FROM "${schemaName}".staff s
    WHERE s.organization_user_id = p_organization_user_id
    FOR UPDATE;

    IF v_enabled THEN
        v_store_id := NULLIF(p_payload->>'primaryStoreId','');
        IF v_store_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "${schemaName}".stores
            WHERE store_id = v_store_id AND organization_id = p_organization_id AND NOT is_deleted
        ) THEN
            RAISE EXCEPTION 'Store not found' USING ERRCODE = '23503';
        END IF;

        IF v_staff_id IS NULL THEN
            IF v_store_id IS NULL THEN
                RAISE EXCEPTION 'A primary store is required to enable a new Counter Operator' USING ERRCODE = '22023';
            END IF;
            v_staff_id := "${schemaName}".generate_runtime_id('STF');

            SELECT st.store_code, u.first_name, u.last_name
              INTO v_store_code, v_first_name, v_last_name
            FROM "${schemaName}".stores st
            JOIN "${schemaName}".organization_user ou
              ON ou.organization_user_id = p_organization_user_id
            JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
            WHERE st.store_id = v_store_id
              AND st.organization_id = p_organization_id
              AND NOT st.is_deleted;

            IF v_store_code IS NULL THEN
                RAISE EXCEPTION 'Store code is required to create a Staff profile' USING ERRCODE = '22023';
            END IF;

            v_next_staff_number := "${schemaName}".next_business_sequence('STAFF', p_organization_id);
            v_staff_code := (
                v_store_code || '_STF_' || "${schemaName}".business_user_fragment(v_first_name, v_last_name)
                || '_' || lpad(v_next_staff_number::text, 3, '0')
            )::varchar(64);
        END IF;

        INSERT INTO "${schemaName}".staff (
            staff_id, organization_user_id, staff_code, organization_id,
            role_id, designation, store_id, joining_date, staff_status_id,
            created_by, updated_by, is_deleted, version_no
        ) VALUES (
            v_staff_id, p_organization_user_id, v_staff_code, p_organization_id,
            'role-staff', NULLIF(p_payload->>'designation',''), v_store_id,
            CURRENT_DATE, 'entity-status-staff-active', p_actor_user_id,
            p_actor_user_id, FALSE, 1
        )
        ON CONFLICT (organization_user_id) DO UPDATE SET
            designation = COALESCE(EXCLUDED.designation, staff.designation),
            store_id = COALESCE(EXCLUDED.store_id, staff.store_id),
            staff_status_id = 'entity-status-staff-active', relieving_date = NULL,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            is_deleted = FALSE, version_no = staff.version_no + 1
        RETURNING staff_id INTO v_staff_id;

        PERFORM "${schemaName}".rbac_ensure_staff_base_role(
            p_organization_id, v_staff_id, p_actor_user_id
        );
    ELSE
        IF v_staff_id IS NULL THEN RETURN NULL; END IF;
        UPDATE "${schemaName}".staff
        SET staff_status_id = 'entity-status-staff-inactive',
            relieving_date = COALESCE(relieving_date, CURRENT_DATE),
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE staff_id = v_staff_id;

        UPDATE "${schemaName}".organization_user_roles
        SET assignment_status_id = 'entity-status-org-user-role-revoked',
            effective_to = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE organization_user_id = p_organization_user_id
          AND role_id = 'role-staff' AND NOT is_deleted
          AND assignment_status_id = 'entity-status-org-user-role-active';
    END IF;

    RETURN v_staff_id;
END;
$function$;

-- --------------------------------------------------------------------------
-- Caller-owned runtime ID parameters: normalize function contract lengths now.
-- The Kotlin-side generators must produce PMT_/PAT_/POS_/SES_ IDs before actual
-- deployment. We intentionally do not rewrite IDs in these functions because
-- callers use the supplied IDs in later operations.
-- --------------------------------------------------------------------------

-- No data rewrite is performed by this changeset. Existing rows retain their
-- current IDs/codes; the standard applies to newly-created runtime data.

-- --------------------------------------------------------------------------
-- Business codes/numbers are immutable by write-function design.
-- CREATE paths generate them; UPDATE paths intentionally do not modify them.
-- No database triggers are used.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Platform administrative-user maintenance also creates User/OUS identities.
-- --------------------------------------------------------------------------
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
    v_user_id varchar(64) := NULLIF(trim(p_user_id), '');
    v_organization_user_id varchar(64);
    v_role_id varchar(64);
    v_other_role_id varchar(64);
    v_user_type_id varchar(64);
    v_phone varchar(20) := regexp_replace(COALESCE(trim(p_primary_phone), ''), '[^0-9+]', '', 'g');
    v_assignment_id varchar(64);
    v_effective_from timestamp without time zone := COALESCE(p_effective_from, CURRENT_TIMESTAMP);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform organization maintenance is not permitted' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
    ) THEN
        RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_role_code = 'BUSINESS_OWNER' THEN
        v_role_id := 'role-owner';
        v_other_role_id := 'role-admin';
        v_user_type_id := 'organization-user-type-owner';
    ELSIF p_role_code = 'ORG_ADMIN' THEN
        v_role_id := 'role-admin';
        v_other_role_id := 'role-owner';
        v_user_type_id := 'organization-user-type-admin';
    ELSE
        RAISE EXCEPTION 'Administrative role must be BUSINESS_OWNER or ORG_ADMIN' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(trim(p_first_name), '') IS NULL OR length(trim(p_first_name)) > 100
       OR length(COALESCE(trim(p_last_name), '')) > 100
       OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
       OR (NULLIF(trim(p_primary_email), '') IS NOT NULL AND
           (length(trim(p_primary_email)) > 254 OR
            lower(trim(p_primary_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
       OR (p_effective_to IS NOT NULL AND p_effective_to <= v_effective_from) THEN
        RAISE EXCEPTION 'Invalid administrative user fields or effective date range' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));

    IF v_user_id IS NULL THEN
        SELECT u.user_id INTO v_user_id
        FROM "${schemaName}"."user" u
        WHERE u.primary_phone = v_phone
        ORDER BY u.is_deleted, u.user_id
        LIMIT 1 FOR UPDATE;

        IF v_user_id IS NULL THEN
            v_user_id := "${schemaName}".generate_runtime_id('USR');
            INSERT INTO "${schemaName}"."user" (
                user_id, user_code, first_name, last_name, display_name,
                primary_email, primary_phone, preferred_language_id,
                user_status_id, created_by, updated_by
            ) VALUES (
                v_user_id,
                "${schemaName}".generate_user_code(p_first_name, p_last_name),
                trim(p_first_name), NULLIF(trim(p_last_name), ''),
                concat_ws(' ', trim(p_first_name), NULLIF(trim(p_last_name), '')),
                NULLIF(lower(trim(p_primary_email)), ''), v_phone, 'language-en',
                'entity-status-user-active', p_actor_user_id, p_actor_user_id
            );
        ELSE
            UPDATE "${schemaName}"."user" AS u
            SET user_status_id = 'entity-status-user-active', is_deleted = FALSE,
                updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
                version_no = u.version_no + 1
            WHERE u.user_id = v_user_id
              AND (u.is_deleted OR u.user_status_id <> 'entity-status-user-active');
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM "${schemaName}".organization_user ou
            JOIN "${schemaName}".organization_user_roles our
              ON our.organization_user_id = ou.organization_user_id
            WHERE ou.organization_id = p_organization_id
              AND ou.user_id = v_user_id
              AND our.role_id IN ('role-owner', 'role-admin')
              AND NOT ou.is_deleted AND NOT our.is_deleted
        ) THEN
            RAISE EXCEPTION 'Administrative organization user not found' USING ERRCODE = 'P0002';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM "${schemaName}"."user" u
            WHERE u.user_id = v_user_id AND u.primary_phone = v_phone
        ) THEN
            RAISE EXCEPTION 'Phone is the immutable identity for an existing user' USING ERRCODE = '22023';
        END IF;

        UPDATE "${schemaName}"."user" AS u
        SET first_name = trim(p_first_name),
            last_name = NULLIF(trim(p_last_name), ''),
            display_name = concat_ws(' ', trim(p_first_name), NULLIF(trim(p_last_name), '')),
            primary_email = NULLIF(lower(trim(p_primary_email)), ''),
            user_status_id = 'entity-status-user-active', is_deleted = FALSE,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = u.version_no + 1
        WHERE u.user_id = v_user_id;
    END IF;

    SELECT ou.organization_user_id INTO v_organization_user_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = p_organization_id
      AND ou.user_id = v_user_id
      AND ou.organization_user_type_id IN (
          'organization-user-type-owner', 'organization-user-type-admin'
      )
    ORDER BY ou.is_deleted, ou.organization_user_id
    LIMIT 1 FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        v_organization_user_id := "${schemaName}".generate_runtime_id('OUS');
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id,
            joining_date, created_by, updated_by
        ) VALUES (
            v_organization_user_id, p_organization_id, v_user_id,
            v_user_type_id, 'entity-status-org-user-active', CURRENT_DATE,
            p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user AS ou
        SET organization_user_type_id = v_user_type_id,
            organization_user_status_id = 'entity-status-org-user-active',
            is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = ou.version_no + 1
        WHERE ou.organization_user_id = v_organization_user_id;
    END IF;

    v_assignment_id := "${schemaName}".rbac_ensure_organization_base_role(
        v_organization_user_id, v_role_id, p_actor_user_id
    );

    UPDATE "${schemaName}".organization_user_roles AS our
    SET effective_from = v_effective_from,
        effective_to = p_effective_to,
        assignment_reason = 'Platform Admin organization maintenance',
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = our.version_no + 1
    WHERE our.organization_user_role_id = v_assignment_id;

    UPDATE "${schemaName}".organization_user_roles AS our
    SET assignment_status_id = 'entity-status-org-user-role-revoked',
        effective_to = CASE WHEN our.effective_from < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = our.version_no + 1
    WHERE our.organization_user_id = v_organization_user_id
      AND our.role_id = v_other_role_id
      AND NOT our.is_deleted
      AND our.assignment_status_id <> 'entity-status-org-user-role-revoked';

    RETURN QUERY
    SELECT our.organization_user_role_id, ou.organization_user_id,
           ou.organization_id, u.user_id, u.first_name, u.last_name,
           COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
           u.primary_email, u.primary_phone, r.role_code,
           our.assignment_status_id, our.effective_from, our.effective_to
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".organization_user_roles our ON our.organization_user_id = ou.organization_user_id
    JOIN "${schemaName}".role r ON r.role_id = our.role_id
    WHERE ou.organization_user_id = v_organization_user_id
      AND our.organization_user_role_id = v_assignment_id;
END;
$function$;
