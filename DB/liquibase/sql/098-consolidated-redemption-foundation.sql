-- Authoritative, server-side redemption basket foundation. Existing

-- counter_redeem_benefits remains intentionally unchanged for compatibility.



CREATE TABLE IF NOT EXISTS "${schemaName}".redemption_transaction (

    redemption_transaction_id varchar(64) PRIMARY KEY,

    redemption_transaction_number varchar(64) NOT NULL,

    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),

    subscription_id varchar(64) NOT NULL REFERENCES "${schemaName}".subscriptions(subscription_id),

    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),

    staff_id varchar(64) REFERENCES "${schemaName}".staff(staff_id),

    redemption_method varchar(64) NOT NULL,

    status varchar(16) NOT NULL,

    expires_at timestamp without time zone,

    completed_at timestamp without time zone,

    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),

    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),

    version_no integer NOT NULL DEFAULT 1,

    CONSTRAINT uq_redemption_transaction_org_number UNIQUE (organization_id, redemption_transaction_number),

    CONSTRAINT ck_redemption_transaction_status CHECK (status IN ('PENDING','SUCCESS','FAILED','EXPIRED','CANCELLED'))

);



CREATE TABLE IF NOT EXISTS "${schemaName}".redemption_transaction_item (

    redemption_transaction_item_id varchar(64) PRIMARY KEY,

    redemption_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".redemption_transaction(redemption_transaction_id) ON DELETE CASCADE,

    item_type varchar(16) NOT NULL,

    benefit_id varchar(64) REFERENCES "${schemaName}".benefits(benefit_id),

    offer_id varchar(64) REFERENCES "${schemaName}".offer(offer_id),

    quantity integer NOT NULL DEFAULT 1,

    status varchar(16) NOT NULL DEFAULT 'PENDING',

    redemption_id varchar(64) REFERENCES "${schemaName}".redemptions(redemption_id),

    offer_redemption_id varchar(64),

    failure_reason varchar(500),

    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),

    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),

    version_no integer NOT NULL DEFAULT 1,

    CONSTRAINT ck_redemption_transaction_item_type CHECK (

        (item_type = 'BENEFIT' AND benefit_id IS NOT NULL AND offer_id IS NULL) OR

        (item_type = 'OFFER' AND offer_id IS NOT NULL AND benefit_id IS NULL)

    ),

    CONSTRAINT ck_redemption_transaction_item_quantity CHECK (quantity > 0),

    CONSTRAINT ck_redemption_transaction_item_status CHECK (status IN ('PENDING','SUCCESS','FAILED'))

);



CREATE UNIQUE INDEX IF NOT EXISTS uq_redemption_transaction_benefit_item

    ON "${schemaName}".redemption_transaction_item(redemption_transaction_id, benefit_id)

    WHERE benefit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_redemption_transaction_offer_item

    ON "${schemaName}".redemption_transaction_item(redemption_transaction_id, offer_id)

    WHERE offer_id IS NOT NULL;



CREATE TABLE IF NOT EXISTS "${schemaName}".offer_redemptions (

    offer_redemption_id varchar(64) PRIMARY KEY,

    redemption_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".redemption_transaction(redemption_transaction_id),

    redemption_transaction_item_id varchar(64) NOT NULL REFERENCES "${schemaName}".redemption_transaction_item(redemption_transaction_item_id),

    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),

    subscription_id varchar(64) NOT NULL REFERENCES "${schemaName}".subscriptions(subscription_id),

    offer_id varchar(64) NOT NULL REFERENCES "${schemaName}".offer(offer_id),

    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),

    staff_id varchar(64) REFERENCES "${schemaName}".staff(staff_id),

    redeemed_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    quantity integer NOT NULL DEFAULT 1,

    status varchar(16) NOT NULL DEFAULT 'SUCCESS',

    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),

    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),

    version_no integer NOT NULL DEFAULT 1,

    CONSTRAINT ck_offer_redemptions_status CHECK (status IN ('SUCCESS','FAILED','REVERSED')),

    CONSTRAINT ck_offer_redemptions_quantity CHECK (quantity > 0),

    CONSTRAINT uq_offer_redemption_transaction_item UNIQUE (redemption_transaction_item_id)

);

ALTER TABLE "${schemaName}".redemption_transaction_item

    DROP CONSTRAINT IF EXISTS fk_redemption_transaction_item_offer_redemption;

