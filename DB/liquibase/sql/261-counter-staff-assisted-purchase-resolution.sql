-- Migration 261: harden the existing Staff-Assisted purchase resolver.
-- Migration 259 already created this function and the purchase_mode column.
-- This is an in-place function replacement only: no new table or payment change.
-- IMPORTANT: the Kotlin CounterService and CounterSql must call this resolver.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_resolve_staff_assisted_purchase(
    p_organization_id varchar,
    p_counter_purchase_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "storeId" varchar,
    "staffId" varchar,
    "customerUserId" varchar,
    "planId" varchar,
    "purchaseMode" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT cp.store_id::varchar,
           cp.staff_id::varchar,
           cp.customer_user_id::varchar,
           cp.subscription_plan_id::varchar,
           cp.purchase_mode::varchar
    FROM counter_purchases AS cp
    WHERE NULLIF(btrim(p_organization_id), '') IS NOT NULL
      AND NULLIF(btrim(p_counter_purchase_id), '') IS NOT NULL
      AND NULLIF(btrim(p_actor_user_id), '') IS NOT NULL
      AND cp.organization_id = p_organization_id
      AND cp.counter_purchase_id = p_counter_purchase_id
      AND cp.status = 'OPEN'
      AND cp.purchase_mode = 'STAFF_ASSISTED'
      AND cp.customer_user_id IS NOT NULL
      AND cp.subscription_plan_id IS NOT NULL
      AND counter_can_operate(
          cp.organization_id, cp.store_id, cp.staff_id, p_actor_user_id
      );
$function$;
