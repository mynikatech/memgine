--liquibase formatted sql

--changeset mynikatech:212-benefit-store-availability splitStatements:false

-- Store availability is independent of a Benefit's canonical Product eligibility.
-- Existing Benefits were redeemable at any Store before this table existed, so their
-- durable default remains ALL_STORES.
DO $migration$
DECLARE
    v_constraint_definition text;
BEGIN
    SELECT pg_get_constraintdef(c.oid)
      INTO v_constraint_definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = '${schemaName}'
       AND t.relname = 'benefits'
       AND c.conname = 'uq_benefits_id_organization';

    IF v_constraint_definition IS NOT NULL
       AND v_constraint_definition <> 'UNIQUE (benefit_id, organization_id)' THEN
        RAISE EXCEPTION
            'Existing uq_benefits_id_organization has an incompatible definition';
    END IF;

    IF v_constraint_definition IS NULL
       AND NOT EXISTS (
           SELECT 1
             FROM pg_index i
             JOIN pg_class t ON t.oid = i.indrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = '${schemaName}'
              AND t.relname = 'benefits'
              AND i.indisunique
              AND i.indisvalid
              AND i.indnkeyatts = 2
              AND i.indpred IS NULL
              AND pg_get_indexdef(i.indexrelid, 1, true) = 'benefit_id'
              AND pg_get_indexdef(i.indexrelid, 2, true) = 'organization_id'
       ) THEN
        ALTER TABLE "${schemaName}".benefits
            ADD CONSTRAINT uq_benefits_id_organization
            UNIQUE (benefit_id, organization_id);
    END IF;
END;
$migration$;


CREATE TABLE "${schemaName}".benefit_store_availability (
    benefit_id varchar(40) NOT NULL,
    organization_id varchar(64) NOT NULL,
    availability_mode varchar(20) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (benefit_id),
    UNIQUE (benefit_id, organization_id),
    CONSTRAINT ck_benefit_store_availability_mode
        CHECK (availability_mode IN ('ALL_STORES', 'SELECTED_STORES')),
    CONSTRAINT fk_benefit_store_availability_benefit
        FOREIGN KEY (benefit_id, organization_id)
        REFERENCES "${schemaName}".benefits(benefit_id, organization_id)
);

CREATE TABLE "${schemaName}".benefit_store_availability_store (
    benefit_id varchar(40) NOT NULL,
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    organization_id varchar(64) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (benefit_id, store_id),
    CONSTRAINT fk_benefit_store_availability_store_parent
        FOREIGN KEY (benefit_id, organization_id)
        REFERENCES "${schemaName}".benefit_store_availability(benefit_id, organization_id)
);

CREATE INDEX ix_benefit_store_availability_store_active
    ON "${schemaName}".benefit_store_availability_store(organization_id, store_id)
    WHERE NOT is_deleted;

INSERT INTO "${schemaName}".benefit_store_availability (
    benefit_id,
    organization_id,
    availability_mode,
    created_at,
    created_by,
    updated_at,
    updated_by,
    version_no
)
SELECT b.benefit_id,
       b.organization_id,
       'ALL_STORES',
       b.created_at,
       b.created_by,
       b.updated_at,
       b.updated_by,
       b.version_no
  FROM "${schemaName}".benefits b
 WHERE b.organization_id IS NOT NULL
ON CONFLICT (benefit_id) DO NOTHING;

