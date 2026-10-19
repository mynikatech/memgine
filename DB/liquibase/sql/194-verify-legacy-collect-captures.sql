-- M194. Original-payment-bound read-only lookup permits provider verification when
-- historical capture merchant/store fields were not recorded. No refund dispatch.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_collect_original_binding(
    p_org varchar, p_refund varchar, p_actor varchar
) RETURNS TABLE (
    "paymentRefundId" varchar, "originalCaptureId" varchar,
    "capturedAmountMinor" bigint, "refundAmountMinor" bigint,
    "currencyCode" varchar, "integrationConfigurationId" varchar,
    "businessId" varchar, "providerStoreId" varchar,
    "applicationId" varchar, "secretReference" varchar,
    "merchantCurrencyCode" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF NOT can_administer_organization(p_org,p_actor) THEN
   RAISE EXCEPTION 'Refund access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT r.payment_refund_id,c.provider_transaction_id,r.captured_amount_minor,
        r.refund_amount_minor,r.currency_code,cfg.integration_configuration_id,
        cfg.provider_business_id,cfg.provider_store_id,cfg.application_id,
        cfg.credential_secret_reference,cfg.merchant_currency_code
 FROM payment_refunds r
 JOIN payment_intents pi ON pi.payment_intent_id=r.payment_intent_id
    AND pi.organization_id=r.organization_id
 JOIN poynt_collect_verified_captures c ON c.payment_intent_id=pi.payment_intent_id
    AND c.organization_id=r.organization_id
    AND c.provider_transaction_id=r.original_provider_transaction_reference
    AND c.amount_minor=r.captured_amount_minor
    AND upper(c.currency_code)=upper(r.currency_code)
 JOIN commerce_provider_catalog_configurations cfg
    ON cfg.integration_configuration_id=r.original_integration_configuration_id
    AND cfg.organization_id=r.organization_id
 JOIN integration_configurations ic ON ic.integration_configuration_id=cfg.integration_configuration_id
    AND ic.organization_id=cfg.organization_id
 WHERE r.organization_id=p_org AND r.payment_refund_id=p_refund
   AND r.approval_status='APPROVED' AND r.execution_status='READY'
   AND r.original_provider_code='POYNT_COLLECT'
   AND pi.provider_reference_id=c.provider_transaction_id
   AND (c.merchant_business_id IS NULL OR c.merchant_business_id=cfg.provider_business_id)
   AND (c.merchant_store_id IS NULL OR c.merchant_store_id=cfg.provider_store_id)
   AND upper(cfg.merchant_currency_code)=upper(r.currency_code)
   AND NOT cfg.is_deleted AND NOT ic.is_deleted AND upper(ic.provider)='POYNT'
   AND NULLIF(btrim(cfg.provider_business_id),'') IS NOT NULL
   AND NULLIF(btrim(cfg.provider_store_id),'') IS NOT NULL
   AND NULLIF(btrim(cfg.application_id),'') IS NOT NULL
   AND NULLIF(btrim(cfg.credential_secret_reference),'') IS NOT NULL;
END;$f$;

-- Called ONLY by the server after exact-ID live Poynt confirmation. It is not
-- proof by itself. Fail closed on stale refund/config/capture changes.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_record_verified_legacy_merchant(
 p_org varchar,p_refund varchar,p_actor varchar,p_capture varchar,
 p_business varchar,p_store varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_refund payment_refunds%ROWTYPE;
        v_capture poynt_collect_verified_captures%ROWTYPE;
        v_cfg commerce_provider_catalog_configurations%ROWTYPE;
BEGIN
 IF NOT can_administer_organization(p_org,p_actor) THEN
   RAISE EXCEPTION 'Refund access denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_refund FROM payment_refunds
 WHERE organization_id=p_org AND payment_refund_id=p_refund FOR UPDATE;
 IF NOT FOUND OR v_refund.approval_status<>'APPROVED'
    OR v_refund.execution_status<>'READY'
    OR v_refund.original_provider_code<>'POYNT_COLLECT'
    OR v_refund.original_provider_transaction_reference IS DISTINCT FROM p_capture THEN
   RETURN FALSE;
 END IF;
 SELECT * INTO v_cfg FROM commerce_provider_catalog_configurations
 WHERE organization_id=p_org
   AND integration_configuration_id=v_refund.original_integration_configuration_id;
 IF NOT FOUND OR v_cfg.is_deleted OR v_cfg.provider_business_id IS DISTINCT FROM p_business
    OR v_cfg.provider_store_id IS DISTINCT FROM p_store
    OR upper(v_cfg.merchant_currency_code)<>upper(v_refund.currency_code)
    OR NOT EXISTS (SELECT 1 FROM integration_configurations ic
      WHERE ic.integration_configuration_id=v_cfg.integration_configuration_id
      AND ic.organization_id=p_org AND NOT ic.is_deleted AND upper(ic.provider)='POYNT') THEN
   RETURN FALSE;
 END IF;
 SELECT * INTO v_capture FROM poynt_collect_verified_captures
 WHERE organization_id=p_org AND payment_intent_id=v_refund.payment_intent_id
   AND provider_transaction_id=p_capture
   AND amount_minor=v_refund.captured_amount_minor
   AND upper(currency_code)=upper(v_refund.currency_code) FOR UPDATE;
 IF NOT FOUND OR (v_capture.merchant_business_id IS NOT NULL
    AND v_capture.merchant_business_id IS DISTINCT FROM p_business)
    OR (v_capture.merchant_store_id IS NOT NULL
    AND v_capture.merchant_store_id IS DISTINCT FROM p_store) THEN
   RETURN FALSE;
 END IF;
 UPDATE poynt_collect_verified_captures
    SET merchant_business_id=p_business, merchant_store_id=p_store
 WHERE organization_id=p_org AND payment_intent_id=v_refund.payment_intent_id
   AND provider_transaction_id=p_capture;
 RETURN TRUE;
END;$f$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_collect_original_binding(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_record_verified_legacy_merchant(varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_collect_original_binding(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_record_verified_legacy_merchant(varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
