-- Memgine AWS PROD PostgreSQL bootstrap.
-- Run as the RDS master/admin while connected to the PostgreSQL maintenance database.
-- Passwords are supplied by bootstrap-prod-memgine.ps1 through psql variables.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_prod_user') THEN
        CREATE ROLE memgine_prod_user
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_app_prod') THEN
        CREATE ROLE memgine_app_prod
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

ALTER ROLE memgine_prod_user PASSWORD :'liquibase_password';
ALTER ROLE memgine_app_prod PASSWORD :'runtime_password';

SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0', 'memgine_prod', current_user)
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'memgine_prod'
)\gexec

\connect memgine_prod

GRANT CONNECT ON DATABASE memgine_prod TO memgine_prod_user;
GRANT CONNECT ON DATABASE memgine_prod TO memgine_app_prod;

CREATE SCHEMA IF NOT EXISTS memgineprod AUTHORIZATION memgine_prod_user;
ALTER SCHEMA memgineprod OWNER TO memgine_prod_user;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA memgineprod TO memgine_prod_user;
GRANT USAGE ON SCHEMA memgineprod TO memgine_app_prod;

ALTER DEFAULT PRIVILEGES FOR ROLE memgine_prod_user IN SCHEMA memgineprod
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memgine_app_prod;

ALTER DEFAULT PRIVILEGES FOR ROLE memgine_prod_user IN SCHEMA memgineprod
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO memgine_app_prod;

ALTER ROLE memgine_prod_user SET search_path TO memgineprod, pg_catalog;
ALTER ROLE memgine_app_prod SET search_path TO memgineprod, pg_catalog;