CREATE OR REPLACE FUNCTION "${schemaName}".get_benefit_store_availability(
    p_organization_id varchar
)
RETURNS TABLE(
    "benefitId" varchar,
    "availabilityMode" varchar,
    "storeId" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$   
    SELECT availability.benefit_id,
           availability.availability_mode,
           selected.store_id
      FROM benefit_store_availability availability
      JOIN benefits benefit
        ON benefit.benefit_id = availability.benefit_id
       AND benefit.organization_id = availability.organization_id
       AND NOT benefit.is_deleted
      LEFT JOIN benefit_store_availability_store selected
        ON selected.benefit_id = availability.benefit_id
       AND selected.organization_id = availability.organization_id
       AND NOT selected.is_deleted
     WHERE availability.organization_id = p_organization_id
     ORDER BY availability.benefit_id, selected.store_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_benefit_store_availability(
    p_organization_id varchar,
    p_benefit_id varchar,
    p_availability_mode varchar,
    p_store_ids varchar[],
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_store_id varchar(64);
    v_store_count integer;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization access denied' USING ERRCODE = '42501';
    END IF;

    IF p_availability_mode IS NULL
    OR p_availability_mode NOT IN ('ALL_STORES', 'SELECTED_STORES') THEN
        RAISE EXCEPTION 'Benefit Store availability mode is invalid' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(COALESCE(p_store_ids, ARRAY[]::varchar[])) selected(store_id)
         WHERE NULLIF(btrim(selected.store_id), '') IS NULL
    ) OR (
        SELECT count(*)
          FROM unnest(COALESCE(p_store_ids, ARRAY[]::varchar[])) selected(store_id)
    ) <> (
        SELECT count(DISTINCT selected.store_id)
          FROM unnest(COALESCE(p_store_ids, ARRAY[]::varchar[])) selected(store_id)
    ) THEN
        RAISE EXCEPTION 'Benefit Store availability contains an invalid or duplicate Store id'
            USING ERRCODE = '22023';
    END IF;

    IF p_availability_mode = 'ALL_STORES'
       AND cardinality(COALESCE(p_store_ids, ARRAY[]::varchar[])) <> 0 THEN
        RAISE EXCEPTION 'ALL_STORES availability cannot include Store ids' USING ERRCODE = '22023';
    END IF;

    IF p_availability_mode = 'SELECTED_STORES'
       AND cardinality(COALESCE(p_store_ids, ARRAY[]::varchar[])) = 0 THEN
        RAISE EXCEPTION 'SELECTED_STORES availability requires at least one Store' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
      FROM benefits
     WHERE benefit_id = p_benefit_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Benefit not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_availability_mode = 'SELECTED_STORES' THEN
        PERFORM s.store_id
          FROM stores s
          JOIN entity_status store_entity_status
            ON store_entity_status.entity_status_id = s.store_status_id
           AND store_entity_status.is_active
          JOIN statuses store_status
            ON store_status.status_id = store_entity_status.status_id
           AND store_status.status_code = 'ACTIVE'
         WHERE s.organization_id = p_organization_id
           AND s.store_id = ANY(p_store_ids)
           AND NOT s.is_deleted
         ORDER BY s.store_id
         FOR UPDATE;
        GET DIAGNOSTICS v_store_count = ROW_COUNT;
        IF v_store_count <> cardinality(p_store_ids) THEN
            RAISE EXCEPTION 'Selected Store is unavailable or belongs to another organization'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    PERFORM 1
      FROM benefit_store_availability
     WHERE benefit_id = p_benefit_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    PERFORM 1
      FROM benefit_store_availability_store
     WHERE benefit_id = p_benefit_id
       AND organization_id = p_organization_id
     ORDER BY store_id
     FOR UPDATE;

    INSERT INTO benefit_store_availability (
        benefit_id,
        organization_id,
        availability_mode,
        created_by,
        updated_by
    ) VALUES (
        p_benefit_id,
        p_organization_id,
        p_availability_mode,
        p_actor_user_id,
        p_actor_user_id
    )
    ON CONFLICT (benefit_id) DO UPDATE
       SET availability_mode = EXCLUDED.availability_mode,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by,
           version_no = benefit_store_availability.version_no + 1
     WHERE benefit_store_availability.organization_id = EXCLUDED.organization_id
       AND benefit_store_availability.availability_mode IS DISTINCT FROM EXCLUDED.availability_mode;

    UPDATE benefit_store_availability_store selected
       SET is_deleted = true,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = selected.version_no + 1
     WHERE selected.benefit_id = p_benefit_id
       AND selected.organization_id = p_organization_id
       AND NOT selected.is_deleted
       AND (
           p_availability_mode = 'ALL_STORES'
           OR NOT selected.store_id = ANY(p_store_ids)
       );

    IF p_availability_mode = 'SELECTED_STORES' THEN
        FOR v_store_id IN
            SELECT selected.store_id
              FROM unnest(p_store_ids) selected(store_id)
             ORDER BY selected.store_id
        LOOP
            INSERT INTO benefit_store_availability_store (
                benefit_id,
                store_id,
                organization_id,
                created_by,
                updated_by
            ) VALUES (
                p_benefit_id,
                v_store_id,
                p_organization_id,
                p_actor_user_id,
                p_actor_user_id
            )
            ON CONFLICT (benefit_id, store_id) DO UPDATE
               SET is_deleted = false,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = EXCLUDED.updated_by,
                   version_no = benefit_store_availability_store.version_no + 1
             WHERE benefit_store_availability_store.organization_id = EXCLUDED.organization_id
               AND benefit_store_availability_store.is_deleted;
        END LOOP;
    END IF;

    RETURN true;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".benefit_store_availability,
    "${schemaName}".benefit_store_availability_store FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_benefit_store_availability(varchar),
    "${schemaName}".save_benefit_store_availability(varchar, varchar, varchar, varchar[], varchar)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_benefit_store_availability(varchar),
    "${schemaName}".save_benefit_store_availability(varchar, varchar, varchar, varchar[], varchar)
    TO "${appRole}";

-- Store-scoped eligibility is evaluated whenever a Counter Store is known.
-- Customer QR creation deliberately calls the legacy three-argument function and
-- therefore defers this check until Counter validation or Commerce preparation.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_benefit_rejection(
    p_organization_id varchar,
    p_subscription_id varchar,
    p_benefit_id varchar,
    p_store_id varchar
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_reason text;
    v_mode varchar(20);
BEGIN
    v_reason := counter_benefit_rejection(
        p_organization_id,
        p_subscription_id,
        p_benefit_id
    );
    IF v_reason IS NOT NULL OR p_store_id IS NULL THEN
        RETURN v_reason;
    END IF;

    SELECT availability.availability_mode
      INTO v_mode
      FROM benefit_store_availability availability
     WHERE availability.benefit_id = p_benefit_id
       AND availability.organization_id = p_organization_id;

    IF v_mode IS NULL THEN
        RETURN 'Benefit Store availability is unavailable';
    END IF;

    IF v_mode = 'ALL_STORES' THEN
        RETURN NULL;
    END IF;

    IF v_mode = 'SELECTED_STORES' AND EXISTS (
        SELECT 1
          FROM benefit_store_availability_store selected
         WHERE selected.benefit_id = p_benefit_id
           AND selected.organization_id = p_organization_id
           AND selected.store_id = p_store_id
           AND NOT selected.is_deleted
    ) THEN
        RETURN NULL;
    END IF;

    RETURN 'Benefit is not available at this Store';
END;
$function$;

-- Preserve the existing transaction lifecycle, adding Store validation when a
-- Counter Store is supplied and deferring it when a customer creates a QR.
CREATE OR REPLACE FUNCTION "${schemaName}".create_redemption_transaction_internal(
 p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_subscription_id varchar,p_benefit_ids varchar[],p_offer_ids varchar[],p_redemption_method varchar,p_actor_user_id varchar
) RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"expiresAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
 v_id varchar(64); v_number varchar(64); v_item varchar(64); v_benefit varchar; v_offer varchar; v_reason text; v_seq bigint;
 v_now timestamp without time zone := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
 v_expires_at timestamp without time zone;
 v_expiry_minutes integer;
BEGIN
 IF COALESCE(cardinality(p_benefit_ids),0)+COALESCE(cardinality(p_offer_ids),0)=0 THEN RAISE EXCEPTION 'Select one or more benefits or offers' USING ERRCODE='22023'; END IF;
 IF (p_benefit_ids IS NOT NULL AND cardinality(p_benefit_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_benefit_ids)x)) OR (p_offer_ids IS NOT NULL AND cardinality(p_offer_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_offer_ids)x)) THEN RAISE EXCEPTION 'Select distinct redemption items' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id WHERE s.subscription_id=p_subscription_id AND ou.organization_id=p_organization_id AND NOT s.is_deleted AND NOT ou.is_deleted FOR UPDATE OF s; IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found' USING ERRCODE='P0002'; END IF;
 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_benefit_rejection(p_organization_id,p_subscription_id,v_benefit,p_store_id); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_offer_rejection(p_organization_id,p_subscription_id,v_offer,p_store_id); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 v_id:=generate_runtime_id('RTX'); v_seq:=next_business_sequence('REDEMPTION_TRANSACTION',p_organization_id); v_number:=('RTX_'||lpad(v_seq::text,6,'0'))::varchar(64);
 v_expiry_minutes := get_organization_redemption_qr_expiry_minutes(p_organization_id);
 v_expires_at := v_now + make_interval(mins => v_expiry_minutes);
 INSERT INTO redemption_transaction(redemption_transaction_id,redemption_transaction_number,organization_id,subscription_id,store_id,staff_id,redemption_method,status,expires_at,created_by,updated_by) VALUES(v_id,v_number,p_organization_id,p_subscription_id,p_store_id,p_staff_id,p_redemption_method,'PENDING',v_expires_at,p_actor_user_id,p_actor_user_id);
 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,benefit_id,created_by,updated_by) VALUES(v_item,v_id,'BENEFIT',v_benefit,p_actor_user_id,p_actor_user_id); END LOOP;
 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,offer_id,created_by,updated_by) VALUES(v_item,v_id,'OFFER',v_offer,p_actor_user_id,p_actor_user_id); END LOOP;
 RETURN QUERY SELECT v_id,v_number,'PENDING'::varchar,v_expires_at::text;
