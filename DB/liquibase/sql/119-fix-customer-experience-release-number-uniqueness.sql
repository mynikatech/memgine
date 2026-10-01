ALTER TABLE "${schemaName}".customer_experience_release
DROP CONSTRAINT IF EXISTS customer_experience_release_release_number_key;

ALTER TABLE "${schemaName}".customer_experience_release
DROP CONSTRAINT IF EXISTS customer_experience_release_organization_release_number_key;

ALTER TABLE "${schemaName}".customer_experience_release
ADD CONSTRAINT customer_experience_release_organization_release_number_key
UNIQUE (organization_id, release_number);