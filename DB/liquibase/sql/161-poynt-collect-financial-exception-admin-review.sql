-- Stage B1: read-only, evidence-backed correlation for administrator review.
-- A matching prior purchase is only a possible duplicate. The persisted model
-- cannot prove whether it was a legitimate renewal or a mistaken repeat charge.

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_collect_exception_correlation(
    p_organization_id varchar,
    p_financial_exception_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "financialExceptionId" varchar,
    "sourcePaymentIntentId" varchar,
    "sourceProviderTransactionId" varchar,
    "customerUserId" varchar,
    "membershipPlanId" varchar,
    "candidatePaymentIntentId" varchar,
    "candidateProviderTransactionId" varchar,
    "candidateSubscriptionId" varchar,
    "candidatePaymentStatus" varchar,
    "evidenceClassification" varchar,
    "evidenceReason" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_exception poynt_collect_financial_exceptions%ROWTYPE;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is unavailable' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_exception
      FROM poynt_collect_financial_exceptions
     WHERE financial_exception_id = p_financial_exception_id
       AND organization_id = p_organization_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Financial exception was not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT v_exception.financial_exception_id,
           v_exception.payment_intent_id,
           v_exception.provider_transaction_id,
           v_exception.customer_user_id,
           v_exception.membership_plan_id,
           candidate.payment_intent_id,
           candidate.provider_reference_id,
           candidate.finalized_subscription_id,
           candidate.status,
           'POSSIBLE_DUPLICATE'::varchar,
           'Same organization, customer, and membership plan; successful payment is linked to its finalized subscription. This does not prove the later capture was erroneous.'::varchar
      FROM payment_intents candidate
      JOIN subscriptions subscription
        ON subscription.subscription_id = candidate.finalized_subscription_id
       AND subscription.subscription_plan_id = v_exception.membership_plan_id
      JOIN organization_user subscription_owner
        ON subscription_owner.organization_user_id = subscription.organization_user_id
       AND subscription_owner.organization_id = v_exception.organization_id
       AND subscription_owner.user_id = v_exception.customer_user_id
     WHERE candidate.organization_id = v_exception.organization_id
       AND candidate.customer_user_id = v_exception.customer_user_id
       AND candidate.membership_plan_id = v_exception.membership_plan_id
       AND candidate.payment_intent_id <> v_exception.payment_intent_id
       AND candidate.status = 'SUCCEEDED'
       AND candidate.finalized_subscription_id IS NOT NULL
     ORDER BY candidate.created_at ASC, candidate.payment_intent_id ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_collect_exception_correlation_summary(
    p_organization_id varchar,
    p_financial_exception_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "financialExceptionId" varchar,
    "candidateCount" bigint,
    "evidenceClassification" varchar,
    "evidenceReason" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_exception poynt_collect_financial_exceptions%ROWTYPE;
    v_candidate_count bigint;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is unavailable' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_exception
      FROM poynt_collect_financial_exceptions
     WHERE financial_exception_id = p_financial_exception_id
       AND organization_id = p_organization_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Financial exception was not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) INTO v_candidate_count
      FROM payment_intents candidate
      JOIN subscriptions subscription
        ON subscription.subscription_id = candidate.finalized_subscription_id
       AND subscription.subscription_plan_id = v_exception.membership_plan_id
      JOIN organization_user subscription_owner
        ON subscription_owner.organization_user_id = subscription.organization_user_id
       AND subscription_owner.organization_id = v_exception.organization_id
       AND subscription_owner.user_id = v_exception.customer_user_id
     WHERE candidate.organization_id = v_exception.organization_id
       AND candidate.customer_user_id = v_exception.customer_user_id
       AND candidate.membership_plan_id = v_exception.membership_plan_id
       AND candidate.payment_intent_id <> v_exception.payment_intent_id
       AND candidate.status = 'SUCCEEDED'
       AND candidate.finalized_subscription_id IS NOT NULL;

    RETURN QUERY
    SELECT v_exception.financial_exception_id,
           v_candidate_count,
           CASE
               WHEN v_candidate_count = 0 THEN 'NO_MATCHING_FINALIZED_PURCHASE'
               WHEN v_candidate_count = 1 THEN 'POSSIBLE_DUPLICATE'
               ELSE 'MANUAL_REVIEW'
           END::varchar,
           CASE
               WHEN v_candidate_count = 0 THEN
                   'No successful payment linked to a finalized subscription for the same organization, customer, and membership plan was found.'
               WHEN v_candidate_count = 1 THEN
                   'One successful payment linked to a finalized subscription matches the organization, customer, and membership plan. Manual review is required; the data does not prove a duplicate charge.'
               ELSE
                   'Multiple successful payments linked to finalized subscriptions match the organization, customer, and membership plan. Manual review is required.'
           END::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_get_collect_exception_correlation(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_get_collect_exception_correlation_summary(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_get_collect_exception_correlation(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_get_collect_exception_correlation_summary(varchar,varchar,varchar) TO "${appRole}";

