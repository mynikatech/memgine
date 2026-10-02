-- Separate membership-sale offer applicability. It deliberately does not alter
-- legacy offer.membership_product_id or POS Commerce offer applicability.

CREATE TABLE IF NOT EXISTS "${schemaName}".membership_offer_applicability (
    membership_offer_applicability_id varchar(64) PRIMARY KEY,
    offer_id varchar(64) NOT NULL REFERENCES "${schemaName}".offer(offer_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    behavior varchar(32) NOT NULL,
    target_membership_product_id varchar(64) NOT NULL REFERENCES "${schemaName}".membership_products(membership_product_id),
    target_subscription_plan_id varchar(64) REFERENCES "${schemaName}".subscription_plans(subscription_plan_id),
    source_membership_product_id varchar(64) REFERENCES "${schemaName}".membership_products(membership_product_id),
    source_subscription_plan_id varchar(64) REFERENCES "${schemaName}".subscription_plans(subscription_plan_id),
    adjustment_type varchar(32) NOT NULL,
    percentage numeric(5,2),
    amount_minor bigint,
    currency_code varchar(3),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_membership_offer_behavior CHECK (behavior IN ('PURCHASE_DISCOUNT', 'UPGRADE')),
    CONSTRAINT ck_membership_offer_adjustment CHECK (
        (adjustment_type = 'PRODUCT_PERCENT_OFF' AND percentage > 0 AND percentage <= 100 AND amount_minor IS NULL AND currency_code IS NULL)
        OR (adjustment_type = 'PRODUCT_FIXED_OFF' AND percentage IS NULL AND amount_minor > 0 AND currency_code ~ '^[A-Z]{3}$')
        OR (adjustment_type = 'PRODUCT_SPECIAL_PRICE' AND percentage IS NULL AND amount_minor >= 0 AND currency_code ~ '^[A-Z]{3}$')
    ),
    CONSTRAINT ck_membership_offer_source CHECK (
        (behavior = 'PURCHASE_DISCOUNT' AND source_membership_product_id IS NULL AND source_subscription_plan_id IS NULL)
        OR behavior = 'UPGRADE'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_membership_offer_applicability_offer
    ON "${schemaName}".membership_offer_applicability (offer_id)
    WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS ix_membership_offer_applicability_target
    ON "${schemaName}".membership_offer_applicability (organization_id, target_membership_product_id)
    WHERE NOT is_deleted AND is_active;

CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_offer_applicability(
    p_organization_id varchar, p_offer_id varchar, p_actor_user_id varchar
) RETURNS TABLE(
    "applicabilityId" varchar, "offerId" varchar, behavior varchar,
    "targetMembershipProductId" varchar, "targetSubscriptionPlanId" varchar,
    "sourceMembershipProductId" varchar, "sourceSubscriptionPlanId" varchar,
    "adjustmentType" varchar, percentage double precision, "amountMinor" bigint,
    "currencyCode" varchar, active boolean, "versionNo" integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT a.membership_offer_applicability_id, a.offer_id, a.behavior,
           a.target_membership_product_id, a.target_subscription_plan_id,
           a.source_membership_product_id, a.source_subscription_plan_id,
           a.adjustment_type, a.percentage::double precision, a.amount_minor,
           a.currency_code, a.is_active, a.version_no
      FROM membership_offer_applicability a
      JOIN offer o ON o.offer_id = a.offer_id
     WHERE a.organization_id = p_organization_id AND a.offer_id = p_offer_id
       AND NOT a.is_deleted AND NOT o.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_membership_offer_applicability(
    p_organization_id varchar, p_offer_id varchar, p_behavior varchar,
    p_target_membership_product_id varchar, p_target_subscription_plan_id varchar,
    p_source_membership_product_id varchar, p_source_subscription_plan_id varchar,
    p_adjustment_type varchar, p_percentage numeric, p_amount_minor bigint,
    p_currency_code varchar, p_active boolean, p_actor_user_id varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_id varchar(64); v_actor_organization_user_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    SELECT organization_user_id INTO v_actor_organization_user_id FROM organization_user
     WHERE organization_id = p_organization_id AND user_id = p_actor_user_id AND NOT is_deleted LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN RAISE EXCEPTION 'Actor is not an organization user' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM offer WHERE offer_id=p_offer_id AND organization_id=p_organization_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Offer is not in organization' USING ERRCODE='23503';
    END IF;
    IF p_behavior NOT IN ('PURCHASE_DISCOUNT','UPGRADE') OR p_adjustment_type NOT IN ('PRODUCT_PERCENT_OFF','PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE') THEN
        RAISE EXCEPTION 'Invalid membership offer applicability' USING ERRCODE='22023';
    END IF;
    IF (p_adjustment_type='PRODUCT_PERCENT_OFF' AND (p_percentage IS NULL OR p_percentage<=0 OR p_percentage>100 OR p_amount_minor IS NOT NULL OR p_currency_code IS NOT NULL))
       OR (p_adjustment_type='PRODUCT_FIXED_OFF' AND (p_percentage IS NOT NULL OR p_amount_minor IS NULL OR p_amount_minor<=0 OR upper(coalesce(p_currency_code,'')) !~ '^[A-Z]{3}$'))
       OR (p_adjustment_type='PRODUCT_SPECIAL_PRICE' AND (p_percentage IS NOT NULL OR p_amount_minor IS NULL OR p_amount_minor<0 OR upper(coalesce(p_currency_code,'')) !~ '^[A-Z]{3}$')) THEN
        RAISE EXCEPTION 'Invalid membership offer adjustment value' USING ERRCODE='22023';
    END IF;
    IF p_behavior='PURCHASE_DISCOUNT' AND (p_source_membership_product_id IS NOT NULL OR p_source_subscription_plan_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Purchase discount cannot have an upgrade source' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM membership_products mp JOIN entity_status es ON es.entity_status_id=mp.product_status_id JOIN statuses st ON st.status_id=es.status_id WHERE mp.membership_product_id=p_target_membership_product_id AND mp.organization_id=p_organization_id AND NOT mp.is_deleted AND es.is_active AND st.status_code='ACTIVE') THEN
        RAISE EXCEPTION 'Target membership product is invalid' USING ERRCODE='23503';
    END IF;
    IF p_target_subscription_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subscription_plans sp JOIN membership_products mp ON mp.membership_product_id=sp.membership_product_id WHERE sp.subscription_plan_id=p_target_subscription_plan_id AND sp.membership_product_id=p_target_membership_product_id AND mp.organization_id=p_organization_id AND NOT sp.is_deleted AND NOT mp.is_deleted AND EXISTS (SELECT 1 FROM entity_status es JOIN statuses st ON st.status_id=es.status_id WHERE es.entity_status_id=mp.product_status_id AND es.is_active AND st.status_code='ACTIVE') AND EXISTS (SELECT 1 FROM entity_status es JOIN statuses st ON st.status_id=es.status_id WHERE es.entity_status_id=sp.subscription_plan_status_id AND es.is_active AND st.status_code='ACTIVE')) THEN
        RAISE EXCEPTION 'Target subscription plan is invalid' USING ERRCODE='23503';
    END IF;
    IF p_behavior='UPGRADE' AND p_source_membership_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM membership_products mp JOIN entity_status es ON es.entity_status_id=mp.product_status_id JOIN statuses st ON st.status_id=es.status_id WHERE mp.membership_product_id=p_source_membership_product_id AND mp.organization_id=p_organization_id AND NOT mp.is_deleted AND es.is_active AND st.status_code='ACTIVE') THEN
        RAISE EXCEPTION 'Source membership product is invalid' USING ERRCODE='23503';
    END IF;
    IF p_source_subscription_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subscription_plans sp JOIN membership_products mp ON mp.membership_product_id=sp.membership_product_id WHERE sp.subscription_plan_id=p_source_subscription_plan_id AND sp.membership_product_id=p_source_membership_product_id AND mp.organization_id=p_organization_id AND NOT sp.is_deleted AND NOT mp.is_deleted AND EXISTS (SELECT 1 FROM entity_status es JOIN statuses st ON st.status_id=es.status_id WHERE es.entity_status_id=mp.product_status_id AND es.is_active AND st.status_code='ACTIVE') AND EXISTS (SELECT 1 FROM entity_status es JOIN statuses st ON st.status_id=es.status_id WHERE es.entity_status_id=sp.subscription_plan_status_id AND es.is_active AND st.status_code='ACTIVE')) THEN
        RAISE EXCEPTION 'Source subscription plan is invalid' USING ERRCODE='23503';
    END IF;
    IF p_behavior='UPGRADE' AND p_source_membership_product_id IS NOT NULL AND p_source_membership_product_id=p_target_membership_product_id AND coalesce(p_source_subscription_plan_id,'')=coalesce(p_target_subscription_plan_id,'') THEN
        RAISE EXCEPTION 'Source and target membership cannot be identical' USING ERRCODE='22023';
    END IF;
    SELECT membership_offer_applicability_id INTO v_id FROM membership_offer_applicability WHERE offer_id=p_offer_id AND NOT is_deleted FOR UPDATE;
    IF v_id IS NULL THEN
        v_id:=generate_runtime_id('MOA');
        INSERT INTO membership_offer_applicability(membership_offer_applicability_id,offer_id,organization_id,behavior,target_membership_product_id,target_subscription_plan_id,source_membership_product_id,source_subscription_plan_id,adjustment_type,percentage,amount_minor,currency_code,is_active,created_by,updated_by)
        VALUES(v_id,p_offer_id,p_organization_id,p_behavior,p_target_membership_product_id,p_target_subscription_plan_id,p_source_membership_product_id,p_source_subscription_plan_id,p_adjustment_type,p_percentage,p_amount_minor,upper(p_currency_code),coalesce(p_active,true),v_actor_organization_user_id,v_actor_organization_user_id);
    ELSE
        UPDATE membership_offer_applicability SET behavior=p_behavior,target_membership_product_id=p_target_membership_product_id,target_subscription_plan_id=p_target_subscription_plan_id,source_membership_product_id=p_source_membership_product_id,source_subscription_plan_id=p_source_subscription_plan_id,adjustment_type=p_adjustment_type,percentage=p_percentage,amount_minor=p_amount_minor,currency_code=upper(p_currency_code),is_active=coalesce(p_active,true),updated_at=CURRENT_TIMESTAMP,updated_by=v_actor_organization_user_id,version_no=version_no+1 WHERE membership_offer_applicability_id=v_id;
    END IF;
    RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_membership_offer_applicability(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_membership_offer_applicability(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar) FROM PUBLIC;
DO $grant$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${appRole}') THEN
  GRANT EXECUTE ON FUNCTION "${schemaName}".get_membership_offer_applicability(varchar,varchar,varchar) TO "${appRole}";
  GRANT EXECUTE ON FUNCTION "${schemaName}".save_membership_offer_applicability(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar) TO "${appRole}";
 END IF;
END $grant$;
