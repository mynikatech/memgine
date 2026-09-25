-- ============================================================================
-- Memgine - Standardize remaining internal business code columns to varchar(64)
--
-- Safely rerunnable.
-- Only columns with varchar length < 64 are expanded.
-- Columns already 64 or wider are left unchanged.
-- ============================================================================

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'entity_type'
          AND column_name = 'entity_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.entity_type
            ALTER COLUMN entity_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'offer'
          AND column_name = 'offer_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.offer
            ALTER COLUMN offer_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'organization'
          AND column_name = 'organization_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.organization
            ALTER COLUMN organization_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'otp_challenges'
          AND column_name = 'provider_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.otp_challenges
            ALTER COLUMN provider_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'preference_type'
          AND column_name = 'preference_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.preference_type
            ALTER COLUMN preference_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'privileges'
          AND column_name = 'privilege_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.privileges
            ALTER COLUMN privilege_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'product'
          AND column_name = 'product_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.product
            ALTER COLUMN product_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'memginedev'
          AND table_name = 'referral_program'
          AND column_name = 'referral_program_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE memginedev.referral_program
            ALTER COLUMN referral_program_code TYPE varchar(64);
    END IF;
END
$migration$;