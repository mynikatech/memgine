-- Read-only organization financial investigation. No provider mutations.
-- Payment intent, not payment attempt, is the list unit to avoid retry double counting.
CREATE OR REPLACE FUNCTION "${schemaName}".org_transaction_payment_list(
  p_organization_id varchar, p_actor_user_id varchar,
  p_support_request_id varchar DEFAULT NULL
) RETURNS TABLE (
  "paymentIntentId" varchar, "customerUserId" varchar, "customerName" text,
  "paymentStatus" varchar, "providerCode" varchar, "providerReference" varchar,
  "amountMinor" bigint, "currencyCode" varchar, "createdAt" text,
  "storeId" varchar, "staffId" varchar, "authorizationMode" varchar,
  "subscriptionId" varchar, "membershipPlanId" varchar,
  "attemptCount" bigint, "latestAttemptStatus" varchar,
  "refundedMinor" bigint, "reservedRefundMinor" bigint,
  "financialExceptionId" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_customer varchar;
BEGIN
  IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR
          rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN
    RAISE EXCEPTION 'Organization transaction access denied' USING ERRCODE='42501';
  END IF;
  IF p_support_request_id IS NOT NULL THEN
    SELECT r.customer_user_id INTO v_customer
    FROM customer_support_requests r
    WHERE r.support_request_id=p_support_request_id
      AND r.organization_id=p_organization_id
      AND r.support_destination='BUSINESS';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Support request is unavailable' USING ERRCODE='P0002';
    END IF;
  END IF;
  RETURN QUERY
  SELECT i.payment_intent_id, i.customer_user_id,
         nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),'')::text,
         i.status, pc.provider_code, i.provider_reference_id,
         round(i.amount*100)::bigint, i.currency_code, i.created_at::text,
         i.store_id,i.staff_id,i.authorization_mode,i.finalized_subscription_id,i.membership_plan_id,
         (SELECT count(*) FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id),
         (SELECT a.status FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id
           ORDER BY a.created_at DESC,a.payment_attempt_id DESC LIMIT 1),
         (SELECT coalesce(sum(r.refund_amount_minor),0)::bigint FROM payment_refunds r
           WHERE r.organization_id=p_organization_id AND r.payment_intent_id=i.payment_intent_id
             AND r.execution_status='SUCCEEDED'),
         (SELECT coalesce(sum(r.refund_amount_minor),0)::bigint FROM payment_refunds r
           WHERE r.organization_id=p_organization_id AND r.payment_intent_id=i.payment_intent_id
             AND r.approval_status='APPROVED' AND r.execution_status IN
               ('READY','PENDING','UNKNOWN_REQUIRES_RECONCILIATION','UNSUPPORTED_REQUIRES_MANUAL')),
         (SELECT e.financial_exception_id FROM poynt_collect_financial_exceptions e
           WHERE e.organization_id=p_organization_id AND e.payment_intent_id=i.payment_intent_id
           ORDER BY e.opened_at DESC LIMIT 1)
  FROM payment_intents i
  JOIN payment_provider_configs pc ON pc.payment_provider_config_id=i.payment_provider_config_id
  LEFT JOIN "user" u ON u.user_id=i.customer_user_id
  WHERE i.organization_id=p_organization_id AND (v_customer IS NULL OR i.customer_user_id=v_customer)
  ORDER BY i.created_at DESC,i.payment_intent_id DESC;
END $f$;
REVOKE ALL ON FUNCTION "${schemaName}".org_transaction_payment_list(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".org_transaction_payment_list(varchar,varchar,varchar) TO "${appRole}";
