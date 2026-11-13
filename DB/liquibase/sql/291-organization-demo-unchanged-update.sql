-- W291: Allow ordinary organization updates which echo an unchanged isDemo value.
-- Only a genuine DEMO designation change requires PLATFORM_ADMIN_ACCESS.
-- Based on the latest update_organization implementation in W287.
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
    v_current_is_demo boolean;
    v_requested_is_demo boolean;
    v_demo_change_requested boolean := FALSE;
BEGIN
    IF p_organization IS NOT NULL AND p_organization ? 'isDemo'
       AND p_organization->'isDemo' <> 'null'::jsonb
       AND jsonb_typeof(p_organization->'isDemo') <> 'boolean' THEN
        RAISE EXCEPTION 'Organization isDemo must be a boolean'
            USING ERRCODE = '22023';
    END IF;

    IF p_organization IS NOT NULL AND p_organization ? 'isDemo'
       AND p_organization->'isDemo' <> 'null'::jsonb THEN
        v_requested_is_demo := (p_organization->>'isDemo')::boolean;

        -- Lock the current organization so a concurrent DEMO toggle cannot race
        -- the authorization comparison or the eventual write.
        SELECT o.is_demo INTO v_current_is_demo
          FROM "${schemaName}"."organization" o
         WHERE o.organization_id = p_organization_id AND o.is_deleted = FALSE
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Organization not found: %', p_organization_id
                USING ERRCODE = 'P0002';
        END IF;

        v_demo_change_requested := v_requested_is_demo IS DISTINCT FROM v_current_is_demo;
        IF v_demo_change_requested AND NOT "${schemaName}".rbac_has_capability(
            p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS'
        ) THEN
            RAISE EXCEPTION 'Demo organization configuration is not permitted'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Preserve the full pre-terms organization/details/branding update behavior.
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

    -- Unchanged values should not trigger a redundant privileged-field update.
    IF v_demo_change_requested THEN
        UPDATE "${schemaName}"."organization"
           SET is_demo = v_requested_is_demo
         WHERE organization_id = p_organization_id AND is_deleted = FALSE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Organization not found: %', p_organization_id
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".update_organization(varchar, jsonb, jsonb, jsonb, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".update_organization(varchar, jsonb, jsonb, jsonb, varchar) TO "${appRole}";
