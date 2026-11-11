-- Memgine AWS PROD PostgreSQL bootstrap.
-- Run as the RDS master/admin while connected to the PostgreSQL maintenance database.
-- Passwords are supplied by bootstrap-prod-memgine.ps1 through process-local
-- environment variables, then read with psql \getenv.

\set ON_ERROR_STOP on

\getenv liquibase_password MEMGINE_LIQUIBASE_PASSWORD
\getenv runtime_password MEMGINE_RUNTIME_PASSWORD

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_user') THEN
        CREATE ROLE memgine_user
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_app') THEN
        CREATE ROLE memgine_app
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;
END
$$;

ALTER ROLE memgine_user PASSWORD :'liquibase_password';
ALTER ROLE memgine_app PASSWORD :'runtime_password';

-- RDS master is not a PostgreSQL superuser. Temporarily allow the bootstrap
-- account to SET ROLE to the Liquibase/schema owner for default privileges.
-- Preserve a pre-existing membership rather than revoking it at the end.
SELECT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname = current_user
      AND granted_role.rolname = 'memgine_user'
) AS bootstrap_had_memgine_user_membership
\gset

\if :bootstrap_had_memgine_user_membership
\else
    DO $$
    DECLARE
        bootstrap_user text := current_user;
    BEGIN
        EXECUTE format('GRANT memgine_user TO %I WITH SET TRUE, INHERIT FALSE', bootstrap_user);
    END
    $$;
\endif

SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0', 'memgine', current_user)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'memgine'
)\gexec

\connect memgine

GRANT CONNECT ON DATABASE memgine TO memgine_user;
GRANT CONNECT ON DATABASE memgine TO memgine_app;

CREATE SCHEMA IF NOT EXISTS memgine AUTHORIZATION memgine_user;
ALTER SCHEMA memgine OWNER TO memgine_user;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA memgine TO memgine_user;
GRANT USAGE ON SCHEMA memgine TO memgine_app;

SET ROLE memgine_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA memgine
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memgine_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA memgine
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO memgine_app;

RESET ROLE;

ALTER ROLE memgine_user SET search_path TO memgine, pg_catalog;
ALTER ROLE memgine_app SET search_path TO memgine, pg_catalog;

\if :bootstrap_had_memgine_user_membership
\else
    DO $$
    DECLARE
        bootstrap_user text := current_user;
    BEGIN
        EXECUTE format('REVOKE memgine_user FROM %I', bootstrap_user);
    END
    $$;
\endif
