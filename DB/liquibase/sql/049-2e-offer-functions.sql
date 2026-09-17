-- Batch 2E: organization-owned Offers and Offer Usage Rules.
-- Offer is seeded in baseline; its status-bearing child needs its own mapping.
INSERT INTO "${schemaName}".entity_type
    (entity_type_id, entity_type_code, entity_type_name, description, display_order, is_active)
VALUES ('entity-type-offer-usage-rule', 'OFFER_USAGE_RULE', 'Offer Usage Rule',
        'Represents a usage or frequency rule associated with an offer.', 28, TRUE)
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

INSERT INTO "${schemaName}".entity_status
    (entity_status_id, entity_type_id, status_id, display_order, is_active, system_managed)
VALUES
    ('entity-status-offer-rule-draft', 'entity-type-offer-usage-rule', 'status-draft', 1, TRUE, FALSE),
    ('entity-status-offer-rule-active', 'entity-type-offer-usage-rule', 'status-active', 2, TRUE, FALSE),
    ('entity-status-offer-rule-inactive', 'entity-type-offer-usage-rule', 'status-inactive', 3, TRUE, FALSE),
    ('entity-status-offer-rule-expired', 'entity-type-offer-usage-rule', 'status-expired', 4, TRUE, TRUE),
    ('entity-status-offer-rule-cancelled', 'entity-type-offer-usage-rule', 'status-cancelled', 5, TRUE, TRUE)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_offers(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "organizationId" varchar, "offerCode" varchar, "offerName" varchar,
    description varchar, "membershipProductId" varchar, "storeId" varchar,
    "promotionImageUrl" varchar, "badgeText" varchar, "availabilityText" varchar,
    "ctaLabel" varchar, "ctaType" varchar, "ctaTarget" varchar,
    "discountPercentage" double precision, "effectiveDate" text, "expiryDate" text,
    "statusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT o.offer_id, o.organization_id, o.offer_code, o.offer_name,
        o.description, o.membership_product_id, o.store_id,
        o.promotion_image_url, o.badge_text, o.availability_text,
        o.cta_label, o.cta_type, o.cta_target, o.discount_percentage::double precision,
        o.effective_date::text, o.expiry_date::text, o.status_id,
        o.created_at::text, o.created_by, o.updated_at::text, o.updated_by,
        o.is_deleted, o.version_no
    FROM "${schemaName}".offer o
    WHERE o.organization_id = p_organization_id AND o.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
    ORDER BY o.offer_name, o.offer_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_offer_rules(
    p_organization_id varchar, p_offer_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "offerId" varchar, "ruleName" varchar, "frequencyType" varchar,
    "frequencyInterval" integer, "usageLimit" integer,
    "windowStartTime" text, "windowEndTime" text, "applicableDays" varchar,
    "timeZone" varchar, "effectiveDate" text, "expiryDate" text,
    "offerUsageRuleStatusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT r.offer_usage_rule_id, r.offer_id, r.rule_name, r.frequency_type,
        r.frequency_interval, r.usage_limit,
        to_char(r.window_start_time, 'HH24:MI'), to_char(r.window_end_time, 'HH24:MI'),
        r.applicable_days, r.time_zone, r.effective_date::text, r.expiry_date::text,
        r.offer_usage_rule_status_id, r.created_at::text, r.created_by,
        r.updated_at::text, r.updated_by, r.is_deleted, r.version_no
    FROM "${schemaName}".offer_usage_rule r
    JOIN "${schemaName}".offer o ON o.offer_id = r.offer_id
    WHERE o.organization_id = p_organization_id AND o.offer_id = p_offer_id
      AND o.is_deleted = false AND r.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
    ORDER BY r.rule_name, r.offer_usage_rule_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_offer(
    p_organization_id varchar, p_id varchar, p_code varchar, p_name varchar,
    p_description varchar, p_membership_product_id varchar, p_store_id varchar,
    p_promotion_image_url varchar, p_badge_text varchar, p_availability_text varchar,
    p_cta_label varchar, p_cta_type varchar, p_cta_target varchar,
    p_discount_percentage numeric, p_effective_date date, p_expiry_date date,
    p_status_id varchar, p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 40
       OR nullif(trim(p_code), '') IS NULL OR length(p_code) > 50
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 150
       OR length(coalesce(p_description, '')) > 1000
       OR nullif(trim(p_promotion_image_url), '') IS NULL OR length(p_promotion_image_url) > 500
       OR length(coalesce(p_badge_text, '')) > 50
       OR length(coalesce(p_availability_text, '')) > 100
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
        RAISE EXCEPTION 'Membership Product does not belong to organization' USING ERRCODE = '22023';
    END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores s
        WHERE s.store_id = p_store_id AND s.organization_id = p_organization_id AND s.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Store does not belong to organization' USING ERRCODE = '22023';
    END IF;
    IF p_create THEN
        INSERT INTO "${schemaName}".offer (
            offer_id, organization_id, offer_code, offer_name, description,
            membership_product_id, store_id, promotion_image_url, badge_text,
            availability_text, cta_label, cta_type, cta_target, discount_percentage,
            effective_date, expiry_date, status_id, created_at, created_by, updated_at, updated_by
        ) VALUES (
            p_id, p_organization_id, p_code, p_name, p_description,
            p_membership_product_id, p_store_id, p_promotion_image_url, p_badge_text,
            p_availability_text, p_cta_label, p_cta_type, p_cta_target, p_discount_percentage,
            p_effective_date, p_expiry_date, p_status_id, CURRENT_TIMESTAMP,
            p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".offer SET
            offer_code = p_code, offer_name = p_name, description = p_description,
            membership_product_id = p_membership_product_id, store_id = p_store_id,
            promotion_image_url = p_promotion_image_url, badge_text = p_badge_text,
            availability_text = p_availability_text, cta_label = p_cta_label,
            cta_type = p_cta_type, cta_target = p_cta_target,
            discount_percentage = p_discount_percentage, effective_date = p_effective_date,
            expiry_date = p_expiry_date, status_id = p_status_id,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE offer_id = p_id AND organization_id = p_organization_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Offer not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_offer_rule(
    p_organization_id varchar, p_offer_id varchar, p_id varchar,
    p_name varchar, p_frequency_type varchar, p_frequency_interval integer,
    p_usage_limit integer, p_window_start_time time, p_window_end_time time,
    p_applicable_days varchar, p_time_zone varchar, p_effective_date date,
    p_expiry_date date, p_status_id varchar, p_version_no integer,
    p_actor_user_id varchar, p_create boolean
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".offer
                   WHERE offer_id = p_offer_id AND organization_id = p_organization_id AND is_deleted = false) THEN
        RAISE EXCEPTION 'Offer not found in organization' USING ERRCODE = 'P0002';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 40
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_frequency_type NOT IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ONE_TIME')
       OR p_frequency_interval IS NULL OR p_frequency_interval < 1
       OR p_usage_limit IS NULL OR p_usage_limit < 1
       OR (p_window_start_time IS NOT NULL AND p_window_end_time IS NOT NULL
           AND p_window_end_time <= p_window_start_time)
       OR length(coalesce(p_applicable_days, '')) > 100
       OR length(coalesce(p_time_zone, '')) > 100
       OR p_effective_date IS NULL OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid Offer Usage Rule fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'OFFER_USAGE_RULE' AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid Offer Usage Rule status' USING ERRCODE = '22023';
    END IF;
    IF p_create THEN
        INSERT INTO "${schemaName}".offer_usage_rule (
            offer_usage_rule_id, offer_id, rule_name, frequency_type,
            frequency_interval, usage_limit, window_start_time, window_end_time,
            applicable_days, time_zone, effective_date, expiry_date,
            offer_usage_rule_status_id, created_by, updated_by
        ) VALUES (
            p_id, p_offer_id, p_name, p_frequency_type,
            p_frequency_interval, p_usage_limit,
            CASE WHEN p_window_start_time IS NULL THEN NULL ELSE p_effective_date + p_window_start_time END,
            CASE WHEN p_window_end_time IS NULL THEN NULL ELSE p_effective_date + p_window_end_time END,
            p_applicable_days, p_time_zone, p_effective_date, p_expiry_date,
            p_status_id, p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".offer_usage_rule SET
            rule_name = p_name, frequency_type = p_frequency_type,
            frequency_interval = p_frequency_interval, usage_limit = p_usage_limit,
            window_start_time = CASE WHEN p_window_start_time IS NULL THEN NULL ELSE p_effective_date + p_window_start_time END,
            window_end_time = CASE WHEN p_window_end_time IS NULL THEN NULL ELSE p_effective_date + p_window_end_time END,
            applicable_days = p_applicable_days, time_zone = p_time_zone,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            offer_usage_rule_status_id = p_status_id, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE offer_usage_rule_id = p_id AND offer_id = p_offer_id AND is_deleted = false
          AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Offer Usage Rule not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_offer_rule(
    p_organization_id varchar, p_offer_id varchar, p_rule_id varchar,
    p_version_no integer, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".offer_usage_rule r SET is_deleted = true,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = r.version_no + 1
    FROM "${schemaName}".offer o
    WHERE r.offer_usage_rule_id = p_rule_id AND r.offer_id = p_offer_id
      AND o.offer_id = r.offer_id AND o.organization_id = p_organization_id
      AND o.is_deleted = false AND r.is_deleted = false AND r.version_no = p_version_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer Usage Rule not found or changed since load' USING ERRCODE = '40001';
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_offer(
    p_organization_id varchar, p_offer_id varchar, p_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".offer SET is_deleted = true,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = version_no + 1
    WHERE offer_id = p_offer_id AND organization_id = p_organization_id
      AND is_deleted = false AND version_no = p_version_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not found or changed since load' USING ERRCODE = '40001';
    END IF;
    UPDATE "${schemaName}".offer_usage_rule SET is_deleted = true,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = version_no + 1
    WHERE offer_id = p_offer_id AND is_deleted = false;
    RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_offers(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_offer_rules(varchar, varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_offer_rule(varchar, varchar, varchar, varchar, varchar, integer, integer, time, time, varchar, varchar, date, date, varchar, integer, varchar, boolean) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".delete_organization_offer_rule(varchar, varchar, varchar, integer, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".delete_organization_offer(varchar, varchar, integer, varchar) TO "${appRole}";
