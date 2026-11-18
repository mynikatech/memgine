-- PostgreSQL cannot replace a function's OUT-column types in place. Refuse
-- replacement if it would silently change the existing owner or grants.
-- DROP uses RESTRICT (the default), so unanticipated dependencies abort the
-- transactional changeset instead of being removed.
DO $guard$
DECLARE
    v_function oid := to_regprocedure('"${schemaName}".get_customer_discoverable_organizations()');
    v_owner oid;
    v_app_role oid := to_regrole('${appRole}');
BEGIN
    IF v_app_role IS NULL THEN
        RAISE EXCEPTION 'Discovery app role does not exist';
    END IF;
    IF v_function IS NOT NULL THEN
        SELECT p.proowner INTO v_owner FROM pg_proc p WHERE p.oid = v_function;
        IF v_owner <> (SELECT oid FROM pg_roles WHERE rolname = current_user) THEN
            RAISE EXCEPTION 'Discovery function owner differs from migration role; preserve ownership before replacement';
        END IF;
        IF EXISTS (
            SELECT 1 FROM pg_proc p,
                 LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
             WHERE p.oid = v_function
               AND (a.grantee NOT IN (v_owner, v_app_role)
                    OR (a.grantee = v_app_role AND a.grantee <> v_owner AND (a.is_grantable OR a.grantor <> v_owner)))
        ) OR (v_app_role <> v_owner AND NOT EXISTS (
            SELECT 1 FROM pg_proc p,
                 LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
             WHERE p.oid = v_function AND a.grantee = v_app_role
               AND a.privilege_type = 'EXECUTE' AND NOT a.is_grantable
        )) THEN
            RAISE EXCEPTION 'Discovery function grants differ from the expected owner and app role; preserve them before replacement';
        END IF;
    END IF;
END;
$guard$;

DROP FUNCTION IF EXISTS "${schemaName}".get_customer_discoverable_organizations();
CREATE FUNCTION "${schemaName}".get_customer_discoverable_organizations()
RETURNS TABLE (
    "organizationId" varchar, "name" varchar, "displayName" varchar,
    "logoUrl" varchar, tagline varchar, "heroImageUrl" text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
    SELECT d."organizationId",
           (d."detailJson"::jsonb #>> '{organization,name}')::varchar,
           (d."detailJson"::jsonb #>> '{organization,displayName}')::varchar,
           (d."detailJson"::jsonb #>> '{publishedExperience,organizationBranding,logoUrl}')::varchar,
           COALESCE(d."detailJson"::jsonb #>> '{publishedExperience,organizationBranding,tagline}',
                    d."detailJson"::jsonb #>> '{publishedExperience,definition,businessIdentity,tagline}')::varchar,
           d."detailJson"::jsonb #>> '{publishedExperience,organizationBranding,heroImageUrl}'
      FROM "${schemaName}".organization o
      CROSS JOIN LATERAL "${schemaName}".get_customer_discoverable_organization(o.organization_id) d
     ORDER BY COALESCE(NULLIF(d."detailJson"::jsonb #>> '{organization,displayName}', ''),
                       d."detailJson"::jsonb #>> '{organization,name}'), d."organizationId";
$function$;

-- Candidate availability, not payment authorization. The published and live
-- catalogs are read once per organization within this single bulk query.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_discovery_eligibility(p_user_id varchar)
RETURNS TABLE (
    "organizationId" varchar, "hasActiveMemberships" boolean, "hasEligibleMemberships" boolean
)
LANGUAGE sql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    WITH organizations AS MATERIALIZED (
        SELECT o."organizationId" FROM "${schemaName}".get_customer_discoverable_organizations() o
    ), catalogs AS MATERIALIZED (
        SELECT d."organizationId", d."detailJson"::jsonb AS detail
          FROM organizations o
          CROSS JOIN LATERAL "${schemaName}".get_customer_discoverable_organization(o."organizationId") d
    ), subscriptions AS MATERIALIZED (
        SELECT o."organizationId", s."membershipProductId", s."statusCode", s."endDate"
          FROM organizations o
          CROSS JOIN LATERAL "${schemaName}".get_customer_subscriptions(o."organizationId", p_user_id) s
    ), joinable_products AS MATERIALIZED (
        SELECT o."organizationId", p.id
          FROM organizations o
          CROSS JOIN LATERAL "${schemaName}".get_customer_join_membership_ids(o."organizationId") p
    ), joinable_plans AS MATERIALIZED (
        SELECT o."organizationId", p.id
          FROM organizations o
          CROSS JOIN LATERAL "${schemaName}".get_customer_join_plan_ids(o."organizationId") p
    )
    SELECT c."organizationId",
           EXISTS (SELECT 1 FROM subscriptions s
                    WHERE s."organizationId" = c."organizationId"
                      AND s."statusCode" = 'ACTIVE' AND s."endDate"::date >= CURRENT_DATE),
           "${schemaName}".customer_can_start_membership_purchase(c."organizationId", p_user_id)
           AND EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(c.detail -> 'membershipProducts') product
                 JOIN joinable_products live_product
                   ON live_product."organizationId" = c."organizationId" AND live_product.id = product ->> 'id'
                WHERE EXISTS (
                    SELECT 1 FROM jsonb_array_elements(product -> 'plans') plan
                    JOIN joinable_plans live_plan
                      ON live_plan."organizationId" = c."organizationId" AND live_plan.id = plan ->> 'id'
                    JOIN "${schemaName}".subscription_plans current_plan
                      ON current_plan.subscription_plan_id = live_plan.id
                     AND current_plan.membership_product_id = live_product.id
                     AND NOT current_plan.is_deleted
                )
                AND NOT EXISTS (
                    SELECT 1 FROM subscriptions s
                     WHERE s."organizationId" = c."organizationId"
                       AND s."membershipProductId" = product ->> 'id'
                       AND s."statusCode" = 'ACTIVE' AND s."endDate"::date >= CURRENT_DATE
                )
           )
      FROM catalogs c
     ORDER BY c."organizationId";
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_discoverable_organizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_discovery_eligibility(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_discoverable_organizations() TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_discovery_eligibility(varchar) TO "${appRole}";