ALTER TABLE "${schemaName}".redemption_transaction_item

    ADD CONSTRAINT fk_redemption_transaction_item_offer_redemption

    FOREIGN KEY (offer_redemption_id) REFERENCES "${schemaName}".offer_redemptions(offer_redemption_id)

    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_offer_redemptions_eligibility

    ON "${schemaName}".offer_redemptions(subscription_id, offer_id, redeemed_at)

    WHERE status = 'SUCCESS';



CREATE OR REPLACE FUNCTION "${schemaName}".counter_offer_rejection(

    p_organization_id varchar, p_subscription_id varchar, p_offer_id varchar, p_store_id varchar DEFAULT NULL

) RETURNS text LANGUAGE plpgsql STABLE SET search_path = pg_catalog, "${schemaName}" AS $function$

DECLARE v_sub record; v_rule record; v_now timestamp; v_window timestamp; v_count integer; v_zone text;

BEGIN

    SELECT s.start_date, s.end_date, sp.membership_product_id, ss.status_code

      INTO v_sub FROM subscriptions s

      JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id AND NOT ou.is_deleted

      JOIN organization_user_types ot ON ot.organization_user_type_id=ou.organization_user_type_id

      JOIN "user" u ON u.user_id=ou.user_id AND NOT u.is_deleted

      JOIN entity_status us ON us.entity_status_id=u.user_status_id JOIN statuses ust ON ust.status_id=us.status_id

      JOIN entity_status ous ON ous.entity_status_id=ou.organization_user_status_id JOIN statuses ost ON ost.status_id=ous.status_id

      JOIN subscription_plans sp ON sp.subscription_plan_id=s.subscription_plan_id

      JOIN membership_products mp ON mp.membership_product_id=sp.membership_product_id AND mp.organization_id=p_organization_id AND NOT mp.is_deleted

      JOIN entity_status ses ON ses.entity_status_id=s.subscription_status_id JOIN statuses ss ON ss.status_id=ses.status_id

     WHERE s.subscription_id=p_subscription_id AND NOT s.is_deleted AND ou.organization_id=p_organization_id

       AND ot.organization_user_type_code='CUSTOMER' AND ust.status_code='ACTIVE' AND ost.status_code='ACTIVE';

    IF NOT FOUND THEN RETURN 'Subscription is not available for this organization'; END IF;

    IF v_sub.status_code <> 'ACTIVE' OR CURRENT_DATE NOT BETWEEN v_sub.start_date AND v_sub.end_date THEN RETURN 'Subscription is not active today'; END IF;

    IF NOT EXISTS (SELECT 1 FROM offer o JOIN entity_status es ON es.entity_status_id=o.status_id JOIN statuses st ON st.status_id=es.status_id

       WHERE o.offer_id=p_offer_id AND o.organization_id=p_organization_id AND NOT o.is_deleted AND st.status_code='ACTIVE'

       AND o.effective_date <= CURRENT_DATE AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_DATE)

       AND (o.membership_product_id IS NULL OR o.membership_product_id=v_sub.membership_product_id)) THEN RETURN 'Offer is not active for this membership'; END IF;

    IF p_store_id IS NOT NULL AND EXISTS (SELECT 1 FROM offer WHERE offer_id=p_offer_id AND store_id IS NOT NULL AND store_id<>p_store_id) THEN RETURN 'Offer is not available at this store'; END IF;

    FOR v_rule IN SELECT r.* FROM offer_usage_rule r JOIN entity_status es ON es.entity_status_id=r.offer_usage_rule_status_id JOIN statuses st ON st.status_id=es.status_id WHERE r.offer_id=p_offer_id AND NOT r.is_deleted AND st.status_code='ACTIVE' LOOP

      v_zone:=COALESCE(NULLIF(trim(v_rule.time_zone),''),'UTC'); BEGIN v_now:=CURRENT_TIMESTAMP AT TIME ZONE v_zone; EXCEPTION WHEN invalid_parameter_value THEN RETURN 'Offer usage rule has an invalid time zone'; END;

      IF v_now::date < v_rule.effective_date OR (v_rule.expiry_date IS NOT NULL AND v_now::date > v_rule.expiry_date) THEN RETURN 'Offer usage rule is outside its valid period'; END IF;

      IF NULLIF(trim(v_rule.applicable_days),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(upper(v_rule.applicable_days),'[,; ]+') d WHERE d=upper(trim(to_char(v_now,'DAY'))) OR d=upper(trim(to_char(v_now,'DY')))) THEN RETURN 'Offer is not available today'; END IF;

      IF v_rule.window_start_time IS NOT NULL AND v_rule.window_end_time IS NOT NULL AND ((v_rule.window_start_time::time<=v_rule.window_end_time::time AND (v_now::time<v_rule.window_start_time::time OR v_now::time>v_rule.window_end_time::time)) OR (v_rule.window_start_time::time>v_rule.window_end_time::time AND v_now::time<v_rule.window_start_time::time AND v_now::time>v_rule.window_end_time::time)) THEN RETURN 'Offer usage rule is outside its valid period'; END IF;

      IF v_rule.window_start_time IS NOT NULL AND v_rule.window_end_time IS NULL AND v_now::time<v_rule.window_start_time::time THEN RETURN 'Offer usage rule is outside its valid period'; END IF;

      IF v_rule.window_end_time IS NOT NULL AND v_rule.window_start_time IS NULL AND v_now::time>v_rule.window_end_time::time THEN RETURN 'Offer usage rule is outside its valid period'; END IF;

      v_window:=CASE upper(v_rule.frequency_type) WHEN 'ONE_TIME' THEN v_sub.start_date::timestamp WHEN 'DAILY' THEN v_now-make_interval(days=>v_rule.frequency_interval) WHEN 'WEEKLY' THEN v_now-make_interval(days=>7*v_rule.frequency_interval) WHEN 'MONTHLY' THEN v_now-make_interval(months=>v_rule.frequency_interval) WHEN 'YEARLY' THEN v_now-make_interval(years=>v_rule.frequency_interval) ELSE NULL END;

      IF v_window IS NULL OR v_rule.frequency_interval<1 OR v_rule.usage_limit<1 THEN RETURN 'Offer usage rule is invalid'; END IF;

      SELECT COALESCE(sum(quantity),0)::integer INTO v_count FROM offer_redemptions WHERE subscription_id=p_subscription_id AND offer_id=p_offer_id AND status='SUCCESS' AND ((redeemed_at AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE v_zone) >= v_window;

      IF v_count>=v_rule.usage_limit THEN RETURN 'Offer usage limit has been reached'; END IF;

    END LOOP; RETURN NULL;

END; $function$;



-- This primitive is never granted. Guarded customer/counter wrappers own authorization.

CREATE OR REPLACE FUNCTION "${schemaName}".create_redemption_transaction_internal(

 p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_subscription_id varchar,p_benefit_ids varchar[],p_offer_ids varchar[],p_redemption_method varchar,p_actor_user_id varchar

) RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"expiresAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$

DECLARE v_id varchar(64); v_number varchar(64); v_item varchar(64); v_benefit varchar; v_offer varchar; v_reason text; v_seq bigint;

BEGIN

 IF COALESCE(cardinality(p_benefit_ids),0)+COALESCE(cardinality(p_offer_ids),0)=0 THEN RAISE EXCEPTION 'Select one or more benefits or offers' USING ERRCODE='22023'; END IF;

 IF (p_benefit_ids IS NOT NULL AND cardinality(p_benefit_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_benefit_ids)x)) OR (p_offer_ids IS NOT NULL AND cardinality(p_offer_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_offer_ids)x)) THEN RAISE EXCEPTION 'Select distinct redemption items' USING ERRCODE='22023'; END IF;

 PERFORM 1 FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id WHERE s.subscription_id=p_subscription_id AND ou.organization_id=p_organization_id AND NOT s.is_deleted AND NOT ou.is_deleted FOR UPDATE OF s; IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found' USING ERRCODE='P0002'; END IF;

 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_benefit_rejection(p_organization_id,p_subscription_id,v_benefit); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;

 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_offer_rejection(p_organization_id,p_subscription_id,v_offer,p_store_id); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;

 v_id:=generate_runtime_id('RTX'); v_seq:=next_business_sequence('REDEMPTION_TRANSACTION',p_organization_id); v_number:=('RTX_'||lpad(v_seq::text,6,'0'))::varchar(64);

 INSERT INTO redemption_transaction(redemption_transaction_id,redemption_transaction_number,organization_id,subscription_id,store_id,staff_id,redemption_method,status,expires_at,created_by,updated_by) VALUES(v_id,v_number,p_organization_id,p_subscription_id,p_store_id,p_staff_id,p_redemption_method,'PENDING',CURRENT_TIMESTAMP+interval '10 minutes',p_actor_user_id,p_actor_user_id);

 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,benefit_id,created_by,updated_by) VALUES(v_item,v_id,'BENEFIT',v_benefit,p_actor_user_id,p_actor_user_id); END LOOP;

 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,offer_id,created_by,updated_by) VALUES(v_item,v_id,'OFFER',v_offer,p_actor_user_id,p_actor_user_id); END LOOP;

 RETURN QUERY SELECT v_id,v_number,'PENDING'::varchar,(CURRENT_TIMESTAMP+interval '10 minutes')::text;

