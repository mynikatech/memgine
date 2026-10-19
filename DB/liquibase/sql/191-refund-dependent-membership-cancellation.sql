-- Draft 191: durable dependent cancellation. Enable UI only after service wiring and DB tests.
CREATE TABLE "${schemaName}".payment_refund_membership_actions (
    payment_refund_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".payment_refunds(payment_refund_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    subscription_id varchar(64) NOT NULL REFERENCES "${schemaName}".subscriptions(subscription_id),
    action_code varchar(32) NOT NULL DEFAULT 'CANCEL_MEMBERSHIP' CHECK (action_code='CANCEL_MEMBERSHIP'),
    action_status varchar(32) NOT NULL DEFAULT 'WAITING_FOR_REFUND'
      CHECK (action_status IN ('WAITING_FOR_REFUND','COMPLETED','NEEDS_REVIEW')),
    requested_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    requested_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamptz,
    last_error_code varchar(80),
    version_no integer NOT NULL DEFAULT 1,
    UNIQUE (organization_id, subscription_id)
);

-- The original refund request and its dependent action are atomic.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_request_and_cancel(
    p_refund_id varchar,p_organization_id varchar,p_payment_intent_id varchar,
    p_amount_minor bigint,p_reason_code varchar,p_explanation varchar,
    p_support_request_id varchar,p_financial_exception_id varchar,
    p_idempotency_key varchar,p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar,"approvalStatus" varchar,"executionStatus" varchar,
    "refundAmountMinor" bigint,"currencyCode" varchar,"versionNo" integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_subscription_id varchar; v_record record; v_existing payment_refund_membership_actions%ROWTYPE;
BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN
       RAISE EXCEPTION 'Refund action is not permitted' USING ERRCODE='42501';
    END IF;
    SELECT pi.finalized_subscription_id INTO v_subscription_id
      FROM payment_intents pi JOIN subscriptions s ON s.subscription_id=pi.finalized_subscription_id
      JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
     WHERE pi.payment_intent_id=p_payment_intent_id
       AND pi.organization_id=p_organization_id AND ou.organization_id=p_organization_id
       AND pi.customer_user_id=ou.user_id AND NOT s.is_deleted;
    IF v_subscription_id IS NULL THEN
       RAISE EXCEPTION 'No membership is linked to this payment. Choose Refund customer instead.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_record FROM payment_refund_request(
      p_refund_id,p_organization_id,p_payment_intent_id,p_amount_minor,p_reason_code,
      p_explanation,p_support_request_id,p_financial_exception_id,p_idempotency_key,p_actor_user_id);
    IF v_record."paymentRefundId" IS DISTINCT FROM p_refund_id THEN
      SELECT * INTO v_existing FROM payment_refund_membership_actions
       WHERE payment_refund_id=v_record."paymentRefundId";
      IF NOT FOUND OR v_existing.subscription_id IS DISTINCT FROM v_subscription_id THEN
         RAISE EXCEPTION 'This refund already exists with a different resolution action' USING ERRCODE='23505';
      END IF;
    ELSE
      INSERT INTO payment_refund_membership_actions(payment_refund_id,organization_id,subscription_id,requested_by)
      VALUES (v_record."paymentRefundId",p_organization_id,v_subscription_id,p_actor_user_id);
    END IF;
    RETURN QUERY SELECT v_record."paymentRefundId"::varchar,v_record."approvalStatus"::varchar,
      v_record."executionStatus"::varchar,v_record."refundAmountMinor"::bigint,
      v_record."currencyCode"::varchar,v_record."versionNo"::integer;
END $f$;

-- This operation is separate from provider dispatch. It may run ONLY AFTER
-- the refund has a verified SUCCEEDED ledger status. Repeated calls are safe.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_complete_membership_cancellation(
  p_organization_id varchar,p_refund_id varchar,p_actor_user_id varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_action payment_refund_membership_actions%ROWTYPE; v_refund payment_refunds%ROWTYPE;
        v_current varchar; v_cancel_status varchar;
BEGIN
  IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN
    RAISE EXCEPTION 'Membership cancellation is not permitted' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_action FROM payment_refund_membership_actions
    WHERE organization_id=p_organization_id AND payment_refund_id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No cancellation was requested for this refund' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_refund FROM payment_refunds
    WHERE payment_refund_id=p_refund_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_refund.execution_status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Membership cannot be cancelled until the refund is verified successful' USING ERRCODE='22023';
  END IF;
  IF v_action.action_status='COMPLETED' THEN RETURN 'COMPLETED'; END IF;
  -- Verify linkage at execution too; a customer can have multiple memberships.
  IF NOT EXISTS (
     SELECT 1 FROM payment_intents pi JOIN subscriptions s
       ON s.subscription_id=pi.finalized_subscription_id
       JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
     WHERE pi.payment_intent_id=v_refund.payment_intent_id
       AND pi.organization_id=p_organization_id AND ou.organization_id=p_organization_id
       AND ou.user_id=pi.customer_user_id
       AND s.subscription_id=v_action.subscription_id AND NOT s.is_deleted
  ) THEN
     RAISE EXCEPTION 'Original payment and membership association requires investigation' USING ERRCODE='22023';
  END IF;
  SELECT st.status_code INTO v_current FROM subscriptions s
    JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
    JOIN statuses st ON st.status_id=es.status_id
    WHERE s.subscription_id=v_action.subscription_id FOR UPDATE OF s;
  IF v_current IN ('CANCELLED','CANCELED') THEN
     UPDATE payment_refund_membership_actions SET action_status='COMPLETED',completed_at=CURRENT_TIMESTAMP,
       last_error_code=NULL,version_no=version_no+1 WHERE payment_refund_id=p_refund_id;
     RETURN 'COMPLETED';
  END IF;
  IF v_current <> 'ACTIVE' THEN
     RAISE EXCEPTION 'Membership is not active; manual review is required before cancellation' USING ERRCODE='22023';
  END IF;
  SELECT es.entity_status_id INTO v_cancel_status FROM entity_status es
     JOIN entity_type et ON et.entity_type_id=es.entity_type_id
     JOIN statuses st ON st.status_id=es.status_id
   WHERE et.entity_type_code='SUBSCRIPTION' AND st.status_code IN ('CANCELLED','CANCELED')
     AND es.is_active AND st.is_active
   ORDER BY CASE WHEN st.status_code='CANCELLED' THEN 0 ELSE 1 END LIMIT 1;
  IF v_cancel_status IS NULL THEN
    RAISE EXCEPTION 'Membership cancellation status is not configured' USING ERRCODE='22023';
  END IF;
  UPDATE subscriptions SET subscription_status_id=v_cancel_status,
     updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1
   WHERE subscription_id=v_action.subscription_id;
  UPDATE payment_refund_membership_actions SET action_status='COMPLETED',completed_at=CURRENT_TIMESTAMP,
     last_error_code=NULL,version_no=version_no+1 WHERE payment_refund_id=p_refund_id;
  RETURN 'COMPLETED';
END $f$;

REVOKE ALL ON TABLE "${schemaName}".payment_refund_membership_actions FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_request_and_cancel(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_complete_membership_cancellation(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_request_and_cancel(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_complete_membership_cancellation(varchar,varchar,varchar) TO "${appRole}";
