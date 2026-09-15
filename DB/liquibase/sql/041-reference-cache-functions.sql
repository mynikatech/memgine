-- Memgine Reference Data / Entity Status cache functions
-- Rerunnable / idempotent DDL: YES

CREATE OR REPLACE FUNCTION "${schemaName}".get_reference_data()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
    SELECT jsonb_build_object(

        'languages',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', l.language_id,
                    'code', l.language_code,
                    'name', l.language_name,
                    'displayOrder', l.display_order,
                    'active', l.is_active
                )
                ORDER BY l.display_order, l.language_name
            )
            FROM "${schemaName}".languages l
            WHERE l.is_active = TRUE
        ), '[]'::jsonb),

        'organizationTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.organization_type_id,
                    'code', x.organization_type_code,
                    'name', x.organization_type_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.organization_type_name
            )
            FROM "${schemaName}".organization_types x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'organizationUserTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.organization_user_type_id,
                    'code', x.organization_user_type_code,
                    'name', x.organization_user_type_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.organization_user_type_name
            )
            FROM "${schemaName}".organization_user_types x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'storeTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.store_type_id,
                    'code', x.store_type_code,
                    'name', x.store_type_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.store_type_name
            )
            FROM "${schemaName}".store_types x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'productCategories',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.product_category_id,
                    'code', x.product_category_code,
                    'name', x.product_category_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.product_category_name
            )
            FROM "${schemaName}".product_categories x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'productTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.product_type_id,
                    'code', x.product_type_code,
                    'name', x.product_type_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.product_type_name
            )
            FROM "${schemaName}".product_types x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'benefitCategories',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.benefit_category_id,
                    'code', x.benefit_category_code,
                    'name', x.benefit_category_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.benefit_category_name
            )
            FROM "${schemaName}".benefit_categories x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'benefitTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.benefit_type_id,
                    'code', x.benefit_type_code,
                    'name', x.benefit_type_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.benefit_type_name
            )
            FROM "${schemaName}".benefit_types x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'currencies',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.currency_id,
                    'code', x.currency_code,
                    'name', x.currency_name,
                    'displayOrder', x.display_order,
                    'active', x.is_active
                )
                ORDER BY x.display_order, x.currency_name
            )
            FROM "${schemaName}".currencies x
            WHERE x.is_active = TRUE
        ), '[]'::jsonb),

        'integrationTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', x.integration_type_id,
                    'code', x.integration_type_code,
                    'name', x.integration_type_name,
                    'displayOrder', x.display_sequence,
                    'active', NOT x.is_deleted
                )
                ORDER BY x.display_sequence, x.integration_type_name
            )
            FROM "${schemaName}".integration_types x
            WHERE x.is_deleted = FALSE
        ), '[]'::jsonb)
    );
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_entity_status_data()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
    SELECT jsonb_build_object(

        'statuses',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', s.status_id,
                    'statusCode', s.status_code,
                    'statusName', s.status_name,
                    'description', s.description,
                    'displayOrder', s.display_order,
                    'isActive', s.is_active
                )
                ORDER BY s.display_order, s.status_name
            )
            FROM "${schemaName}".statuses s
        ), '[]'::jsonb),

        'entityTypes',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', e.entity_type_id,
                    'entityTypeCode', e.entity_type_code,
                    'entityTypeName', e.entity_type_name,
                    'description', e.description,
                    'displayOrder', e.display_order,
                    'isActive', e.is_active
                )
                ORDER BY e.display_order, e.entity_type_name
            )
            FROM "${schemaName}".entity_type e
        ), '[]'::jsonb),

        'entityStatuses',
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', es.entity_status_id,
                    'entityTypeId', es.entity_type_id,
                    'statusId', es.status_id,
                    'displayOrder', es.display_order,
                    'isActive', es.is_active,
                    'systemManaged', es.system_managed
                )
                ORDER BY es.entity_type_id, es.display_order
            )
            FROM "${schemaName}".entity_status es
        ), '[]'::jsonb)
    );
$function$;


REVOKE ALL ON FUNCTION "${schemaName}".get_reference_data()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_reference_data()
TO "${appRole}";


REVOKE ALL ON FUNCTION "${schemaName}".get_entity_status_data()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_entity_status_data()
TO "${appRole}";