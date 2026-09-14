-- ============================================================
-- Memgine Physical Data Model
-- PostgreSQL 17
-- Generated from: Memgine_Physical_Data_Model_catalogue(20260914-184233).xlsx
-- Schema variable: ${schemaName}
-- Rerunnable / idempotent: YES
-- ============================================================

-- Tables, columns, primary keys, single-column uniqueness and safe database defaults.

-- ORG: Organization
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization" (
    "organization_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_code" varchar(20) NOT NULL UNIQUE,
    "organization_name" varchar(200) NOT NULL,
    "published_customer_experience_release_id" varchar(40),
    "organization_display_name" varchar(100),
    "legal_name" varchar(250),
    "organization_type_id" varchar(40) NOT NULL,
    "organization_status_id" varchar(40) NOT NULL,
    "primary_email" varchar(254) NOT NULL UNIQUE,
    "primary_phone" varchar(20) NOT NULL,
    "website_url" varchar(300),
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean NOT NULL,
    "version_no" integer NOT NULL
);

-- USR: User
CREATE TABLE IF NOT EXISTS "${schemaName}"."user" (
    "user_id" varchar(40) NOT NULL PRIMARY KEY,
    "user_code" varchar(30) NOT NULL UNIQUE,
    "first_name" varchar(100) NOT NULL,
    "middle_name" varchar(100),
    "last_name" varchar(100),
    "display_name" varchar(150),
    "primary_email" varchar(254),
    "primary_phone" varchar(20) NOT NULL UNIQUE,
    "preferred_language_id" varchar(40),
    "user_status_id" varchar(40) DEFAULT 'entity-status-user-active' NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- ORGUSR: Organization User
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization_user" (
    "organization_user_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "user_id" varchar(40) NOT NULL,
    "organization_user_type_id" varchar(40) NOT NULL,
    "organization_user_status_id" varchar(40) DEFAULT 'entity-status-org-user-active' NOT NULL,
    "joining_date" date DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- ROLE: Role
CREATE TABLE IF NOT EXISTS "${schemaName}"."role" (
    "role_id" varchar(40) NOT NULL PRIMARY KEY,
    "role_code" varchar(30) NOT NULL UNIQUE,
    "role_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "role_status_id" varchar(40) NOT NULL
);

-- ORGUSRROLE: Organization User Role
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization_user_roles" (
    "organization_user_role_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_user_id" varchar(40) NOT NULL,
    "role_id" varchar(40) NOT NULL,
    "assignment_status_id" varchar(40) DEFAULT 'entity-status-org-user-role-active' NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- PRIV: Privilege
CREATE TABLE IF NOT EXISTS "${schemaName}"."privileges" (
    "privilege_id" varchar(40) NOT NULL PRIMARY KEY,
    "privilege_code" varchar(50) NOT NULL UNIQUE,
    "privilege_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "privilege_status_id" varchar(40) DEFAULT 'entity-status-privilege-active' NOT NULL
);

-- ROLEPRIV: Role Privilege
CREATE TABLE IF NOT EXISTS "${schemaName}"."role_privileges" (
    "role_privilege_id" varchar(40) NOT NULL PRIMARY KEY,
    "role_id" varchar(40) NOT NULL,
    "privilege_id" varchar(40) NOT NULL
);

-- MEMPROD: Membership Product
CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_products" (
    "membership_product_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "membership_product_code" varchar(30) NOT NULL UNIQUE,
    "membership_product_name" varchar(100) NOT NULL,
    "display_name" varchar(100),
    "product_category_id" varchar(40) NOT NULL,
    "product_type_id" varchar(40) NOT NULL,
    "description" varchar(1000),
    "product_status_id" varchar(40) DEFAULT 'entity-status-membership-prod-active' NOT NULL,
    "effective_date" date DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" date,
    "tier" varchar(50),
    "tier_sequence" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- BENEFIT: Benefit
CREATE TABLE IF NOT EXISTS "${schemaName}"."benefits" (
    "benefit_id" varchar(40) NOT NULL PRIMARY KEY,
    "benefit_code" varchar(30) NOT NULL UNIQUE,
    "benefit_name" varchar(100) NOT NULL,
    "display_name" varchar(100),
    "benefit_category_id" varchar(40) NOT NULL,
    "benefit_type_id" varchar(40) NOT NULL,
    "description" varchar(1000),
    "benefit_status_id" varchar(40) DEFAULT 'entity-status-benefit-active' NOT NULL,
    "product_id" varchar(40),
    "retail_price" numeric(12,2),
    "cost" numeric(12,2),
    "effective_date" date DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" date,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- SUBPLAN: Subscription Plan
CREATE TABLE IF NOT EXISTS "${schemaName}"."subscription_plans" (
    "subscription_plan_id" varchar(40) NOT NULL PRIMARY KEY,
    "membership_product_id" varchar(40) NOT NULL,
    "subscription_plan_code" varchar(30) NOT NULL UNIQUE,
    "subscription_plan_name" varchar(100) NOT NULL,
    "description" varchar(1000),
    "subscription_period" integer NOT NULL,
    "subscription_period_unit" varchar(20) DEFAULT 'Months' NOT NULL,
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency_id" varchar(40) NOT NULL,
    "subscription_plan_status_id" varchar(40) DEFAULT 'entity-status-subscription-plan-active' NOT NULL,
    "effective_date" date DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" date,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- SUBS: Subscription
CREATE TABLE IF NOT EXISTS "${schemaName}"."subscriptions" (
    "subscription_id" varchar(40) NOT NULL PRIMARY KEY,
    "subscription_number" varchar(30) NOT NULL UNIQUE,
    "subscription_plan_id" varchar(40) NOT NULL,
    "organization_user_id" varchar(40) NOT NULL,
    "subscription_date" date DEFAULT CURRENT_DATE NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "subscription_status_id" varchar(40) DEFAULT 'entity-status-subscription-active' NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- REDEEM: Redemption
CREATE TABLE IF NOT EXISTS "${schemaName}"."redemptions" (
    "redemption_id" varchar(40) NOT NULL PRIMARY KEY,
    "redemption_number" varchar(30) NOT NULL UNIQUE,
    "subscription_id" varchar(40) NOT NULL,
    "benefit_id" varchar(40) NOT NULL,
    "store_id" varchar(40) NOT NULL,
    "staff_id" varchar(40),
    "redemption_datetime" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "redemption_status_id" varchar(40) DEFAULT 'entity-status-redemption-success' NOT NULL,
    "remarks" varchar(500),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- STORE: Store
CREATE TABLE IF NOT EXISTS "${schemaName}"."stores" (
    "store_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "store_code" varchar(30) NOT NULL UNIQUE,
    "store_name" varchar(100) NOT NULL,
    "store_type_id" varchar(40) NOT NULL,
    "phone_number" varchar(20),
    "email_address" varchar(255),
    "address_line1" varchar(250) NOT NULL,
    "address_line2" varchar(250),
    "city" varchar(100) NOT NULL,
    "state" varchar(100) NOT NULL,
    "postal_code" varchar(20) NOT NULL,
    "country" varchar(100) NOT NULL,
    "timezone" varchar(100) NOT NULL,
    "store_status_id" varchar(40) DEFAULT 'entity-status-store-active' NOT NULL,
    "opening_date" date,
    "closing_date" date,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- STAFF: Staff
CREATE TABLE IF NOT EXISTS "${schemaName}"."staff" (
    "staff_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_user_id" varchar(40) NOT NULL UNIQUE,
    "staff_code" varchar(30) NOT NULL UNIQUE,
    "organization_id" varchar(40) NOT NULL,
    "role_id" varchar(40) NOT NULL,
    "designation" varchar(100),
    "store_id" varchar(40),
    "joining_date" date DEFAULT CURRENT_DATE NOT NULL,
    "relieving_date" date,
    "staff_status_id" varchar(40) DEFAULT 'entity-status-staff-active' NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- ORGTYPE: Organization Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization_types" (
    "organization_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_type_code" varchar(30) NOT NULL UNIQUE,
    "organization_type_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- STATUS: Status
CREATE TABLE IF NOT EXISTS "${schemaName}"."statuses" (
    "status_id" varchar(40) NOT NULL PRIMARY KEY,
    "status_code" varchar(30) NOT NULL UNIQUE,
    "status_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- LANG: Language
CREATE TABLE IF NOT EXISTS "${schemaName}"."languages" (
    "language_id" varchar(40) NOT NULL PRIMARY KEY,
    "language_code" varchar(10) NOT NULL UNIQUE,
    "language_name" varchar(100) NOT NULL,
    "native_name" varchar(100),
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- CURR: Currency
CREATE TABLE IF NOT EXISTS "${schemaName}"."currencies" (
    "currency_id" varchar(40) NOT NULL PRIMARY KEY,
    "currency_code" varchar(3) NOT NULL UNIQUE,
    "currency_name" varchar(100) NOT NULL,
    "currency_symbol" varchar(10) NOT NULL,
    "decimal_places" integer DEFAULT 2 NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- ORGUSRTYPE: Organization User Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization_user_types" (
    "organization_user_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_user_type_code" varchar(30) NOT NULL UNIQUE,
    "organization_user_type_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- PRODCAT: Product Category
CREATE TABLE IF NOT EXISTS "${schemaName}"."product_categories" (
    "product_category_id" varchar(40) NOT NULL PRIMARY KEY,
    "product_category_code" varchar(30) NOT NULL UNIQUE,
    "product_category_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- PRODTYPE: Product Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."product_types" (
    "product_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "product_type_code" varchar(30) NOT NULL UNIQUE,
    "product_type_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- BENCAT: Benefit Category
CREATE TABLE IF NOT EXISTS "${schemaName}"."benefit_categories" (
    "benefit_category_id" varchar(40) NOT NULL PRIMARY KEY,
    "benefit_category_code" varchar(30) NOT NULL UNIQUE,
    "benefit_category_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- BENTYPE: Benefit Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."benefit_types" (
    "benefit_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "benefit_type_code" varchar(30) NOT NULL UNIQUE,
    "benefit_type_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- STORETYPE: Store Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."store_types" (
    "store_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "store_type_code" varchar(30) NOT NULL UNIQUE,
    "store_type_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- ORGBRANDING: Organization Branding
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization_branding" (
    "organization_branding_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL UNIQUE,
    "branding_name" varchar(100) DEFAULT 'Default' NOT NULL,
    "theme_template_id" varchar(40) NOT NULL,
    "primary_color" varchar(20),
    "secondary_color" varchar(20),
    "accent_color" varchar(20),
    "logo_url" varchar(500),
    "dark_theme_logo_url" varchar(500),
    "favicon_url" varchar(500),
    "splash_screen_image_url" varchar(500),
    "branding_status_id" varchar(40) NOT NULL,
    "tagline" varchar(500),
    "hero_image_url" varchar(500),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone,
    "updated_by" varchar(40),
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- ORG_NOTIFICATION_CONFIG: Notification Configuration
CREATE TABLE IF NOT EXISTS "${schemaName}"."notification_configurations" (
    "notification_configuration_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL UNIQUE,
    "configuration_name" varchar(100) NOT NULL,
    "email_enabled" boolean DEFAULT TRUE NOT NULL,
    "sms_enabled" boolean DEFAULT FALSE NOT NULL,
    "whatsapp_enabled" boolean DEFAULT FALSE NOT NULL,
    "push_enabled" boolean DEFAULT TRUE NOT NULL,
    "in_app_enabled" boolean DEFAULT TRUE NOT NULL,
    "notification_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone,
    "updated_by" varchar(40),
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- PAYMENT_CONFIRMATION: Payment Confirmation
CREATE TABLE IF NOT EXISTS "${schemaName}"."payment_confirmations" (
    "payment_confirmation_id" varchar(40) NOT NULL PRIMARY KEY,
    "subscription_id" varchar(40) NOT NULL,
    "external_transaction_reference" varchar(100) NOT NULL UNIQUE,
    "payment_amount" numeric(18,2) NOT NULL,
    "currency_id" varchar(40) NOT NULL,
    "payment_date" timestamp without time zone NOT NULL,
    "payment_status_id" varchar(40) NOT NULL,
    "processed" boolean DEFAULT FALSE NOT NULL,
    "processed_at" timestamp without time zone,
    "processing_remarks" varchar(500),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- INTEGRATION_CONFIGURATION: Integration Configuration
CREATE TABLE IF NOT EXISTS "${schemaName}"."integration_configurations" (
    "integration_configuration_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "integration_name" varchar(100) NOT NULL,
    "integration_type_id" varchar(40) NOT NULL,
    "provider" varchar(100) NOT NULL,
    "integration_status_id" varchar(40) DEFAULT 'entity-status-integrate-config-active' NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone,
    "updated_by" varchar(40),
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- INTEGRATION_TYPE: Integration Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."integration_types" (
    "integration_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "integration_type_code" varchar(30) NOT NULL UNIQUE,
    "integration_type_name" varchar(100) NOT NULL UNIQUE,
    "description" varchar(500),
    "display_sequence" integer DEFAULT 1 NOT NULL,
    "status_id" varchar(40) DEFAULT 'entity-status-integrat-type-active' NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp without time zone,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- MEMBERSHIP_PRODUCT_BENEFIT: Membership Product Benefit
CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_product_benefits" (
    "membership_product_benefit_id" varchar(40) NOT NULL PRIMARY KEY,
    "membership_product_id" varchar(40) NOT NULL,
    "benefit_id" varchar(40) NOT NULL,
    "display_sequence" integer DEFAULT 1 NOT NULL,
    "mandatory_benefit" boolean DEFAULT TRUE NOT NULL,
    "effective_from" date,
    "effective_to" date,
    "status_id" varchar(40) DEFAULT 'entity-status-member-benefit-active' NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone,
    "updated_by" varchar(40),
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- TMP: Template
CREATE TABLE IF NOT EXISTS "${schemaName}"."template" (
    "template_id" varchar(40) NOT NULL PRIMARY KEY,
    "template_type_id" varchar(40) NOT NULL,
    "template_name" varchar(150) NOT NULL UNIQUE,
    "organization_type_id" varchar(40) NOT NULL,
    "template_description" varchar(500),
    "template_format" varchar(20) DEFAULT 'JSON' NOT NULL,
    "template_definition" jsonb NOT NULL,
    "template_version" integer DEFAULT 1 NOT NULL,
    "template_status_id" varchar(40) DEFAULT 'entity-status-template-active' NOT NULL,
    "is_default" boolean DEFAULT FALSE NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- TMPTYP: Template Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."template_type" (
    "template_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "template_type_code" varchar(30) NOT NULL UNIQUE,
    "template_type_name" varchar(100) NOT NULL UNIQUE,
    "template_type_description" varchar(500),
    "status_id" varchar(40) DEFAULT 'entity-status-template-type-active' NOT NULL
);

-- ORGDTL: Organization Details
CREATE TABLE IF NOT EXISTS "${schemaName}"."organization_details" (
    "organization_details_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL UNIQUE,
    "registration_number" varchar(50) UNIQUE,
    "gst_number" varchar(20) UNIQUE,
    "support_email" varchar(150),
    "support_phone" varchar(20),
    "address_line1" varchar(200) NOT NULL,
    "address_line2" varchar(200),
    "city" varchar(100) NOT NULL,
    "state" varchar(100) NOT NULL,
    "postal_code" varchar(20) NOT NULL,
    "country" varchar(100) NOT NULL,
    "about_organization" varchar(1000),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone,
    "updated_by" varchar(40),
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- PLTUSRROLE: Platform User Role
CREATE TABLE IF NOT EXISTS "${schemaName}"."platform_user_role" (
    "platform_user_role_id" varchar(40) NOT NULL PRIMARY KEY,
    "user_id" varchar(40) NOT NULL,
    "role_id" varchar(40) NOT NULL,
    "status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- STFSTORASGN: Staff Store Assignment
CREATE TABLE IF NOT EXISTS "${schemaName}"."staff_store_assignment" (
    "staff_store_assignment_id" varchar(40) NOT NULL PRIMARY KEY,
    "staff_id" varchar(40) NOT NULL,
    "store_id" varchar(40) NOT NULL,
    "status_id" varchar(40) NOT NULL,
    "effective_date" date NOT NULL,
    "end_date" date,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- OFFER: Offer
CREATE TABLE IF NOT EXISTS "${schemaName}"."offer" (
    "offer_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "offer_code" varchar(50) NOT NULL UNIQUE,
    "offer_name" varchar(150) DEFAULT 'Yes' NOT NULL,
    "description" varchar(1000) DEFAULT 'Yes',
    "membership_product_id" varchar(40),
    "store_id" varchar(40),
    "promotion_image_url" varchar(500) NOT NULL,
    "badge_text" varchar(50),
    "availability_text" varchar(100),
    "cta_label" varchar(50) NOT NULL,
    "cta_type" varchar(30) NOT NULL,
    "cta_target" varchar(500),
    "discount_percentage" numeric(5,2),
    "effective_date" date NOT NULL,
    "expiry_date" date,
    "status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- CUSTEXP: Customer Experience
CREATE TABLE IF NOT EXISTS "${schemaName}"."customer_experience" (
    "customer_experience_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL UNIQUE,
    "template_id" varchar(40) NOT NULL,
    "experience_name" varchar(150) NOT NULL,
    "experience_definition" jsonb NOT NULL,
    "experience_status_id" varchar(40) NOT NULL,
    "published_at" timestamp without time zone,
    "published_by" varchar(40),
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- PRODUCT: Product
CREATE TABLE IF NOT EXISTS "${schemaName}"."product" (
    "product_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "product_code" varchar(50) NOT NULL UNIQUE,
    "product_name" varchar(150) NOT NULL,
    "description" varchar(1000),
    "status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- ENTITY_TYPE: Entity Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."entity_type" (
    "entity_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "entity_type_code" varchar(50) NOT NULL UNIQUE,
    "entity_type_name" varchar(100) NOT NULL,
    "description" varchar(500),
    "display_order" integer NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL
);

-- ENTITY_STATUS: Entity Status
CREATE TABLE IF NOT EXISTS "${schemaName}"."entity_status" (
    "entity_status_id" varchar(40) NOT NULL PRIMARY KEY,
    "entity_type_id" varchar(40) NOT NULL,
    "status_id" varchar(40) NOT NULL,
    "display_order" integer NOT NULL,
    "is_active" boolean DEFAULT TRUE NOT NULL,
    "system_managed" boolean DEFAULT FALSE NOT NULL
);

-- referral_program: Referral Program
CREATE TABLE IF NOT EXISTS "${schemaName}"."referral_program" (
    "referral_program_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "referral_program_code" varchar(50) NOT NULL UNIQUE,
    "referral_program_name" varchar(200) NOT NULL,
    "description" varchar(1000),
    "referrer_reward_type_id" varchar(40),
    "referrer_reward_value" numeric(18,2),
    "effective_date" timestamp without time zone NOT NULL,
    "expiry_date" timestamp without time zone,
    "referral_program_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- referral: Referral
CREATE TABLE IF NOT EXISTS "${schemaName}"."referral" (
    "referral_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "referral_program_id" varchar(40) NOT NULL,
    "referrer_user_id" varchar(40) NOT NULL,
    "referral_code" varchar(100) NOT NULL UNIQUE,
    "referred_user_id" varchar(40),
    "referred_email" varchar(320),
    "referred_phone" text,
    "referral_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "accepted_at" timestamp without time zone,
    "converted_at" timestamp without time zone,
    "reward_issued_at" timestamp without time zone,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- preference_type: Preference Type
CREATE TABLE IF NOT EXISTS "${schemaName}"."preference_type" (
    "preference_type_id" varchar(40) NOT NULL PRIMARY KEY,
    "preference_type_code" varchar(50) NOT NULL UNIQUE,
    "preference_type_name" varchar(200) NOT NULL,
    "data_type" varchar(30) NOT NULL,
    "default_value" varchar(500),
    "description" varchar(1000),
    "preference_type_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- customer_preference: Customer Preference
CREATE TABLE IF NOT EXISTS "${schemaName}"."customer_preference" (
    "customer_preference_id" varchar(40) NOT NULL PRIMARY KEY,
    "user_id" varchar(40) NOT NULL,
    "preference_type_id" varchar(40) NOT NULL,
    "preference_value" varchar(500) NOT NULL,
    "preference_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- BENRULE: Benefit Usage Rule
CREATE TABLE IF NOT EXISTS "${schemaName}"."benefit_usage_rule" (
    "benefit_usage_rule_id" varchar(40) NOT NULL PRIMARY KEY,
    "benefit_id" varchar(40) NOT NULL,
    "rule_name" varchar(100) NOT NULL,
    "frequency_type" varchar(30) DEFAULT 'DAILY' NOT NULL,
    "frequency_interval" integer DEFAULT 1 NOT NULL,
    "usage_limit" integer DEFAULT 1 NOT NULL,
    "window_start_time" timestamp without time zone,
    "window_end_time" timestamp without time zone,
    "applicable_days" varchar(100),
    "time_zone" varchar(100),
    "effective_date" date DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" date,
    "benefit_usage_rule_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- OFFRULE: Offer Usage Rule
CREATE TABLE IF NOT EXISTS "${schemaName}"."offer_usage_rule" (
    "offer_usage_rule_id" varchar(40) NOT NULL PRIMARY KEY,
    "offer_id" varchar(40) NOT NULL,
    "rule_name" varchar(100) NOT NULL,
    "frequency_type" varchar(30) DEFAULT 'DAILY' NOT NULL,
    "frequency_interval" integer DEFAULT 1 NOT NULL,
    "usage_limit" integer DEFAULT 1 NOT NULL,
    "window_start_time" timestamp without time zone,
    "window_end_time" timestamp without time zone,
    "applicable_days" varchar(100),
    "time_zone" varchar(100),
    "effective_date" date DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" date,
    "offer_usage_rule_status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- QRCODE: QR Code
CREATE TABLE IF NOT EXISTS "${schemaName}"."qr_codes" (
    "qr_code_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "qr_code_name" varchar(100) NOT NULL,
    "qr_code_type_id" varchar(40) NOT NULL,
    "qr_code_token" varchar(200) NOT NULL UNIQUE,
    "target_entity_type" varchar(50),
    "target_entity_id" varchar(40),
    "placement_name" varchar(150),
    "store_id" varchar(40),
    "status_id" varchar(40) NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

-- QRSCNHIST: QR Scan History
CREATE TABLE IF NOT EXISTS "${schemaName}"."qr_scan_history" (
    "qr_scan_history_id" varchar(40) NOT NULL PRIMARY KEY,
    "qr_code_id" varchar(40) NOT NULL,
    "user_id" varchar(40),
    "qr_scan_datetime" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "qr_scan_result_id" varchar(40) NOT NULL,
    "store_id" varchar(40),
    "staff_id" varchar(40),
    "scan_source" varchar(50) NOT NULL,
    "target_entity_type" varchar(50),
    "target_entity_id" varchar(40),
    "failure_reason" varchar(500),
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40),
    "version_no" integer DEFAULT 1 NOT NULL
);

-- QRACQATTR: QR Membership Acquisition Attribution
CREATE TABLE IF NOT EXISTS "${schemaName}"."qr_membership_acquisition_attributions" (
    "qr_membership_acquisition_attribution_id" varchar(40) NOT NULL PRIMARY KEY,
    "qr_scan_history_id" varchar(40) NOT NULL,
    "subscription_id" varchar(40) NOT NULL,
    "organization_id" varchar(40) NOT NULL,
    "membership_product_id" varchar(40) NOT NULL,
    "customer_id" varchar(40),
    "attributed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" varchar(40),
    "version_no" integer DEFAULT 1 NOT NULL
);

-- CXREL: Customer Experience Release
CREATE TABLE IF NOT EXISTS "${schemaName}"."customer_experience_release" (
    "customer_experience_release_id" varchar(40) NOT NULL PRIMARY KEY,
    "organization_id" varchar(40) NOT NULL,
    "release_number" integer DEFAULT 1 NOT NULL UNIQUE,
    "release_status_id" varchar(40) NOT NULL,
    "snapshot_data" jsonb NOT NULL,
    "published_at" timestamp without time zone NOT NULL,
    "published_by" varchar(40) NOT NULL,
    "created_at" timestamp without time zone NOT NULL,
    "created_by" varchar(40) NOT NULL,
    "updated_at" timestamp without time zone NOT NULL,
    "updated_by" varchar(40) NOT NULL,
    "is_deleted" boolean DEFAULT FALSE NOT NULL,
    "version_no" integer DEFAULT 1 NOT NULL
);

