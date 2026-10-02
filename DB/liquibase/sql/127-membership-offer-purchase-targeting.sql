ALTER TABLE "${schemaName}".membership_offer_applicability
    ADD COLUMN IF NOT EXISTS customer_applicability varchar(32) NOT NULL DEFAULT 'ALL',
    ADD COLUMN IF NOT EXISTS membership_target_mode varchar(32) NOT NULL DEFAULT 'ALL_MEMBERSHIP_PRODUCTS';

ALTER TABLE "${schemaName}".membership_offer_applicability
    ALTER COLUMN target_membership_product_id DROP NOT NULL;

ALTER TABLE "${schemaName}".membership_offer_applicability
    DROP CONSTRAINT IF EXISTS ck_membership_offer_customer_applicability,
    ADD CONSTRAINT ck_membership_offer_customer_applicability
        CHECK (customer_applicability IN ('ALL', 'NEW_CUSTOMER', 'EXISTING_CUSTOMER')),
    DROP CONSTRAINT IF EXISTS ck_membership_offer_target_mode,
    ADD CONSTRAINT ck_membership_offer_target_mode
        CHECK (membership_target_mode IN ('ALL_MEMBERSHIP_PRODUCTS', 'SELECTED_MEMBERSHIP_PRODUCTS'));

CREATE TABLE IF NOT EXISTS "${schemaName}".membership_offer_applicability_products (
    membership_offer_applicability_product_id varchar(64) PRIMARY KEY,
    membership_offer_applicability_id varchar(64) NOT NULL REFERENCES "${schemaName}".membership_offer_applicability(membership_offer_applicability_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    membership_product_id varchar(64) NOT NULL REFERENCES "${schemaName}".membership_products(membership_product_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_membership_offer_applicability_products_active
    ON "${schemaName}".membership_offer_applicability_products(membership_offer_applicability_id, membership_product_id)
    WHERE NOT is_deleted;

UPDATE "${schemaName}".membership_offer_applicability
   SET customer_applicability = 'ALL',
       membership_target_mode = CASE WHEN behavior = 'PURCHASE_DISCOUNT' AND target_membership_product_id IS NOT NULL THEN 'SELECTED_MEMBERSHIP_PRODUCTS' ELSE 'ALL_MEMBERSHIP_PRODUCTS' END;

INSERT INTO "${schemaName}".membership_offer_applicability_products(
    membership_offer_applicability_product_id, membership_offer_applicability_id, organization_id, membership_product_id, created_by, updated_by
)
SELECT generate_runtime_id('MOAP'), a.membership_offer_applicability_id, a.organization_id, a.target_membership_product_id, a.updated_by, a.updated_by
  FROM "${schemaName}".membership_offer_applicability a
 WHERE a.behavior = 'PURCHASE_DISCOUNT' AND a.target_membership_product_id IS NOT NULL AND NOT a.is_deleted
   AND NOT EXISTS (SELECT 1 FROM "${schemaName}".membership_offer_applicability_products p WHERE p.membership_offer_applicability_id=a.membership_offer_applicability_id AND p.membership_product_id=a.target_membership_product_id AND NOT p.is_deleted);

DROP FUNCTION IF EXISTS "${schemaName}".get_membership_offer_applicability(
    varchar,
    varchar,
    varchar
);
CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_offer_applicability(p_organization_id varchar,p_offer_id varchar,p_actor_user_id varchar)
RETURNS TABLE("applicabilityId" varchar,"offerId" varchar,behavior varchar,"targetMembershipProductId" varchar,"targetSubscriptionPlanId" varchar,"sourceMembershipProductId" varchar,"sourceSubscriptionPlanId" varchar,"adjustmentType" varchar,percentage double precision,"amountMinor" bigint,"currencyCode" varchar,active boolean,"versionNo" integer,"customerApplicability" varchar,"membershipTargetMode" varchar,"selectedMembershipProductIds" varchar[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT a.membership_offer_applicability_id,a.offer_id,a.behavior,a.target_membership_product_id,a.target_subscription_plan_id,a.source_membership_product_id,a.source_subscription_plan_id,a.adjustment_type,a.percentage::double precision,a.amount_minor,a.currency_code,a.is_active,a.version_no,a.customer_applicability,a.membership_target_mode,coalesce(array_agg(p.membership_product_id) FILTER (WHERE NOT p.is_deleted),ARRAY[]::varchar[])
 FROM membership_offer_applicability a JOIN offer o ON o.offer_id=a.offer_id LEFT JOIN membership_offer_applicability_products p ON p.membership_offer_applicability_id=a.membership_offer_applicability_id
 WHERE a.organization_id=p_organization_id AND a.offer_id=p_offer_id AND NOT a.is_deleted AND NOT o.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id)
 GROUP BY a.membership_offer_applicability_id;
$function$;

-- Extend the existing writer with purchase targeting. Upgrade retains directional fields.

DROP FUNCTION IF EXISTS "${schemaName}".save_membership_offer_applicability(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    numeric,
    bigint,
    varchar,
    boolean,
    varchar
);
CREATE OR REPLACE FUNCTION "${schemaName}".save_membership_offer_applicability(p_organization_id varchar,p_offer_id varchar,p_behavior varchar,p_target_membership_product_id varchar,p_target_subscription_plan_id varchar,p_source_membership_product_id varchar,p_source_subscription_plan_id varchar,p_adjustment_type varchar,p_percentage numeric,p_amount_minor bigint,p_currency_code varchar,p_active boolean,p_customer_applicability varchar,p_membership_target_mode varchar,p_selected_membership_product_ids varchar[],p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE v_id varchar(64); v_actor varchar(64); v_product varchar(64);
BEGIN
 IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE='42501'; END IF;
 SELECT organization_user_id INTO v_actor FROM organization_user WHERE organization_id=p_organization_id AND user_id=p_actor_user_id AND NOT is_deleted LIMIT 1;
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM offer WHERE offer_id=p_offer_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Offer is not in organization' USING ERRCODE='42501'; END IF;
 IF p_behavior NOT IN ('PURCHASE_DISCOUNT','UPGRADE') OR p_adjustment_type NOT IN ('PRODUCT_PERCENT_OFF','PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE') OR p_customer_applicability NOT IN ('ALL','NEW_CUSTOMER','EXISTING_CUSTOMER') OR p_membership_target_mode NOT IN ('ALL_MEMBERSHIP_PRODUCTS','SELECTED_MEMBERSHIP_PRODUCTS') THEN RAISE EXCEPTION 'Invalid membership offer applicability' USING ERRCODE='22023'; END IF;
 IF (p_adjustment_type='PRODUCT_PERCENT_OFF' AND (p_percentage IS NULL OR p_percentage<=0 OR p_percentage>100 OR p_amount_minor IS NOT NULL OR p_currency_code IS NOT NULL)) OR (p_adjustment_type='PRODUCT_FIXED_OFF' AND (p_percentage IS NOT NULL OR p_amount_minor IS NULL OR p_amount_minor<=0 OR upper(coalesce(p_currency_code,'')) !~ '^[A-Z]{3}$')) OR (p_adjustment_type='PRODUCT_SPECIAL_PRICE' AND (p_percentage IS NOT NULL OR p_amount_minor IS NULL OR p_amount_minor<0 OR upper(coalesce(p_currency_code,'')) !~ '^[A-Z]{3}$')) THEN RAISE EXCEPTION 'Invalid membership offer adjustment value' USING ERRCODE='22023'; END IF;
 IF p_behavior='PURCHASE_DISCOUNT' AND (p_source_membership_product_id IS NOT NULL OR p_source_subscription_plan_id IS NOT NULL OR (p_membership_target_mode='SELECTED_MEMBERSHIP_PRODUCTS' AND coalesce(cardinality(p_selected_membership_product_ids),0)=0) OR (p_membership_target_mode='ALL_MEMBERSHIP_PRODUCTS' AND coalesce(cardinality(p_selected_membership_product_ids),0)<>0)) THEN RAISE EXCEPTION 'Invalid purchase discount targeting' USING ERRCODE='22023'; END IF;
 IF p_behavior='PURCHASE_DISCOUNT' AND p_target_subscription_plan_id IS NOT NULL AND (coalesce(cardinality(p_selected_membership_product_ids),0)<>1 OR NOT EXISTS(SELECT 1 FROM subscription_plans sp WHERE sp.subscription_plan_id=p_target_subscription_plan_id AND sp.membership_product_id=p_selected_membership_product_ids[1] AND NOT sp.is_deleted)) THEN RAISE EXCEPTION 'Purchase discount plan target is invalid' USING ERRCODE='23503'; END IF;
 IF p_behavior='UPGRADE' AND (p_target_membership_product_id IS NULL OR p_membership_target_mode<>'ALL_MEMBERSHIP_PRODUCTS' OR coalesce(cardinality(p_selected_membership_product_ids),0)<>0) THEN RAISE EXCEPTION 'Invalid upgrade targeting' USING ERRCODE='22023'; END IF;
 IF p_behavior='PURCHASE_DISCOUNT' AND p_selected_membership_product_ids IS NOT NULL AND (cardinality(p_selected_membership_product_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_selected_membership_product_ids) x) OR EXISTS(SELECT 1 FROM unnest(p_selected_membership_product_ids) x WHERE NOT EXISTS(SELECT 1 FROM membership_products mp JOIN entity_status es ON es.entity_status_id=mp.product_status_id JOIN statuses st ON st.status_id=es.status_id WHERE mp.membership_product_id=x AND mp.organization_id=p_organization_id AND NOT mp.is_deleted AND es.is_active AND st.status_code='ACTIVE'))) THEN RAISE EXCEPTION 'Selected membership product is invalid' USING ERRCODE='23503'; END IF;
 SELECT membership_offer_applicability_id INTO v_id FROM membership_offer_applicability WHERE offer_id=p_offer_id AND NOT is_deleted FOR UPDATE;
 IF v_id IS NULL THEN v_id:=generate_runtime_id('MOA'); INSERT INTO membership_offer_applicability(membership_offer_applicability_id,offer_id,organization_id,behavior,target_membership_product_id,target_subscription_plan_id,source_membership_product_id,source_subscription_plan_id,adjustment_type,percentage,amount_minor,currency_code,is_active,customer_applicability,membership_target_mode,created_by,updated_by) VALUES(v_id,p_offer_id,p_organization_id,p_behavior,CASE WHEN p_behavior='UPGRADE' THEN p_target_membership_product_id END,p_target_subscription_plan_id,p_source_membership_product_id,p_source_subscription_plan_id,p_adjustment_type,p_percentage,p_amount_minor,upper(p_currency_code),coalesce(p_active,true),p_customer_applicability,p_membership_target_mode,v_actor,v_actor); ELSE UPDATE membership_offer_applicability SET behavior=p_behavior,target_membership_product_id=CASE WHEN p_behavior='UPGRADE' THEN p_target_membership_product_id END,target_subscription_plan_id=p_target_subscription_plan_id,source_membership_product_id=p_source_membership_product_id,source_subscription_plan_id=p_source_subscription_plan_id,adjustment_type=p_adjustment_type,percentage=p_percentage,amount_minor=p_amount_minor,currency_code=upper(p_currency_code),is_active=coalesce(p_active,true),customer_applicability=p_customer_applicability,membership_target_mode=p_membership_target_mode,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE membership_offer_applicability_id=v_id; END IF;
 UPDATE membership_offer_applicability_products SET is_deleted=true,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE membership_offer_applicability_id=v_id AND NOT is_deleted;
 FOREACH v_product IN ARRAY coalesce(p_selected_membership_product_ids,ARRAY[]::varchar[]) LOOP INSERT INTO membership_offer_applicability_products(membership_offer_applicability_product_id,membership_offer_applicability_id,organization_id,membership_product_id,created_by,updated_by) VALUES(generate_runtime_id('MOAP'),v_id,p_organization_id,v_product,v_actor,v_actor); END LOOP;
 RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".save_membership_offer_applicability(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar,varchar,varchar[],varchar) FROM PUBLIC;
DO $grant$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${appRole}') THEN
  GRANT EXECUTE ON FUNCTION "${schemaName}".get_membership_offer_applicability(varchar,varchar,varchar) TO "${appRole}";
  GRANT EXECUTE ON FUNCTION "${schemaName}".save_membership_offer_applicability(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,bigint,varchar,boolean,varchar,varchar,varchar[],varchar) TO "${appRole}";
 END IF;
END $grant$;
