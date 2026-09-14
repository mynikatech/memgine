-- ============================================================
-- Memgine Physical Data Model
-- PostgreSQL 17
-- Generated from: Memgine_Physical_Data_Model_catalogue(20260914-184233).xlsx
-- Schema variable: ${schemaName}
-- Rerunnable / idempotent: YES
-- ============================================================

-- Foreign keys. PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS,
-- so each constraint is guarded through pg_constraint.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel001_organization'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization"
            ADD CONSTRAINT "fk_rel001_organization"
            FOREIGN KEY ("organization_type_id")
            REFERENCES "${schemaName}"."organization_types" ("organization_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel003_organization'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization"
            ADD CONSTRAINT "fk_rel003_organization"
            FOREIGN KEY ("organization_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel004_organization_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user"
            ADD CONSTRAINT "fk_rel004_organization_user"
            FOREIGN KEY ("user_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel005_organization_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user"
            ADD CONSTRAINT "fk_rel005_organization_user"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel006_organization_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user"
            ADD CONSTRAINT "fk_rel006_organization_user"
            FOREIGN KEY ("organization_user_type_id")
            REFERENCES "${schemaName}"."organization_user_types" ("organization_user_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel007_organization_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user"
            ADD CONSTRAINT "fk_rel007_organization_user"
            FOREIGN KEY ("organization_user_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel008_organization_user_roles'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user_roles"
            ADD CONSTRAINT "fk_rel008_organization_user_roles"
            FOREIGN KEY ("role_id")
            REFERENCES "${schemaName}"."role" ("role_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel009_organization_user_roles'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user_roles"
            ADD CONSTRAINT "fk_rel009_organization_user_roles"
            FOREIGN KEY ("organization_user_id")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel010_role_privileges'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."role_privileges"
            ADD CONSTRAINT "fk_rel010_role_privileges"
            FOREIGN KEY ("role_id")
            REFERENCES "${schemaName}"."role" ("role_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel011_role_privileges'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."role_privileges"
            ADD CONSTRAINT "fk_rel011_role_privileges"
            FOREIGN KEY ("privilege_id")
            REFERENCES "${schemaName}"."privileges" ("privilege_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel012_membership_products'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "fk_rel012_membership_products"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel013_membership_products'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "fk_rel013_membership_products"
            FOREIGN KEY ("product_category_id")
            REFERENCES "${schemaName}"."product_categories" ("product_category_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel014_membership_products'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "fk_rel014_membership_products"
            FOREIGN KEY ("product_type_id")
            REFERENCES "${schemaName}"."product_types" ("product_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel015_membership_products'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "fk_rel015_membership_products"
            FOREIGN KEY ("product_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel016_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "fk_rel016_benefits"
            FOREIGN KEY ("benefit_category_id")
            REFERENCES "${schemaName}"."benefit_categories" ("benefit_category_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel017_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "fk_rel017_benefits"
            FOREIGN KEY ("benefit_type_id")
            REFERENCES "${schemaName}"."benefit_types" ("benefit_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel018_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "fk_rel018_benefits"
            FOREIGN KEY ("benefit_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel019_subscription_plans'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscription_plans"
            ADD CONSTRAINT "fk_rel019_subscription_plans"
            FOREIGN KEY ("membership_product_id")
            REFERENCES "${schemaName}"."membership_products" ("membership_product_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel020_subscription_plans'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscription_plans"
            ADD CONSTRAINT "fk_rel020_subscription_plans"
            FOREIGN KEY ("currency_id")
            REFERENCES "${schemaName}"."currencies" ("currency_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel021_subscription_plans'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscription_plans"
            ADD CONSTRAINT "fk_rel021_subscription_plans"
            FOREIGN KEY ("subscription_plan_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel022_subscriptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscriptions"
            ADD CONSTRAINT "fk_rel022_subscriptions"
            FOREIGN KEY ("subscription_plan_id")
            REFERENCES "${schemaName}"."subscription_plans" ("subscription_plan_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel023_subscriptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscriptions"
            ADD CONSTRAINT "fk_rel023_subscriptions"
            FOREIGN KEY ("organization_user_id")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel024_subscriptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscriptions"
            ADD CONSTRAINT "fk_rel024_subscriptions"
            FOREIGN KEY ("subscription_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel025_stores'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."stores"
            ADD CONSTRAINT "fk_rel025_stores"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel026_stores'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."stores"
            ADD CONSTRAINT "fk_rel026_stores"
            FOREIGN KEY ("store_type_id")
            REFERENCES "${schemaName}"."store_types" ("store_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel027_stores'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."stores"
            ADD CONSTRAINT "fk_rel027_stores"
            FOREIGN KEY ("store_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel028_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel028_staff"
            FOREIGN KEY ("organization_user_id")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel029_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel029_staff"
            FOREIGN KEY ("store_id")
            REFERENCES "${schemaName}"."stores" ("store_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel030_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel030_staff"
            FOREIGN KEY ("staff_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel031_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel031_redemptions"
            FOREIGN KEY ("subscription_id")
            REFERENCES "${schemaName}"."subscriptions" ("subscription_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel032_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel032_redemptions"
            FOREIGN KEY ("benefit_id")
            REFERENCES "${schemaName}"."benefits" ("benefit_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel033_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel033_redemptions"
            FOREIGN KEY ("store_id")
            REFERENCES "${schemaName}"."stores" ("store_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel034_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel034_redemptions"
            FOREIGN KEY ("staff_id")
            REFERENCES "${schemaName}"."staff" ("staff_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel035_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel035_redemptions"
            FOREIGN KEY ("redemption_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel036_membership_product_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_product_benefits"
            ADD CONSTRAINT "fk_rel036_membership_product_benefits"
            FOREIGN KEY ("membership_product_id")
            REFERENCES "${schemaName}"."membership_products" ("membership_product_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel037_membership_product_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_product_benefits"
            ADD CONSTRAINT "fk_rel037_membership_product_benefits"
            FOREIGN KEY ("benefit_id")
            REFERENCES "${schemaName}"."benefits" ("benefit_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel038_membership_product_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_product_benefits"
            ADD CONSTRAINT "fk_rel038_membership_product_benefits"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel039_payment_confirmations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."payment_confirmations"
            ADD CONSTRAINT "fk_rel039_payment_confirmations"
            FOREIGN KEY ("subscription_id")
            REFERENCES "${schemaName}"."subscriptions" ("subscription_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel040_payment_confirmations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."payment_confirmations"
            ADD CONSTRAINT "fk_rel040_payment_confirmations"
            FOREIGN KEY ("currency_id")
            REFERENCES "${schemaName}"."currencies" ("currency_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel041_payment_confirmations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."payment_confirmations"
            ADD CONSTRAINT "fk_rel041_payment_confirmations"
            FOREIGN KEY ("payment_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel042_integration_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."integration_configurations"
            ADD CONSTRAINT "fk_rel042_integration_configurations"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel043_integration_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."integration_configurations"
            ADD CONSTRAINT "fk_rel043_integration_configurations"
            FOREIGN KEY ("integration_type_id")
            REFERENCES "${schemaName}"."integration_types" ("integration_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel044_integration_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."integration_configurations"
            ADD CONSTRAINT "fk_rel044_integration_configurations"
            FOREIGN KEY ("integration_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel045_organization_details'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_details"
            ADD CONSTRAINT "fk_rel045_organization_details"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel046_organization_branding'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_branding"
            ADD CONSTRAINT "fk_rel046_organization_branding"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel047_organization_branding'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_branding"
            ADD CONSTRAINT "fk_rel047_organization_branding"
            FOREIGN KEY ("branding_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel048_notification_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."notification_configurations"
            ADD CONSTRAINT "fk_rel048_notification_configurations"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel049_notification_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."notification_configurations"
            ADD CONSTRAINT "fk_rel049_notification_configurations"
            FOREIGN KEY ("notification_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel050_platform_user_role'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."platform_user_role"
            ADD CONSTRAINT "fk_rel050_platform_user_role"
            FOREIGN KEY ("user_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel051_platform_user_role'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."platform_user_role"
            ADD CONSTRAINT "fk_rel051_platform_user_role"
            FOREIGN KEY ("role_id")
            REFERENCES "${schemaName}"."role" ("role_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel052_platform_user_role'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."platform_user_role"
            ADD CONSTRAINT "fk_rel052_platform_user_role"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel053_staff_store_assignment'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff_store_assignment"
            ADD CONSTRAINT "fk_rel053_staff_store_assignment"
            FOREIGN KEY ("staff_id")
            REFERENCES "${schemaName}"."staff" ("staff_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel054_staff_store_assignment'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff_store_assignment"
            ADD CONSTRAINT "fk_rel054_staff_store_assignment"
            FOREIGN KEY ("store_id")
            REFERENCES "${schemaName}"."stores" ("store_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel055_staff_store_assignment'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff_store_assignment"
            ADD CONSTRAINT "fk_rel055_staff_store_assignment"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel056_offer'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "fk_rel056_offer"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel057_offer'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "fk_rel057_offer"
            FOREIGN KEY ("membership_product_id")
            REFERENCES "${schemaName}"."membership_products" ("membership_product_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel058_offer'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "fk_rel058_offer"
            FOREIGN KEY ("store_id")
            REFERENCES "${schemaName}"."stores" ("store_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel059_offer'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "fk_rel059_offer"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel060_template'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."template"
            ADD CONSTRAINT "fk_rel060_template"
            FOREIGN KEY ("template_type_id")
            REFERENCES "${schemaName}"."template_type" ("template_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel061_template'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."template"
            ADD CONSTRAINT "fk_rel061_template"
            FOREIGN KEY ("template_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel062_template_type'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."template_type"
            ADD CONSTRAINT "fk_rel062_template_type"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel063_product'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."product"
            ADD CONSTRAINT "fk_rel063_product"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel064_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "fk_rel064_benefits"
            FOREIGN KEY ("product_id")
            REFERENCES "${schemaName}"."product" ("product_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel065_template'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."template"
            ADD CONSTRAINT "fk_rel065_template"
            FOREIGN KEY ("organization_type_id")
            REFERENCES "${schemaName}"."organization_types" ("organization_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel066_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel066_staff"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel067_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel067_staff"
            FOREIGN KEY ("role_id")
            REFERENCES "${schemaName}"."role" ("role_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel068_referral_program'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral_program"
            ADD CONSTRAINT "fk_rel068_referral_program"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel069_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel069_referral"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel070_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel070_referral"
            FOREIGN KEY ("referral_program_id")
            REFERENCES "${schemaName}"."referral_program" ("referral_program_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel071_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel071_referral"
            FOREIGN KEY ("referrer_user_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel072_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel072_referral"
            FOREIGN KEY ("referred_user_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel073_customer_preference'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_preference"
            ADD CONSTRAINT "fk_rel073_customer_preference"
            FOREIGN KEY ("preference_type_id")
            REFERENCES "${schemaName}"."preference_type" ("preference_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel074_customer_preference'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_preference"
            ADD CONSTRAINT "fk_rel074_customer_preference"
            FOREIGN KEY ("user_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel075_benefit_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefit_usage_rule"
            ADD CONSTRAINT "fk_rel075_benefit_usage_rule"
            FOREIGN KEY ("benefit_id")
            REFERENCES "${schemaName}"."benefits" ("benefit_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel076_benefit_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefit_usage_rule"
            ADD CONSTRAINT "fk_rel076_benefit_usage_rule"
            FOREIGN KEY ("benefit_usage_rule_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel077_benefit_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefit_usage_rule"
            ADD CONSTRAINT "fk_rel077_benefit_usage_rule"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel078_benefit_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefit_usage_rule"
            ADD CONSTRAINT "fk_rel078_benefit_usage_rule"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel079_offer_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer_usage_rule"
            ADD CONSTRAINT "fk_rel079_offer_usage_rule"
            FOREIGN KEY ("offer_id")
            REFERENCES "${schemaName}"."offer" ("offer_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel080_offer_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer_usage_rule"
            ADD CONSTRAINT "fk_rel080_offer_usage_rule"
            FOREIGN KEY ("offer_usage_rule_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel081_offer_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer_usage_rule"
            ADD CONSTRAINT "fk_rel081_offer_usage_rule"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel082_offer_usage_rule'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer_usage_rule"
            ADD CONSTRAINT "fk_rel082_offer_usage_rule"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel083_qr_codes'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_codes"
            ADD CONSTRAINT "fk_rel083_qr_codes"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id") ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel084_qr_codes'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_codes"
            ADD CONSTRAINT "fk_rel084_qr_codes"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel085_qr_codes'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_codes"
            ADD CONSTRAINT "fk_rel085_qr_codes"
            FOREIGN KEY ("store_id")
            REFERENCES "${schemaName}"."stores" ("store_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel086_qr_codes'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_codes"
            ADD CONSTRAINT "fk_rel086_qr_codes"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel087_qr_codes'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_codes"
            ADD CONSTRAINT "fk_rel087_qr_codes"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel088_qr_scan_history'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_scan_history"
            ADD CONSTRAINT "fk_rel088_qr_scan_history"
            FOREIGN KEY ("qr_code_id")
            REFERENCES "${schemaName}"."qr_codes" ("qr_code_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel089_qr_scan_history'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_scan_history"
            ADD CONSTRAINT "fk_rel089_qr_scan_history"
            FOREIGN KEY ("user_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel090_qr_scan_history'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_scan_history"
            ADD CONSTRAINT "fk_rel090_qr_scan_history"
            FOREIGN KEY ("store_id")
            REFERENCES "${schemaName}"."stores" ("store_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel091_qr_scan_history'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_scan_history"
            ADD CONSTRAINT "fk_rel091_qr_scan_history"
            FOREIGN KEY ("staff_id")
            REFERENCES "${schemaName}"."staff" ("staff_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel092_qr_scan_history'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_scan_history"
            ADD CONSTRAINT "fk_rel092_qr_scan_history"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel093_qr_membership_acquisition_attributions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_membership_acquisition_attributions"
            ADD CONSTRAINT "fk_rel093_qr_membership_acquisition_attributions"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel094_qr_membership_acquisition_attributions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_membership_acquisition_attributions"
            ADD CONSTRAINT "fk_rel094_qr_membership_acquisition_attributions"
            FOREIGN KEY ("qr_scan_history_id")
            REFERENCES "${schemaName}"."qr_scan_history" ("qr_scan_history_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel095_qr_membership_acquisition_attributions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_membership_acquisition_attributions"
            ADD CONSTRAINT "fk_rel095_qr_membership_acquisition_attributions"
            FOREIGN KEY ("subscription_id")
            REFERENCES "${schemaName}"."subscriptions" ("subscription_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel096_qr_membership_acquisition_attributions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_membership_acquisition_attributions"
            ADD CONSTRAINT "fk_rel096_qr_membership_acquisition_attributions"
            FOREIGN KEY ("membership_product_id")
            REFERENCES "${schemaName}"."membership_products" ("membership_product_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel097_organization'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization"
            ADD CONSTRAINT "fk_rel097_organization"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel098_organization'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization"
            ADD CONSTRAINT "fk_rel098_organization"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel099_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."user"
            ADD CONSTRAINT "fk_rel099_user"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel100_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."user"
            ADD CONSTRAINT "fk_rel100_user"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel101_organization_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user"
            ADD CONSTRAINT "fk_rel101_organization_user"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel102_organization_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user"
            ADD CONSTRAINT "fk_rel102_organization_user"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel103_organization_user_roles'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user_roles"
            ADD CONSTRAINT "fk_rel103_organization_user_roles"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel104_organization_user_roles'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user_roles"
            ADD CONSTRAINT "fk_rel104_organization_user_roles"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel105_membership_products'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "fk_rel105_membership_products"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel106_membership_products'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "fk_rel106_membership_products"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel107_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "fk_rel107_benefits"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel108_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "fk_rel108_benefits"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel109_subscription_plans'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscription_plans"
            ADD CONSTRAINT "fk_rel109_subscription_plans"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel110_subscription_plans'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscription_plans"
            ADD CONSTRAINT "fk_rel110_subscription_plans"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel111_subscriptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscriptions"
            ADD CONSTRAINT "fk_rel111_subscriptions"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel112_subscriptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscriptions"
            ADD CONSTRAINT "fk_rel112_subscriptions"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel113_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel113_redemptions"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel114_redemptions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "fk_rel114_redemptions"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel115_stores'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."stores"
            ADD CONSTRAINT "fk_rel115_stores"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel116_stores'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."stores"
            ADD CONSTRAINT "fk_rel116_stores"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel117_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel117_staff"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel118_staff'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff"
            ADD CONSTRAINT "fk_rel118_staff"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel119_organization_details'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_details"
            ADD CONSTRAINT "fk_rel119_organization_details"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel120_organization_details'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_details"
            ADD CONSTRAINT "fk_rel120_organization_details"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel121_organization_branding'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_branding"
            ADD CONSTRAINT "fk_rel121_organization_branding"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel122_organization_branding'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_branding"
            ADD CONSTRAINT "fk_rel122_organization_branding"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel123_notification_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."notification_configurations"
            ADD CONSTRAINT "fk_rel123_notification_configurations"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel124_notification_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."notification_configurations"
            ADD CONSTRAINT "fk_rel124_notification_configurations"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel125_integration_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."integration_configurations"
            ADD CONSTRAINT "fk_rel125_integration_configurations"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel126_integration_configurations'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."integration_configurations"
            ADD CONSTRAINT "fk_rel126_integration_configurations"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel127_membership_product_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_product_benefits"
            ADD CONSTRAINT "fk_rel127_membership_product_benefits"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel128_membership_product_benefits'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_product_benefits"
            ADD CONSTRAINT "fk_rel128_membership_product_benefits"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."organization_user" ("organization_user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel129_template'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."template"
            ADD CONSTRAINT "fk_rel129_template"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel130_template'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."template"
            ADD CONSTRAINT "fk_rel130_template"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel131_platform_user_role'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."platform_user_role"
            ADD CONSTRAINT "fk_rel131_platform_user_role"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel132_platform_user_role'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."platform_user_role"
            ADD CONSTRAINT "fk_rel132_platform_user_role"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel133_staff_store_assignment'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff_store_assignment"
            ADD CONSTRAINT "fk_rel133_staff_store_assignment"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel134_staff_store_assignment'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff_store_assignment"
            ADD CONSTRAINT "fk_rel134_staff_store_assignment"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel135_offer'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "fk_rel135_offer"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel136_offer'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "fk_rel136_offer"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel137_customer_experience'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience"
            ADD CONSTRAINT "fk_rel137_customer_experience"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel138_customer_experience'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience"
            ADD CONSTRAINT "fk_rel138_customer_experience"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel139_product'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."product"
            ADD CONSTRAINT "fk_rel139_product"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel140_product'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."product"
            ADD CONSTRAINT "fk_rel140_product"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel141_referral_program'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral_program"
            ADD CONSTRAINT "fk_rel141_referral_program"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel142_referral_program'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral_program"
            ADD CONSTRAINT "fk_rel142_referral_program"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel143_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel143_referral"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel144_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel144_referral"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel145_preference_type'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."preference_type"
            ADD CONSTRAINT "fk_rel145_preference_type"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel146_preference_type'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."preference_type"
            ADD CONSTRAINT "fk_rel146_preference_type"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel147_customer_preference'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_preference"
            ADD CONSTRAINT "fk_rel147_customer_preference"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel148_customer_preference'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_preference"
            ADD CONSTRAINT "fk_rel148_customer_preference"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel149_qr_membership_acquisition_attributions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_membership_acquisition_attributions"
            ADD CONSTRAINT "fk_rel149_qr_membership_acquisition_attributions"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel150_customer_experience_release'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience_release"
            ADD CONSTRAINT "fk_rel150_customer_experience_release"
            FOREIGN KEY ("created_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel151_customer_experience_release'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience_release"
            ADD CONSTRAINT "fk_rel151_customer_experience_release"
            FOREIGN KEY ("updated_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel152_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."user"
            ADD CONSTRAINT "fk_rel152_user"
            FOREIGN KEY ("user_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel153_role'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."role"
            ADD CONSTRAINT "fk_rel153_role"
            FOREIGN KEY ("role_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel154_organization_user_roles'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_user_roles"
            ADD CONSTRAINT "fk_rel154_organization_user_roles"
            FOREIGN KEY ("assignment_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel155_privileges'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."privileges"
            ADD CONSTRAINT "fk_rel155_privileges"
            FOREIGN KEY ("privilege_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel156_integration_types'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."integration_types"
            ADD CONSTRAINT "fk_rel156_integration_types"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel157_customer_experience'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience"
            ADD CONSTRAINT "fk_rel157_customer_experience"
            FOREIGN KEY ("experience_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel158_product'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."product"
            ADD CONSTRAINT "fk_rel158_product"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel159_entity_status'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."entity_status"
            ADD CONSTRAINT "fk_rel159_entity_status"
            FOREIGN KEY ("entity_type_id")
            REFERENCES "${schemaName}"."entity_type" ("entity_type_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel160_entity_status'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."entity_status"
            ADD CONSTRAINT "fk_rel160_entity_status"
            FOREIGN KEY ("status_id")
            REFERENCES "${schemaName}"."statuses" ("status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel161_referral_program'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral_program"
            ADD CONSTRAINT "fk_rel161_referral_program"
            FOREIGN KEY ("referral_program_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel162_referral'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."referral"
            ADD CONSTRAINT "fk_rel162_referral"
            FOREIGN KEY ("referral_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel163_preference_type'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."preference_type"
            ADD CONSTRAINT "fk_rel163_preference_type"
            FOREIGN KEY ("preference_type_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel164_customer_preference'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_preference"
            ADD CONSTRAINT "fk_rel164_customer_preference"
            FOREIGN KEY ("preference_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel165_customer_experience_release'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience_release"
            ADD CONSTRAINT "fk_rel165_customer_experience_release"
            FOREIGN KEY ("release_status_id")
            REFERENCES "${schemaName}"."entity_status" ("entity_status_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel166_organization'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization"
            ADD CONSTRAINT "fk_rel166_organization"
            FOREIGN KEY ("published_customer_experience_release_id")
            REFERENCES "${schemaName}"."customer_experience_release" ("customer_experience_release_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel167_user'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."user"
            ADD CONSTRAINT "fk_rel167_user"
            FOREIGN KEY ("preferred_language_id")
            REFERENCES "${schemaName}"."languages" ("language_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel168_organization_branding'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization_branding"
            ADD CONSTRAINT "fk_rel168_organization_branding"
            FOREIGN KEY ("theme_template_id")
            REFERENCES "${schemaName}"."template" ("template_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel169_customer_experience'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience"
            ADD CONSTRAINT "fk_rel169_customer_experience"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel170_customer_experience'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience"
            ADD CONSTRAINT "fk_rel170_customer_experience"
            FOREIGN KEY ("template_id")
            REFERENCES "${schemaName}"."template" ("template_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel171_customer_experience'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience"
            ADD CONSTRAINT "fk_rel171_customer_experience"
            FOREIGN KEY ("published_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel172_qr_membership_acquisition_attributions'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."qr_membership_acquisition_attributions"
            ADD CONSTRAINT "fk_rel172_qr_membership_acquisition_attributions"
            FOREIGN KEY ("customer_id")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel173_customer_experience_release'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience_release"
            ADD CONSTRAINT "fk_rel173_customer_experience_release"
            FOREIGN KEY ("organization_id")
            REFERENCES "${schemaName}"."organization" ("organization_id");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'fk_rel174_customer_experience_release'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."customer_experience_release"
            ADD CONSTRAINT "fk_rel174_customer_experience_release"
            FOREIGN KEY ("published_by")
            REFERENCES "${schemaName}"."user" ("user_id");
    END IF;
END $$;

