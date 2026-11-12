-- Platform-admin DEMO organization configuration.
-- Existing organizations remain REAL by the NOT NULL false default.

ALTER TABLE "${schemaName}"."organization"
    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT FALSE;

-- Extend the latest authoritative organization creator (096).  The public
-- signature and all existing validation/default behavior remain unchanged;
-- is_demo is persisted as part of the initial organization row.
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
    v_organization_type_id varchar(40) := NULLIF(trim(p_organization->>'organizationTypeId'), '');
    v_default_template_id varchar(40);
    v_default_template_ids varchar(40)[];
    v_requested_template_id varchar(40) := NULLIF(trim(p_branding->>'themeTemplateId'), '');
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

    IF v_organization_type_id IS NULL THEN
        RAISE EXCEPTION 'Organization type is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(t.template_id ORDER BY t.template_id)
      INTO v_default_template_ids
      FROM "${schemaName}"."template" t
      JOIN "${schemaName}"."entity_status" es
        ON es.entity_status_id = t.template_status_id
       AND es.is_active = TRUE
      JOIN "${schemaName}"."statuses" s
        ON s.status_id = es.status_id
     WHERE t.organization_type_id = v_organization_type_id
       AND t.is_default = TRUE
       AND t.is_deleted = FALSE
       AND s.status_code = 'ACTIVE';

    IF COALESCE(cardinality(v_default_template_ids), 0) = 0 THEN
        RAISE EXCEPTION
            'No active default template is configured for organization type ''%''.',
            v_organization_type_id
            USING ERRCODE = '22023';
    END IF;

    IF cardinality(v_default_template_ids) > 1 THEN
        RAISE EXCEPTION
            'Multiple active default templates are configured for organization type ''%''.',
            v_organization_type_id
            USING ERRCODE = '22023';
    END IF;

    v_default_template_id := v_default_template_ids[1];

    IF v_requested_template_id IS DISTINCT FROM v_default_template_id THEN
        RAISE EXCEPTION
            'Theme template ''%'' is not the active default template for organization type ''%''.',
            COALESCE(v_requested_template_id, ''), v_organization_type_id
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
        primary_phone_calling_code, website_url, is_demo,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_id, v_organization_code, p_organization->>'name', NULL,
        NULLIF(p_organization->>'displayName', ''), NULL,
        v_organization_type_id, 'entity-status-org-active',
        p_organization->>'primaryEmail', v_primary_phone,
        NULLIF(p_organization#>>'{primaryPhone,countryId}', ''),
        NULLIF(p_organization#>>'{primaryPhone,callingCode}', ''),
        NULLIF(p_organization->>'website', ''),
        COALESCE((p_organization->>'isDemo')::boolean, FALSE),
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
        p_branding->>'brandingName', v_requested_template_id,
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

-- The authoritative onboarding function keeps its existing API, validation,
-- authorization, owner creation, and transaction boundary. isDemo is optional
-- and must be a JSON boolean when present.
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
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Platform organization onboarding is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_organization IS NOT NULL AND p_organization ? 'isDemo' THEN
        IF p_organization->'isDemo' = 'null'::jsonb
           OR jsonb_typeof(p_organization->'isDemo') <> 'boolean' THEN
            RAISE EXCEPTION 'Organization isDemo must be a boolean'
                USING ERRCODE = '22023';
        END IF;
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

-- Preserve the existing 252 update behavior and update is_demo only when an
-- explicitly supplied boolean appears in the organization JSON payload.
CREATE OR REPLACE FUNCTION "${schemaName}".update_organization(
    p_organization_id varchar(64),
    p_organization jsonb,
    p_details jsonb,
    p_branding jsonb,
    p_actor_user_id varchar(40)
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_result boolean;
BEGIN
    IF p_organization IS NOT NULL AND p_organization ? 'isDemo'
       AND p_organization->'isDemo' <> 'null'::jsonb
       AND jsonb_typeof(p_organization->'isDemo') <> 'boolean' THEN
        RAISE EXCEPTION 'Organization isDemo must be a boolean'
            USING ERRCODE = '22023';
    END IF;

    IF p_organization IS NOT NULL AND p_organization ? 'isDemo'
       AND p_organization->'isDemo' <> 'null'::jsonb
       AND NOT "${schemaName}".rbac_has_capability(
           p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS'
       ) THEN
        RAISE EXCEPTION 'Demo organization configuration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    v_result := "${schemaName}".update_organization_pre_terms_252(
        p_organization_id, p_organization, p_details, p_branding, p_actor_user_id
    );

    IF p_details IS NOT NULL AND p_details ? 'membershipTermsAndConditions' THEN
        IF p_details->'membershipTermsAndConditions' <> 'null'::jsonb
           AND jsonb_typeof(p_details->'membershipTermsAndConditions') <> 'string' THEN
            RAISE EXCEPTION 'Membership terms must be a string or null' USING ERRCODE = '22023';
        END IF;
        IF length(COALESCE(p_details->>'membershipTermsAndConditions', '')) > 30000 THEN
            RAISE EXCEPTION 'Membership terms exceed 30000 characters' USING ERRCODE = '22023';
        END IF;
        UPDATE "${schemaName}".organization_details
           SET membership_terms_and_conditions = NULLIF(p_details->>'membershipTermsAndConditions', '')
         WHERE organization_id = p_organization_id AND is_deleted = FALSE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Organization details not found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF p_organization IS NOT NULL AND p_organization ? 'isDemo'
       AND p_organization->'isDemo' <> 'null'::jsonb THEN
        UPDATE "${schemaName}"."organization"
           SET is_demo = (p_organization->>'isDemo')::boolean
         WHERE organization_id = p_organization_id
           AND is_deleted = FALSE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Organization not found: %', p_organization_id
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'id', o.organization_id,
        'code', o.organization_code,
        'name', o.organization_name,
        'legalName', o.legal_name,
        'displayName', o.organization_display_name,
        'organizationTypeId', o.organization_type_id,
        'organizationStatusId', o.organization_status_id,
        'primaryEmail', o.primary_email,
        'primaryPhone', jsonb_build_object(
            'countryId', COALESCE(o.primary_phone_country_id, ''),
            'callingCode', COALESCE(o.primary_phone_calling_code, ''),
            'number', CASE
                WHEN o.primary_phone_calling_code IS NOT NULL
                 AND o.primary_phone_calling_code <> ''
                 AND o.primary_phone LIKE o.primary_phone_calling_code || '%'
                THEN substring(o.primary_phone FROM char_length(o.primary_phone_calling_code) + 1)
                ELSE COALESCE(o.primary_phone, '')
            END
        ),
        'website', o.website_url,
        'publishedCustomerExperienceReleaseId', o.published_customer_experience_release_id,
        'isDemo', o.is_demo,
        'createdAt', o.created_at,
        'createdBy', o.created_by,
        'updatedAt', o.updated_at,
        'updatedBy', o.updated_by,
        'isDeleted', o.is_deleted,
        'versionNo', o.version_no
    )
    FROM "${schemaName}"."organization" o
    WHERE o.organization_id = p_organization_id
      AND o.is_deleted = FALSE;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organizations()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT COALESCE(
        jsonb_agg("${schemaName}".get_organization(o.organization_id)
            ORDER BY o.organization_name, o.organization_code),
        '[]'::jsonb
    )
    FROM "${schemaName}"."organization" o
    WHERE o.is_deleted = FALSE;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_aggregate(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'organization', "${schemaName}".get_organization(p_organization_id),
        'details', "${schemaName}".get_organization_details(p_organization_id),
        'branding', "${schemaName}".get_organization_branding(p_organization_id)
    )
    WHERE "${schemaName}".get_organization(p_organization_id) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".onboard_organization(jsonb, jsonb, jsonb, jsonb, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".onboard_organization(jsonb, jsonb, jsonb, jsonb, varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".update_organization(varchar, jsonb, jsonb, jsonb, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".update_organization(varchar, jsonb, jsonb, jsonb, varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_organization(varchar), "${schemaName}".get_organizations(), "${schemaName}".get_organization_aggregate(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization(varchar), "${schemaName}".get_organizations(), "${schemaName}".get_organization_aggregate(varchar) TO "${appRole}";
