
-- ================================================================
-- MEMGINE - MIGRATION 311
-- Counter Reservation Selection
--
-- Purpose:
--   Locate an existing customer fulfillment order holding a
--   Benefit or Offer reservation.
--
-- Architecture:
--   1. Authorize the Counter operator and Store.
--   2. Verify customer ownership of the subscription.
--   3. Call the canonical customer redemption item status function.
--   4. Locate the matching active reservation and order.
--   5. Return its order reference only if exactly one qualifies.
--
-- The canonical function remains unchanged:
--   get_customer_redemption_item_status(...)
--
-- This function does not:
--   - calculate entitlement eligibility independently
--   - create a redemption
--   - consume or release a reservation
--   - verify a customer for pickup
--   - change payment or fulfillment status
-- ================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".counter_reserved_order_reference_for_item(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar,
    p_subscription_id varchar,
    p_customer_user_id varchar,
    p_item_type varchar,
    p_item_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}", pg_temp
AS $function$
DECLARE
    v_canonical_status varchar;
    v_matching_order_count bigint;
    v_order_reference varchar;
BEGIN

    -- ------------------------------------------------------------
    -- 1. Counter operator authorization.
    -- ------------------------------------------------------------

    IF counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Counter operator is not authorized'
            USING ERRCODE = '42501';
    END IF;

    -- ------------------------------------------------------------
    -- 2. Customer ownership and input validation.
    -- ------------------------------------------------------------

    IF customer_fulfillment_subscription_owned(
        p_organization_id,
        p_subscription_id,
        p_customer_user_id
    ) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Customer subscription is not available'
            USING ERRCODE = '42501';
    END IF;

    IF p_item_type IS NULL
       OR p_item_type NOT IN ('BENEFIT', 'OFFER')
       OR NULLIF(BTRIM(p_item_id), '') IS NULL THEN
        RETURN NULL;
    END IF;

    -- ------------------------------------------------------------
    -- 3. Canonical customer redemption item status.
    --
    -- This is the single authoritative eligibility source.
    --
    -- The existing function currently reports AVAILABLE,
    -- LIMIT_REACHED, UNAVAILABLE_TODAY, UNAVAILABLE,
    -- NOT_APPLICABLE and INACTIVE.
    --
    -- Active fulfillment reservations are stored separately;
    -- therefore AVAILABLE does not prove that no hold exists.
    -- ------------------------------------------------------------

    SELECT canonical_item.status
      INTO v_canonical_status
      FROM get_customer_redemption_item_status(
          p_organization_id,
          p_subscription_id,
          p_customer_user_id
      ) AS canonical_item
     WHERE canonical_item."itemId" = p_item_id
       AND canonical_item."itemType" = p_item_type;

    -- Unknown or non-published items cannot be opened.

    IF v_canonical_status IS NULL THEN
        RETURN NULL;
    END IF;

    -- Do not expose an order-navigation action for an item that
    -- is currently inactive, not applicable, or outside its
    -- permitted availability period.
    --
    -- LIMIT_REACHED is allowed here only for locating an
    -- existing reservation, never for initiating redemption.

    IF v_canonical_status NOT IN ('AVAILABLE', 'LIMIT_REACHED') THEN
        RETURN NULL;
    END IF;

    -- ------------------------------------------------------------
    -- 4. Find the exact reserved customer fulfillment order.
    --
    -- Require:
    --   - same organization
    --   - same Store
    --   - same customer
    --   - same subscription
    --   - exact Benefit or Offer
    --   - active reservation with remaining held quantity
    --   - reserved customer fulfillment redemption
    --   - unfulfilled and non-cancelled order
    --   - canonical Commerce ownership linkage
    --
    -- DISTINCT removes duplicate reservation rows belonging
    -- to the same order, but never collapses different orders.
    -- ------------------------------------------------------------

    SELECT COUNT(*),
           MIN(candidate.fulfillment_number)
      INTO v_matching_order_count,
           v_order_reference
      FROM (
          SELECT DISTINCT
                 fulfillment.fulfillment_id,
                 fulfillment.fulfillment_number

            FROM redemption_entitlement_reservations reservation

            JOIN statuses reservation_status
              ON reservation_status.status_id =
                 reservation.reservation_status_id
             AND reservation_status.status_code = 'RESERVED'

            JOIN redemption_transaction_item redemption_item
              ON redemption_item.redemption_transaction_item_id =
                 reservation.redemption_transaction_item_id

            JOIN redemption_transaction redemption
              ON redemption.redemption_transaction_id =
                 redemption_item.redemption_transaction_id

            JOIN fulfillments fulfillment
              ON fulfillment.fulfillment_id =
                 reservation.fulfillment_id
             AND fulfillment.redemption_transaction_id =
                 redemption.redemption_transaction_id

            JOIN statuses fulfillment_status
              ON fulfillment_status.status_id =
                 fulfillment.fulfillment_status_id

            JOIN commerce_transactions commerce
              ON commerce.commerce_transaction_id =
                 fulfillment.commerce_transaction_id
             AND commerce.organization_id = p_organization_id
             AND commerce.store_id = p_store_id
             AND commerce.customer_user_id = p_customer_user_id
             AND commerce.subscription_id = p_subscription_id
             AND commerce.source_channel = 'CUSTOMER_FULFILLMENT'
             AND NOT commerce.is_deleted

           WHERE redemption.organization_id = p_organization_id
             AND redemption.store_id = p_store_id
             AND redemption.subscription_id = p_subscription_id
             AND redemption.redemption_method = 'CUSTOMER_FULFILLMENT'
             AND redemption.status = 'RESERVED'

             AND fulfillment.organization_id = p_organization_id
             AND fulfillment.store_id = p_store_id
             AND fulfillment.customer_user_id = p_customer_user_id

             AND fulfillment_status.status_code
                 NOT IN ('FULFILLED', 'CANCELLED', 'CANCELED')

             AND fulfillment.fulfilled_at IS NULL

             AND redemption_item.status = 'PENDING'

             AND redemption_item.item_type = p_item_type

             AND (
                    (
                        p_item_type = 'BENEFIT'
                        AND redemption_item.benefit_id = p_item_id
                    )
                    OR
                    (
                        p_item_type = 'OFFER'
                        AND redemption_item.offer_id = p_item_id
                    )
                 )

             AND reservation.reserved_quantity >
                 (
                     COALESCE(reservation.consumed_quantity, 0)
                     +
                     COALESCE(reservation.released_quantity, 0)
                 )

             AND NULLIF(
                 BTRIM(fulfillment.fulfillment_number),
                 ''
             ) IS NOT NULL

      ) candidate;

    -- ------------------------------------------------------------
    -- 5. Return only an unambiguous order reference.
    --
    -- Zero matches: no accessible reserved order.
    -- Multiple matches: ambiguous, fail closed.
    --
    -- This does not authorize collection or payment.
    -- Existing Counter order verification remains mandatory.
    -- ------------------------------------------------------------

    IF v_matching_order_count <> 1 THEN
        RETURN NULL;
    END IF;

    RETURN v_order_reference;

END;
$function$;

-- ================================================================
-- Permissions
-- ================================================================

REVOKE ALL ON FUNCTION
    "${schemaName}".counter_reserved_order_reference_for_item(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".counter_reserved_order_reference_for_item(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";
