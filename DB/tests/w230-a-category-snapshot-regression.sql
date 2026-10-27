-- W230-A: transaction-only smoke test of the category merge semantics in Apply.
-- Run on a LOCAL PostgreSQL database after Liquibase. Uses a temporary table and ROLLBACK.
BEGIN;
CREATE TEMP TABLE w230_a_snapshot_test (
  id integer PRIMARY KEY,
  external_categories jsonb,
  category_metadata_available boolean NOT NULL DEFAULT false,
  version_no integer NOT NULL DEFAULT 1
) ON COMMIT DROP;

-- Match Apply: known external categories replace existing categories; unknown metadata does not clear them.
-- Equivalent to the production ON CONFLICT category logic, without touching application tables.
INSERT INTO w230_a_snapshot_test(id, external_categories, category_metadata_available)
VALUES (1,'[{"externalCategoryId":"COFFEE","categoryName":"Coffee"}]'::jsonb,true);

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM w230_a_snapshot_test WHERE id=1 AND jsonb_array_length(external_categories)=1 AND category_metadata_available) THEN
    RAISE EXCEPTION 'initial categories failed'; END IF;
END $$;

-- Unavailable metadata: no change.
INSERT INTO w230_a_snapshot_test(id,external_categories,category_metadata_available)
VALUES (1,NULL,false)
ON CONFLICT(id) DO UPDATE
SET external_categories=CASE WHEN EXCLUDED.category_metadata_available THEN EXCLUDED.external_categories ELSE w230_a_snapshot_test.external_categories END,
    category_metadata_available=w230_a_snapshot_test.category_metadata_available OR EXCLUDED.category_metadata_available,
    version_no=w230_a_snapshot_test.version_no+1
WHERE EXCLUDED.category_metadata_available AND (
  NOT w230_a_snapshot_test.category_metadata_available OR
  NOT (COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb) @> COALESCE(EXCLUDED.external_categories,'[]'::jsonb)
   AND COALESCE(EXCLUDED.external_categories,'[]'::jsonb) @> COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb))
);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM w230_a_snapshot_test WHERE id=1 AND version_no=1 AND jsonb_array_length(external_categories)=1)
THEN RAISE EXCEPTION 'unavailable metadata cleared/updated'; END IF; END $$;

-- Known, identical categories: avoid unnecessary version increment.
INSERT INTO w230_a_snapshot_test(id,external_categories,category_metadata_available)
VALUES (1,'[{"externalCategoryId":"COFFEE","categoryName":"Coffee"}]'::jsonb,true)
ON CONFLICT(id) DO UPDATE SET external_categories=EXCLUDED.external_categories,
  version_no=w230_a_snapshot_test.version_no+1
WHERE NOT (COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb) @> COALESCE(EXCLUDED.external_categories,'[]'::jsonb)
  AND COALESCE(EXCLUDED.external_categories,'[]'::jsonb) @> COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb));
DO $$ BEGIN IF (SELECT version_no FROM w230_a_snapshot_test WHERE id=1)<>1 THEN
RAISE EXCEPTION 'identical categories updated'; END IF; END $$;

-- Known, category-only change: replace old category and increment version.
INSERT INTO w230_a_snapshot_test(id,external_categories,category_metadata_available)
VALUES (1,'[{"externalCategoryId":"DRINKS","categoryName":"Drinks"}]'::jsonb,true)
ON CONFLICT(id) DO UPDATE SET external_categories=EXCLUDED.external_categories,
  version_no=w230_a_snapshot_test.version_no+1
WHERE NOT (COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb) @> COALESCE(EXCLUDED.external_categories,'[]'::jsonb)
  AND COALESCE(EXCLUDED.external_categories,'[]'::jsonb) @> COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM w230_a_snapshot_test WHERE id=1 AND version_no=2 AND external_categories @> '[{"externalCategoryId":"DRINKS"}]'::jsonb)
THEN RAISE EXCEPTION 'category-only change failed'; END IF; END $$;

-- Explicit empty category list: clear known categories.
INSERT INTO w230_a_snapshot_test(id,external_categories,category_metadata_available)
VALUES (1,'[]'::jsonb,true)
ON CONFLICT(id) DO UPDATE SET external_categories=EXCLUDED.external_categories,
  version_no=w230_a_snapshot_test.version_no+1
WHERE NOT (COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb) @> COALESCE(EXCLUDED.external_categories,'[]'::jsonb)
  AND COALESCE(EXCLUDED.external_categories,'[]'::jsonb) @> COALESCE(w230_a_snapshot_test.external_categories,'[]'::jsonb));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM w230_a_snapshot_test WHERE id=1 AND version_no=3 AND external_categories='[]'::jsonb)
THEN RAISE EXCEPTION 'explicit clearing failed'; END IF; END $$;

-- Order independent compare.
DO $$ DECLARE a jsonb := '[{"externalCategoryId":"A"},{"externalCategoryId":"B"}]';
             b jsonb := '[{"externalCategoryId":"B"},{"externalCategoryId":"A"}]';
BEGIN IF NOT (a @> b AND b @> a) THEN RAISE EXCEPTION 'order equivalence failed'; END IF; END $$;

ROLLBACK;
