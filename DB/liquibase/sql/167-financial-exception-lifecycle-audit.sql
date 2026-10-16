-- P4-C: append-only, provider-neutral financial-exception lifecycle audit.

CREATE TABLE "${schemaName}".financial_exception_events (
    financial_exception_event_id varchar(64) PRIMARY KEY,
    financial_exception_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".poynt_collect_financial_exceptions(financial_exception_id),
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    event_type varchar(40) NOT NULL CHECK (event_type IN (
        'OPENED', 'RECOVERY_SUCCEEDED', 'RECOVERY_FAILED', 'STATUS_CHANGED'
    )),
    previous_case_status varchar(32),
    new_case_status varchar(32),
    previous_fulfillment_outcome varchar(32),
    new_fulfillment_outcome varchar(32),
    actor_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    actor_origin varchar(32) NOT NULL CHECK (actor_origin IN ('SYSTEM', 'CUSTOMER', 'COUNTER', 'ORG_ADMIN')),
    description varchar(500) NOT NULL,
    event_identity varchar(200) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_financial_exception_events_case
    ON "${schemaName}".financial_exception_events(financial_exception_id, created_at, financial_exception_event_id);
CREATE INDEX ix_financial_exception_events_organization
    ON "${schemaName}".financial_exception_events(organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64);
    v_origin varchar(32);
    v_reason varchar(500);
    v_event_type varchar(40);
    v_identity varchar(200);
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO financial_exception_events (
            financial_exception_event_id, financial_exception_id, organization_id,
            event_type, new_case_status, new_fulfillment_outcome, actor_origin,
            description, event_identity
        ) VALUES (
            'FEE_' || gen_random_uuid()::text, NEW.financial_exception_id, NEW.organization_id,
            'OPENED', NEW.case_status, NEW.fulfillment_outcome, 'SYSTEM',
            'Financial exception opened from persisted payment evidence.',
            'OPENED:' || NEW.financial_exception_id
        ) ON CONFLICT (event_identity) DO NOTHING;
        RETURN NEW;
    END IF;

    IF NEW.case_status IS NOT DISTINCT FROM OLD.case_status
       AND NEW.fulfillment_outcome IS NOT DISTINCT FROM OLD.fulfillment_outcome THEN
        RETURN NEW;
    END IF;

    v_actor := NULLIF(current_setting('memgine.financial_exception_actor', true), '');
    v_reason := NULLIF(current_setting('memgine.financial_exception_reason', true), '');
    v_origin := COALESCE(NULLIF(current_setting('memgine.financial_exception_origin', true), ''), 'SYSTEM');
    IF v_origin NOT IN ('SYSTEM', 'CUSTOMER', 'COUNTER', 'ORG_ADMIN') THEN
        v_origin := 'SYSTEM';
    END IF;
    v_event_type := CASE
        WHEN NEW.fulfillment_outcome = 'FULFILLED'
         AND OLD.fulfillment_outcome IS DISTINCT FROM 'FULFILLED'
        THEN 'RECOVERY_SUCCEEDED'
        ELSE 'STATUS_CHANGED'
    END;
    v_identity := CASE
        WHEN v_event_type = 'RECOVERY_SUCCEEDED'
        THEN 'RECOVERY_SUCCEEDED:' || NEW.financial_exception_id
        ELSE 'STATUS_CHANGED:' || NEW.financial_exception_id || ':' || gen_random_uuid()::text
    END;

    INSERT INTO financial_exception_events (
        financial_exception_event_id, financial_exception_id, organization_id,
        event_type, previous_case_status, new_case_status,
        previous_fulfillment_outcome, new_fulfillment_outcome,
        actor_user_id, actor_origin, description, event_identity
    ) VALUES (
        'FEE_' || gen_random_uuid()::text, NEW.financial_exception_id, NEW.organization_id,
        v_event_type, OLD.case_status, NEW.case_status,
        OLD.fulfillment_outcome, NEW.fulfillment_outcome,
        v_actor, v_origin,
        COALESCE(left(v_reason, 500), CASE WHEN v_event_type = 'RECOVERY_SUCCEEDED'
            THEN 'Verified fulfillment recovery completed.'
            ELSE 'Financial exception lifecycle status changed.' END),
        v_identity
    ) ON CONFLICT (event_identity) DO NOTHING;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER financial_exception_audit_after_change
AFTER INSERT OR UPDATE OF case_status, fulfillment_outcome
ON "${schemaName}".poynt_collect_financial_exceptions
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".financial_exception_audit_trigger();

-- Migration 167 is introduced after financial exceptions already exist.  Give
-- every existing case one neutral opening event without inventing an actor or
-- any recovery history.  Future inserts are captured by the trigger above.
INSERT INTO financial_exception_events (
    financial_exception_event_id, financial_exception_id, organization_id,
    event_type, new_case_status, new_fulfillment_outcome, actor_origin,
    description, event_identity, created_at
)
SELECT
    'FEE_' || gen_random_uuid()::text,
    e.financial_exception_id,
    e.organization_id,
    'OPENED',
    NULL::varchar(32),
    NULL::varchar(32),
    'SYSTEM',
    'Historical exception opening; original opening state and fulfillment outcome were not reconstructed.',
    'OPENED:' || e.financial_exception_id,
    e.opened_at
FROM poynt_collect_financial_exceptions e
ON CONFLICT (event_identity) DO NOTHING;

CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_record_recovery_failure(
    p_organization_id varchar, p_payment_intent_id varchar,
    p_commerce_transaction_id varchar, p_actor_user_id varchar,
    p_recovery_attempt_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_case poynt_collect_financial_exceptions%ROWTYPE;
BEGIN
    IF (p_payment_intent_id IS NULL) = (p_commerce_transaction_id IS NULL) THEN
        RAISE EXCEPTION 'Exactly one financial exception source is required' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(p_recovery_attempt_id), '') IS NULL OR length(p_recovery_attempt_id) > 100 THEN
        RAISE EXCEPTION 'Recovery attempt identity is required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_case FROM poynt_collect_financial_exceptions
     WHERE organization_id = p_organization_id
       AND ((p_payment_intent_id IS NOT NULL AND payment_intent_id = p_payment_intent_id)
         OR (p_commerce_transaction_id IS NOT NULL AND commerce_transaction_id = p_commerce_transaction_id))
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial exception is unavailable' USING ERRCODE = 'P0002'; END IF;
    IF p_payment_intent_id IS NOT NULL THEN
        IF NOT payment_actor_is_authorized(p_payment_intent_id, p_actor_user_id) THEN
            RAISE EXCEPTION 'Financial exception is unavailable' USING ERRCODE = '42501';
        END IF;
    ELSE
        PERFORM commerce_counter_checkout_actor_organization_user(p_commerce_transaction_id, p_actor_user_id);
    END IF;
    INSERT INTO financial_exception_events (
        financial_exception_event_id, financial_exception_id, organization_id, event_type,
        previous_case_status, new_case_status, previous_fulfillment_outcome, new_fulfillment_outcome,
        actor_user_id, actor_origin, description, event_identity
    ) VALUES (
        'FEE_' || gen_random_uuid()::text, v_case.financial_exception_id, v_case.organization_id, 'RECOVERY_FAILED',
        v_case.case_status, v_case.case_status, v_case.fulfillment_outcome, v_case.fulfillment_outcome,
        p_actor_user_id, CASE WHEN p_payment_intent_id IS NULL THEN 'COUNTER' ELSE 'CUSTOMER' END,
        CASE WHEN v_case.case_status = 'RESOLVED' AND v_case.fulfillment_outcome = 'FULFILLED'
            THEN 'A fulfillment recovery attempt did not complete after the exception was already fulfilled.'
            ELSE 'A fulfillment recovery attempt did not complete; the exception remains available for review.'
        END,
        'RECOVERY_FAILED:' || v_case.financial_exception_id || ':' || btrim(p_recovery_attempt_id)
    ) ON CONFLICT (event_identity) DO NOTHING;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_transition(
    p_organization_id varchar, p_financial_exception_id varchar,
    p_new_status varchar, p_reason varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_case poynt_collect_financial_exceptions%ROWTYPE; v_valid boolean := false;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Financial exception administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_reason), '') IS NULL OR length(p_reason) > 500 THEN
        RAISE EXCEPTION 'A sanitized lifecycle reason is required' USING ERRCODE = '22023';
    END IF;
    IF p_reason ~* '(token|nonce|pan|cvv|card[ _-]?(number|data)|secret|private[ _-]?key|authorization|bearer|jwt|payload|[{}])' THEN
        RAISE EXCEPTION 'Lifecycle reason must not contain payment or credential data' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_case FROM poynt_collect_financial_exceptions
     WHERE financial_exception_id = p_financial_exception_id AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial exception is unavailable' USING ERRCODE = 'P0002'; END IF;
    v_valid := (v_case.case_status = 'OPEN' AND p_new_status = 'UNDER_REVIEW')
            OR (v_case.case_status = 'UNDER_REVIEW' AND p_new_status = 'OPEN')
            OR (v_case.case_status IN ('OPEN','UNDER_REVIEW') AND p_new_status = 'RESOLVED'
                AND v_case.fulfillment_outcome = 'FULFILLED')
            OR (v_case.case_status = 'RESOLVED' AND p_new_status = 'CLOSED');
    IF NOT v_valid THEN
        RAISE EXCEPTION 'Financial exception lifecycle transition is not permitted' USING ERRCODE = '22023';
    END IF;
    -- RESOLVED is a review-state acknowledgement of fulfillment proven by
    -- migration 166.  A manual transition cannot assert a financial or
    -- fulfillment outcome on its own.
    IF p_new_status = 'RESOLVED' AND (
        (v_case.payment_intent_id IS NOT NULL
            AND NULLIF(btrim(v_case.related_subscription_id), '') IS NULL)
        OR
        (v_case.commerce_transaction_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
              FROM commerce_transactions c
             WHERE c.commerce_transaction_id = v_case.commerce_transaction_id
               AND c.organization_id = p_organization_id
               AND NOT c.is_deleted
               AND (
                   (c.source_channel = 'COUNTER_REDEMPTION' AND c.status = 'COMPLETED')
                   OR
                   (c.source_channel = 'COUNTER'
                       AND NULLIF(btrim(c.subscription_id), '') IS NOT NULL)
               )
        ))
    ) THEN
        RAISE EXCEPTION 'Verified fulfillment evidence is unavailable' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('memgine.financial_exception_actor', p_actor_user_id, true);
    PERFORM set_config('memgine.financial_exception_origin', 'ORG_ADMIN', true);
    PERFORM set_config('memgine.financial_exception_reason', btrim(p_reason), true);
    UPDATE poynt_collect_financial_exceptions
       SET case_status = p_new_status,
           resolved_at = CASE WHEN p_new_status IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
     WHERE financial_exception_id = v_case.financial_exception_id;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_list(
    p_organization_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "financialExceptionId" varchar, "sourceChannel" varchar, "providerCode" varchar,
    "providerReferenceId" varchar, "providerTransactionId" varchar, "amountMinor" bigint,
    "currencyCode" varchar, "caseStatus" varchar, "fulfillmentOutcome" varchar,
    "openedAt" text, "updatedAt" text, "resolvedAt" text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT e.financial_exception_id, e.source_channel, e.provider_code, e.provider_reference_id,
        e.provider_transaction_id, e.amount_minor, e.currency_code, e.case_status,
        e.fulfillment_outcome, e.opened_at::text, e.updated_at::text, e.resolved_at::text
   FROM poynt_collect_financial_exceptions e
  WHERE e.organization_id = p_organization_id
    AND can_administer_organization(p_organization_id, p_actor_user_id)
  ORDER BY e.opened_at DESC, e.financial_exception_id DESC;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_detail(
    p_organization_id varchar, p_financial_exception_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "financialExceptionId" varchar, "paymentIntentId" varchar, "commerceTransactionId" varchar,
    "sourceChannel" varchar, "providerCode" varchar, "providerReferenceId" varchar,
    "providerTransactionId" varchar, "amountMinor" bigint, "currencyCode" varchar,
    classification varchar, "evidenceReason" varchar, "caseStatus" varchar,
    "fulfillmentOutcome" varchar, "openedAt" text, "updatedAt" text, "resolvedAt" text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT e.financial_exception_id, e.payment_intent_id, e.commerce_transaction_id,
        e.source_channel, e.provider_code, e.provider_reference_id, e.provider_transaction_id,
        e.amount_minor, e.currency_code, e.classification, e.evidence_reason, e.case_status,
        e.fulfillment_outcome, e.opened_at::text, e.updated_at::text, e.resolved_at::text
   FROM poynt_collect_financial_exceptions e
  WHERE e.organization_id = p_organization_id
    AND e.financial_exception_id = p_financial_exception_id
    AND can_administer_organization(p_organization_id, p_actor_user_id);
$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_events(
    p_organization_id varchar, p_financial_exception_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "eventId" varchar, "eventType" varchar, "previousCaseStatus" varchar,
    "newCaseStatus" varchar, "previousFulfillmentOutcome" varchar,
    "newFulfillmentOutcome" varchar, "actorUserId" varchar, "actorOrigin" varchar,
    description varchar, "createdAt" text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT x.financial_exception_event_id, x.event_type, x.previous_case_status, x.new_case_status,
        x.previous_fulfillment_outcome, x.new_fulfillment_outcome, x.actor_user_id,
        x.actor_origin, x.description, x.created_at::text
   FROM financial_exception_events x
   JOIN poynt_collect_financial_exceptions e ON e.financial_exception_id = x.financial_exception_id
  WHERE x.organization_id = p_organization_id AND x.financial_exception_id = p_financial_exception_id
    AND can_administer_organization(p_organization_id, p_actor_user_id)
  ORDER BY x.created_at, x.financial_exception_event_id;
$function$;

REVOKE ALL ON TABLE "${schemaName}".financial_exception_events FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".financial_exception_audit_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".financial_exception_record_recovery_failure(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".financial_exception_transition(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".financial_exception_list(varchar,varchar),
    "${schemaName}".financial_exception_detail(varchar,varchar,varchar),
    "${schemaName}".financial_exception_events(varchar,varchar,varchar)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".financial_exception_record_recovery_failure(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".financial_exception_transition(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".financial_exception_list(varchar,varchar),
    "${schemaName}".financial_exception_detail(varchar,varchar,varchar),
    "${schemaName}".financial_exception_events(varchar,varchar,varchar)
TO "${appRole}";
