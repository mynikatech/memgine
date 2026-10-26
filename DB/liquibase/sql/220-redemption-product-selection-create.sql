CREATE OR REPLACE FUNCTION "${schemaName}".create_redemption_transaction_with_products_internal(
  p_organization_id varchar,
  p_store_id varchar,
  p_staff_id varchar,
  p_subscription_id varchar,
  p_benefit_ids varchar[],
  p_offer_ids varchar[],
  p_redemption_method varchar,
  p_selections jsonb,
  p_actor_user_id varchar
)
RETURNS TABLE(
  "transactionId" varchar,
  "transactionNumber" varchar,
  status varchar,
  "expiresAt" text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
  v_created record;
  v_item record;
  v_key text;
  v_product_id varchar;
  v_options integer;
BEGIN
  IF p_selections IS NULL
     OR jsonb_typeof(p_selections) <> 'object' THEN
    RAISE EXCEPTION 'Product selections must be an object'
      USING ERRCODE = '22023';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT *
      INTO STRICT v_created
      FROM create_customer_redemption_transaction(
        p_organization_id,
        p_subscription_id,
        p_benefit_ids,
        p_offer_ids,
        p_redemption_method,
        p_actor_user_id
      );
  ELSE
    SELECT *
      INTO STRICT v_created
      FROM create_counter_redemption_transaction(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_subscription_id,
        p_benefit_ids,
        p_offer_ids,
        p_redemption_method,
        p_actor_user_id
      );
  END IF;

  FOR v_item IN
    SELECT
      rti.redemption_transaction_item_id AS item_id,
      rti.item_type,
      COALESCE(rti.benefit_id, rti.offer_id) AS source_id
    FROM redemption_transaction_item rti
    WHERE rti.redemption_transaction_id = v_created."transactionId"
    ORDER BY rti.redemption_transaction_item_id
  LOOP
    v_key := v_item.item_type || ':' || v_item.source_id;
    v_product_id := NULLIF(p_selections ->> v_key, '')::varchar;

    IF v_product_id IS NULL THEN
      SELECT COUNT(*), MIN(choices."productId")
        INTO v_options, v_product_id
        FROM redemption_product_choices(
          p_organization_id,
          p_subscription_id,
          v_item.item_type,
          v_item.source_id,
          p_actor_user_id,
          p_store_id,
          p_staff_id
        ) choices;

      IF v_options <> 1 THEN
        RAISE EXCEPTION 'Select an eligible product for %', v_key
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF LENGTH(v_product_id) > 40 THEN
      RAISE EXCEPTION 'Invalid product id'
        USING ERRCODE = '22023';
    END IF;

    PERFORM select_redemption_item_canonical_product(
      p_organization_id,
      v_created."transactionId",
      v_item.item_id,
      v_product_id,
      p_actor_user_id,
      p_store_id,
      p_staff_id
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_selections) supplied(key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM redemption_transaction_item i
      WHERE i.redemption_transaction_id = v_created."transactionId"
        AND supplied.key =
          i.item_type || ':' || COALESCE(i.benefit_id, i.offer_id)
    )
  ) THEN
    RAISE EXCEPTION 'Unexpected product selection'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v_created."transactionId"::varchar,
    v_created."transactionNumber"::varchar,
    v_created.status::varchar,
    v_created."expiresAt"::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".create_customer_redemption_transaction_with_products(
  p_organization_id varchar,
  p_subscription_id varchar,
  p_benefit_ids varchar[],
  p_offer_ids varchar[],
  p_redemption_method varchar,
  p_selections jsonb,
  p_actor_user_id varchar
)
RETURNS TABLE(
  "transactionId" varchar,
  "transactionNumber" varchar,
  status varchar,
  "expiresAt" text
)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
  SELECT *
  FROM create_redemption_transaction_with_products_internal(
    p_organization_id,
    NULL::varchar,
    NULL::varchar,
    p_subscription_id,
    p_benefit_ids,
    p_offer_ids,
    p_redemption_method,
    p_selections,
    p_actor_user_id
  );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".create_counter_redemption_transaction_with_products(
  p_organization_id varchar,
  p_store_id varchar,
  p_staff_id varchar,
  p_subscription_id varchar,
  p_benefit_ids varchar[],
  p_offer_ids varchar[],
  p_redemption_method varchar,
  p_selections jsonb,
  p_actor_user_id varchar
)
RETURNS TABLE(
  "transactionId" varchar,
  "transactionNumber" varchar,
  status varchar,
  "expiresAt" text
)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
  SELECT *
  FROM create_redemption_transaction_with_products_internal(
    p_organization_id,
    p_store_id,
    p_staff_id,
    p_subscription_id,
    p_benefit_ids,
    p_offer_ids,
    p_redemption_method,
    p_selections,
    p_actor_user_id
  );
$function$;

REVOKE ALL ON FUNCTION
  "${schemaName}".create_redemption_transaction_with_products_internal(
    varchar, varchar, varchar, varchar,
    varchar[], varchar[], varchar, jsonb, varchar
  )
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  "${schemaName}".create_customer_redemption_transaction_with_products(
    varchar, varchar, varchar[], varchar[],
    varchar, jsonb, varchar
  )
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  "${schemaName}".create_counter_redemption_transaction_with_products(
    varchar, varchar, varchar, varchar,
    varchar[], varchar[], varchar, jsonb, varchar
  )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  "${schemaName}".create_customer_redemption_transaction_with_products(
    varchar, varchar, varchar[], varchar[],
    varchar, jsonb, varchar
  )
TO "${appRole}";

GRANT EXECUTE ON FUNCTION
  "${schemaName}".create_counter_redemption_transaction_with_products(
    varchar, varchar, varchar, varchar,
    varchar[], varchar[], varchar, jsonb, varchar
  )
TO "${appRole}";