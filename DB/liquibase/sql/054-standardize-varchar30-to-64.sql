-- ============================================================================
-- Memgine - Standardize varchar columns to varchar(64)
--
-- Safely rerunnable.
-- Each ALTER executes only when the column is varchar with length < 64.
-- ============================================================================

DO $migration$
BEGIN

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'benefit_categories'
          AND column_name = 'benefit_category_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.benefit_categories
            ALTER COLUMN benefit_category_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'benefit_types'
          AND column_name = 'benefit_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.benefit_types
            ALTER COLUMN benefit_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'benefit_usage_rule'
          AND column_name = 'frequency_type'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.benefit_usage_rule
            ALTER COLUMN frequency_type TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'benefits'
          AND column_name = 'benefit_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.benefits
            ALTER COLUMN benefit_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'integration_types'
          AND column_name = 'integration_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.integration_types
            ALTER COLUMN integration_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'membership_products'
          AND column_name = 'membership_product_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.membership_products
            ALTER COLUMN membership_product_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'offer'
          AND column_name = 'cta_type'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.offer
            ALTER COLUMN cta_type TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'offer_usage_rule'
          AND column_name = 'frequency_type'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.offer_usage_rule
            ALTER COLUMN frequency_type TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'organization_types'
          AND column_name = 'organization_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.organization_types
            ALTER COLUMN organization_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'organization_user_types'
          AND column_name = 'organization_user_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.organization_user_types
            ALTER COLUMN organization_user_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'preference_type'
          AND column_name = 'data_type'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.preference_type
            ALTER COLUMN data_type TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'product_categories'
          AND column_name = 'product_category_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.product_categories
            ALTER COLUMN product_category_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'product_types'
          AND column_name = 'product_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.product_types
            ALTER COLUMN product_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'redemptions'
          AND column_name = 'redemption_number'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.redemptions
            ALTER COLUMN redemption_number TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'role'
          AND column_name = 'role_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.role
            ALTER COLUMN role_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'statuses'
          AND column_name = 'status_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.statuses
            ALTER COLUMN status_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'store_types'
          AND column_name = 'store_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.store_types
            ALTER COLUMN store_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'subscription_plans'
          AND column_name = 'subscription_plan_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.subscription_plans
            ALTER COLUMN subscription_plan_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'subscriptions'
          AND column_name = 'subscription_number'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.subscriptions
            ALTER COLUMN subscription_number TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'template_type'
          AND column_name = 'template_type_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}.template_type
            ALTER COLUMN template_type_code TYPE varchar(64);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'user'
          AND column_name = 'user_code'
          AND data_type = 'character varying'
          AND character_maximum_length < 64
    ) THEN
        ALTER TABLE ${schemaName}."user"
            ALTER COLUMN user_code TYPE varchar(64);
    END IF;

END
$migration$;