-- Apply ONLY after backend/frontend compile, LOCAL tests, and review.
UPDATE "${schemaName}".refund_resolution_options
SET is_active=TRUE
WHERE option_type='ACTION' AND option_code='REFUND_AND_CANCEL' AND scope='BOTH';
