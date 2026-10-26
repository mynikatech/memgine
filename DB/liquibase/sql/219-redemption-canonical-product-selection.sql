-- Shared Benefit / Offer canonical Product selection.
ALTER TABLE "${schemaName}".redemption_transaction_item
  ADD COLUMN IF NOT EXISTS selected_product_id varchar(40);

CREATE OR REPLACE FUNCTION "${schemaName}".redemption_product_choices(
  p_organization_id varchar,
  p_subscription_id varchar,
  p_item_type varchar,
  p_item_id varchar,
  p_actor_user_id varchar,
  p_store_id varchar DEFAULT NULL,
  p_staff_id varchar DEFAULT NULL
)
RETURNS TABLE(
  "productId" varchar,
  "productName" varchar,
  "productCode" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM subscriptions s
    JOIN organization_user ou
      ON ou.organization_user_id = s.organization_user_id
    WHERE s.subscription_id = p_subscription_id
      AND ou.organization_id = p_organization_id
      AND NOT s.is_deleted
      AND NOT ou.is_deleted
      AND (
        ou.user_id = p_actor_user_id
        OR (
          p_store_id IS NOT NULL
          AND p_staff_id IS NOT NULL
          AND counter_can_operate(
            p_organization_id, p_store_id,
            p_staff_id, p_actor_user_id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Subscription product selection is not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF p_item_type NOT IN ('BENEFIT', 'OFFER') THEN
    RAISE EXCEPTION 'Invalid redemption item type'
      USING ERRCODE = '22023';
  END IF;

  IF p_item_type = 'BENEFIT' THEN
    RETURN QUERY
    SELECT p.product_id, p.product_name, p.product_code
    FROM benefit_product bp
    JOIN product p
      ON p.product_id = bp.product_id
     AND p.organization_id = bp.organization_id
    WHERE bp.organization_id = p_organization_id
      AND bp.benefit_id = p_item_id
      AND bp.is_active
      AND NOT bp.is_deleted
      AND NOT p.is_deleted
    ORDER BY p.product_name, p.product_id;
  ELSE
    RETURN QUERY
    SELECT p.product_id, p.product_name, p.product_code
    FROM offer_product op
    JOIN product p
      ON p.product_id = op.product_id
     AND p.organization_id = op.organization_id
    WHERE op.organization_id = p_organization_id
      AND op.offer_id = p_item_id
      AND op.is_active
      AND NOT op.is_deleted
      AND NOT p.is_deleted
    ORDER BY p.product_name, p.product_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".select_redemption_item_canonical_product(
  p_organization_id varchar,
  p_transaction_id varchar,
  p_item_id varchar,
  p_product_id varchar,
  p_actor_user_id varchar,
  p_store_id varchar DEFAULT NULL,
  p_staff_id varchar DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
  v_item redemption_transaction_item%ROWTYPE;
  v_transaction redemption_transaction%ROWTYPE;
BEGIN
  SELECT *
    INTO v_transaction
    FROM redemption_transaction
   WHERE redemption_transaction_id = p_transaction_id
     AND organization_id = p_organization_id
     AND status = 'PENDING'
     AND (
       expires_at IS NULL
       OR expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     )
     AND (
       p_store_id IS NULL
       OR store_id IS NULL
       OR store_id = p_store_id
     )
     AND (
       p_staff_id IS NULL
       OR staff_id IS NULL
       OR staff_id = p_staff_id
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending redemption is unavailable'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM subscriptions s
    JOIN organization_user ou
      ON ou.organization_user_id = s.organization_user_id
    WHERE s.subscription_id = v_transaction.subscription_id
      AND ou.organization_id = p_organization_id
      AND NOT s.is_deleted
      AND NOT ou.is_deleted
      AND (
        ou.user_id = p_actor_user_id
        OR (
          p_store_id IS NOT NULL
          AND p_staff_id IS NOT NULL
          AND counter_can_operate(
            p_organization_id, p_store_id,
            p_staff_id, p_actor_user_id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Redemption selection is not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM commerce_transaction_redemptions ctr
    JOIN commerce_transactions ct
      ON ct.commerce_transaction_id = ctr.commerce_transaction_id
    WHERE ctr.redemption_transaction_id = p_transaction_id
      AND NOT ctr.is_deleted
      AND NOT ct.is_deleted
  ) THEN
    RAISE EXCEPTION 'Redemption checkout has already started'
      USING ERRCODE = '23505';
  END IF;

  SELECT *
    INTO v_item
    FROM redemption_transaction_item
   WHERE redemption_transaction_item_id = p_item_id
     AND redemption_transaction_id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption item is unavailable'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM redemption_product_choices(
      p_organization_id,
      v_transaction.subscription_id,
      v_item.item_type,
      COALESCE(v_item.benefit_id, v_item.offer_id),
      p_actor_user_id,
      p_store_id,
      p_staff_id
    ) choices
    WHERE choices."productId" = p_product_id
  ) THEN
    RAISE EXCEPTION 'Selected product is not eligible for redemption item'
      USING ERRCODE = '23503';
  END IF;

  UPDATE redemption_transaction_item
     SET selected_product_id = p_product_id,
         commerce_product_mapping_id = NULL,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = p_actor_user_id,
         version_no = version_no + 1
   WHERE redemption_transaction_item_id = p_item_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION
  "${schemaName}".redemption_product_choices(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
  ),
  "${schemaName}".select_redemption_item_canonical_product(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
  )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  "${schemaName}".redemption_product_choices(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
  ),
  "${schemaName}".select_redemption_item_canonical_product(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
  )
TO "${appRole}";