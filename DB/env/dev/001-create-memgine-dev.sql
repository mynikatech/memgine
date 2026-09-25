-- Memgine AWS DEV PostgreSQL bootstrap.
-- Run as the RDS master/admin while connected to the PostgreSQL
-- maintenance database.
--
-- Passwords are supplied through temporary environment variables
-- by bootstrap-dev-memgine.ps1.

\set ON_ERROR_STOP on

\getenv liquibase_password MEMGINE_LIQUIBASE_PASSWORD
\getenv runtime_password MEMGINE_RUNTIME_PASSWORD

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'memgine_dev_user'
    ) THEN
        CREATE ROLE memgine_dev_user
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'memgine_app_dev'
    ) THEN
        CREATE ROLE memgine_app_dev
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

ALTER ROLE memgine_dev_user PASSWORD :'liquibase_password';
ALTER ROLE memgine_app_dev PASSWORD :'runtime_password';

-- RDS master is not a true PostgreSQL superuser.
-- Temporarily allow the bootstrap account to SET ROLE to the
-- Liquibase/schema-owner role.
DO $$
DECLARE
    bootstrap_user text := current_user;
BEGIN
    EXECUTE format(
        'GRANT memgine_dev_user TO %I WITH SET TRUE, INHERIT FALSE',
        bootstrap_user
    );
END
$$;

SELECT format(
    'CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0',
    'memgine_dev',
    current_user
)
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_database
    WHERE datname = 'memgine_dev'
)\gexec

\connect memgine_dev

GRANT CONNECT ON DATABASE memgine_dev TO memgine_dev_user;
GRANT CONNECT ON DATABASE memgine_dev TO memgine_app_dev;

CREATE SCHEMA IF NOT EXISTS memginedev
    AUTHORIZATION memgine_dev_user;

ALTER SCHEMA memginedev
    OWNER TO memgine_dev_user;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE, CREATE
    ON SCHEMA memginedev
    TO memgine_dev_user;

GRANT USAGE
    ON SCHEMA memginedev
    TO memgine_app_dev;

-- Default privileges must belong to the role that Liquibase will
-- actually use to create future tables and sequences.
SET ROLE memgine_dev_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA memginedev
    GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLES
    TO memgine_app_dev;

ALTER DEFAULT PRIVILEGES IN SCHEMA memginedev
    GRANT USAGE, SELECT, UPDATE
    ON SEQUENCES
    TO memgine_app_dev;

RESET ROLE;

ALTER ROLE memgine_dev_user
    SET search_path TO memginedev, pg_catalog;

ALTER ROLE memgine_app_dev
    SET search_path TO memginedev, pg_catalog;

-- Remove the temporary RDS-admin -> Liquibase-role relationship.
DO $$
DECLARE
    bootstrap_user text := current_user;
BEGIN
    EXECUTE format(
        'REVOKE memgine_dev_user FROM %I',
        bootstrap_user
    );
END
$$;