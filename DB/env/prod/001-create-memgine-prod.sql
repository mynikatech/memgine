-- Memgine AWS PROD PostgreSQL bootstrap.
-- Run as the RDS master/admin while connected to the PostgreSQL maintenance database.
-- Passwords are supplied by bootstrap-prod-memgine.ps1 through psql variables.

\set ON_ERROR_STOP on

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

ALTER DEFAULT PRIVILEGES FOR ROLE memgine_user IN SCHEMA memgine
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memgine_app;

ALTER DEFAULT PRIVILEGES FOR ROLE memgine_user IN SCHEMA memgine
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO memgine_app;

ALTER ROLE memgine_user SET search_path TO memgine, pg_catalog;
ALTER ROLE memgine_app SET search_path TO memgine, pg_catalog;
