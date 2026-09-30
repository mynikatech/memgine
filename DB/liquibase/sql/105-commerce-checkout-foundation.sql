-- Generic provider-neutral checkout persistence. Existing payment and redemption execution remain unchanged.

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_transactions (
    commerce_transaction_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    customer_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    subscription_id varchar(64) REFERENCES "${schemaName}".subscriptions(subscription_id),
    integration_configuration_id varchar(64) REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    source_channel varchar(32) NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'DRAFT',
    currency_code varchar(3),
    subtotal_minor bigint CHECK (subtotal_minor >= 0),
    adjustment_total_minor bigint CHECK (adjustment_total_minor >= 0),
    tax_total_minor bigint CHECK (tax_total_minor >= 0),
    total_minor bigint CHECK (total_minor >= 0),
    provider_order_id varchar(160),
    provider_transaction_id varchar(160),
    idempotency_key varchar(128) NOT NULL,
    failure_code varchar(80),
    failure_message varchar(500),
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_commerce_transactions_status CHECK (status IN ('DRAFT','READY_FOR_PROVIDER','PROVIDER_IN_PROGRESS','PROVIDER_SUCCEEDED','PROVIDER_FAILED','FULFILLMENT_PENDING','COMPLETED','CANCELLED')),
    CONSTRAINT ck_commerce_transactions_currency CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_commerce_transactions_source CHECK (length(btrim(source_channel)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_transactions_org_idempotency
    ON "${schemaName}".commerce_transactions (organization_id, idempotency_key) WHERE NOT is_deleted;
CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_transactions_provider_order
    ON "${schemaName}".commerce_transactions (integration_configuration_id, provider_order_id)
    WHERE provider_order_id IS NOT NULL AND NOT is_deleted;
CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_transactions_provider_transaction
    ON "${schemaName}".commerce_transactions (integration_configuration_id, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL AND NOT is_deleted;
CREATE INDEX IF NOT EXISTS ix_commerce_transactions_org_status
    ON "${schemaName}".commerce_transactions (organization_id, status, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS ix_commerce_transactions_customer_subscription
    ON "${schemaName}".commerce_transactions (customer_user_id, subscription_id, created_at DESC) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_transaction_lines (
    commerce_transaction_line_id varchar(64) PRIMARY KEY,
    commerce_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    line_type varchar(32) NOT NULL,
    source_entity_type varchar(32),
    source_entity_id varchar(64),
    commerce_product_mapping_id varchar(64) REFERENCES "${schemaName}".commerce_product_mappings(commerce_product_mapping_id),
    subscription_plan_id varchar(64) REFERENCES "${schemaName}".subscription_plans(subscription_plan_id),
    external_product_id varchar(160),
    external_variant_id varchar(160),
    description varchar(500) NOT NULL,
    quantity integer NOT NULL,
    unit_price_minor_snapshot bigint CHECK (unit_price_minor_snapshot >= 0),
    unit_price_minor_authoritative bigint CHECK (unit_price_minor_authoritative >= 0),
    line_subtotal_minor bigint CHECK (line_subtotal_minor >= 0),
    currency_code varchar(3),
    price_source varchar(32) NOT NULL,
    metadata_json jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_commerce_transaction_lines_type CHECK (line_type IN ('EXTERNAL_PRODUCT','MEMBERSHIP','CUSTOM_ITEM')),
    CONSTRAINT ck_commerce_transaction_lines_quantity CHECK (quantity > 0),
    CONSTRAINT ck_commerce_transaction_lines_currency CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
    CONSTRAINT ck_commerce_transaction_lines_price_source CHECK (price_source IN ('UNRESOLVED','EXTERNAL_SNAPSHOT','MEMGINE_MEMBERSHIP','PROVIDER_FINAL')),
    CONSTRAINT ck_commerce_transaction_lines_membership CHECK (
      (line_type = 'MEMBERSHIP' AND subscription_plan_id IS NOT NULL AND commerce_product_mapping_id IS NULL)
      OR (line_type <> 'MEMBERSHIP' AND subscription_plan_id IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_commerce_transaction_lines_transaction
    ON "${schemaName}".commerce_transaction_lines (commerce_transaction_id, created_at) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_transaction_adjustments (
    commerce_transaction_adjustment_id varchar(64) PRIMARY KEY,
    commerce_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    target_line_id varchar(64) REFERENCES "${schemaName}".commerce_transaction_lines(commerce_transaction_line_id),
    commerce_adjustment_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_adjustments(commerce_adjustment_id),
    source_type varchar(16) NOT NULL,
    source_id varchar(64) NOT NULL,
    adjustment_type varchar(32) NOT NULL,
    percentage numeric(5,2),
    requested_amount_minor bigint CHECK (requested_amount_minor >= 0),
    applied_amount_minor bigint CHECK (applied_amount_minor >= 0),
    currency_code varchar(3),
    status varchar(16) NOT NULL DEFAULT 'REQUESTED',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_commerce_transaction_adjustments_source CHECK (source_type IN ('BENEFIT','OFFER')),
    CONSTRAINT ck_commerce_transaction_adjustments_type CHECK (adjustment_type IN ('PRODUCT_FREE','PRODUCT_PERCENT_OFF','PRODUCT_FIXED_OFF','PRODUCT_SPECIAL_PRICE','ORDER_PERCENT_OFF','ORDER_FIXED_OFF')),
    CONSTRAINT ck_commerce_transaction_adjustments_status CHECK (status IN ('REQUESTED','APPLIED','REJECTED')),
    CONSTRAINT ck_commerce_transaction_adjustments_currency CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);
CREATE INDEX IF NOT EXISTS ix_commerce_transaction_adjustments_transaction
    ON "${schemaName}".commerce_transaction_adjustments (commerce_transaction_id) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_transaction_redemptions (
    commerce_transaction_redemption_id varchar(64) PRIMARY KEY,
    commerce_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    redemption_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".redemption_transaction(redemption_transaction_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_transaction_redemptions_active
    ON "${schemaName}".commerce_transaction_redemptions (commerce_transaction_id, redemption_transaction_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS ix_commerce_transaction_redemptions_redemption
    ON "${schemaName}".commerce_transaction_redemptions (redemption_transaction_id) WHERE NOT is_deleted;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_actor_organization_user(p_organization_id varchar, p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT organization_user_id INTO v_id FROM organization_user
    WHERE organization_id=p_organization_id AND user_id=p_actor_user_id AND NOT is_deleted LIMIT 1;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Organization membership not found' USING ERRCODE='42501'; END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_create_transaction(
 p_organization_id varchar,p_store_id varchar,p_customer_user_id varchar,p_subscription_id varchar,
 p_integration_configuration_id varchar,p_source_channel varchar,p_idempotency_key varchar,p_actor_user_id varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_actor varchar(64); v_id varchar(64);
BEGIN
    v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id);
    IF NULLIF(btrim(p_source_channel),'') IS NULL OR length(p_source_channel)>32 OR NULLIF(btrim(p_idempotency_key),'') IS NULL OR length(p_idempotency_key)>128 THEN RAISE EXCEPTION 'Invalid commerce transaction' USING ERRCODE='22023'; END IF;
    SELECT commerce_transaction_id INTO v_id FROM commerce_transactions WHERE organization_id=p_organization_id AND idempotency_key=p_idempotency_key AND NOT is_deleted FOR UPDATE;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM stores WHERE store_id=p_store_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Store is not in organization' USING ERRCODE='23503'; END IF;
    IF p_customer_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_user ou JOIN organization_user_types ot ON ot.organization_user_type_id=ou.organization_user_type_id WHERE ou.organization_id=p_organization_id AND ou.user_id=p_customer_user_id AND ot.organization_user_type_code='CUSTOMER' AND NOT ou.is_deleted) THEN RAISE EXCEPTION 'Customer is not in organization' USING ERRCODE='23503'; END IF;
    IF p_subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id WHERE s.subscription_id=p_subscription_id AND ou.organization_id=p_organization_id AND NOT s.is_deleted AND NOT ou.is_deleted) THEN RAISE EXCEPTION 'Subscription is not in organization' USING ERRCODE='23503'; END IF;
    IF p_integration_configuration_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM integration_configurations c JOIN integration_types it ON it.integration_type_id=c.integration_type_id WHERE c.integration_configuration_id=p_integration_configuration_id AND c.organization_id=p_organization_id AND NOT c.is_deleted AND NOT it.is_deleted AND it.integration_type_code IN ('POS','ECOMMERCE')) THEN RAISE EXCEPTION 'Commerce integration is not in organization' USING ERRCODE='23503'; END IF;
    v_id:=generate_runtime_id('CTX');
    INSERT INTO commerce_transactions(commerce_transaction_id,organization_id,store_id,customer_user_id,subscription_id,integration_configuration_id,source_channel,idempotency_key,created_by,updated_by)
    VALUES(v_id,p_organization_id,p_store_id,p_customer_user_id,p_subscription_id,p_integration_configuration_id,upper(p_source_channel),p_idempotency_key,v_actor,v_actor);
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_add_external_product_line(p_transaction_id varchar,p_mapping_id varchar,p_quantity integer,p_description varchar,p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; m commerce_product_mappings%ROWTYPE; v_actor varchar(64); v_id varchar(64); s record;
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF;
 v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id); IF t.status<>'DRAFT' THEN RAISE EXCEPTION 'Commerce transaction is not editable' USING ERRCODE='23505'; END IF;
 IF p_quantity IS NULL OR p_quantity<1 OR NULLIF(btrim(p_description),'') IS NULL OR length(p_description)>500 THEN RAISE EXCEPTION 'Invalid commerce line' USING ERRCODE='22023'; END IF;
 SELECT * INTO m FROM commerce_product_mappings WHERE commerce_product_mapping_id=p_mapping_id AND organization_id=t.organization_id AND is_active AND NOT is_deleted; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce product mapping is unavailable' USING ERRCODE='23503'; END IF;
 SELECT product_name,currency_code,unit_price_minor_snapshot INTO s FROM commerce_product_snapshots WHERE organization_id=t.organization_id AND integration_configuration_id=m.integration_configuration_id AND COALESCE(store_id,'')=COALESCE(m.store_id,'') AND external_product_id=m.external_product_id AND COALESCE(external_variant_id,'')=COALESCE(m.external_variant_id,'') AND is_active AND NOT is_deleted ORDER BY last_synced_at DESC LIMIT 1;
 v_id:=generate_runtime_id('CTL');
 INSERT INTO commerce_transaction_lines(commerce_transaction_line_id,commerce_transaction_id,line_type,commerce_product_mapping_id,external_product_id,external_variant_id,description,quantity,unit_price_minor_snapshot,currency_code,price_source,created_by,updated_by)
 VALUES(v_id,t.commerce_transaction_id,'EXTERNAL_PRODUCT',m.commerce_product_mapping_id,m.external_product_id,m.external_variant_id,COALESCE(NULLIF(btrim(p_description),''),s.product_name),p_quantity,s.unit_price_minor_snapshot,s.currency_code,CASE WHEN s.unit_price_minor_snapshot IS NULL THEN 'UNRESOLVED' ELSE 'EXTERNAL_SNAPSHOT' END,v_actor,v_actor);
 RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_add_membership_line(p_transaction_id varchar,p_subscription_plan_id varchar,p_quantity integer,p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64); v_id varchar(64); v_price numeric(12,2); v_currency varchar(3); v_name varchar(500); v_minor bigint;
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF;
 v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id); IF t.status<>'DRAFT' THEN RAISE EXCEPTION 'Commerce transaction is not editable' USING ERRCODE='23505'; END IF; IF p_quantity IS NULL OR p_quantity<>1 THEN RAISE EXCEPTION 'Membership quantity must be one' USING ERRCODE='22023'; END IF;
 SELECT sp.price,cur.currency_code,COALESCE(mp.membership_product_name,'Membership')||' - '||COALESCE(sp.subscription_plan_name,'Plan') INTO v_price,v_currency,v_name FROM subscription_plans sp JOIN membership_products mp ON mp.membership_product_id=sp.membership_product_id JOIN currencies cur ON cur.currency_id=sp.currency_id JOIN entity_status pse ON pse.entity_status_id=sp.subscription_plan_status_id JOIN statuses ps ON ps.status_id=pse.status_id JOIN entity_status mse ON mse.entity_status_id=mp.product_status_id JOIN statuses ms ON ms.status_id=mse.status_id WHERE sp.subscription_plan_id=p_subscription_plan_id AND mp.organization_id=t.organization_id AND NOT sp.is_deleted AND NOT mp.is_deleted AND ps.status_code='ACTIVE' AND ms.status_code='ACTIVE' AND sp.effective_date<=CURRENT_DATE AND (sp.expiry_date IS NULL OR sp.expiry_date>=CURRENT_DATE) AND mp.effective_date<=CURRENT_DATE AND (mp.expiry_date IS NULL OR mp.expiry_date>=CURRENT_DATE);
 IF v_price IS NULL THEN RAISE EXCEPTION 'Membership plan is unavailable' USING ERRCODE='23503'; END IF;
 v_minor:=round(v_price*100)::bigint; v_id:=generate_runtime_id('CTL');
 INSERT INTO commerce_transaction_lines(commerce_transaction_line_id,commerce_transaction_id,line_type,subscription_plan_id,description,quantity,unit_price_minor_authoritative,line_subtotal_minor,currency_code,price_source,created_by,updated_by)
 VALUES(v_id,t.commerce_transaction_id,'MEMBERSHIP',p_subscription_plan_id,v_name,1,v_minor,v_minor,v_currency,'MEMGINE_MEMBERSHIP',v_actor,v_actor);
 RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_attach_redemption(p_transaction_id varchar,p_redemption_transaction_id varchar,p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; r redemption_transaction%ROWTYPE; v_actor varchar(64); v_id varchar(64);
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF; v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id); IF t.status<>'DRAFT' THEN RAISE EXCEPTION 'Commerce transaction is not editable' USING ERRCODE='23505'; END IF;
 SELECT * INTO r FROM redemption_transaction WHERE redemption_transaction_id=p_redemption_transaction_id AND organization_id=t.organization_id FOR UPDATE; IF NOT FOUND OR r.status<>'PENDING' THEN RAISE EXCEPTION 'Pending redemption transaction is unavailable' USING ERRCODE='23503'; END IF; IF t.subscription_id IS NOT NULL AND r.subscription_id<>t.subscription_id THEN RAISE EXCEPTION 'Redemption subscription does not match commerce transaction' USING ERRCODE='23503'; END IF;
 SELECT commerce_transaction_redemption_id INTO v_id FROM commerce_transaction_redemptions WHERE commerce_transaction_id=t.commerce_transaction_id AND redemption_transaction_id=r.redemption_transaction_id AND NOT is_deleted; IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 v_id:=generate_runtime_id('CTR'); INSERT INTO commerce_transaction_redemptions(commerce_transaction_redemption_id,commerce_transaction_id,redemption_transaction_id,created_by,updated_by) VALUES(v_id,t.commerce_transaction_id,r.redemption_transaction_id,v_actor,v_actor); RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_materialize_adjustment(p_transaction_id varchar,p_source_type varchar,p_source_id varchar,p_target_line_id varchar,p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64); a commerce_adjustments%ROWTYPE; v_id varchar(64); l commerce_transaction_lines%ROWTYPE;
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF; v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id); IF t.status<>'DRAFT' THEN RAISE EXCEPTION 'Commerce transaction is not editable' USING ERRCODE='23505'; END IF;
 IF upper(p_source_type)='BENEFIT' THEN SELECT a0.* INTO a FROM benefit_commerce_adjustments x JOIN commerce_adjustments a0 ON a0.commerce_adjustment_id=x.commerce_adjustment_id WHERE x.organization_id=t.organization_id AND x.benefit_id=p_source_id AND NOT x.is_deleted AND a0.is_active AND NOT a0.is_deleted; ELSIF upper(p_source_type)='OFFER' THEN SELECT a0.* INTO a FROM offer_commerce_adjustments x JOIN commerce_adjustments a0 ON a0.commerce_adjustment_id=x.commerce_adjustment_id WHERE x.organization_id=t.organization_id AND x.offer_id=p_source_id AND NOT x.is_deleted AND a0.is_active AND NOT a0.is_deleted; ELSE RAISE EXCEPTION 'Invalid adjustment source' USING ERRCODE='22023'; END IF;
 IF a.commerce_adjustment_id IS NULL THEN RAISE EXCEPTION 'Commerce adjustment is unavailable' USING ERRCODE='23503'; END IF;
 IF a.adjustment_type LIKE 'PRODUCT_%' THEN SELECT * INTO l FROM commerce_transaction_lines WHERE commerce_transaction_line_id=p_target_line_id AND commerce_transaction_id=t.commerce_transaction_id AND NOT is_deleted; IF NOT FOUND OR l.commerce_product_mapping_id IS NULL OR NOT EXISTS(SELECT 1 FROM commerce_adjustment_product_mappings WHERE commerce_adjustment_id=a.commerce_adjustment_id AND commerce_product_mapping_id=l.commerce_product_mapping_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Product adjustment does not apply to transaction line' USING ERRCODE='23503'; END IF; ELSE IF p_target_line_id IS NOT NULL THEN RAISE EXCEPTION 'Order adjustment must not target a line' USING ERRCODE='22023'; END IF; END IF;
 v_id:=generate_runtime_id('CTA'); INSERT INTO commerce_transaction_adjustments(commerce_transaction_adjustment_id,commerce_transaction_id,target_line_id,commerce_adjustment_id,source_type,source_id,adjustment_type,percentage,requested_amount_minor,currency_code,created_by,updated_by) VALUES(v_id,t.commerce_transaction_id,p_target_line_id,a.commerce_adjustment_id,upper(p_source_type),p_source_id,a.adjustment_type,a.percentage,CASE WHEN a.amount_minor IS NULL THEN NULL ELSE a.amount_minor END,a.currency_code,v_actor,v_actor); RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_mark_ready(p_transaction_id varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64); v_currency varchar(3); v_subtotal bigint;
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF; v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id); IF t.status<>'DRAFT' THEN RETURN t.status='READY_FOR_PROVIDER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM commerce_transaction_lines WHERE commerce_transaction_id=t.commerce_transaction_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Commerce transaction requires one or more lines' USING ERRCODE='22023'; END IF;
 SELECT min(currency_code),COALESCE(sum(line_subtotal_minor),0) INTO v_currency,v_subtotal FROM commerce_transaction_lines WHERE commerce_transaction_id=t.commerce_transaction_id AND NOT is_deleted AND price_source='MEMGINE_MEMBERSHIP';
 UPDATE commerce_transactions SET status='READY_FOR_PROVIDER',currency_code=v_currency,subtotal_minor=v_subtotal,adjustment_total_minor=0,tax_total_minor=NULL,total_minor=NULL,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_transaction(p_organization_id varchar,p_transaction_id varchar,p_actor_user_id varchar)
RETURNS TABLE("transactionId" varchar,"organizationId" varchar,"storeId" varchar,"customerUserId" varchar,"subscriptionId" varchar,"integrationConfigurationId" varchar,"sourceChannel" varchar,status varchar,"currencyCode" varchar,"subtotalMinor" bigint,"adjustmentTotalMinor" bigint,"taxTotalMinor" bigint,"totalMinor" bigint,"providerOrderId" varchar,"providerTransactionId" varchar,"idempotencyKey" varchar,"failureCode" varchar,"failureMessage" varchar,"createdAt" text,"updatedAt" text,"completedAt" text,"versionNo" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT t.commerce_transaction_id,t.organization_id,t.store_id,t.customer_user_id,t.subscription_id,t.integration_configuration_id,t.source_channel,t.status,t.currency_code,t.subtotal_minor,t.adjustment_total_minor,t.tax_total_minor,t.total_minor,t.provider_order_id,t.provider_transaction_id,t.idempotency_key,t.failure_code,t.failure_message,t.created_at::text,t.updated_at::text,t.completed_at::text,t.version_no FROM commerce_transactions t WHERE t.organization_id=p_organization_id AND t.commerce_transaction_id=p_transaction_id AND NOT t.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_transaction_lines(p_organization_id varchar,p_transaction_id varchar,p_actor_user_id varchar)
RETURNS TABLE("lineId" varchar,"transactionId" varchar,"lineType" varchar,"sourceEntityType" varchar,"sourceEntityId" varchar,"productMappingId" varchar,"subscriptionPlanId" varchar,"externalProductId" varchar,"externalVariantId" varchar,description varchar,quantity integer,"unitPriceMinorSnapshot" bigint,"unitPriceMinorAuthoritative" bigint,"lineSubtotalMinor" bigint,"currencyCode" varchar,"priceSource" varchar,"metadataJson" text,"versionNo" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT l.commerce_transaction_line_id,l.commerce_transaction_id,l.line_type,l.source_entity_type,l.source_entity_id,l.commerce_product_mapping_id,l.subscription_plan_id,l.external_product_id,l.external_variant_id,l.description,l.quantity,l.unit_price_minor_snapshot,l.unit_price_minor_authoritative,l.line_subtotal_minor,l.currency_code,l.price_source,l.metadata_json::text,l.version_no FROM commerce_transaction_lines l JOIN commerce_transactions t ON t.commerce_transaction_id=l.commerce_transaction_id WHERE l.commerce_transaction_id=p_transaction_id AND t.organization_id=p_organization_id AND NOT l.is_deleted AND NOT t.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id) ORDER BY l.created_at,l.commerce_transaction_line_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_transaction_adjustments(p_organization_id varchar,p_transaction_id varchar,p_actor_user_id varchar)
RETURNS TABLE("adjustmentId" varchar,"transactionId" varchar,"targetLineId" varchar,"commerceAdjustmentId" varchar,"sourceType" varchar,"sourceId" varchar,"adjustmentType" varchar,percentage double precision,"requestedAmountMinor" bigint,"appliedAmountMinor" bigint,"currencyCode" varchar,status varchar,"versionNo" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT a.commerce_transaction_adjustment_id,a.commerce_transaction_id,a.target_line_id,a.commerce_adjustment_id,a.source_type,a.source_id,a.adjustment_type,a.percentage::double precision,a.requested_amount_minor,a.applied_amount_minor,a.currency_code,a.status,a.version_no FROM commerce_transaction_adjustments a JOIN commerce_transactions t ON t.commerce_transaction_id=a.commerce_transaction_id WHERE a.commerce_transaction_id=p_transaction_id AND t.organization_id=p_organization_id AND NOT a.is_deleted AND NOT t.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id) ORDER BY a.created_at,a.commerce_transaction_adjustment_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_transaction_redemptions(p_organization_id varchar,p_transaction_id varchar,p_actor_user_id varchar)
RETURNS TABLE("associationId" varchar,"transactionId" varchar,"redemptionTransactionId" varchar,"redemptionStatus" varchar,"versionNo" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT x.commerce_transaction_redemption_id,x.commerce_transaction_id,x.redemption_transaction_id,r.status,x.version_no FROM commerce_transaction_redemptions x JOIN commerce_transactions t ON t.commerce_transaction_id=x.commerce_transaction_id JOIN redemption_transaction r ON r.redemption_transaction_id=x.redemption_transaction_id WHERE x.commerce_transaction_id=p_transaction_id AND t.organization_id=p_organization_id AND NOT x.is_deleted AND NOT t.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id) ORDER BY x.created_at,x.commerce_transaction_redemption_id;
$function$;

REVOKE ALL ON TABLE "${schemaName}".commerce_transactions,"${schemaName}".commerce_transaction_lines,"${schemaName}".commerce_transaction_adjustments,"${schemaName}".commerce_transaction_redemptions FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_actor_organization_user(varchar,varchar),"${schemaName}".commerce_create_transaction(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".commerce_add_external_product_line(varchar,varchar,integer,varchar,varchar),"${schemaName}".commerce_add_membership_line(varchar,varchar,integer,varchar),"${schemaName}".commerce_attach_redemption(varchar,varchar,varchar),"${schemaName}".commerce_materialize_adjustment(varchar,varchar,varchar,varchar,varchar),"${schemaName}".commerce_mark_ready(varchar,varchar),"${schemaName}".commerce_get_transaction(varchar,varchar,varchar),"${schemaName}".commerce_get_transaction_lines(varchar,varchar,varchar),"${schemaName}".commerce_get_transaction_adjustments(varchar,varchar,varchar),"${schemaName}".commerce_get_transaction_redemptions(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_create_transaction(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".commerce_add_external_product_line(varchar,varchar,integer,varchar,varchar),"${schemaName}".commerce_add_membership_line(varchar,varchar,integer,varchar),"${schemaName}".commerce_attach_redemption(varchar,varchar,varchar),"${schemaName}".commerce_materialize_adjustment(varchar,varchar,varchar,varchar,varchar),"${schemaName}".commerce_mark_ready(varchar,varchar),"${schemaName}".commerce_get_transaction(varchar,varchar,varchar),"${schemaName}".commerce_get_transaction_lines(varchar,varchar,varchar),"${schemaName}".commerce_get_transaction_adjustments(varchar,varchar,varchar),"${schemaName}".commerce_get_transaction_redemptions(varchar,varchar,varchar) TO "${appRole}";
-- Internal orchestration state changes. There is deliberately no public provider-result route in Phase 2.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_provider_result(
 p_transaction_id varchar,p_provider_status varchar,p_provider_order_id varchar,p_provider_transaction_id varchar,
 p_subtotal_minor bigint,p_adjustment_total_minor bigint,p_tax_total_minor bigint,p_total_minor bigint,p_currency_code varchar,
 p_failure_code varchar,p_failure_message varchar,p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64); v_next varchar(32);
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF;
 v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id);
 IF t.status IN ('COMPLETED','CANCELLED') THEN RETURN false; END IF;
 IF upper(p_provider_status)='SUCCEEDED' THEN v_next:='PROVIDER_SUCCEEDED';
 ELSIF upper(p_provider_status)='FAILED' THEN v_next:='PROVIDER_FAILED';
 ELSIF upper(p_provider_status) IN ('IN_PROGRESS','PROCESSING') THEN v_next:='PROVIDER_IN_PROGRESS';
 ELSE RAISE EXCEPTION 'Invalid provider status' USING ERRCODE='22023'; END IF;
 IF p_subtotal_minor IS NOT NULL AND p_subtotal_minor<0 OR p_adjustment_total_minor IS NOT NULL AND p_adjustment_total_minor<0 OR p_tax_total_minor IS NOT NULL AND p_tax_total_minor<0 OR p_total_minor IS NOT NULL AND p_total_minor<0 OR p_currency_code IS NOT NULL AND p_currency_code !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid provider totals' USING ERRCODE='22023'; END IF;
 UPDATE commerce_transactions SET status=v_next,provider_order_id=COALESCE(p_provider_order_id,provider_order_id),provider_transaction_id=COALESCE(p_provider_transaction_id,provider_transaction_id),subtotal_minor=COALESCE(p_subtotal_minor,subtotal_minor),adjustment_total_minor=COALESCE(p_adjustment_total_minor,adjustment_total_minor),tax_total_minor=COALESCE(p_tax_total_minor,tax_total_minor),total_minor=COALESCE(p_total_minor,total_minor),currency_code=COALESCE(p_currency_code,currency_code),failure_code=CASE WHEN v_next='PROVIDER_FAILED' THEN p_failure_code ELSE NULL END,failure_message=CASE WHEN v_next='PROVIDER_FAILED' THEN p_failure_message ELSE NULL END,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_mark_fulfillment_pending(p_transaction_id varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64);
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF; v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id);
 IF t.status='COMPLETED' THEN RETURN true; END IF;
 IF t.status NOT IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING') THEN RAISE EXCEPTION 'Provider checkout has not succeeded' USING ERRCODE='23505'; END IF;
 UPDATE commerce_transactions SET status='FULFILLMENT_PENDING',updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_complete_fulfillment(p_transaction_id varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64);
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF; v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id);
 IF t.status='COMPLETED' THEN RETURN true; END IF;
 IF t.status<>'FULFILLMENT_PENDING' THEN RAISE EXCEPTION 'Commerce fulfillment is not pending' USING ERRCODE='23505'; END IF;
 UPDATE commerce_transactions SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_record_provider_result(varchar,varchar,varchar,varchar,bigint,bigint,bigint,bigint,varchar,varchar,varchar,varchar),"${schemaName}".commerce_mark_fulfillment_pending(varchar,varchar),"${schemaName}".commerce_complete_fulfillment(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_record_provider_result(varchar,varchar,varchar,varchar,bigint,bigint,bigint,bigint,varchar,varchar,varchar,varchar),"${schemaName}".commerce_mark_fulfillment_pending(varchar,varchar),"${schemaName}".commerce_complete_fulfillment(varchar,varchar) TO "${appRole}";
