-- W230-C: read-only post-deployment inspection; substitute actual org ID as needed.
-- Run after a NEW POS Product is Applied using migration 231 (not on legacy 120 Products).
SELECT
  p.product_id,
  p.product_code,
  p.product_name AS canonical_fallback_name,
  p.description AS canonical_description,
  p.sku AS canonical_sku,
  p.base_price_minor AS canonical_price,
  p.currency_code AS canonical_currency,
  p.product_catalog_category_id AS canonical_category,
  m.commerce_product_mapping_id,
  m.external_catalog_id,
  s.product_name AS pos_name,
  s.external_sku AS pos_sku,
  s.unit_price_minor_snapshot AS pos_price,
  s.currency_code AS pos_currency,
  s.external_categories AS pos_categories
FROM memginedev.product p
JOIN memginedev.commerce_product_mappings m
  ON m.product_id = p.product_id AND m.organization_id = p.organization_id
JOIN memginedev.commerce_product_snapshots s
  ON s.commerce_product_mapping_id = m.commerce_product_mapping_id
WHERE p.organization_id = 'ORG_6acae26d-6b69-4985-b1f1-d8addd792bd5'
  AND NOT p.is_deleted AND NOT m.is_deleted AND NOT s.is_deleted
ORDER BY p.created_at DESC
LIMIT 15;
