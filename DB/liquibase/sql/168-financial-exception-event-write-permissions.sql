-- P4-C privilege hardening: prevent direct writes to financial audit events.
-- Applied by Liquibase after migration 167. Does not change other tables.
-- Execute only through the usual environment-configured Liquibase workflow.

DO $guard$
BEGIN
    IF to_regclass(format('%I.%I', '${schemaName}', 'financial_exception_events')) IS NULL THEN
        RAISE EXCEPTION 'P4C 168: financial_exception_events is missing; apply migration 167 first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        RAISE EXCEPTION 'P4C 168: configured application role does not exist';
    END IF;
END
$guard$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE "${schemaName}".financial_exception_events FROM "${appRole}";

-- Also prevent access through generic PUBLIC grants. Retain SELECT permissions
-- only if specifically granted to application role by existing policy.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE "${schemaName}".financial_exception_events FROM PUBLIC;

DO $verify$
BEGIN
    IF has_table_privilege('${appRole}', format('%I.%I', '${schemaName}', 'financial_exception_events'), 'INSERT')
       OR has_table_privilege('${appRole}', format('%I.%I', '${schemaName}', 'financial_exception_events'), 'UPDATE')
       OR has_table_privilege('${appRole}', format('%I.%I', '${schemaName}', 'financial_exception_events'), 'DELETE')
       OR has_table_privilege('${appRole}', format('%I.%I', '${schemaName}', 'financial_exception_events'), 'TRUNCATE')
    THEN
        RAISE EXCEPTION 'P4C 168: application role retains effective audit-table write access; inspect inherited grants or ownership';
    END IF;
    IF NOT has_function_privilege('${appRole}', format('%I.%I(varchar,varchar,varchar,varchar,varchar)', '${schemaName}', 'financial_exception_record_recovery_failure'), 'EXECUTE')
       OR NOT has_function_privilege('${appRole}', format('%I.%I(varchar,varchar,varchar,varchar,varchar)', '${schemaName}', 'financial_exception_transition'), 'EXECUTE')
    THEN
        RAISE EXCEPTION 'P4C 168: required audit functions are not executable by the application role';
    END IF;
    RAISE NOTICE 'P4C 168 PASS: no direct app-role audit writes; required function execution preserved';
END
$verify$;
