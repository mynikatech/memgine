-- Phase 4B-2: Counter redemptions build one Commerce basket.
-- Entitlement usage is recorded only after a successful provider result.

CREATE UNIQUE INDEX IF NOT EXISTS ux_commerce_transaction_redemptions_one_active_redemption
    ON "${schemaName}".commerce_transaction_redemptions (redemption_transaction_id)
    WHERE NOT is_deleted;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "commerceTransactionId" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    status varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;
    c commerce_transactions%ROWTYPE;

    v_actor varchar(64);
    v_reason text;
    v_provider varchar(32);
    v_integration varchar(64);

    a commerce_adjustments%ROWTYPE;
    m commerce_product_mappings%ROWTYPE;
    s record;
    v_line varchar(64);
BEGIN
    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO t
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF t.store_id IS NOT NULL
       AND t.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store'
            USING ERRCODE = '42501';
    END IF;

    IF t.staff_id IS NOT NULL
       AND t.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another staff context'
            USING ERRCODE = '42501';
    END IF;

    IF t.status <> 'PENDING'
       OR (
            t.expires_at IS NOT NULL
            AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
       ) THEN
        RAISE EXCEPTION 'Redemption transaction cannot be prepared'
            USING ERRCODE = '23505';
    END IF;

    SELECT organization_user_id
      INTO v_actor
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     ORDER BY organization_user_id
     LIMIT 1;

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found'
            USING ERRCODE = '42501';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        v_reason :=
            CASE
                WHEN i.item_type = 'BENEFIT' THEN
                    counter_benefit_rejection(
                        p_organization_id,
                        t.subscription_id,
                        i.benefit_id
                    )
                ELSE
                    counter_offer_rejection(
                        p_organization_id,
                        t.subscription_id,
                        i.offer_id,
                        p_store_id
                    )
            END;

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason
                USING ERRCODE = '23505';
        END IF;
    END LOOP;

    SELECT c0.*
      INTO c
      FROM commerce_transaction_redemptions x
      JOIN commerce_transactions c0
        ON c0.commerce_transaction_id = x.commerce_transaction_id
     WHERE x.redemption_transaction_id = t.redemption_transaction_id
       AND NOT x.is_deleted
       AND NOT c0.is_deleted
     FOR UPDATE OF c0;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            c.commerce_transaction_id,
            NULL::varchar,
            c.integration_configuration_id,
            c.status;
        RETURN;
    END IF;

    SELECT
        r.provider_code,
        r.integration_configuration_id
      INTO
        v_provider,
        v_integration
      FROM commerce_payment_provider_routes r
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = r.integration_configuration_id
       AND ic.organization_id = r.organization_id
       AND NOT ic.is_deleted
      LEFT JOIN entity_status ies
        ON ies.entity_status_id = ic.integration_status_id
      LEFT JOIN statuses ist
        ON ist.status_id = ies.status_id
     WHERE r.organization_id = p_organization_id
       AND r.source_channel = 'COUNTER'
       AND r.is_enabled
       AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
       AND r.provider_code IN ('TEST', 'POYNT')
       AND (
            r.provider_code = 'TEST'
            OR (
                ic.integration_configuration_id IS NOT NULL
                AND upper(ic.provider) = r.provider_code
                AND ies.is_active
                AND ist.status_code = 'ACTIVE'
            )
       )
     ORDER BY
        CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
        r.commerce_payment_provider_route_id
     LIMIT 1;

    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'No Counter payment provider is configured'
            USING ERRCODE = '22023';
    END IF;

    c.commerce_transaction_id := generate_runtime_id('CTX');

    INSERT INTO commerce_transactions (
        commerce_transaction_id,
        organization_id,
        store_id,
        customer_user_id,
        subscription_id,
        integration_configuration_id,
        source_channel,
        status,
        idempotency_key,
        created_by,
        updated_by
    )
    VALUES (
        c.commerce_transaction_id,
        p_organization_id,
        p_store_id,
        (
            SELECT ou.user_id
              FROM subscriptions sub
              JOIN organization_user ou
                ON ou.organization_user_id = sub.organization_user_id
             WHERE sub.subscription_id = t.subscription_id
        ),
        t.subscription_id,
        v_integration,
        'COUNTER_REDEMPTION',
        'DRAFT',
        ('COUNTER_REDEMPTION:' || t.redemption_transaction_id)::varchar(128),
        v_actor,
        v_actor
    );

    INSERT INTO commerce_transaction_redemptions (
        commerce_transaction_redemption_id,
        commerce_transaction_id,
        redemption_transaction_id,
        created_by,
        updated_by
    )
    VALUES (
        generate_runtime_id('CTR'),
        c.commerce_transaction_id,
        t.redemption_transaction_id,
        v_actor,
        v_actor
    );

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         ORDER BY created_at, redemption_transaction_item_id
    LOOP
        a := NULL;
        m := NULL;

        IF i.item_type = 'BENEFIT' THEN
            SELECT ca.*
              INTO a
              FROM benefit_commerce_adjustments x
              JOIN commerce_adjustments ca
                ON ca.commerce_adjustment_id = x.commerce_adjustment_id
             WHERE x.organization_id = p_organization_id
               AND x.benefit_id = i.benefit_id
               AND NOT x.is_deleted
               AND NOT ca.is_deleted
               AND ca.is_active
               AND ca.adjustment_type IN (
                    'PRODUCT_FREE',
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               );
        ELSE
            SELECT ca.*
              INTO a
              FROM offer_commerce_adjustments x
              JOIN commerce_adjustments ca
                ON ca.commerce_adjustment_id = x.commerce_adjustment_id
             WHERE x.organization_id = p_organization_id
               AND x.offer_id = i.offer_id
               AND NOT x.is_deleted
               AND NOT ca.is_deleted
               AND ca.is_active
               AND ca.adjustment_type IN (
                    'PRODUCT_FREE',
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               );
        END IF;

        IF a.commerce_adjustment_id IS NULL THEN
            RAISE EXCEPTION 'Selected % has no active POS product adjustment', lower(i.item_type)
                USING ERRCODE = '23503';
        END IF;

        SELECT pm.*
          INTO m
          FROM commerce_adjustment_product_mappings x
          JOIN commerce_product_mappings pm
            ON pm.commerce_product_mapping_id = x.commerce_product_mapping_id
         WHERE x.commerce_adjustment_id = a.commerce_adjustment_id
           AND NOT x.is_deleted
           AND NOT pm.is_deleted
           AND pm.is_active
         ORDER BY pm.commerce_product_mapping_id
         LIMIT 1;

        IF m.commerce_product_mapping_id IS NULL THEN
            RAISE EXCEPTION 'Selected % has no active POS product mapping', lower(i.item_type)
                USING ERRCODE = '23503';
        END IF;

        SELECT
            product_name,
            currency_code,
            unit_price_minor_snapshot
          INTO s
          FROM commerce_product_snapshots
         WHERE organization_id = p_organization_id
           AND integration_configuration_id = m.integration_configuration_id
           AND COALESCE(store_id, '') = COALESCE(m.store_id, '')
           AND external_product_id = m.external_product_id
           AND COALESCE(external_variant_id, '') = COALESCE(m.external_variant_id, '')
           AND is_active
           AND NOT is_deleted
         ORDER BY last_synced_at DESC
         LIMIT 1;

        IF s.product_name IS NULL THEN
            RAISE EXCEPTION 'Selected POS product has no active catalog snapshot'
                USING ERRCODE = '23503';
        END IF;

        v_line := generate_runtime_id('CTL');

        INSERT INTO commerce_transaction_lines (
            commerce_transaction_line_id,
            commerce_transaction_id,
            line_type,
            source_entity_type,
            source_entity_id,
            commerce_product_mapping_id,
            external_product_id,
            external_variant_id,
            description,
            quantity,
            unit_price_minor_snapshot,
            currency_code,
            price_source,
            created_by,
            updated_by
        )
        VALUES (
            v_line,
            c.commerce_transaction_id,
            'EXTERNAL_PRODUCT',
            i.item_type,
            COALESCE(i.benefit_id, i.offer_id),
            m.commerce_product_mapping_id,
            m.external_product_id,
            m.external_variant_id,
            s.product_name,
            1,
            s.unit_price_minor_snapshot,
            s.currency_code,
            'PROVIDER_FINAL',
            v_actor,
            v_actor
        );

        INSERT INTO commerce_transaction_adjustments (
            commerce_transaction_adjustment_id,
            commerce_transaction_id,
            target_line_id,
            commerce_adjustment_id,
            source_type,
            source_id,
            adjustment_type,
            percentage,
            requested_amount_minor,
            currency_code,
            created_by,
            updated_by
        )
        VALUES (
            generate_runtime_id('CTA'),
            c.commerce_transaction_id,
            v_line,
            a.commerce_adjustment_id,
            i.item_type,
            COALESCE(i.benefit_id, i.offer_id),
            a.adjustment_type,
            a.percentage,
            a.amount_minor,
            a.currency_code,
            v_actor,
            v_actor
        );
    END LOOP;

    UPDATE commerce_transactions
       SET status = 'READY_FOR_PROVIDER',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN QUERY
    SELECT
        c.commerce_transaction_id,
        v_provider,
        v_integration,
        'READY_FOR_PROVIDER'::varchar;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_redemption_transaction(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;

    v_actor varchar(64);
    v_success varchar(64);
    v_id varchar(64);
    v_number varchar(64);
    v_sequence bigint;
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_actor_organization_user(
        c.commerce_transaction_id,
        p_actor_user_id
    );

    IF c.status = 'COMPLETED' THEN
        RETURN true;
    END IF;

    IF c.status <> 'PROVIDER_SUCCEEDED' THEN
        RAISE EXCEPTION 'Counter redemption provider payment has not succeeded'
            USING ERRCODE = '23505';
    END IF;

    SELECT rt.*
      INTO t
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     FOR UPDATE OF rt;

    IF NOT FOUND OR t.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Pending redemption transaction is unavailable'
            USING ERRCODE = '23505';
    END IF;

    SELECT es.entity_status_id
      INTO v_success
      FROM entity_status es
      JOIN entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'REDEMPTION'
       AND st.status_code = 'SUCCESS'
       AND es.is_active;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        IF i.status = 'SUCCESS' THEN
            CONTINUE;
        END IF;

        IF i.item_type = 'BENEFIT' THEN
            v_id := generate_runtime_id('RDM');
            v_sequence := next_business_sequence('REDEMPTION', t.subscription_id);

            SELECT (
                subscription_number
                || '_RDM_'
                || lpad(v_sequence::text, 3, '0')
            )::varchar(64)
              INTO v_number
              FROM subscriptions
             WHERE subscription_id = t.subscription_id;

            INSERT INTO redemptions (
                redemption_id,
                redemption_number,
                subscription_id,
                benefit_id,
                store_id,
                staff_id,
                redemption_status_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                v_number,
                t.subscription_id,
                i.benefit_id,
                c.store_id,
                t.staff_id,
                v_success,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id = i.redemption_transaction_item_id;
        ELSE
            v_id := generate_runtime_id('ORD');

            INSERT INTO offer_redemptions (
                offer_redemption_id,
                redemption_transaction_id,
                redemption_transaction_item_id,
                organization_id,
                subscription_id,
                offer_id,
                store_id,
                staff_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                t.redemption_transaction_id,
                i.redemption_transaction_item_id,
                c.organization_id,
                t.subscription_id,
                i.offer_id,
                c.store_id,
                t.staff_id,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET offer_redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id = i.redemption_transaction_item_id;
        END IF;
    END LOOP;

    UPDATE redemption_transaction
       SET status = 'SUCCESS',
           store_id = c.store_id,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_id = t.redemption_transaction_id;

    UPDATE commerce_transactions
       SET status = 'COMPLETED',
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_execute_counter_redemption_transaction(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "transactionId" varchar,
    "transactionNumber" varchar,
    status varchar,
    "completedAt" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t redemption_transaction%ROWTYPE;
    p record;
BEGIN
    SELECT *
      INTO p
      FROM commerce_prepare_counter_redemption_transaction(
          p_transaction_id,
          p_organization_id,
          p_store_id,
          p_staff_id,
          p_actor_user_id
      );

    SELECT *
      INTO t
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id;

    RETURN QUERY
    SELECT
        t.redemption_transaction_id,
        t.redemption_transaction_number,
        'PENDING'::varchar,
        NULL::text;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_payment_by_reference(
    p_reference_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    a commerce_provider_payment_attempts%ROWTYPE;
    c commerce_transactions%ROWTYPE;
BEGIN
    SELECT *
      INTO a
      FROM commerce_provider_payment_attempts
     WHERE provider_reference_id = p_reference_id
       AND payment_channel = 'REMOTE_TERMINAL'
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = a.commerce_transaction_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF c.source_channel = 'COUNTER_REDEMPTION' THEN
        IF a.provider_status = 'SUCCEEDED' THEN
            PERFORM commerce_finalize_counter_redemption_transaction(
                c.commerce_transaction_id,
                COALESCE(c.created_by, c.updated_by)
            );

            RETURN c.commerce_transaction_id;
        END IF;

        RETURN NULL;
    END IF;

    IF c.source_channel = 'COUNTER' THEN
        RETURN commerce_finalize_counter_membership_payment_by_reference(
            p_reference_id
        );
    END IF;

    RETURN NULL;
END;
$function$;


REVOKE ALL
ON FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
),
"${schemaName}".commerce_finalize_counter_redemption_transaction(
    varchar,
    varchar
),
"${schemaName}".commerce_execute_counter_redemption_transaction(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
),
"${schemaName}".commerce_finalize_counter_payment_by_reference(
    varchar
)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
),
"${schemaName}".commerce_finalize_counter_redemption_transaction(
    varchar,
    varchar
),
"${schemaName}".commerce_execute_counter_redemption_transaction(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
),
"${schemaName}".commerce_finalize_counter_payment_by_reference(
    varchar
)
TO "${appRole}";