END; $function$;


-- Revalidate Store availability at QR validation and legacy direct execution.
CREATE OR REPLACE FUNCTION "${schemaName}".validate_redemption_transaction(p_transaction_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar)
RETURNS TABLE("itemId" varchar,"itemType" varchar,"benefitId" varchar,"offerId" varchar,eligible boolean,"rejectionReason" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE r record; v_reason text; v_sub varchar; v_status varchar; v_expires_at timestamp; v_now timestamp without time zone := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
BEGIN
 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501'; END IF;
 SELECT subscription_id,status,expires_at INTO v_sub,v_status,v_expires_at FROM redemption_transaction WHERE redemption_transaction_id=p_transaction_id AND organization_id=p_organization_id; IF v_sub IS NULL THEN RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE='P0002'; END IF; IF v_status<>'PENDING' THEN RAISE EXCEPTION 'Redemption transaction is not pending' USING ERRCODE='23505'; END IF; IF v_expires_at IS NOT NULL AND v_expires_at<=v_now THEN RAISE EXCEPTION 'Redemption transaction has expired' USING ERRCODE='23505'; END IF;
 FOR r IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id ORDER BY created_at LOOP v_reason:=CASE WHEN r.item_type='BENEFIT' THEN counter_benefit_rejection(p_organization_id,v_sub,r.benefit_id,p_store_id) ELSE counter_offer_rejection(p_organization_id,v_sub,r.offer_id,p_store_id) END; RETURN QUERY SELECT r.redemption_transaction_item_id,r.item_type,r.benefit_id,r.offer_id,v_reason IS NULL,v_reason; END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION "${schemaName}".execute_redemption_transaction(p_transaction_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar)
RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"completedAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE t record; i record; v_reason text; v_redemption varchar(64); v_number varchar(64); v_offer_redemption varchar(64); v_seq bigint; v_success varchar; v_now timestamp without time zone := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
BEGIN
 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM redemption_transaction WHERE redemption_transaction_id=p_transaction_id AND organization_id=p_organization_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE='P0002'; END IF;
 IF t.status<>'PENDING' THEN RAISE EXCEPTION 'Redemption transaction cannot be executed' USING ERRCODE='23505'; END IF; IF t.expires_at IS NOT NULL AND t.expires_at<=v_now THEN RAISE EXCEPTION 'Redemption transaction has expired' USING ERRCODE='23505'; END IF;
 PERFORM 1 FROM subscriptions WHERE subscription_id=t.subscription_id FOR UPDATE;
 FOR i IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id FOR UPDATE LOOP v_reason:=CASE WHEN i.item_type='BENEFIT' THEN counter_benefit_rejection(p_organization_id,t.subscription_id,i.benefit_id,p_store_id) ELSE counter_offer_rejection(p_organization_id,t.subscription_id,i.offer_id,p_store_id) END; IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 SELECT es.entity_status_id INTO v_success FROM entity_status es JOIN entity_type et ON et.entity_type_id=es.entity_type_id JOIN statuses s ON s.status_id=es.status_id WHERE et.entity_type_code='REDEMPTION' AND s.status_code='SUCCESS' AND es.is_active;
 FOR i IN SELECT * FROM redemption_transaction_item WHERE redemption_transaction_id=p_transaction_id FOR UPDATE LOOP
   IF i.item_type='BENEFIT' THEN v_redemption:=generate_runtime_id('RDM'); v_seq:=next_business_sequence('REDEMPTION',t.subscription_id); SELECT (subscription_number||'_RDM_'||lpad(v_seq::text,3,'0'))::varchar(64) INTO v_number FROM subscriptions WHERE subscription_id=t.subscription_id; INSERT INTO redemptions(redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,redemption_status_id,created_by,updated_by) VALUES(v_redemption,v_number,t.subscription_id,i.benefit_id,p_store_id,p_staff_id,v_success,p_actor_user_id,p_actor_user_id); UPDATE redemption_transaction_item SET redemption_id=v_redemption,status='SUCCESS',updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE redemption_transaction_item_id=i.redemption_transaction_item_id;
   ELSE v_offer_redemption:=generate_runtime_id('ORD'); INSERT INTO offer_redemptions(offer_redemption_id,redemption_transaction_id,redemption_transaction_item_id,organization_id,subscription_id,offer_id,store_id,staff_id,created_by,updated_by) VALUES(v_offer_redemption,p_transaction_id,i.redemption_transaction_item_id,p_organization_id,t.subscription_id,i.offer_id,p_store_id,p_staff_id,p_actor_user_id,p_actor_user_id); UPDATE redemption_transaction_item SET offer_redemption_id=v_offer_redemption,status='SUCCESS',updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE redemption_transaction_item_id=i.redemption_transaction_item_id; END IF;
 END LOOP;
 UPDATE redemption_transaction SET status='SUCCESS',store_id=p_store_id,staff_id=p_staff_id,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE redemption_transaction_id=p_transaction_id;
 RETURN QUERY SELECT t.redemption_transaction_id,t.redemption_transaction_number,'SUCCESS'::varchar,CURRENT_TIMESTAMP::text;
END; $function$;



-- Revalidate before any Commerce transaction, provider order, or payment attempt.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "commerceTransactionId" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    status varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;
    c commerce_transactions%ROWTYPE;

    v_actor varchar(64);
    v_reason text;
    v_provider varchar(32);
    v_integration varchar(64);

    a commerce_adjustments%ROWTYPE;
    m commerce_product_mappings%ROWTYPE;
    s record;
    v_line varchar(64);
    v_mapping_count integer;
BEGIN
    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO t
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF t.store_id IS NOT NULL
       AND t.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store'
            USING ERRCODE = '42501';
    END IF;

    IF t.staff_id IS NOT NULL
       AND t.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another staff context'
            USING ERRCODE = '42501';
    END IF;

    IF t.status <> 'PENDING'
       OR (
            t.expires_at IS NOT NULL
            AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
       ) THEN
        RAISE EXCEPTION 'Redemption transaction cannot be prepared'
            USING ERRCODE = '23505';
    END IF;

    SELECT organization_user_id
      INTO v_actor
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     ORDER BY organization_user_id
     LIMIT 1;

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found'
            USING ERRCODE = '42501';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        v_reason :=
            CASE
                WHEN i.item_type = 'BENEFIT' THEN
                    counter_benefit_rejection(
                        p_organization_id,
                        t.subscription_id,
                        i.benefit_id,
                        p_store_id
                    )
                ELSE
                    counter_offer_rejection(
                        p_organization_id,
                        t.subscription_id,
                        i.offer_id,
                        p_store_id
                    )
            END;

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason
                USING ERRCODE = '23505';
        END IF;
    END LOOP;

    SELECT c0.*
      INTO c
      FROM commerce_transaction_redemptions x
      JOIN commerce_transactions c0
        ON c0.commerce_transaction_id = x.commerce_transaction_id
     WHERE x.redemption_transaction_id = t.redemption_transaction_id
       AND NOT x.is_deleted
       AND NOT c0.is_deleted
     FOR UPDATE OF c0;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            c.commerce_transaction_id,
            NULL::varchar,
            c.integration_configuration_id,
            c.status;
        RETURN;
    END IF;

    SELECT
        r.provider_code,
        r.integration_configuration_id
      INTO
        v_provider,
        v_integration
      FROM commerce_payment_provider_routes r
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = r.integration_configuration_id
       AND ic.organization_id = r.organization_id
       AND NOT ic.is_deleted
      LEFT JOIN entity_status ies
        ON ies.entity_status_id = ic.integration_status_id
      LEFT JOIN statuses ist
        ON ist.status_id = ies.status_id
     WHERE r.organization_id = p_organization_id
       AND r.source_channel = 'COUNTER'
       AND r.is_enabled
       AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
       AND r.provider_code IN ('TEST', 'POYNT')
       AND (
            r.provider_code = 'TEST'
            OR (
                ic.integration_configuration_id IS NOT NULL
                AND upper(ic.provider) = r.provider_code
                AND ies.is_active
                AND ist.status_code = 'ACTIVE'
            )
       )
     ORDER BY
        CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
        r.commerce_payment_provider_route_id
     LIMIT 1;

    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'No Counter payment provider is configured'
            USING ERRCODE = '22023';
    END IF;

    -- Poynt redemption must use the Store's W41-selected catalog source. This
    -- verifies the integration boundary before any Commerce order or payment is created.
    IF v_provider = 'POYNT' AND NOT EXISTS (
        SELECT 1
          FROM commerce_store_catalog_sources source
          JOIN poynt_store_catalog_configurations configuration
            ON configuration.organization_id = source.organization_id
           AND configuration.store_id = source.store_id
           AND configuration.integration_configuration_id = source.integration_configuration_id
         WHERE source.organization_id = p_organization_id
           AND source.store_id = p_store_id
           AND source.integration_configuration_id = v_integration
           AND NULLIF(btrim(configuration.effective_catalog_id), '') IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Poynt Product Catalog is not configured for this Store'
            USING ERRCODE = '23503';
    END IF;


    c.commerce_transaction_id := generate_runtime_id('CTX');

    INSERT INTO commerce_transactions (
        commerce_transaction_id,
        organization_id,
        store_id,
        customer_user_id,
        subscription_id,
        integration_configuration_id,
        source_channel,
        status,
        idempotency_key,
        created_by,
        updated_by
    )
    VALUES (
        c.commerce_transaction_id,
        p_organization_id,
        p_store_id,
        (
            SELECT ou.user_id
              FROM subscriptions sub
              JOIN organization_user ou
                ON ou.organization_user_id = sub.organization_user_id
             WHERE sub.subscription_id = t.subscription_id
        ),
        t.subscription_id,
        v_integration,
        'COUNTER_REDEMPTION',
        'DRAFT',
        ('COUNTER_REDEMPTION:' || t.redemption_transaction_id)::varchar(128),
        v_actor,
        v_actor
    );

    INSERT INTO commerce_transaction_redemptions (
        commerce_transaction_redemption_id,
        commerce_transaction_id,
        redemption_transaction_id,
        created_by,
        updated_by
    )
    VALUES (
        generate_runtime_id('CTR'),
        c.commerce_transaction_id,
        t.redemption_transaction_id,
        v_actor,
        v_actor
    );

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         ORDER BY created_at, redemption_transaction_item_id
    LOOP
        a := NULL;
        m := NULL;

        IF i.item_type = 'BENEFIT' THEN
            SELECT ca.*
              INTO a
              FROM benefit_commerce_adjustments x
              JOIN commerce_adjustments ca
                ON ca.commerce_adjustment_id = x.commerce_adjustment_id
             WHERE x.organization_id = p_organization_id
               AND x.benefit_id = i.benefit_id
               AND NOT x.is_deleted
               AND NOT ca.is_deleted
               AND ca.is_active
               AND ca.adjustment_type IN (
                    'PRODUCT_FREE',
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               );
        ELSE
            SELECT ca.*
              INTO a
              FROM offer_commerce_adjustments x
              JOIN commerce_adjustments ca
                ON ca.commerce_adjustment_id = x.commerce_adjustment_id
             WHERE x.organization_id = p_organization_id
               AND x.offer_id = i.offer_id
               AND NOT x.is_deleted
               AND NOT ca.is_deleted
               AND ca.is_active
               AND ca.adjustment_type IN (
                    'PRODUCT_FREE',
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               );
        END IF;

        IF a.commerce_adjustment_id IS NULL THEN
            RAISE EXCEPTION 'Selected % has no active POS product adjustment', lower(i.item_type)
                USING ERRCODE = '23503';
        END IF;

        /* Canonical Benefit/Offer associations determine eligibility. */
        IF i.commerce_product_mapping_id IS NOT NULL THEN
            SELECT pm.*
              INTO m
              FROM commerce_product_mappings pm
             WHERE pm.commerce_product_mapping_id = i.commerce_product_mapping_id
               AND pm.organization_id = p_organization_id
               AND pm.is_active AND NOT pm.is_deleted
               AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
               AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
               AND ((i.item_type = 'BENEFIT' AND EXISTS (
                    SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                     AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                     AND bp.is_active AND NOT bp.is_deleted
               )) OR (i.item_type = 'OFFER' AND EXISTS (
                    SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                     AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                     AND op.is_active AND NOT op.is_deleted
               )));
            IF m.commerce_product_mapping_id IS NULL THEN
                RAISE EXCEPTION 'Selected POS product is not eligible for this redemption checkout context' USING ERRCODE = '23503';
            END IF;
        ELSE
            WITH eligible_mappings AS (
                SELECT pm.*
                  FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                         AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                         AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                         AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                         AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred_mappings AS (
                SELECT * FROM eligible_mappings exact_mapping WHERE exact_mapping.store_id = p_store_id
                UNION ALL
                SELECT * FROM eligible_mappings organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM eligible_mappings exact_mapping
                         WHERE exact_mapping.store_id = p_store_id
                           AND exact_mapping.product_id = organization_mapping.product_id
                           AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT count(*) INTO v_mapping_count FROM preferred_mappings;

            IF v_mapping_count = 0 THEN
                RAISE EXCEPTION 'No active POS mapping is configured for the eligible canonical Product' USING ERRCODE = '23503';
            ELSIF v_mapping_count > 1 THEN
                RAISE EXCEPTION 'Select a POS product for this redemption; multiple eligible mappings are configured' USING ERRCODE = '22023';
            END IF;

            WITH eligible_mappings AS (
                SELECT pm.*
                  FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                         AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                         AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                         AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                         AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred_mappings AS (
                SELECT * FROM eligible_mappings exact_mapping WHERE exact_mapping.store_id = p_store_id
                UNION ALL
                SELECT * FROM eligible_mappings organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM eligible_mappings exact_mapping
                         WHERE exact_mapping.store_id = p_store_id
                           AND exact_mapping.product_id = organization_mapping.product_id
                           AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT * INTO m FROM preferred_mappings;

            UPDATE redemption_transaction_item
               SET commerce_product_mapping_id = m.commerce_product_mapping_id,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id = i.redemption_transaction_item_id;
        END IF;

        SELECT
            product_name,
            currency_code,
            unit_price_minor_snapshot
          INTO s
          FROM commerce_product_snapshots
         WHERE organization_id = p_organization_id
           AND integration_configuration_id = m.integration_configuration_id
           AND COALESCE(store_id, '') = COALESCE(m.store_id, '')
           AND external_product_id = m.external_product_id
           AND COALESCE(external_variant_id, '') = COALESCE(m.external_variant_id, '')
           AND is_active
           AND NOT is_deleted
         ORDER BY last_synced_at DESC
         LIMIT 1;

        IF s.product_name IS NULL THEN
            RAISE EXCEPTION 'Selected POS product has no active catalog snapshot'
                USING ERRCODE = '23503';
        END IF;

        v_line := generate_runtime_id('CTL');

        INSERT INTO commerce_transaction_lines (
            commerce_transaction_line_id,
            commerce_transaction_id,
            line_type,
            source_entity_type,
            source_entity_id,
            commerce_product_mapping_id,
            external_product_id,
            external_variant_id,
            description,
            quantity,
            unit_price_minor_snapshot,
            currency_code,
            price_source,
            created_by,
            updated_by
        )
        VALUES (
            v_line,
            c.commerce_transaction_id,
            'EXTERNAL_PRODUCT',
            i.item_type,
            COALESCE(i.benefit_id, i.offer_id),
            m.commerce_product_mapping_id,
            m.external_product_id,
            m.external_variant_id,
            s.product_name,
            1,
            s.unit_price_minor_snapshot,
            s.currency_code,
            'PROVIDER_FINAL',
            v_actor,
            v_actor
        );

        INSERT INTO commerce_transaction_adjustments (
            commerce_transaction_adjustment_id,
            commerce_transaction_id,
            target_line_id,
            commerce_adjustment_id,
            source_type,
            source_id,
            adjustment_type,
            percentage,
            requested_amount_minor,
            currency_code,
            created_by,
            updated_by
        )
        VALUES (
            generate_runtime_id('CTA'),
            c.commerce_transaction_id,
            v_line,
            a.commerce_adjustment_id,
            i.item_type,
            COALESCE(i.benefit_id, i.offer_id),
            a.adjustment_type,
            a.percentage,
            a.amount_minor,
            a.currency_code,
            v_actor,
            v_actor
        );
    END LOOP;

    UPDATE commerce_transactions
       SET status = 'READY_FOR_PROVIDER',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN QUERY
    SELECT
        c.commerce_transaction_id,
        v_provider,
        v_integration,
        'READY_FOR_PROVIDER'::varchar;
END;
$function$;

-- Recheck Store availability in the legacy direct Counter redemption path.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_redeem_benefits(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_subscription_id varchar,
    p_benefit_ids varchar[],
    p_actor_user_id varchar
)
RETURNS TABLE (
    "redemptionId" varchar,
    "benefitId" varchar,
    "redemptionNumber" varchar
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_benefit_id varchar;
    v_redemption_id varchar(64);
    v_redemption_number varchar(64);
    v_redemption_number_candidate text;
    v_subscription_number varchar(64);
    v_status_id varchar;
    v_reason text;
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_benefit_ids IS NULL
       OR cardinality(p_benefit_ids) = 0
       OR EXISTS (
            SELECT 1
            FROM unnest(p_benefit_ids) id
            WHERE id IS NULL OR trim(id) = ''
       )
       OR (
            SELECT count(DISTINCT id)
            FROM unnest(p_benefit_ids) id
       ) <> cardinality(p_benefit_ids)
    THEN
        RAISE EXCEPTION
            'Select one or more distinct benefits'
            USING ERRCODE = '22023';
    END IF;

    SELECT s.subscription_number
    INTO v_subscription_number
    FROM "${schemaName}".subscriptions s
    JOIN "${schemaName}".organization_user ou
      ON ou.organization_user_id = s.organization_user_id
    WHERE s.subscription_id = p_subscription_id
      AND ou.organization_id = p_organization_id
    FOR UPDATE OF s;

    IF v_subscription_number IS NULL THEN
        RAISE EXCEPTION
            'Subscription not found'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT es.entity_status_id
    INTO v_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'REDEMPTION'
      AND st.status_code = 'SUCCESS'
      AND es.is_active = true;

    IF v_status_id IS NULL THEN
        RAISE EXCEPTION
            'Successful redemption status is not configured'
            USING ERRCODE = '22023';
    END IF;

    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_reason :=
            "${schemaName}".counter_benefit_rejection(
                p_organization_id,
                p_subscription_id,
                v_benefit_id,
                p_store_id
            );

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason
                USING ERRCODE = '23505';
        END IF;
    END LOOP;

    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_redemption_id :=
            "${schemaName}".generate_runtime_id('RDM');

        v_seq :=
            "${schemaName}".next_business_sequence(
                'REDEMPTION',
                p_subscription_id
            );

        v_redemption_number_candidate :=
            v_subscription_number
            || '_RDM_'
            || lpad(v_seq::text, 3, '0');

        IF length(v_redemption_number_candidate) > 64 THEN
            RAISE EXCEPTION
                'Generated redemption number exceeds 64 characters: %',
                v_redemption_number_candidate
                USING ERRCODE = '22023';
        END IF;

        v_redemption_number :=
            v_redemption_number_candidate::varchar(64);

        INSERT INTO "${schemaName}".redemptions (
            redemption_id,
            redemption_number,
            subscription_id,
            benefit_id,
            store_id,
            staff_id,
            redemption_status_id,
            created_by,
            updated_by
        )
        VALUES (
            v_redemption_id,
            v_redemption_number,
            p_subscription_id,
            v_benefit_id,
            p_store_id,
            p_staff_id,
            v_status_id,
            p_actor_user_id,
            p_actor_user_id
        );

        RETURN QUERY
        SELECT
            v_redemption_id,
            v_benefit_id,
            v_redemption_number;
    END LOOP;
END;
$function$;

-- Explicit product choice keeps multi-product redemptions deterministic.
CREATE OR REPLACE FUNCTION "${schemaName}".select_counter_redemption_item_product_mapping(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_item_id varchar,
    p_mapping_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_item redemption_transaction_item%ROWTYPE;
    v_subscription_id varchar;
    v_reason text;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT item.*
      INTO v_item
      FROM redemption_transaction_item item
      JOIN redemption_transaction transaction_row
        ON transaction_row.redemption_transaction_id = item.redemption_transaction_id
     WHERE item.redemption_transaction_item_id = p_item_id
       AND item.redemption_transaction_id = p_transaction_id
       AND transaction_row.organization_id = p_organization_id
       AND transaction_row.status = 'PENDING'
       AND (transaction_row.store_id IS NULL OR transaction_row.store_id = p_store_id)
       AND (transaction_row.staff_id IS NULL OR transaction_row.staff_id = p_staff_id)
     FOR UPDATE OF item, transaction_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending redemption item is unavailable' USING ERRCODE = '23503';
    END IF;

    IF v_item.item_type = 'BENEFIT' THEN
        SELECT transaction_row.subscription_id
          INTO v_subscription_id
          FROM redemption_transaction transaction_row
         WHERE transaction_row.redemption_transaction_id = p_transaction_id;

        v_reason := counter_benefit_rejection(
            p_organization_id,
            v_subscription_id,
            v_item.benefit_id,
            p_store_id
        );

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505';
        END IF;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM commerce_product_mappings mapping
         WHERE mapping.commerce_product_mapping_id = p_mapping_id
           AND mapping.organization_id = p_organization_id
           AND mapping.is_active
           AND NOT mapping.is_deleted
           AND (mapping.store_id = p_store_id OR mapping.store_id IS NULL)
           AND NOT (
                mapping.store_id IS NULL
                AND EXISTS (
                    SELECT 1
                      FROM commerce_product_mappings store_mapping
                     WHERE store_mapping.organization_id = mapping.organization_id
                       AND store_mapping.product_id = mapping.product_id
                       AND store_mapping.integration_configuration_id IS NOT DISTINCT FROM mapping.integration_configuration_id
                       AND store_mapping.store_id = p_store_id
                       AND store_mapping.is_active
                       AND NOT store_mapping.is_deleted
                )
           )
           AND ((v_item.item_type = 'BENEFIT' AND EXISTS (
                SELECT 1 FROM benefit_product bp
                 WHERE bp.benefit_id = v_item.benefit_id
                   AND bp.organization_id = p_organization_id
                   AND bp.product_id = mapping.product_id
                   AND bp.is_active AND NOT bp.is_deleted
           )) OR (v_item.item_type = 'OFFER' AND EXISTS (
                SELECT 1 FROM offer_product op
                 WHERE op.offer_id = v_item.offer_id
                   AND op.organization_id = p_organization_id
                   AND op.product_id = mapping.product_id
                   AND op.is_active AND NOT op.is_deleted
           )))
    ) THEN
        RAISE EXCEPTION 'Selected POS product does not apply to redemption item' USING ERRCODE = '23503';
    END IF;

    UPDATE redemption_transaction_item
       SET commerce_product_mapping_id = p_mapping_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_item_id = p_item_id;

    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".counter_benefit_rejection(varchar, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_benefit_rejection(varchar, varchar, varchar, varchar)
    TO "${appRole}";
