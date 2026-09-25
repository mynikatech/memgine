-- ============================================================================
-- Memgine - Remove obsolete function signatures left behind in older databases
--
-- Purpose:
--   * Fresh DEV does not contain these legacy function signatures.
--   * LOCAL retained them from earlier development because CREATE OR REPLACE
--     only replaces a function with the same identity argument signature.
--   * This migration removes only those obsolete overloads.
--
-- Safe to rerun:
--   DROP FUNCTION IF EXISTS is intentionally used so the same migration works
--   in LOCAL, DEV and PROD regardless of whether the legacy overload exists.
-- ============================================================================

DROP FUNCTION IF EXISTS "${schemaName}".create_organization(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
);

DROP FUNCTION IF EXISTS "${schemaName}".upsert_store(
    varchar,
    jsonb,
    varchar
);