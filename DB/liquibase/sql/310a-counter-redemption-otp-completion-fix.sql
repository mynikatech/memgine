
-- ============================================================
-- 310A P0: Counter Redemption OTP Completion Fix
-- ============================================================
-- Fixes PostgreSQL error:
--   record "b" is not assigned yet
--
-- Root cause:
--   PL/pgSQL record variable and SQL table alias shared
--   the same single-letter identifier.
--
-- Uses descriptive variable names and aliases throughout.
--
-- Preserves:
--   - Existing redemption ownership and PENDING status
--   - OTP challenge context validation
--   - Store, staff and subscription matching
--   - Selected benefit and offer validation
--   - Staff authorization
--   - One-time OTP consumption
--   - Existing verification evidence
--
-- No payment, entitlement consumption or fulfillment changes.
-- Forward-only migration. Do not modify previous changesets.
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".bind_counter_redemption_otp(
    p_org varchar,
    p_redemption varchar,
    p_challenge varchar,
    p_actor varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}", pg_temp
AS $body$
DECLARE
    redemption_record redemption_transaction%ROWTYPE;
    otp_context_record record;
BEGIN

    -- --------------------------------------------------------
    -- 1. Lock and validate the existing redemption transaction.
    -- --------------------------------------------------------

    SELECT redemption_transaction.*
    INTO redemption_record
    FROM redemption_transaction
    WHERE redemption_transaction.redemption_transaction_id = p_redemption
      AND redemption_transaction.organization_id = p_org
      AND redemption_transaction.redemption_method = 'OTP'
      AND redemption_transaction.status = 'PENDING'
      AND redemption_transaction.created_by = p_actor
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Existing successful binding is idempotent.
    IF redemption_record.counter_verification->>'sourceId' = p_challenge THEN
        RETURN true;
    END IF;

    -- --------------------------------------------------------
    -- 2. Resolve and validate the OTP challenge context.
    -- --------------------------------------------------------

    SELECT otp_context.*
    INTO otp_context_record
    FROM business_otp_resolve_context(
        p_challenge,
        'COUNTER_REDEMPTION_VERIFY'
    ) AS otp_context
    WHERE otp_context.organization_id = p_org
      AND otp_context.store_id = redemption_record.store_id
      AND otp_context.staff_id = redemption_record.staff_id
      AND otp_context.subscription_id = redemption_record.subscription_id

      -- Collection-order verification must not be accepted
      -- as a manual redemption OTP.
      AND NOT (otp_context.payload ? 'collectionOrderId')

      -- Verify customer ownership of the subscription.
      AND customer_fulfillment_subscription_owned(
          p_org,
          redemption_record.subscription_id,
          otp_context.user_id
      )

      -- ----------------------------------------------------
      -- 3. Verify exact selected benefit IDs.
      -- ----------------------------------------------------

      AND (
          SELECT COALESCE(
              array_agg(
                  redemption_item.benefit_id
                  ORDER BY redemption_item.benefit_id
              ),
              ARRAY[]::varchar[]
          )
          FROM redemption_transaction_item AS redemption_item
          WHERE redemption_item.redemption_transaction_id = p_redemption
            AND redemption_item.item_type = 'BENEFIT'
      ) = ARRAY(
          SELECT selected_benefit_id.item_id::varchar
          FROM jsonb_array_elements_text(
              COALESCE(
                  otp_context.payload->'benefitIds',
                  '[]'::jsonb
              )
          ) AS selected_benefit_id(item_id)
          ORDER BY selected_benefit_id.item_id
      )

      -- ----------------------------------------------------
      -- 4. Verify exact selected offer IDs.
      -- ----------------------------------------------------

      AND (
          SELECT COALESCE(
              array_agg(
                  redemption_item.offer_id
                  ORDER BY redemption_item.offer_id
              ),
              ARRAY[]::varchar[]
          )
          FROM redemption_transaction_item AS redemption_item
          WHERE redemption_item.redemption_transaction_id = p_redemption
            AND redemption_item.item_type = 'OFFER'
      ) = ARRAY(
          SELECT selected_offer_id.item_id::varchar
          FROM jsonb_array_elements_text(
              COALESCE(
                  otp_context.payload->'offerIds',
                  '[]'::jsonb
              )
          ) AS selected_offer_id(item_id)
          ORDER BY selected_offer_id.item_id
      );

    -- --------------------------------------------------------
    -- 5. Validate OTP context, staff authorization and consume
    --    the challenge exactly once.
    -- --------------------------------------------------------

    IF NOT FOUND
       OR counter_order_operator(
           p_org,
           redemption_record.store_id,
           redemption_record.staff_id,
           p_actor
       ) IS NULL
       OR NOT business_otp_consume_context(
           p_challenge,
           'COUNTER_REDEMPTION_VERIFY'
       )
    THEN
        RETURN false;
    END IF;

    -- --------------------------------------------------------
    -- 6. Persist successful OTP verification evidence.
    -- --------------------------------------------------------

    UPDATE redemption_transaction
    SET counter_verification = jsonb_build_object(
        'method', 'PHONE_OTP',
        'sourceId', p_challenge,
        'actorId', p_actor,
        'staffId', redemption_record.staff_id,
        'storeId', redemption_record.store_id,
        'verifiedAt', clock_timestamp() AT TIME ZONE 'UTC'
    )
    WHERE redemption_transaction_id = p_redemption;

    RETURN true;

END;
$body$;

-- Preserve restricted function execution permissions.

REVOKE ALL ON FUNCTION
    "${schemaName}".bind_counter_redemption_otp(
        varchar, varchar, varchar, varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".bind_counter_redemption_otp(
        varchar, varchar, varchar, varchar
    )
TO "${appRole}";
