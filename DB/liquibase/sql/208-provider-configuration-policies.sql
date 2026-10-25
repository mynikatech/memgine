--liquibase formatted sql

--changeset mynikatech:208-provider-configuration-policies splitStatements:false

-- Provider policy metadata belongs to the existing integration-types reference catalogue.
ALTER TABLE "${schemaName}".integration_types
    ADD COLUMN IF NOT EXISTS provider_configuration_policies jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "${schemaName}".integration_types
SET provider_configuration_policies = jsonb_set(
    provider_configuration_policies,
    '{POYNT}',
    COALESCE(provider_configuration_policies -> 'POYNT', '{}'::jsonb)
        || jsonb_build_object(
            'STORE_DISCOVERY_SUPPORTED', true,
            'TERMINAL_DISCOVERY_SUPPORTED', true,
            'MANUAL_STORE_ENTRY_ALLOWED', true,
            'MANUAL_TERMINAL_ENTRY_ALLOWED', true,
            'PROVIDER_VERIFICATION_REQUIRED', true
        ),
    true
)
WHERE integration_type_code = 'POS';

CREATE OR REPLACE FUNCTION "${schemaName}".get_reference_data() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = "${schemaName}",
    pg_temp AS $function$
 SELECT jsonb_build_object(
 'languages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', language_id, 'code', language_code, 'name',
     language_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     language_name) FROM languages WHERE is_active), '[]'::jsonb),
 'organizationTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', organization_type_id, 'code',
     organization_type_code, 'name', organization_type_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, organization_type_name) FROM organization_types WHERE is_active), '[]'::jsonb),
 'organizationUserTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', organization_user_type_id, 'code',
     organization_user_type_code, 'name', organization_user_type_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, organization_user_type_name) FROM organization_user_types WHERE is_active),
     '[]'::jsonb),
 'storeTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', store_type_id, 'code', store_type_code, 'name',
     store_type_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     store_type_name) FROM store_types WHERE is_active), '[]'::jsonb),
 'productCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', product_category_id, 'code',
     product_category_code, 'name', product_category_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, product_category_name) FROM product_categories WHERE is_active), '[]'::jsonb),
 'productTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', product_type_id, 'code', product_type_code, 'name',
     product_type_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     product_type_name) FROM product_types WHERE is_active), '[]'::jsonb),
 'benefitCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', benefit_category_id, 'code',
     benefit_category_code, 'name', benefit_category_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, benefit_category_name) FROM benefit_categories WHERE is_active), '[]'::jsonb),
 'benefitTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', benefit_type_id, 'code', benefit_type_code, 'name',
     benefit_type_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     benefit_type_name) FROM benefit_types WHERE is_active), '[]'::jsonb),
 'currencies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', currency_id, 'code', currency_code, 'name',
     currency_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     currency_name) FROM currencies WHERE is_active), '[]'::jsonb),
 'integrationTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', integration_type_id, 'code',
     integration_type_code, 'name', integration_type_name, 'displayOrder', display_sequence, 'active', NOT is_deleted, 'providerConfigurationPolicies', provider_configuration_policies) ORDER BY display_sequence, integration_type_name) FROM integration_types WHERE NOT is_deleted),
     '[]'::jsonb),
 'supportCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', support_category_id, 'code',
     support_category_code, 'name', support_category_name, 'description', description, 'displayOrder', display_order,
     'active', is_active) ORDER BY display_order, support_category_name) FROM support_categories WHERE is_active),
     '[]'::jsonb),
 'supportIssueTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.support_issue_type_id, 'categoryId',
     c.support_category_id, 'categoryCode', c.support_category_code, 'code', i.support_issue_type_code, 'name',
     i.support_issue_type_name, 'description', i.description, 'displayOrder', i.display_order, 'active',
     i.is_active) ORDER BY c.display_order, i.display_order,
     i.support_issue_type_name) FROM support_issue_types i JOIN support_categories c ON c.support_category_id=i.support_category_id WHERE i.is_active AND c.is_active),
     '[]'::jsonb),
 'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', country_id, 'code', country_code, 'name',
     country_name, 'countryCode', country_code, 'callingCode', calling_code, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order) FROM countries WHERE is_active AND NOT is_deleted), '[]'::jsonb),
 'regions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.region_id, 'countryCode', c.country_code, 'code',
     r.region_code, 'name', r.region_name) ORDER BY r.display_order,
     r.region_name) FROM regions r JOIN countries c ON c.country_id=r.country_id WHERE r.is_active AND NOT r.is_deleted AND c.is_active AND NOT c.is_deleted),
     '[]'::jsonb),
 'cities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ci.city_id, 'countryCode', c.country_code, 'regionCode',
     r.region_code, 'name', ci.city_name) ORDER BY ci.display_order,
     ci.city_name) FROM cities ci JOIN regions r ON r.region_id=ci.region_id JOIN countries c ON c.country_id=r.country_id WHERE ci.is_active AND NOT ci.is_deleted AND r.is_active AND NOT r.is_deleted AND c.is_active AND NOT c.is_deleted),
     '[]'::jsonb)
 );
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_reference_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_reference_data() TO "${appRole}";
