-- Idempotently deactivate an Offer's POS Commerce applicability without
-- deleting its adjustment-to-product mapping history.
CREATE OR REPLACE FUNCTION "${schemaName}".deactivate_offer_commerce_applicability(
    p_organization_id varchar,
    p_offer_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_adjustment_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_user_id
      INTO v_actor_organization_user_id
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM offer
         WHERE offer_id = p_offer_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Offer is not in organization' USING ERRCODE = '23503';
    END IF;

    SELECT link.commerce_adjustment_id
      INTO v_adjustment_id
      FROM offer_commerce_adjustments link
      JOIN commerce_adjustments adjustment
        ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
     WHERE link.organization_id = p_organization_id
       AND link.offer_id = p_offer_id
       AND NOT link.is_deleted
       AND NOT adjustment.is_deleted
     FOR UPDATE OF adjustment;

    IF v_adjustment_id IS NULL THEN
        RETURN true;
    END IF;

    UPDATE commerce_adjustments
       SET is_active = false,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE commerce_adjustment_id = v_adjustment_id
       AND is_active;

    RETURN true;
END;
$function$;

-- Idempotently deactivate an Offer's membership-sale applicability while
-- retaining its configuration history.
CREATE OR REPLACE FUNCTION "${schemaName}".deactivate_membership_offer_applicability(
    p_organization_id varchar,
    p_offer_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_applicability_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_user_id
      INTO v_actor_organization_user_id
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM offer
         WHERE offer_id = p_offer_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Offer is not in organization' USING ERRCODE = '23503';
    END IF;

    SELECT membership_offer_applicability_id
      INTO v_applicability_id
      FROM membership_offer_applicability
     WHERE organization_id = p_organization_id
       AND offer_id = p_offer_id
       AND NOT is_deleted
     FOR UPDATE;

    IF v_applicability_id IS NULL THEN
        RETURN true;
    END IF;

    UPDATE membership_offer_applicability
       SET is_active = false,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE membership_offer_applicability_id = v_applicability_id
       AND is_active;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".deactivate_offer_commerce_applicability(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".deactivate_membership_offer_applicability(varchar,varchar,varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".deactivate_offer_commerce_applicability(varchar,varchar,varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".deactivate_membership_offer_applicability(varchar,varchar,varchar) TO "${appRole}";
    END IF;
END $grant$;
