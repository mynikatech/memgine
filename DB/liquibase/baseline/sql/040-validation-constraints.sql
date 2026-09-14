-- ============================================================
-- Memgine Physical Data Model
-- PostgreSQL 17
-- Generated from: Memgine_Physical_Data_Model_catalogue(20260914-184233).xlsx
-- Schema variable: ${schemaName}
-- Rerunnable / idempotent: YES
-- ============================================================

-- Database-enforceable CHECK constraints derived from Validation Rules.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_organization_name_not_blank'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."organization"
            ADD CONSTRAINT "ck_organization_name_not_blank" CHECK (btrim(organization_name) <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_membership_product_name_not_blank'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "ck_membership_product_name_not_blank" CHECK (btrim(membership_product_name) <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_membership_product_dates'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "ck_membership_product_dates" CHECK (expiry_date IS NULL OR expiry_date >= effective_date);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_subscription_plan_price_nonnegative'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscription_plans"
            ADD CONSTRAINT "ck_subscription_plan_price_nonnegative" CHECK (price >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_subscription_dates'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."subscriptions"
            ADD CONSTRAINT "ck_subscription_dates" CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_redemption_quantity_positive'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."redemptions"
            ADD CONSTRAINT "ck_redemption_quantity_positive" CHECK (quantity > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_payment_amount_positive'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."payment_confirmations"
            ADD CONSTRAINT "ck_payment_amount_positive" CHECK (payment_amount > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_staff_assignment_dates'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."staff_store_assignment"
            ADD CONSTRAINT "ck_staff_assignment_dates" CHECK (end_date IS NULL OR end_date >= effective_date);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_offer_dates'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "ck_offer_dates" CHECK (expiry_date IS NULL OR expiry_date >= effective_date);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_offer_discount_percentage'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "ck_offer_discount_percentage" CHECK (discount_percentage IS NULL OR (discount_percentage > 0 AND discount_percentage <= 100));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_membership_product_tier_sequence_positive'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."membership_products"
            ADD CONSTRAINT "ck_membership_product_tier_sequence_positive" CHECK (tier_sequence IS NULL OR tier_sequence > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_benefit_retail_price_nonnegative'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "ck_benefit_retail_price_nonnegative" CHECK (retail_price IS NULL OR retail_price >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_benefit_cost_nonnegative'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."benefits"
            ADD CONSTRAINT "ck_benefit_cost_nonnegative" CHECK (cost IS NULL OR cost >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_product_name_not_blank'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."product"
            ADD CONSTRAINT "ck_product_name_not_blank" CHECK (btrim(product_name) <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_offer_promotion_image_not_blank'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "ck_offer_promotion_image_not_blank" CHECK (btrim(promotion_image_url) <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_offer_cta_label_not_blank'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "ck_offer_cta_label_not_blank" CHECK (btrim(cta_label) <> '');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'ck_offer_cta_type'
          AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}"."offer"
            ADD CONSTRAINT "ck_offer_cta_type" CHECK (cta_type IN ('REDEEM_OFFER','SHOP'));
    END IF;
END $$;

