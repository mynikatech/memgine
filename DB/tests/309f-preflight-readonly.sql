-- Run after 309F migration, read-only. In pgAdmin select the correct schema.
SELECT 'PICKUP_CODE status' AS check_name,EXISTS(
 SELECT 1 FROM memginedev.statuses WHERE status_code='PICKUP_CODE') AS present
UNION ALL
SELECT 'customer issue function',to_regprocedure('memginedev.issue_customer_fulfillment_pickup_code(character varying,character varying,character varying,character varying,character varying)') IS NOT NULL
UNION ALL
SELECT 'counter authorization function',to_regprocedure('memginedev.counter_authorize_pickup_code(character varying,character varying,character varying,character varying,character varying,character varying,character varying)') IS NOT NULL
UNION ALL
SELECT 'active code uniqueness index',to_regclass('memginedev.uq_fulfillment_pickup_code_active_scope') IS NOT NULL;

-- No mutation: code verification itself is a one-time authorization, so DO NOT
-- call the counter_authorize_pickup_code function for a dry run.
-- The existing get_counter_order_lifecycle function remains the authoritative
-- backend read for whether Complete Collection is currently allowed.
