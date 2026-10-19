-- M192: read-only refund execution preflight, cancellation-state read, and action configuration.
-- Depends on applied migrations 190 and 191. Does not enable live provider dispatch.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_collect_preflight(
 p_org varchar,p_refund varchar,p_actor varchar
) RETURNS TABLE (
 "paymentRefundId" varchar, "originalCaptureId" varchar,
 "capturedAmountMinor" bigint,"refundAmountMinor" bigint,"currencyCode" varchar,
 "integrationConfigurationId" varchar,"businessId" varchar,"providerStoreId" varchar,
 "applicationId" varchar,"secretReference" varchar,"merchantCurrencyCode" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF NOT can_administer_organization(p_org,p_actor) THEN
  RAISE EXCEPTION 'Refund access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT r.payment_refund_id,c.provider_transaction_id,r.captured_amount_minor,r.refund_amount_minor,
   r.currency_code,cfg.integration_configuration_id,cfg.provider_business_id,cfg.provider_store_id,
   cfg.application_id,cfg.credential_secret_reference,cfg.merchant_currency_code
 FROM payment_refunds r
 JOIN payment_intents pi ON pi.payment_intent_id=r.payment_intent_id AND pi.organization_id=r.organization_id
 JOIN poynt_collect_verified_captures c ON c.payment_intent_id=pi.payment_intent_id
   AND c.organization_id=r.organization_id AND c.provider_transaction_id=r.original_provider_transaction_reference
   AND c.amount_minor=r.captured_amount_minor AND upper(c.currency_code)=upper(r.currency_code)
 JOIN commerce_provider_catalog_configurations cfg ON cfg.integration_configuration_id=r.original_integration_configuration_id
   AND cfg.organization_id=r.organization_id
 JOIN integration_configurations ic ON ic.integration_configuration_id=cfg.integration_configuration_id
   AND ic.organization_id=cfg.organization_id
 WHERE r.organization_id=p_org AND r.payment_refund_id=p_refund
   AND r.approval_status='APPROVED' AND r.execution_status='READY'
   AND r.original_provider_code='POYNT_COLLECT'
   AND pi.provider_reference_id=c.provider_transaction_id
   AND cfg.provider_business_id=c.merchant_business_id AND cfg.provider_store_id=c.merchant_store_id
   AND upper(cfg.merchant_currency_code)=upper(r.currency_code)
   AND NOT cfg.is_deleted AND NOT ic.is_deleted AND upper(ic.provider)='POYNT'
   AND NULLIF(btrim(cfg.provider_business_id),'') IS NOT NULL
   AND NULLIF(btrim(cfg.provider_store_id),'') IS NOT NULL
   AND NULLIF(btrim(cfg.application_id),'') IS NOT NULL
   AND NULLIF(btrim(cfg.credential_secret_reference),'') IS NOT NULL;
END;$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_membership_action_read(
 p_org varchar,p_refund varchar,p_actor varchar
) RETURNS TABLE("subscriptionId" varchar,"actionStatus" varchar,"lastErrorCode" varchar)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF NOT can_administer_organization(p_org,p_actor) THEN
  RAISE EXCEPTION 'Refund access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT a.subscription_id,a.action_status,a.last_error_code
   FROM payment_refund_membership_actions a WHERE a.organization_id=p_org AND a.payment_refund_id=p_refund;
END;$f$;

-- Failure is recorded in a separate transaction after cancellation rolls back.
-- This never changes the refund's financial outcome and does not expose SQL errors.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_mark_membership_action_review(
 p_org varchar,p_refund varchar,p_actor varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF NOT can_administer_organization(p_org,p_actor) THEN
  RAISE EXCEPTION 'Refund access denied' USING ERRCODE='42501';
 END IF;
 UPDATE payment_refund_membership_actions a
 SET action_status='NEEDS_REVIEW',last_error_code='CANCELLATION_REQUIRES_REVIEW',
     version_no=version_no+1
 FROM payment_refunds r
 WHERE a.payment_refund_id=p_refund AND a.organization_id=p_org
   AND r.payment_refund_id=a.payment_refund_id AND r.organization_id=p_org
   AND r.execution_status='SUCCEEDED' AND a.action_status<>'COMPLETED';
 RETURN FOUND;
END;$f$;

-- Automatic, fail-isolated dependent cancellation for *every* verified transition
-- to SUCCEEDED, including provider callbacks and reconciliation. The trigger
-- performs no network calls, cannot initiate refunds and never undoes success.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_cancel_after_success()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF OLD.execution_status IS DISTINCT FROM 'SUCCEEDED'
    AND NEW.execution_status='SUCCEEDED'
    AND EXISTS (SELECT 1 FROM payment_refund_membership_actions a
       WHERE a.payment_refund_id=NEW.payment_refund_id
         AND a.organization_id=NEW.organization_id AND a.action_status<>'COMPLETED') THEN
   BEGIN
     PERFORM payment_refund_complete_membership_cancellation(
       NEW.organization_id,NEW.payment_refund_id,NEW.requested_by);
   EXCEPTION WHEN OTHERS THEN
     -- PL/pgSQL exception block rolls back ONLY the attempted cancellation.
     -- Provider refund status remains SUCCEEDED and no retry refund is sent.
     UPDATE payment_refund_membership_actions a
        SET action_status='NEEDS_REVIEW',last_error_code='CANCELLATION_REQUIRES_REVIEW',
            version_no=a.version_no+1
      WHERE a.payment_refund_id=NEW.payment_refund_id
        AND a.organization_id=NEW.organization_id AND a.action_status<>'COMPLETED';
   END;
 END IF;
 RETURN NEW;
END;$f$;

DROP TRIGGER IF EXISTS trg_refund_cancel_after_success ON "${schemaName}".payment_refunds;
CREATE TRIGGER trg_refund_cancel_after_success
AFTER UPDATE OF execution_status ON "${schemaName}".payment_refunds
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".payment_refund_cancel_after_success();

-- Enable only after the backend + UI are deployed and tests pass.
INSERT INTO "${schemaName}".refund_resolution_options
 (option_type,option_code,display_name,description,scope,display_order,is_active)
VALUES ('ACTION','REFUND_AND_CANCEL','Refund and cancel membership',
 'Refund a verified payment, then cancel its specifically linked membership after confirmed refund success',
 'BOTH',25,FALSE)
ON CONFLICT (option_type,option_code,scope) DO UPDATE
 SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,
     display_order=EXCLUDED.display_order;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_collect_preflight(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_membership_action_read(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_collect_preflight(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_membership_action_read(varchar,varchar,varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_mark_membership_action_review(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_mark_membership_action_review(varchar,varchar,varchar) TO "${appRole}";
