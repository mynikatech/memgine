-- Optional customer-facing Benefit and Offer terms.
ALTER TABLE "${schemaName}".benefits ADD COLUMN IF NOT EXISTS disclaimer_text varchar(500);
ALTER TABLE "${schemaName}".offer ADD COLUMN IF NOT EXISTS disclaimer_text varchar(500);

-- Return contracts changed, so recreate these functions after removing their prior signatures.
DROP FUNCTION IF EXISTS "${schemaName}".get_membership_product_benefits(varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_organization_benefits(varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_organization_offers(varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_customer_offers(varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean);
DROP FUNCTION IF EXISTS "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean);

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_benefits(
    p_organization_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
    "disclaimerText" varchar,
    "benefitStatusId" varchar,
    "productId" varchar,
    "retailPrice" numeric,
    cost numeric,
    "effectiveDate" text,
    "expiryDate" text,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT
        b.benefit_id,
        b.organization_id,
        b.benefit_code,
        b.benefit_name,
        b.display_name,
        b.benefit_category_id,
        b.benefit_type_id,
        b.description,
        b.disclaimer_text,
        b.benefit_status_id,
        b.product_id,
        b.retail_price,
        b.cost,
        b.effective_date::text,
        b.expiry_date::text,
        b.created_at::text,
        b.created_by,
        b.updated_at::text,
        b.updated_by,
        b.is_deleted,
        b.version_no
    FROM "${schemaName}".benefits b
    WHERE b.organization_id = p_organization_id
      AND b.is_deleted = false
    ORDER BY b.benefit_name, b.benefit_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_product_benefits(
    p_membership_product_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
    "disclaimerText" varchar,
    "benefitStatusId" varchar,
    "productId" varchar,
    "retailPrice" numeric,
    cost numeric,
    "effectiveDate" text,
    "expiryDate" text,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT b.*
    FROM "${schemaName}".membership_products mp
    JOIN "${schemaName}".membership_product_benefits link
      ON link.membership_product_id = mp.membership_product_id
    JOIN LATERAL "${schemaName}".get_organization_benefits(mp.organization_id) b
      ON b.id = link.benefit_id
    WHERE mp.membership_product_id = p_membership_product_id
      AND mp.is_deleted = false
      AND link.is_deleted = false;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_offers(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "organizationId" varchar, "offerCode" varchar, "offerName" varchar,
    description varchar, "membershipProductId" varchar, "storeId" varchar,
    "promotionImageUrl" varchar, "badgeText" varchar, "availabilityText" varchar, "disclaimerText" varchar,
    "ctaLabel" varchar, "ctaType" varchar, "ctaTarget" varchar,
    "discountPercentage" double precision, "effectiveDate" text, "expiryDate" text,
    "statusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT o.offer_id, o.organization_id, o.offer_code, o.offer_name,
        o.description, o.membership_product_id, o.store_id,
        o.promotion_image_url, o.badge_text, o.availability_text, o.disclaimer_text,
        o.cta_label, o.cta_type, o.cta_target, o.discount_percentage::double precision,
        o.effective_date::text, o.expiry_date::text, o.status_id,
        o.created_at::text, o.created_by, o.updated_at::text, o.updated_by,
        o.is_deleted, o.version_no
    FROM "${schemaName}".offer o
    WHERE o.organization_id = p_organization_id AND o.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
    ORDER BY o.offer_name, o.offer_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_offers(
    p_organization_id varchar, p_user_id varchar
) RETURNS TABLE (
    id varchar, "organizationId" varchar, "offerCode" varchar, "offerName" varchar,
    description varchar, "membershipProductId" varchar, "storeId" varchar,
    "promotionImageUrl" varchar, "badgeText" varchar, "availabilityText" varchar, "disclaimerText" varchar,
    "ctaLabel" varchar, "ctaType" varchar, "ctaTarget" varchar,
    "discountPercentage" double precision, "effectiveDate" text, "expiryDate" text,
    "statusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
) LANGUAGE sql STABLE AS $function$
    SELECT o.offer_id, o.organization_id, o.offer_code, o.offer_name,
        o.description, o.membership_product_id, o.store_id,
        o.promotion_image_url, o.badge_text, o.availability_text, o.disclaimer_text,
        o.cta_label, o.cta_type, o.cta_target, o.discount_percentage::double precision,
        o.effective_date::text, o.expiry_date::text, o.status_id,
        o.created_at::text, o.created_by, o.updated_at::text, o.updated_by,
        o.is_deleted, o.version_no
    FROM "${schemaName}".offer o
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = o.status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE o.organization_id = p_organization_id AND o.is_deleted = false
      AND st.status_code = 'ACTIVE' AND o.effective_date <= CURRENT_DATE
      AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_DATE)
      AND (o.membership_product_id IS NULL OR EXISTS (
          SELECT 1 FROM "${schemaName}".subscriptions s
          JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
          JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
          JOIN "${schemaName}".entity_status ses ON ses.entity_status_id = s.subscription_status_id
          JOIN "${schemaName}".statuses ss ON ss.status_id = ses.status_id
          WHERE ou.organization_id = p_organization_id AND ou.user_id = p_user_id
            AND sp.membership_product_id = o.membership_product_id
            AND s.is_deleted = false AND ss.status_code = 'ACTIVE'
            AND s.start_date <= CURRENT_DATE AND s.end_date >= CURRENT_DATE
      ))
      AND "${schemaName}".customer_has_active_relationship(p_organization_id, p_user_id)
    ORDER BY o.offer_name, o.offer_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_benefit(
    p_organization_id varchar, p_benefit_id varchar, p_code varchar,
    p_name varchar, p_display_name varchar, p_category_id varchar,
    p_type_id varchar, p_description varchar, p_disclaimer_text varchar, p_status_id varchar,
    p_product_id varchar, p_retail_price numeric, p_cost numeric,
    p_effective_date date, p_expiry_date date, p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF length(p_benefit_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR length(coalesce(p_disclaimer_text, '')) > 500
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid Benefit fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'BENEFIT'
    ) THEN
        RAISE EXCEPTION 'Benefit status does not belong to BENEFIT' USING ERRCODE = '22023';
    END IF;
    IF p_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".product p
        WHERE p.product_id = p_product_id AND p.organization_id = p_organization_id
          AND p.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Product does not belong to organization' USING ERRCODE = '23503';
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('BENEFIT', p_organization_id);
        v_code := (v_org_code || '_BEN_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".benefits (
            benefit_id, organization_id, benefit_code, benefit_name, display_name,
            benefit_category_id, benefit_type_id, description, disclaimer_text, benefit_status_id,
            product_id, retail_price, cost, effective_date, expiry_date,
            created_at, created_by, updated_at, updated_by, is_deleted, version_no
        ) VALUES (
            p_benefit_id, p_organization_id, v_code, p_name, p_display_name,
            p_category_id, p_type_id, p_description, NULLIF(trim(p_disclaimer_text), ''), p_status_id, p_product_id,
            p_retail_price, p_cost, p_effective_date, p_expiry_date,
            CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
            false, 1
        );
    ELSE
        UPDATE "${schemaName}".benefits SET
            benefit_name = p_name, display_name = p_display_name,
            benefit_category_id = p_category_id, benefit_type_id = p_type_id,
            description = p_description, disclaimer_text = NULLIF(trim(p_disclaimer_text), ''), benefit_status_id = p_status_id,
            product_id = p_product_id, retail_price = p_retail_price, cost = p_cost,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE benefit_id = p_benefit_id AND organization_id = p_organization_id
          AND is_deleted = false;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Benefit not found in organization' USING ERRCODE = 'P0002';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_offer(
    p_organization_id varchar, p_id varchar, p_code varchar, p_name varchar,
    p_description varchar, p_membership_product_id varchar, p_store_id varchar,
    p_promotion_image_url varchar, p_badge_text varchar, p_availability_text varchar, p_disclaimer_text varchar,
    p_cta_label varchar, p_cta_type varchar, p_cta_target varchar,
    p_discount_percentage numeric, p_effective_date date, p_expiry_date date,
    p_status_id varchar, p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 150
       OR length(coalesce(p_description, '')) > 1000
       OR nullif(trim(p_promotion_image_url), '') IS NULL OR length(p_promotion_image_url) > 500
       OR length(coalesce(p_badge_text, '')) > 50
       OR length(coalesce(p_availability_text, '')) > 100
       OR length(coalesce(p_disclaimer_text, '')) > 500
       OR nullif(trim(p_cta_label), '') IS NULL OR length(p_cta_label) > 50
       OR p_cta_type NOT IN ('REDEEM_OFFER', 'SHOP') OR length(coalesce(p_cta_target, '')) > 500
       OR p_effective_date IS NULL OR p_expiry_date < p_effective_date
       OR (p_discount_percentage IS NOT NULL AND (p_discount_percentage <= 0 OR p_discount_percentage > 100)) THEN
        RAISE EXCEPTION 'Invalid Offer fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'OFFER' AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid Offer status' USING ERRCODE = '22023';
    END IF;
    IF p_membership_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".membership_products mp
        WHERE mp.membership_product_id = p_membership_product_id
          AND mp.organization_id = p_organization_id AND mp.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Membership Product does not belong to organization' USING ERRCODE = '23503';
    END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores s
        WHERE s.store_id = p_store_id AND s.organization_id = p_organization_id AND s.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Store does not belong to organization' USING ERRCODE = '23503';
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('OFFER', p_organization_id);
        v_code := (v_org_code || '_OFF_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".offer (
            offer_id, organization_id, offer_code, offer_name, description,
            membership_product_id, store_id, promotion_image_url, badge_text,
            availability_text, disclaimer_text, cta_label, cta_type, cta_target,
            discount_percentage, effective_date, expiry_date, status_id,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            p_id, p_organization_id, v_code, p_name, p_description,
            p_membership_product_id, p_store_id, p_promotion_image_url, p_badge_text,
            p_availability_text, NULLIF(trim(p_disclaimer_text), ''), p_cta_label, p_cta_type, p_cta_target,
            p_discount_percentage, p_effective_date, p_expiry_date, p_status_id,
            CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".offer SET
            offer_name = p_name, description = p_description,
            membership_product_id = p_membership_product_id, store_id = p_store_id,
            promotion_image_url = p_promotion_image_url, badge_text = p_badge_text,
            availability_text = p_availability_text, disclaimer_text = NULLIF(trim(p_disclaimer_text), ''), cta_label = p_cta_label,
            cta_type = p_cta_type, cta_target = p_cta_target,
            discount_percentage = p_discount_percentage,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            status_id = p_status_id, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE offer_id = p_id AND organization_id = p_organization_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Offer not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

-- Published snapshots store generic statuses.status_id values, while live
-- relational columns use entity_status.entity_status_id values. This migration
-- corrects only the snapshot interpretation used by customer discovery.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_discoverable_organization(
    p_organization_id varchar
)
RETURNS TABLE ("organizationId" varchar, "detailJson" text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
WITH candidate AS (
    SELECT o.organization_id, cer.snapshot_data
      FROM "${schemaName}".organization o
      JOIN "${schemaName}".entity_status oes
        ON oes.entity_status_id = o.organization_status_id
      JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
      JOIN "${schemaName}".customer_experience_release cer
        ON cer.customer_experience_release_id = o.published_customer_experience_release_id
       AND cer.is_deleted = false
      JOIN "${schemaName}".entity_status ces
        ON ces.entity_status_id = cer.release_status_id
      JOIN "${schemaName}".statuses cs ON cs.status_id = ces.status_id
     WHERE o.organization_id = p_organization_id
       AND o.is_deleted = false
       AND os.status_code = 'ACTIVE'
       AND cs.status_code = 'PUBLISHED'
),
eligible_products AS (
    SELECT c.organization_id, c.snapshot_data, product
      FROM candidate c
      CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(c.snapshot_data -> 'membershipProducts', '[]'::jsonb)
      ) product
      JOIN "${schemaName}".statuses mps
        ON mps.status_id = product ->> 'productStatusId'
     WHERE mps.status_code = 'ACTIVE'
       AND COALESCE(NULLIF(product ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
       AND COALESCE(NULLIF(product ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
       AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(product -> 'plans', '[]'::jsonb)) plan
             JOIN "${schemaName}".statuses sps
               ON sps.status_id = plan ->> 'subscriptionPlanStatusId'
            WHERE sps.status_code = 'ACTIVE'
              AND COALESCE(NULLIF(plan ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
              AND COALESCE(NULLIF(plan ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
       )
)
SELECT c.organization_id,
       jsonb_build_object(
           'organization', jsonb_build_object(
               'id', c.snapshot_data #> '{organization,id}',
               'name', c.snapshot_data #> '{organization,name}',
               'displayName', c.snapshot_data #> '{organization,displayName}',
               'website', c.snapshot_data #> '{organization,website}',
               'primaryEmail', c.snapshot_data #> '{organization,primaryEmail}',
               'primaryPhone', c.snapshot_data #> '{organization,primaryPhone}'
           ),
           'publishedExperience', jsonb_build_object(
               'configuration', jsonb_build_object(
                   'templateId', c.snapshot_data #> '{configuration,templateId}',
                   'identity', c.snapshot_data #> '{configuration,identity}',
                   'branding', c.snapshot_data #> '{configuration,branding}',
                   'customerExperience', c.snapshot_data #> '{configuration,customerExperience}',
                   'localization', c.snapshot_data #> '{configuration,localization}'
               ),
               'template', jsonb_build_object(
                   'id', c.snapshot_data #> '{template,id}',
                   'sections', c.snapshot_data #> '{template,sections}',
                   'supportedCardStyles', c.snapshot_data #> '{template,supportedCardStyles}'
               ),
               'definition', c.snapshot_data #> '{customerExperience,experienceDefinition}',
               'organizationBranding', jsonb_build_object(
                   'logoUrl', c.snapshot_data #> '{organizationBranding,logoUrl}',
                   'darkThemeLogoUrl', c.snapshot_data #> '{organizationBranding,darkThemeLogoUrl}',
                   'faviconUrl', c.snapshot_data #> '{organizationBranding,faviconUrl}',
                   'splashScreenImageUrl', c.snapshot_data #> '{organizationBranding,splashScreenImageUrl}',
                   'tagline', c.snapshot_data #> '{organizationBranding,tagline}',
                   'heroImageUrl', c.snapshot_data #> '{organizationBranding,heroImageUrl}',
                   'primaryColor', c.snapshot_data #> '{organizationBranding,primaryColor}',
                   'secondaryColor', c.snapshot_data #> '{organizationBranding,secondaryColor}',
                   'accentColor', c.snapshot_data #> '{organizationBranding,accentColor}'
               ),
               'organizationDetails', jsonb_build_object(
                   'aboutOrganization', c.snapshot_data #> '{organizationDetails,aboutOrganization}',
                   'supportEmail', c.snapshot_data #> '{organizationDetails,supportEmail}',
                   'supportPhone', c.snapshot_data #> '{organizationDetails,supportPhone}'
               )
           ),
           'membershipProducts', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', product -> 'id',
                   'membershipProductName', product -> 'membershipProductName',
                   'displayName', product -> 'displayName',
                   'tier', product -> 'tier',
                   'tierSequence', product -> 'tierSequence',
                   'description', product -> 'description',
                   'benefitIds', COALESCE(product -> 'benefitIds', '[]'::jsonb),
                   'plans', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'id', plan -> 'id',
                           'subscriptionPlanName', plan -> 'subscriptionPlanName',
                           'subscriptionPlanCode', plan -> 'subscriptionPlanCode',
                           'description', plan -> 'description',
                           'subscriptionPeriod', plan -> 'subscriptionPeriod',
                           'subscriptionPeriodUnit', plan -> 'subscriptionPeriodUnit',
                           'price', plan -> 'price'
                       ) ORDER BY plan ->> 'subscriptionPlanName')
                       FROM jsonb_array_elements(COALESCE(product -> 'plans', '[]'::jsonb)) plan
                       JOIN "${schemaName}".statuses sps
                         ON sps.status_id = plan ->> 'subscriptionPlanStatusId'
                      WHERE sps.status_code = 'ACTIVE'
                        AND COALESCE(NULLIF(plan ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
                        AND COALESCE(NULLIF(plan ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
                   ), '[]'::jsonb)
               ) ORDER BY NULLIF(product ->> 'tierSequence', '')::integer NULLS LAST,
                            product ->> 'membershipProductName')
                 FROM eligible_products ep
                WHERE ep.organization_id = c.organization_id
           ), '[]'::jsonb),
           'benefits', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', benefit -> 'id', 'benefitName', benefit -> 'benefitName',
                   'displayName', benefit -> 'displayName', 'description', benefit -> 'description',
                   'disclaimerText', benefit -> 'disclaimerText', 'benefitTypeId', benefit -> 'benefitTypeId'
               ) ORDER BY benefit ->> 'benefitName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'benefits', '[]'::jsonb)) benefit
           ), '[]'::jsonb),
           'benefitUsageRules', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', rule -> 'id', 'benefitId', rule -> 'benefitId',
                   'ruleName', rule -> 'ruleName', 'frequencyType', rule -> 'frequencyType',
                   'frequencyInterval', rule -> 'frequencyInterval', 'usageLimit', rule -> 'usageLimit',
                   'windowStartTime', rule -> 'windowStartTime', 'windowEndTime', rule -> 'windowEndTime',
                   'applicableDays', COALESCE(rule -> 'applicableDays', '[]'::jsonb), 'timeZone', rule -> 'timeZone'
               ) ORDER BY rule ->> 'ruleName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'benefitUsageRules', '[]'::jsonb)) rule
           ), '[]'::jsonb),
           'offers', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', offer -> 'id', 'offerName', offer -> 'offerName',
                   'description', offer -> 'description', 'promotionImageUrl', offer -> 'promotionImageUrl',
                   'badgeText', offer -> 'badgeText', 'availabilityText', offer -> 'availabilityText',
                   'disclaimerText', offer -> 'disclaimerText', 'membershipProductId', offer -> 'membershipProductId',
                   'discountPercentage', offer -> 'discountPercentage', 'ctaLabel', offer -> 'ctaLabel'
               ) ORDER BY offer ->> 'offerName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'offers', '[]'::jsonb)) offer
           ), '[]'::jsonb),
           'offerUsageRules', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', rule -> 'id', 'offerId', rule -> 'offerId',
                   'ruleName', rule -> 'ruleName', 'frequencyType', rule -> 'frequencyType',
                   'frequencyInterval', rule -> 'frequencyInterval', 'usageLimit', rule -> 'usageLimit',
                   'windowStartTime', rule -> 'windowStartTime', 'windowEndTime', rule -> 'windowEndTime',
                   'applicableDays', COALESCE(rule -> 'applicableDays', '[]'::jsonb), 'timeZone', rule -> 'timeZone'
               ) ORDER BY rule ->> 'ruleName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'offerUsageRules', '[]'::jsonb)) rule
           ), '[]'::jsonb),
           'stores', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', store -> 'id', 'name', store -> 'name',
                   'address', jsonb_build_object(
                       'line1', store #> '{address,line1}',
                       'city', store #> '{address,city}'
                   )
               ) ORDER BY store ->> 'name')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'stores', '[]'::jsonb)) store
           ), '[]'::jsonb)
       )::text
  FROM candidate c
 WHERE EXISTS (
     SELECT 1 FROM eligible_products ep WHERE ep.organization_id = c.organization_id
 );
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_discoverable_organization(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_discoverable_organization(varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_discoverable_organizations()
RETURNS TABLE (
    "organizationId" varchar, "name" varchar, "displayName" varchar,
    "logoUrl" varchar, tagline varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
    SELECT detail."organizationId",
           detail."detailJson"::jsonb #>> '{organization,name}',
           detail."detailJson"::jsonb #>> '{organization,displayName}',
           detail."detailJson"::jsonb #>> '{publishedExperience,organizationBranding,logoUrl}',
           COALESCE(
               detail."detailJson"::jsonb #>> '{publishedExperience,organizationBranding,tagline}',
               detail."detailJson"::jsonb #>> '{publishedExperience,definition,businessIdentity,tagline}'
           )
      FROM "${schemaName}".organization o
      CROSS JOIN LATERAL "${schemaName}".get_customer_discoverable_organization(o.organization_id) detail
     ORDER BY COALESCE(NULLIF(detail."detailJson"::jsonb #>> '{organization,displayName}', ''),
                       detail."detailJson"::jsonb #>> '{organization,name}'),
              detail."organizationId";
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_discoverable_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_discoverable_organizations() TO "${appRole}";

REVOKE ALL ON FUNCTION "${schemaName}".get_organization_benefits(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_benefits(varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_membership_product_benefits(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_membership_product_benefits(varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_organization_offers(varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_offers(varchar, varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_offers(varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_offers(varchar, varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean) TO "${appRole}";
