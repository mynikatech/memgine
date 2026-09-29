-- Counter-only display detail. Eligibility remains wholly owned by the existing
-- validate_redemption_transaction function; this wrapper only adds the names
-- of the already-authorized items in the pending transaction.
CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_redemption_transaction_validation_detail(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "itemId" varchar,
    "itemType" varchar,
    "benefitId" varchar,
    "offerId" varchar,
    "displayName" varchar,
    description text,
    eligible boolean,
    "rejectionReason" text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        validation."itemId",
        validation."itemType",
        validation."benefitId",
        validation."offerId",
        CASE
            WHEN validation."itemType" = 'BENEFIT'
                THEN COALESCE(NULLIF(benefit.display_name, ''), benefit.benefit_name)
            WHEN validation."itemType" = 'OFFER'
                THEN offer.offer_name
        END::varchar AS "displayName",
        CASE
            WHEN validation."itemType" = 'BENEFIT' THEN benefit.description
            WHEN validation."itemType" = 'OFFER' THEN offer.description
        END AS description,
        validation.eligible,
        validation."rejectionReason"
    FROM "${schemaName}".validate_redemption_transaction(
        p_transaction_id,
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) validation
    LEFT JOIN "${schemaName}".benefits benefit
        ON benefit.benefit_id = validation."benefitId"
       AND benefit.organization_id = p_organization_id
       AND NOT benefit.is_deleted
    LEFT JOIN "${schemaName}".offer offer   
        ON offer.offer_id = validation."offerId"
       AND offer.organization_id = p_organization_id
       AND NOT offer.is_deleted;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_counter_redemption_transaction_validation_detail(varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_redemption_transaction_validation_detail(varchar, varchar, varchar, varchar, varchar) TO "${appRole}";
    END IF;
END;
$grant$;
