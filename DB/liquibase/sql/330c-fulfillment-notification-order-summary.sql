-- Phase 330c
-- Include a one-line order summary in all fulfillment notifications.
-- Use persisted order item snapshots, not the current product catalogue.
-- Retain existing WhatsApp provider template names.


-- ============================================================
-- 1. Common order summary generator
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_fulfillment_notification_order_summary(
    p_fulfillment varchar
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp
AS $body$

    WITH normalized_items AS (

        SELECT
            btrim(
                regexp_replace(
                    i.product_name_snapshot,
                    '[[:space:]]+',
                    ' ',
                    'g'
                )
            ) AS product_name,
            i.quantity

        FROM fulfillment_items i

        WHERE i.fulfillment_id=p_fulfillment
          AND i.quantity>0
          AND nullif(btrim(i.product_name_snapshot),'')
              IS NOT NULL

    ),

    grouped_items AS (

        SELECT
            n.product_name,
            sum(n.quantity) AS quantity

        FROM normalized_items n

        WHERE n.product_name<>''

        GROUP BY n.product_name

    ),

    ranked_items AS (

        SELECT
            g.product_name,
            g.quantity,
            row_number() OVER (
                ORDER BY g.product_name
            ) AS item_rank

        FROM grouped_items g

    ),

    summary AS (

        SELECT

            string_agg(
                r.quantity::text || ' x ' ||
                CASE
                    WHEN length(r.product_name)>65
                    THEN left(r.product_name,62) || '...'
                    ELSE r.product_name
                END,
                ', ' ORDER BY r.item_rank
            ) FILTER (
                WHERE r.item_rank<=3
            ) AS item_summary,

            count(*) FILTER (
                WHERE r.item_rank>3
            ) AS remaining_products

        FROM ranked_items r

    )

    SELECT coalesce(

        s.item_summary ||

        CASE
            WHEN s.remaining_products>0
            THEN ' + ' ||
                 s.remaining_products::text ||
                 ' more product(s)'
            ELSE ''
        END,

        'Order item details unavailable'

    )

    FROM summary s;

$body$;


REVOKE ALL ON FUNCTION
    "${schemaName}".get_fulfillment_notification_order_summary(varchar)
FROM PUBLIC,"${appRole}";


-- ============================================================
-- 2. Register the new notification parameter
-- ============================================================

UPDATE "${schemaName}".notification_event_definitions d

SET allowed_parameters =
    array_append(d.allowed_parameters,'orderSummary')

WHERE d.component_code='FULFILLMENT'

  AND d.event_code IN (
      'FULFILLMENT_PLACED',
      'FULFILLMENT_PREPARING',
      'FULFILLMENT_READY',
      'FULFILLMENT_COLLECTION_REVISED',
      'FULFILLMENT_COMPLETED',
      'FULFILLMENT_CANCELLED'
  )

  AND NOT (
      'orderSummary'=ANY(d.allowed_parameters)
  );


-- ============================================================
-- 3. Update database-driven notification messages
-- ============================================================

UPDATE "${schemaName}".notification_channel_templates t

SET message=m.message

FROM (VALUES

    (
        'FULFILLMENT_PLACED',
        'Your order {referenceNumber} from {organizationName} was placed at {storeName}.'
        || E'\n\nOrder details: {orderSummary}'
    ),

    (
        'FULFILLMENT_PREPARING',
        'Your order {referenceNumber} from {organizationName} is being prepared at {storeName}.'
        || E'\n\nOrder details: {orderSummary}'
    ),

    (
        'FULFILLMENT_READY',
        'Your order {referenceNumber} from {organizationName} is ready for collection at {storeName}.'
        || E'\n\nOrder details: {orderSummary}'
    ),

    (
        'FULFILLMENT_COLLECTION_REVISED',
        'Collect order {referenceNumber} from {organizationName} at {storeName} on {revisedCollectionTime}.'
        || E'\n\nOrder details: {orderSummary}'
    ),

    (
        'FULFILLMENT_COMPLETED',
        'Your order {referenceNumber} from {organizationName} was collected at {storeName}.'
        || E'\n\nOrder details: {orderSummary}'
    ),

    (
        'FULFILLMENT_CANCELLED',
        'Your order {referenceNumber} from {organizationName} at {storeName} was cancelled.'
        || E'\n\nOrder details: {orderSummary}'
    )

) m(event_code,message)

WHERE t.component_code='FULFILLMENT'
  AND t.event_code=m.event_code
  AND t.channel IN ('IN_APP','WHATSAPP')
  AND t.language_code='en';


-- ============================================================
-- 4. Update WhatsApp positional parameter mappings
-- ============================================================

UPDATE "${schemaName}".notification_channel_templates t

SET parameter_names =

    ARRAY[
        'customerName',
        'organizationName',
        'referenceNumber',
        'storeName',
        'orderSummary'
    ]::text[]

    ||

    CASE

        WHEN t.event_code=
            'FULFILLMENT_COLLECTION_REVISED'

        THEN ARRAY['revisedCollectionTime']::text[]

        ELSE ARRAY[]::text[]

    END

WHERE t.component_code='FULFILLMENT'
  AND t.channel='WHATSAPP'
  AND t.language_code='en'

  AND t.event_code IN (
      'FULFILLMENT_PLACED',
      'FULFILLMENT_PREPARING',
      'FULFILLMENT_READY',
      'FULFILLMENT_COLLECTION_REVISED',
      'FULFILLMENT_COMPLETED',
      'FULFILLMENT_CANCELLED'
  );


-- ============================================================
-- 5. Extend existing fulfillment notification producer
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".prepare_fulfillment_action_notifications(
    p_order varchar,
    p_action_ids varchar[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp
AS $body$

DECLARE

    v_item record;
    v_delivery record;
    v_result jsonb := '[]'::jsonb;
    v_params jsonb;
    v_nav jsonb;
    v_order_summary text;

BEGIN

    FOR v_item IN

        SELECT

            f.fulfillment_id,
            f.organization_id,
            f.customer_user_id,
            f.fulfillment_number,
            f.effective_policy_snapshot,

            a.fulfillment_action_id,
            a.proposed_expected_collection_at,
            a.previous_expected_collection_at,

            action.status_code AS action_code,

            o.organization_name,
            s.store_name,
            s.timezone,

            coalesce(
                nullif(btrim(u.display_name),''),
                nullif(
                    btrim(
                        concat_ws(
                            ' ',
                            u.first_name,
                            u.last_name
                        )
                    ),
                    ''
                ),
                'Customer'
            ) AS customer_name,

            coalesce(
                r.subscription_id,
                c.subscription_id
            ) AS subscription_id,

            d.component_code,
            d.event_code,
            d.source_type,
            d.allowed_parameters,

            fulfillment_resolve_org_policy(
                f.organization_id
            ) AS org_policy,

            fulfillment_apply_store_overrides(
                fulfillment_resolve_org_policy(
                    f.organization_id
                ),
                s.fulfillment_overrides
            ) AS store_policy

        FROM fulfillments f

        JOIN fulfillment_actions a
            ON a.fulfillment_id=f.fulfillment_id

        JOIN statuses action
            ON action.status_id=a.action_type_status_id

        JOIN statuses kind
            ON kind.status_id=f.fulfillment_type_status_id
           AND kind.status_code='ORDER'

        JOIN statuses timing
            ON timing.status_id=f.request_timing_status_id
           AND timing.status_code='ADVANCE'

        JOIN statuses workflow
            ON workflow.status_id=f.workflow_mode_status_id

        LEFT JOIN statuses target
            ON target.status_id=a.new_fulfillment_status_id

        JOIN organization o
            ON o.organization_id=f.organization_id
           AND NOT o.is_deleted

        JOIN stores s
            ON s.store_id=f.store_id
           AND s.organization_id=f.organization_id
           AND NOT s.is_deleted

        JOIN "user" u
            ON u.user_id=f.customer_user_id
           AND NOT u.is_deleted
           AND u.user_status_id=
               'entity-status-user-active'

        LEFT JOIN redemption_transaction r
            ON r.redemption_transaction_id=
               f.redemption_transaction_id

        LEFT JOIN commerce_transactions c
            ON c.commerce_transaction_id=
               f.commerce_transaction_id

        JOIN notification_event_definitions d
            ON d.component_code='FULFILLMENT'
           AND d.source_type='FULFILLMENT_ACTION'
           AND d.supported
           AND d.enabled
           AND action.status_code=
               ANY(d.source_action_codes)

           AND (
               d.source_target_status_code IS NULL
               OR d.source_target_status_code=
                  target.status_code
           )

        WHERE f.fulfillment_id=p_order

          AND a.fulfillment_action_id=
              ANY(p_action_ids)

          AND (
              target.status_code NOT IN (
                  'PREPARING','READY'
              )
              OR workflow.status_code IN (
                  'SIMPLE','DETAILED'
              )
          )

          AND (
              d.event_code<>
                  'FULFILLMENT_COLLECTION_REVISED'

              OR (
                  a.proposed_expected_collection_at
                      IS NOT NULL

                  AND a.proposed_expected_collection_at
                      IS DISTINCT FROM
                      a.previous_expected_collection_at
              )
          )

    LOOP

        -- Organization and Store notification policies.

        IF NOT coalesce(

            (
                v_item.org_policy
                #> '{fulfillmentTypes,ORDER,notificationEvents}'
            ) ? v_item.event_code,

            false

        )

        OR NOT coalesce(

            (
                v_item.store_policy
                #> '{fulfillmentTypes,ORDER,notificationEvents}'
            ) ? v_item.event_code,

            false

        )

        THEN

            CONTINUE;

        END IF;


        -- Generate once per fulfillment notification call.

        IF v_order_summary IS NULL THEN

            v_order_summary :=
                get_fulfillment_notification_order_summary(
                    v_item.fulfillment_id
                );

        END IF;


        -- Common notification parameters.

        v_params := jsonb_build_object(

            'customerName',
            v_item.customer_name,

            'organizationName',
            v_item.organization_name,

            'referenceNumber',
            v_item.fulfillment_number,

            'storeName',
            v_item.store_name,

            'orderSummary',
            v_order_summary

        );


        -- Additional parameter for collection time revision.

        IF v_item.proposed_expected_collection_at
               IS NOT NULL

           AND 'revisedCollectionTime'=
               ANY(v_item.allowed_parameters)

        THEN

            v_params := v_params ||

                jsonb_build_object(

                    'revisedCollectionTime',

                    to_char(

                        (
                            v_item.proposed_expected_collection_at
                            AT TIME ZONE 'UTC'
                        )

                        AT TIME ZONE coalesce(
                            v_item.effective_policy_snapshot
                                ->>'collectionTimeZone',
                            v_item.timezone
                        ),

                        'YYYY-MM-DD HH24:MI'

                    )

                    || ' ' ||

                    coalesce(
                        v_item.effective_policy_snapshot
                            ->>'collectionTimeZone',
                        v_item.timezone
                    )

                );

        END IF;


        -- Preserve existing notification navigation context.

        v_nav :=

            CASE

                WHEN v_item.subscription_id IS NOT NULL

                THEN jsonb_build_object(

                    'kind',
                    'FULFILLMENT',

                    'organizationId',
                    v_item.organization_id,

                    'subscriptionId',
                    v_item.subscription_id,

                    'fulfillmentId',
                    v_item.fulfillment_id

                )

            END;


        -- Use existing generic notification framework.

        FOR v_delivery IN

            SELECT *

            FROM prepare_notification_event(

                v_item.component_code,
                v_item.event_code,
                v_item.source_type,
                v_item.fulfillment_id,
                v_item.fulfillment_action_id,
                v_item.organization_id,
                v_item.customer_user_id,
                'en',
                v_params,
                v_nav

            )

        LOOP

            v_result := v_result ||

                jsonb_build_array(

                    jsonb_build_object(

                        'deliveryId',
                        v_delivery.delivery_id,

                        'channel',
                        v_delivery.channel,

                        'status',
                        v_delivery.status,

                        'recipientUserId',
                        v_item.customer_user_id

                    )

                );

        END LOOP;

    END LOOP;

    RETURN v_result;

END;

$body$;


REVOKE ALL ON FUNCTION
    "${schemaName}".prepare_fulfillment_action_notifications(
        varchar,
        varchar[]
    )
FROM PUBLIC,"${appRole}";