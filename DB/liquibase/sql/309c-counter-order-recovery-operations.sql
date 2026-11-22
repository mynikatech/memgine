-- ==========================================================================
-- REDEMPTION — Legacy execution compatibility
-- Canonical PostgreSQL function: execute_redemption_transaction
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".execute_redemption_transaction(p_transaction_id varchar,
    p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar)
RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,
    "completedAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,
    "${schemaName}" AS $function$
DECLARE t record; i record; v_reason text; v_redemption varchar(64); v_number varchar(64);
    v_offer_redemption varchar(64); v_seq bigint; v_success varchar;
    v_now timestamp without time zone := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
BEGIN
 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,
     p_actor_user_id) THEN RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501';
     END IF;
 SELECT * INTO t FROM redemption_transaction WHERE redemption_transaction_id=p_transaction_id
     AND organization_id=p_organization_id FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE='P0002'; END IF;
 IF t.counter_verification IS NOT NULL
     OR EXISTS (SELECT 1 FROM fulfillments WHERE redemption_transaction_id=p_transaction_id)
 THEN RAISE EXCEPTION 'Open the order in Counter Orders to complete collection' USING ERRCODE='23505'; END IF;
 IF t.status<>'PENDING' THEN RAISE EXCEPTION 'Redemption transaction cannot be executed' USING ERRCODE='23505';
     END IF; IF t.expires_at IS NOT NULL
     AND t.expires_at<=v_now THEN RAISE EXCEPTION 'Redemption transaction has expired' USING ERRCODE='23505';
     END IF;
 PERFORM 1 FROM subscriptions WHERE subscription_id=t.subscription_id FOR UPDATE;
 FOR i IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id FOR UPDATE LOOP v_reason:=CASE WHEN i.item_type='BENEFIT' THEN counter_benefit_rejection(p_organization_id,
     t.subscription_id,i.benefit_id,p_store_id) ELSE counter_offer_rejection(p_organization_id,t.subscription_id,
     i.offer_id,p_store_id) END; IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505';
     END IF; END LOOP;
 SELECT es.entity_status_id INTO v_success FROM entity_status es JOIN entity_type et ON et.entity_type_id=es.entity_type_id JOIN statuses s ON s.status_id=es.status_id WHERE et.entity_type_code='REDEMPTION'
     AND s.status_code='SUCCESS' AND es.is_active;
 FOR i IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id FOR UPDATE LOOP
   IF i.item_type='BENEFIT' THEN v_redemption:=generate_runtime_id('RDM');
       v_seq:=next_business_sequence('REDEMPTION',t.subscription_id);
       SELECT (subscription_number||'_RDM_'||lpad(v_seq::text,3,
       '0'))::varchar(64) INTO v_number FROM subscriptions WHERE subscription_id=t.subscription_id;
       INSERT INTO redemptions(redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
       redemption_status_id,created_by,updated_by) VALUES(v_redemption,v_number,t.subscription_id,i.benefit_id,
       p_store_id,p_staff_id,v_success,p_actor_user_id,p_actor_user_id);
       UPDATE redemption_transaction_item SET redemption_id=v_redemption,status='SUCCESS',
       updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,
       version_no=version_no+1 WHERE redemption_transaction_item_id=i.redemption_transaction_item_id;
   ELSE v_offer_redemption:=generate_runtime_id('ORD'); INSERT INTO offer_redemptions(offer_redemption_id,
       redemption_transaction_id,redemption_transaction_item_id,organization_id,subscription_id,offer_id,store_id,
       staff_id,created_by,updated_by) VALUES(v_offer_redemption,p_transaction_id,
       i.redemption_transaction_item_id,p_organization_id,t.subscription_id,i.offer_id,p_store_id,p_staff_id,
       p_actor_user_id,p_actor_user_id);
       UPDATE redemption_transaction_item SET offer_redemption_id=v_offer_redemption,status='SUCCESS',
       updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,
       version_no=version_no+1 WHERE redemption_transaction_item_id=i.redemption_transaction_item_id; END IF;
 END LOOP;
 UPDATE redemption_transaction SET status='SUCCESS',store_id=p_store_id,staff_id=p_staff_id,
     completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,
     version_no=version_no+1 WHERE redemption_transaction_id=p_transaction_id;
 RETURN QUERY SELECT t.redemption_transaction_id,t.redemption_transaction_number,'SUCCESS'::varchar,
     CURRENT_TIMESTAMP::text;
END; $function$;



