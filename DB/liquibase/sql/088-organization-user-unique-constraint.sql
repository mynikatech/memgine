-- Ensure an Organization User cannot have duplicate memberships of the same
-- organization-user type within the same organization.
--
-- This constraint is also required by upsert_organization_user(), which uses:
--
-- ON CONFLICT (organization_id, user_id, organization_user_type_id)
--
-- The script is intentionally idempotent so it can safely be executed more
-- than once outside Liquibase if required.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = '${schemaName}'
          AND t.relname = 'organization_user'
          AND c.conname = 'ux_organization_user_organization_user_type'
          AND c.contype = 'u'
    ) THEN
        ALTER TABLE "${schemaName}".organization_user
            ADD CONSTRAINT ux_organization_user_organization_user_type
            UNIQUE (
                organization_id,
                user_id,
                organization_user_type_id
            );
    END IF;
END
$$;