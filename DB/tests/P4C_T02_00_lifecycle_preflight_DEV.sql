-- P4-C T02 preflight: READ ONLY. Run on intended DEV database.
-- No changes to payment, exception, subscription or audit records.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;

SELECT current_database() AS database_name, current_user AS database_user,
       inet_server_port() AS server_port;

-- Existing case inventory (do not transition these cases in the test).
SELECT organization_id, source_channel, case_status, fulfillment_outcome,
       count(*) AS cases
FROM memginedev.poynt_collect_financial_exceptions
GROUP BY organization_id, source_channel, case_status, fulfillment_outcome
ORDER BY organization_id, source_channel, case_status;

-- Find an authorized Org Admin for a synthetic lifecycle test.
-- Returns internal actor IDs only; does not disclose names, email or phone.
SELECT ou.organization_id, ou.user_id AS authorized_admin_actor_id,
       ou.organization_user_id AS admin_organization_user_id
FROM memginedev.organization_user ou
WHERE ou.is_deleted = false
  AND memginedev.can_administer_organization(ou.organization_id, ou.user_id)
ORDER BY ou.organization_id, ou.user_id
LIMIT 15;

-- Confirm existing audit function signatures and trigger availability.
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'memginedev'
  AND p.proname IN ('financial_exception_transition', 'financial_exception_record_recovery_failure')
ORDER BY p.proname;

ROLLBACK;
