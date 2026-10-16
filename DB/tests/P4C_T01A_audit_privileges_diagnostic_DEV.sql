-- P4-C T01A -- permissions diagnostic only. DEV 15432. No mutations.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;

SELECT current_database() AS database_name, current_user AS connected_as,
       current_setting('port') AS server_port;

SELECT r.rolname AS role_name, r.rolsuper AS is_superuser,
       r.rolinherit AS inherits_roles, r.rolcreaterole AS can_create_roles
FROM pg_roles r WHERE r.rolname IN ('memgine_app_dev','memgine_dev_user');

SELECT n.nspname AS schema_name, c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS table_owner,
       c.relacl AS raw_table_acl,
       has_table_privilege('memgine_app_dev', c.oid, 'INSERT') AS can_insert,
       has_table_privilege('memgine_app_dev', c.oid, 'UPDATE') AS can_update,
       has_table_privilege('memgine_app_dev', c.oid, 'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='memginedev' AND c.relname='financial_exception_events';

SELECT grantor::regrole::text AS grantor, grantee::regrole::text AS grantee,
       privilege_type, is_grantable
FROM aclexplode((SELECT relacl FROM pg_class
  WHERE oid='memginedev.financial_exception_events'::regclass))
WHERE privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY grantee, privilege_type;

SELECT r.rolname AS reachable_role,
       pg_has_role('memgine_app_dev',r.oid,'MEMBER') AS app_is_member,
       pg_has_role('memgine_app_dev',r.oid,'USAGE') AS app_inherits_privileges
FROM pg_roles r
WHERE r.oid=(SELECT relowner FROM pg_class WHERE oid='memginedev.financial_exception_events'::regclass)
   OR (r.oid IN (SELECT grantee FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='memginedev.financial_exception_events'::regclass)) WHERE privilege_type IN ('INSERT','UPDATE','DELETE')))
ORDER BY r.rolname;
ROLLBACK;
