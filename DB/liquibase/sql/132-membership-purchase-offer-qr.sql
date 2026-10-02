-- Membership Purchase Offer QR resolution for Counter checkout.
--
-- Reuses the existing generic qr_codes table. QR persistence remains the
-- authoritative polymorphic QR model:
--
--   qr_code_token
--     -> qr_codes.target_entity_type = 'membership-purchase-offer'
--     -> qr_codes.target_entity_id   = offer.offer_id
--
-- This resolver establishes only trusted QR -> Offer identity. It deliberately
-- does NOT duplicate membership purchase pricing or customer/product/plan
-- eligibility. Migration 131 remains authoritative for that evaluation.

CREATE OR REPLACE FUNCTION "${schemaName}".resolve_counter_membership_purchase_offer_qr(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_qr_token varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "offerId" varchar,
    "displayName" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_token varchar(200);
BEGIN
    v_token := btrim(p_qr_token);

    IF NULLIF(v_token, '') IS NULL OR length(v_token) > 200 THEN
        RAISE EXCEPTION 'Membership Offer QR is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        o.offer_id,
        o.offer_name
      FROM qr_codes q
      JOIN entity_status qes
        ON qes.entity_status_id = q.status_id
      JOIN statuses qstatus
        ON qstatus.status_id = qes.status_id
      JOIN offer o
        ON o.offer_id = q.target_entity_id
       AND o.organization_id = q.organization_id
       AND NOT o.is_deleted
     WHERE q.organization_id = p_organization_id
       AND q.qr_code_token = v_token
       AND q.qr_code_type_id = 'QR_MEMBERSHIP_PURCHASE_OFFER'
       AND q.target_entity_type = 'membership-purchase-offer'
       AND q.target_entity_id IS NOT NULL
       AND NOT q.is_deleted
       AND qes.is_active
       AND qstatus.status_code = 'ACTIVE'
       AND (q.store_id IS NULL OR q.store_id = p_store_id)
       AND EXISTS (
           SELECT 1
             FROM membership_offer_applicability a
            WHERE a.organization_id = p_organization_id
              AND a.offer_id = o.offer_id
              AND a.behavior = 'PURCHASE_DISCOUNT'
              AND NOT a.is_deleted
       )
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership Offer QR is unavailable'
            USING ERRCODE = '22023';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".resolve_counter_membership_purchase_offer_qr(
    varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".resolve_counter_membership_purchase_offer_qr(
            varchar, varchar, varchar, varchar, varchar
        ) TO "${appRole}";
    END IF;
END $grant$;
