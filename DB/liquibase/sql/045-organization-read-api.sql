CREATE OR REPLACE FUNCTION "${schemaName}".get_organization(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(o)
    FROM "${schemaName}".organization o
    WHERE o.organization_id = p_organization_id
      AND o.is_deleted = FALSE;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_organizations()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT COALESCE(
        jsonb_agg(to_jsonb(o) ORDER BY o.organization_name, o.organization_code),
        '[]'::jsonb
    )
    FROM "${schemaName}".organization o
    WHERE o.is_deleted = FALSE;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_details(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(d)
    FROM "${schemaName}".organization_details d
    WHERE d.organization_id = p_organization_id
      AND d.is_deleted = FALSE;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_branding(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(b)
    FROM "${schemaName}".organization_branding b
    WHERE b.organization_id = p_organization_id
      AND b.is_deleted = FALSE;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_aggregate(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'organization', to_jsonb(o),
        'details', (
            SELECT to_jsonb(d)
            FROM "${schemaName}".organization_details d
            WHERE d.organization_id = o.organization_id
              AND d.is_deleted = FALSE
        ),
        'branding', (
            SELECT to_jsonb(b)
            FROM "${schemaName}".organization_branding b
            WHERE b.organization_id = o.organization_id
              AND b.is_deleted = FALSE
        )
    )
    FROM "${schemaName}".organization o
    WHERE o.organization_id = p_organization_id
      AND o.is_deleted = FALSE;
$function$;