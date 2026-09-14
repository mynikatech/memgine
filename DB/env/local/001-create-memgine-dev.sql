-- Memgine local PostgreSQL 17 bootstrap.
-- Run as postgres while connected to the PostgreSQL maintenance database.
-- This creates only Memgine local DEV objects; it does not touch ApnaFund.
--
-- Ownership/security model:
--   database  -> postgres
--   schema    -> memgine_dev_user
--   Liquibase -> memgine_dev_user (LOGIN)
--   Ktor      -> memgine_app_dev (LOGIN; DML only)
--
-- Passwords are supplied by bootstrap-local-memgine.ps1
-- through psql variables. They are not stored in this file.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_app_dev') THEN
        CREATE ROLE memgine_app_dev
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOREPLICATION
            NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memgine_dev_user') THEN
        CREATE ROLE memgine_dev_user
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

ALTER ROLE memgine_dev_user PASSWORD :'deploy_password';
ALTER ROLE memgine_app_dev PASSWORD :'app_password';

SELECT 'CREATE DATABASE memgine_dev OWNER postgres ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'memgine_dev'
)\gexec

\connect memgine_dev

GRANT CONNECT ON DATABASE memgine_dev TO memgine_dev_user;
GRANT CONNECT ON DATABASE memgine_dev TO memgine_app_dev;

CREATE SCHEMA IF NOT EXISTS memginedev AUTHORIZATION memgine_dev_user;
ALTER SCHEMA memginedev OWNER TO memgine_dev_user;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA memginedev TO memgine_dev_user;
GRANT USAGE ON SCHEMA memginedev TO memgine_app_dev;

ALTER DEFAULT PRIVILEGES FOR ROLE memgine_dev_user IN SCHEMA memginedev
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memgine_app_dev;

ALTER DEFAULT PRIVILEGES FOR ROLE memgine_dev_user IN SCHEMA memginedev
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO memgine_app_dev;

ALTER ROLE memgine_dev_user SET search_path TO memginedev, pg_catalog;
ALTER ROLE memgine_app_dev SET search_path TO memginedev, pg_catalog;

\echo ''
\echo 'Memgine local DEV environment bootstrap complete.'
\echo 'Database owner : postgres'
\echo 'Database       : memgine_dev'
\echo 'Schema owner   : memgine_dev_user'
\echo 'Liquibase      : memgine_dev_user'
\echo 'Runtime        : memgine_app_dev'
\echo ''