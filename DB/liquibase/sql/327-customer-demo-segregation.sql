CREATE OR REPLACE FUNCTION
    "${schemaName}".customer_get_demo_flag(
        p_user_id varchar
    )
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT COALESCE((
        SELECT u.is_demo
        FROM "${schemaName}"."user" u
        WHERE u.user_id = p_user_id
          AND NOT u.is_deleted
    ), false);
$function$;


CREATE OR REPLACE FUNCTION
    "${schemaName}".customer_business_access_allowed(
        p_organization_id varchar,
        p_user_id varchar
    )
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id
          AND NOT o.is_deleted
          AND COALESCE(o.is_demo, false) =
              "${schemaName}".customer_get_demo_flag(p_user_id)
    );
$function$;


CREATE OR REPLACE FUNCTION
    "${schemaName}".get_customer_visible_organizations(
        p_user_id varchar,
        p_enforce_demo_segregation boolean
    )
RETURNS TABLE (
    "organizationId" varchar,
    "name" varchar,
    "displayName" varchar,
    "logoUrl" varchar,
    tagline varchar,
    "heroImageUrl" text,
    "isDemo" boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        d."organizationId",
        d."name",
        d."displayName",
        d."logoUrl",
        d.tagline,
        d."heroImageUrl",
        COALESCE(o.is_demo, false)
    FROM "${schemaName}".get_customer_discoverable_organizations() d
    JOIN "${schemaName}".organization o
        ON o.organization_id = d."organizationId"
    WHERE NOT o.is_deleted
      AND (
          NOT COALESCE(p_enforce_demo_segregation, true)
          OR COALESCE(o.is_demo, false) =
             "${schemaName}".customer_get_demo_flag(p_user_id)
      );
$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".customer_get_demo_flag(varchar),
    "${schemaName}".customer_business_access_allowed(varchar, varchar),
    "${schemaName}".get_customer_visible_organizations(varchar, boolean)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".customer_get_demo_flag(varchar),
    "${schemaName}".customer_business_access_allowed(varchar, varchar),
    "${schemaName}".get_customer_visible_organizations(varchar, boolean)
TO "${appRole}";