END; $function$;



CREATE OR REPLACE FUNCTION "${schemaName}".create_customer_redemption_transaction(

 p_organization_id varchar,p_subscription_id varchar,p_benefit_ids varchar[],p_offer_ids varchar[],p_redemption_method varchar,p_actor_user_id varchar

) RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"expiresAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$

BEGIN

 IF NOT EXISTS (

   SELECT 1 FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id

   JOIN organization_user_types ot ON ot.organization_user_type_id=ou.organization_user_type_id

   JOIN entity_status oes ON oes.entity_status_id=ou.organization_user_status_id JOIN statuses ost ON ost.status_id=oes.status_id

   WHERE s.subscription_id=p_subscription_id AND ou.organization_id=p_organization_id AND ou.user_id=p_actor_user_id

     AND NOT s.is_deleted AND NOT ou.is_deleted AND ot.organization_user_type_code='CUSTOMER' AND ost.status_code='ACTIVE'

 ) THEN RAISE EXCEPTION 'Customer cannot create a redemption transaction for this subscription' USING ERRCODE='42501'; END IF;

 RETURN QUERY SELECT * FROM create_redemption_transaction_internal(p_organization_id,NULL,NULL,p_subscription_id,p_benefit_ids,p_offer_ids,p_redemption_method,p_actor_user_id);

