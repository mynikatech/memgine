-- W279: Expose the organization's OWN published Theme Experience to customer discovery.
-- Source is solely the immutable customer_experience_release.snapshot_data.
-- No platform theme lookup, no mutable organization branding lookup, no republish.
--
-- The existing discovery function performs detailed product/status filtering and
-- has SECURITY DEFINER settings. Patch only the existing JSON projection so that
-- the rest of its deployed definition, owner, permissions, and behavior remain intact.

DO $w279$
DECLARE
    v_function_oid oid;
    v_definition text;
    v_anchor text := $anchor$'announcementConfiguration', c.snapshot_data #> '{organizationBranding,announcementConfiguration}'$anchor$;
    v_addition text := $addition$,
                    'themeExperience', c.snapshot_data #> '{organizationBranding,themeExperience}'$addition$;
    v_expected text := $expected$'themeExperience', c.snapshot_data #> '{organizationBranding,themeExperience}'$expected$;
BEGIN
    v_function_oid := to_regprocedure(
        format('%I.get_customer_discoverable_organization(character varying)', '${schemaName}')
    );

    IF v_function_oid IS NULL THEN
        RAISE EXCEPTION 'W279: get_customer_discoverable_organization(varchar) not found in schema %', '${schemaName}';
    END IF;

    v_definition := pg_get_functiondef(v_function_oid);

    -- Already installed (for safe repeat execution in non-Liquibase dev environments).
    IF strpos(v_definition, v_expected) > 0 THEN
        RAISE NOTICE 'W279: published themeExperience is already projected';
        RETURN;
    END IF;

    -- Fail rather than silently changing an unexpected function revision.
    IF strpos(v_definition, v_anchor) = 0 THEN
        RAISE EXCEPTION 'W279: announcementConfiguration projection anchor not found; inspect active discovery function before migration';
    END IF;

    IF strpos(substr(v_definition, strpos(v_definition, v_anchor) + length(v_anchor)), v_anchor) > 0 THEN
        RAISE EXCEPTION 'W279: multiple announcementConfiguration projection anchors found; refusing ambiguous replacement';
    END IF;

    v_definition := replace(v_definition, v_anchor, v_anchor || v_addition);

    -- Recompile the SAME function with the original signature and attributes.
    -- CREATE OR REPLACE FUNCTION retains the existing owner and grants.
    EXECUTE v_definition;

    RAISE NOTICE 'W279: published organizationBranding.themeExperience added to customer discovery projection';
END;
$w279$;
