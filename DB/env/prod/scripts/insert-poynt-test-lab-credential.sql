-- Memgine PROD: Register Poynt Production Test Lab
-- Configuration only; no payment or transaction changes.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'memgine' THEN
        RAISE EXCEPTION 'Expected PROD database memgine, connected to %',
            current_database();
    END IF;
END;
$$;

INSERT INTO memgine.poynt_credential_profiles (
    credential_profile_id,
    display_name,
    secret_reference,
    is_active,
    is_deleted
)
VALUES (
    'POYNT-CRED-PROD-002',
    'Poynt Production Test Lab',
    'memgine/prod/poynt-test-lab/cloud-app',
    TRUE,
    FALSE
)
ON CONFLICT (credential_profile_id) DO NOTHING;

COMMIT;

-- Verify both credential profiles.
SELECT
    credential_profile_id,
    display_name,
    secret_reference,
    is_active,
    is_deleted
FROM memgine.poynt_credential_profiles
WHERE credential_profile_id IN (
    'POYNT-CRED-PROD-001',
    'POYNT-CRED-PROD-002'
)
ORDER BY credential_profile_id;