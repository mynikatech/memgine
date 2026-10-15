-- Stage B: durable, organization-scoped captured-but-unfulfilled payment cases.
-- This migration does NOT classify an existing membership as a proven duplicate,
-- nor does it change payment status, finalization, refund state, or subscriptions.
CREATE TABLE "${schemaName}".poynt_collect_financial_exceptions (
    financial_exception_id varchar(64) PRIMARY KEY,
    payment_intent_id varchar(64) NOT NULL UNIQUE
        REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    customer_user_id varchar(64) NOT NULL
        REFERENCES "${schemaName}"."user"(user_id),
    membership_plan_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".subscription_plans(subscription_plan_id),
    provider_transaction_id varchar(160) NOT NULL UNIQUE,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency_code varchar(10) NOT NULL,
    classification varchar(40) NOT NULL DEFAULT 'CAPTURED_UNFULFILLED'
        CHECK (classification IN ('CAPTURED_UNFULFILLED', 'POSSIBLE_DUPLICATE',
                                  'VERIFIED_DUPLICATE', 'FINALIZATION_RETRY_REQUIRED',
                                  'MANUAL_REVIEW')),
    case_status varchar(32) NOT NULL DEFAULT 'OPEN'
        CHECK (case_status IN ('OPEN','UNDER_REVIEW','RESOLVED','CLOSED')),
    related_payment_intent_id varchar(64)
        REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    related_subscription_id varchar(64)
        REFERENCES "${schemaName}".subscriptions(subscription_id),
    classification_reason varchar(500),
    opened_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamptz,
    CONSTRAINT ck_poynt_exception_related_payment CHECK (
        related_payment_intent_id IS NULL OR related_payment_intent_id <> payment_intent_id
    ),
    CONSTRAINT ck_poynt_exception_resolution CHECK (
        case_status NOT IN ('RESOLVED','CLOSED') OR resolved_at IS NOT NULL
    )
);

CREATE INDEX ix_poynt_exception_org_status
    ON "${schemaName}".poynt_collect_financial_exceptions
       (organization_id, case_status, opened_at DESC);
CREATE INDEX ix_poynt_exception_customer
    ON "${schemaName}".poynt_collect_financial_exceptions
       (customer_user_id, opened_at DESC);

-- Note: the application can open only a case whose capture was already
-- verified by Stage A; it cannot insert cases or assert duplicate classification
-- directly. Intent row-lock serializes with concurrent payment finalization.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_open_collect_financial_exception(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_case_id varchar;
BEGIN
    SELECT * INTO v_intent FROM payment_intents
      WHERE payment_intent_id = p_intent_id
        AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;
    IF v_intent.provider_code <> 'POYNT_COLLECT'
    OR v_intent.authorization_mode <> 'CUSTOMER_SESSION'
    OR v_intent.customer_user_id IS NULL
        OR v_intent.status <> 'PROCESSING'
        OR v_intent.finalized_subscription_id IS NOT NULL THEN
        RAISE EXCEPTION 'Payment is not eligible for exception review' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_capture FROM poynt_collect_verified_captures
      WHERE payment_intent_id = p_intent_id
        AND organization_id = p_organization_id;
    IF NOT FOUND OR v_capture.provider_transaction_id IS DISTINCT FROM v_intent.provider_reference_id
        OR round(v_intent.amount * 100)::bigint <> v_capture.amount_minor
        OR upper(v_intent.currency_code) <> upper(v_capture.currency_code) THEN
        RAISE EXCEPTION 'Verified capture is unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO poynt_collect_financial_exceptions (
        financial_exception_id, payment_intent_id, organization_id,
        customer_user_id, membership_plan_id, provider_transaction_id,
        amount_minor, currency_code
    ) VALUES (
        'PFE_' || gen_random_uuid()::text, p_intent_id, p_organization_id,
        v_intent.customer_user_id, v_intent.membership_plan_id,
        v_capture.provider_transaction_id, v_capture.amount_minor,
        upper(v_capture.currency_code)
    ) ON CONFLICT (payment_intent_id) DO NOTHING;
    SELECT financial_exception_id INTO v_case_id
      FROM poynt_collect_financial_exceptions
     WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id;
    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'Exception case was not created' USING ERRCODE = '23514';
    END IF;
    RETURN v_case_id;
END;
$function$;

-- Read-only case lookup for the owning customer. Admin access uses a separate
-- explicitly scoped path in the Stage B Kotlin API, not a broad table grant.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_collect_financial_exception(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "financialExceptionId" varchar, "paymentIntentId" varchar,
    "classification" varchar, "caseStatus" varchar,
    "relatedPaymentIntentId" varchar, "relatedSubscriptionId" varchar,
    "amountMinor" bigint, "currencyCode" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT e.financial_exception_id, e.payment_intent_id,
           e.classification, e.case_status,
           e.related_payment_intent_id, e.related_subscription_id,
           e.amount_minor, e.currency_code
      FROM poynt_collect_financial_exceptions e
     WHERE e.organization_id = p_organization_id
       AND e.payment_intent_id = p_intent_id
       AND payment_actor_is_authorized(p_intent_id, p_actor_user_id);
$function$;

REVOKE ALL ON TABLE "${schemaName}".poynt_collect_financial_exceptions FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_open_collect_financial_exception(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_get_collect_financial_exception(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_open_collect_financial_exception(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_get_collect_financial_exception(varchar,varchar,varchar) TO "${appRole}";
