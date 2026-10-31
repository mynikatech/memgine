-- Preserve the FINAL existing update_organization implementation, including
-- phone metadata, legal-name mappings, authorization and future migrations.
-- The original function is renamed once; a wrapper retains the public API.
ALTER FUNCTION "${schemaName}".update_organization(varchar,jsonb,jsonb,jsonb,varchar)
  RENAME TO update_organization_pre_terms_252;

CREATE FUNCTION "${schemaName}".update_organization(
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
    -- Delegate all existing behavior to the pre-existing function.
    v_result := "${schemaName}".update_organization_pre_terms_252(
        p_organization_id, p_organization, p_details, p_branding, p_actor_user_id
    );

    -- Terms are part of the SAME atomic save and use existing admin checks.
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
        WHERE organization_id = p_organization_id AND is_deleted = false;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Organization details not found' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".update_organization(varchar,jsonb,jsonb,jsonb,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".update_organization(varchar,jsonb,jsonb,jsonb,varchar) TO "${appRole}";

-- Preserve the existing camelCase organization-details response and append
-- the terms field without replacing its existing mappings.
ALTER FUNCTION "${schemaName}".get_organization_details(varchar)
  RENAME TO get_organization_details_pre_terms_252;

CREATE FUNCTION "${schemaName}".get_organization_details(p_organization_id varchar)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  SELECT CASE WHEN base.details IS NULL THEN NULL
    ELSE base.details || jsonb_build_object(
      'membershipTermsAndConditions', d.membership_terms_and_conditions
    ) END
  FROM (SELECT "${schemaName}".get_organization_details_pre_terms_252(p_organization_id) AS details) base
  LEFT JOIN "${schemaName}".organization_details d
    ON d.organization_id = p_organization_id AND d.is_deleted = false;
$function$;
