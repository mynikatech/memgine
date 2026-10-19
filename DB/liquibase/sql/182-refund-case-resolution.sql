-- Phase 182A: case-linked refund readback. No provider dispatch or case closure changes.
-- Existing payment_refund_request and payment_refund_request_commerce continue to
-- enforce actor, source-payment, customer, refundable-balance and idempotency checks.
-- Financial exception linkage remains Collect-only under existing FK constraints.

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_case_list(
    p_organization_id varchar, p_actor_user_id varchar,
    p_support_request_id varchar, p_financial_exception_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar, "organizationId" varchar,
    "paymentIntentId" varchar, "supportRequestId" varchar,
    "financialExceptionId" varchar, "originalProviderCode" varchar,
    "refundAmountMinor" bigint, "currencyCode" varchar,
    "reasonCode" varchar, "approvalStatus" varchar,
    "executionStatus" varchar, "requestedAt" text, "versionNo" integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT (rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS')
        OR rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS')) THEN
        RAISE EXCEPTION 'Refund case access is not permitted' USING ERRCODE = '42501';
    END IF;
    IF (p_support_request_id IS NULL) = (p_financial_exception_id IS NULL) THEN
        RAISE EXCEPTION 'Exactly one refund case identifier is required' USING ERRCODE = '22023';
    END IF;
    IF p_support_request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM customer_support_requests s
        WHERE s.organization_id = p_organization_id
          AND s.support_request_id = p_support_request_id
    ) THEN RAISE EXCEPTION 'Support request is not available' USING ERRCODE = '22023'; END IF;
    IF p_financial_exception_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM poynt_collect_financial_exceptions e
        WHERE e.organization_id = p_organization_id
          AND e.financial_exception_id = p_financial_exception_id
    ) THEN RAISE EXCEPTION 'Financial exception is not available' USING ERRCODE = '22023'; END IF;
    RETURN QUERY
    SELECT r.payment_refund_id, r.organization_id, r.payment_intent_id,
           r.support_request_id, r.financial_exception_id, r.original_provider_code,
           r.refund_amount_minor, r.currency_code, r.reason_code, r.approval_status,
           r.execution_status, r.requested_at::text, r.version_no
    FROM payment_refunds r
    WHERE r.organization_id = p_organization_id
      AND (p_support_request_id IS NULL OR r.support_request_id = p_support_request_id)
      AND (p_financial_exception_id IS NULL OR r.financial_exception_id = p_financial_exception_id)
    ORDER BY r.requested_at DESC, r.payment_refund_id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_case_list(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_case_list(varchar,varchar,varchar,varchar) TO "${appRole}";
