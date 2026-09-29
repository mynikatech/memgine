-- Configurable, organization-scoped lifetime for a consolidated redemption
-- transaction and its derived QR. A missing or invalid override resolves to
-- the system default of ten minutes.
CREATE TABLE IF NOT EXISTS "${schemaName}".organization_redemption_configurations (
    organization_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".organization(organization_id),
    configuration_key varchar(64) NOT NULL DEFAULT 'REDEMPTION_QR_EXPIRY_MINUTES',
    redemption_qr_expiry_minutes integer NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_organization_redemption_configuration_key
        CHECK (configuration_key = 'REDEMPTION_QR_EXPIRY_MINUTES'),
    CONSTRAINT ck_organization_redemption_qr_expiry_minutes
        CHECK (redemption_qr_expiry_minutes BETWEEN 1 AND 60)
);

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_redemption_qr_expiry_minutes(
    p_organization_id varchar
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT COALESCE(
        (
            SELECT CASE
                WHEN configuration.redemption_qr_expiry_minutes BETWEEN 1 AND 60
                    THEN configuration.redemption_qr_expiry_minutes
            END
            FROM organization_redemption_configurations configuration
            WHERE configuration.organization_id = p_organization_id
              AND configuration.configuration_key = 'REDEMPTION_QR_EXPIRY_MINUTES'
              AND NOT configuration.is_deleted
        ),
        10
    );
$function$;
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
 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_benefit_rejection(p_organization_id,p_subscription_id,v_benefit); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_offer_rejection(p_organization_id,p_subscription_id,v_offer,p_store_id); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 v_id:=generate_runtime_id('RTX'); v_seq:=next_business_sequence('REDEMPTION_TRANSACTION',p_organization_id); v_number:=('RTX_'||lpad(v_seq::text,6,'0'))::varchar(64);
 v_expiry_minutes := get_organization_redemption_qr_expiry_minutes(p_organization_id);
 v_expires_at := v_now + make_interval(mins => v_expiry_minutes);
 INSERT INTO redemption_transaction(redemption_transaction_id,redemption_transaction_number,organization_id,subscription_id,store_id,staff_id,redemption_method,status,expires_at,created_by,updated_by) VALUES(v_id,v_number,p_organization_id,p_subscription_id,p_store_id,p_staff_id,p_redemption_method,'PENDING',v_expires_at,p_actor_user_id,p_actor_user_id);
 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,benefit_id,created_by,updated_by) VALUES(v_item,v_id,'BENEFIT',v_benefit,p_actor_user_id,p_actor_user_id); END LOOP;
 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,offer_id,created_by,updated_by) VALUES(v_item,v_id,'OFFER',v_offer,p_actor_user_id,p_actor_user_id); END LOOP;
 RETURN QUERY SELECT v_id,v_number,'PENDING'::varchar,v_expires_at::text;
END; $function$;
REVOKE ALL ON FUNCTION "${schemaName}".get_organization_redemption_qr_expiry_minutes(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".create_redemption_transaction_internal(varchar, varchar, varchar, varchar, varchar[], varchar[], varchar, varchar) FROM PUBLIC;
