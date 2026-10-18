-- P5-B3.1 concurrency session A. Run after Migration 172 against a non-production
-- database: psql -v exception_id=<eligible-unlinked-exception-id> -f this-file
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SELECT pg_advisory_xact_lock(hashtext(:'exception_id'));
SELECT pg_sleep(15);
ROLLBACK;