-- P5-B3.1 concurrency session B. Start while session A holds the advisory lock.
-- Run after Migration 172 against a non-production database:
-- psql -v exception_id=<same-eligible-unlinked-exception-id> -f this-file
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SELECT CASE
  WHEN support_create_case_for_verified_exception(:'exception_id') = '__MEMGINE_SUPPORT_LINK_BUSY__' THEN 1
  ELSE 1/0
END AS busy_result_verified;
ROLLBACK;