END; $function$;



CREATE OR REPLACE FUNCTION "${schemaName}".create_counter_redemption_transaction(

 p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_subscription_id varchar,p_benefit_ids varchar[],p_offer_ids varchar[],p_redemption_method varchar,p_actor_user_id varchar

) RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"expiresAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$

BEGIN

 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501'; END IF;

 RETURN QUERY SELECT * FROM create_redemption_transaction_internal(p_organization_id,p_store_id,p_staff_id,p_subscription_id,p_benefit_ids,p_offer_ids,p_redemption_method,p_actor_user_id);

END; $function$;



CREATE OR REPLACE FUNCTION "${schemaName}".validate_redemption_transaction(p_transaction_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar)

RETURNS TABLE("itemId" varchar,"itemType" varchar,"benefitId" varchar,"offerId" varchar,eligible boolean,"rejectionReason" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$

DECLARE r record; v_reason text; v_sub varchar; v_status varchar; v_expires_at timestamp;

BEGIN

 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501'; END IF;

 SELECT subscription_id,status,expires_at INTO v_sub,v_status,v_expires_at FROM redemption_transaction WHERE redemption_transaction_id=p_transaction_id AND organization_id=p_organization_id; IF v_sub IS NULL THEN RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE='P0002'; END IF; IF v_status<>'PENDING' THEN RAISE EXCEPTION 'Redemption transaction is not pending' USING ERRCODE='23505'; END IF; IF v_expires_at IS NOT NULL AND v_expires_at<CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Redemption transaction has expired' USING ERRCODE='23505'; END IF;

 FOR r IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id ORDER BY created_at LOOP v_reason:=CASE WHEN r.item_type='BENEFIT' THEN counter_benefit_rejection(p_organization_id,v_sub,r.benefit_id) ELSE counter_offer_rejection(p_organization_id,v_sub,r.offer_id,p_store_id) END; RETURN QUERY SELECT r.redemption_transaction_item_id,r.item_type,r.benefit_id,r.offer_id,v_reason IS NULL,v_reason; END LOOP;

END; $function$;



CREATE OR REPLACE FUNCTION "${schemaName}".execute_redemption_transaction(p_transaction_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar)

RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"completedAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$

DECLARE t record; i record; v_reason text; v_redemption varchar(64); v_number varchar(64); v_offer_redemption varchar(64); v_seq bigint; v_success varchar;

BEGIN

 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501'; END IF;

 SELECT * INTO t FROM redemption_transaction WHERE redemption_transaction_id=p_transaction_id AND organization_id=p_organization_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE='P0002'; END IF;

 IF t.status<>'PENDING' THEN RAISE EXCEPTION 'Redemption transaction cannot be executed' USING ERRCODE='23505'; END IF; IF t.expires_at IS NOT NULL AND t.expires_at<CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Redemption transaction has expired' USING ERRCODE='23505'; END IF;

 PERFORM 1 FROM subscriptions WHERE subscription_id=t.subscription_id FOR UPDATE;

 FOR i IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id FOR UPDATE LOOP v_reason:=CASE WHEN i.item_type='BENEFIT' THEN counter_benefit_rejection(p_organization_id,t.subscription_id,i.benefit_id) ELSE counter_offer_rejection(p_organization_id,t.subscription_id,i.offer_id,p_store_id) END; IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;

 SELECT es.entity_status_id INTO v_success FROM entity_status es JOIN entity_type et ON et.entity_type_id=es.entity_type_id JOIN statuses s ON s.status_id=es.status_id WHERE et.entity_type_code='REDEMPTION' AND s.status_code='SUCCESS' AND es.is_active;

 FOR i IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id FOR UPDATE LOOP

   IF i.item_type='BENEFIT' THEN v_redemption:=generate_runtime_id('RDM'); v_seq:=next_business_sequence('REDEMPTION',t.subscription_id); SELECT (subscription_number||'_RDM_'||lpad(v_seq::text,3,'0'))::varchar(64) INTO v_number FROM subscriptions WHERE subscription_id=t.subscription_id; INSERT INTO redemptions(redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,redemption_status_id,created_by,updated_by) VALUES(v_redemption,v_number,t.subscription_id,i.benefit_id,p_store_id,p_staff_id,v_success,p_actor_user_id,p_actor_user_id); UPDATE redemption_transaction_item SET redemption_id=v_redemption,status='SUCCESS',updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE redemption_transaction_item_id=i.redemption_transaction_item_id;

   ELSE v_offer_redemption:=generate_runtime_id('ORD'); INSERT INTO offer_redemptions(offer_redemption_id,redemption_transaction_id,redemption_transaction_item_id,organization_id,subscription_id,offer_id,store_id,staff_id,created_by,updated_by) VALUES(v_offer_redemption,p_transaction_id,i.redemption_transaction_item_id,p_organization_id,t.subscription_id,i.offer_id,p_store_id,p_staff_id,p_actor_user_id,p_actor_user_id); UPDATE redemption_transaction_item SET offer_redemption_id=v_offer_redemption,status='SUCCESS',updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE redemption_transaction_item_id=i.redemption_transaction_item_id; END IF;

 END LOOP;

 UPDATE redemption_transaction SET status='SUCCESS',store_id=p_store_id,staff_id=p_staff_id,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE redemption_transaction_id=p_transaction_id;

 RETURN QUERY SELECT t.redemption_transaction_id,t.redemption_transaction_number,'SUCCESS'::varchar,CURRENT_TIMESTAMP::text;

END; $function$;



REVOKE ALL ON FUNCTION "${schemaName}".create_redemption_transaction_internal(varchar,varchar,varchar,varchar,varchar[],varchar[],varchar,varchar) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".create_customer_redemption_transaction(varchar,varchar,varchar[],varchar[],varchar,varchar) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".create_counter_redemption_transaction(varchar,varchar,varchar,varchar,varchar[],varchar[],varchar,varchar) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".validate_redemption_transaction(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".execute_redemption_transaction(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;

DO $grant$ BEGIN

 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${appRole}') THEN

  GRANT EXECUTE ON FUNCTION "${schemaName}".create_customer_redemption_transaction(varchar,varchar,varchar[],varchar[],varchar,varchar) TO "${appRole}";

  GRANT EXECUTE ON FUNCTION "${schemaName}".create_counter_redemption_transaction(varchar,varchar,varchar,varchar,varchar[],varchar[],varchar,varchar) TO "${appRole}";

  GRANT EXECUTE ON FUNCTION "${schemaName}".validate_redemption_transaction(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

  GRANT EXECUTE ON FUNCTION "${schemaName}".execute_redemption_transaction(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

 END IF;

END $grant$;