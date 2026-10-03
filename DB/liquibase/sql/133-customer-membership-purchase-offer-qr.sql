-- Customer-generated Membership Purchase Offer QR.
--
-- A customer may be a valid global Memgine user without yet being a CUSTOMER
-- of this organization. The QR therefore binds to global user_id, not
-- organization_user_id. The existing Counter prospective-customer path creates
-- or reactivates the organization relationship before the purchase OTP when
-- required.
--
-- Raw QR references are NEVER persisted. The server stores SHA-256 only.
-- Final store/product/plan/price eligibility remains authoritative in the
-- migration-131 Membership Purchase Offer pricing path.

CREATE TABLE IF NOT EXISTS "${schemaName}".membership_offer_purchase_qr_tokens (
    membership_offer_purchase_qr_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    customer_user_id varchar(64) NOT NULL
        REFERENCES "${schemaName}"."user"(user_id),
    offer_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".offer(offer_id),
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_resolved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}"."user"(user_id),
    CONSTRAINT ck_membership_offer_purchase_qr_token_hash
        CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS ix_membership_offer_purchase_qr_lookup
    ON "${schemaName}".membership_offer_purchase_qr_tokens (
        organization_id, token_hash
    );

CREATE INDEX IF NOT EXISTS ix_membership_offer_purchase_qr_customer
    ON "${schemaName}".membership_offer_purchase_qr_tokens (
        organization_id, customer_user_id, created_at DESC
    );

-- Coarse customer/Offer eligibility used only to decide whether the customer
-- app may issue a QR. Store/product/plan/currency pricing remains in 131.
CREATE OR REPLACE FUNCTION "${schemaName}".customer_membership_purchase_offer_available(
    p_organization_id varchar,
    p_customer_user_id varchar,
    p_offer_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_existing_customer boolean;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_offer_id), '') IS NULL THEN
        RETURN false;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "user" u
          JOIN entity_status ues
            ON ues.entity_status_id = u.user_status_id
          JOIN statuses us
            ON us.status_id = ues.status_id
         WHERE u.user_id = p_customer_user_id
           AND NOT u.is_deleted
           AND ues.is_active
           AND us.status_code = 'ACTIVE'
    ) THEN
        RETURN false;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM subscriptions s
          JOIN organization_user ou
            ON ou.organization_user_id = s.organization_user_id
         WHERE ou.organization_id = p_organization_id
           AND ou.user_id = p_customer_user_id
           AND NOT s.is_deleted
    ) INTO v_existing_customer;

    RETURN EXISTS (
        SELECT 1
          FROM membership_offer_applicability a
          JOIN offer o
            ON o.offer_id = a.offer_id
          JOIN entity_status oes
            ON oes.entity_status_id = o.status_id
          JOIN statuses os
            ON os.status_id = oes.status_id
         WHERE a.organization_id = p_organization_id
           AND a.offer_id = p_offer_id
           AND a.behavior = 'PURCHASE_DISCOUNT'
           AND a.is_active
           AND NOT a.is_deleted
           AND o.organization_id = p_organization_id
           AND NOT o.is_deleted
           AND oes.is_active
           AND os.status_code = 'ACTIVE'
           AND o.effective_date <= CURRENT_DATE
           AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_DATE)
           AND (
               a.customer_applicability = 'ALL'
               OR (
                   a.customer_applicability = 'NEW_CUSTOMER'
                   AND NOT v_existing_customer
               )
               OR (
                   a.customer_applicability = 'EXISTING_CUSTOMER'
                   AND v_existing_customer
               )
           )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_membership_purchase_offers(
    p_organization_id varchar,
    p_customer_user_id varchar
)
RETURNS TABLE (
    "offerId" varchar,
    "displayName" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        o.offer_id,
        o.offer_name
      FROM offer o
     WHERE o.organization_id = p_organization_id
       AND NOT o.is_deleted
       AND customer_membership_purchase_offer_available(
           p_organization_id,
           p_customer_user_id,
           o.offer_id
       )
     ORDER BY o.offer_name, o.offer_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".issue_customer_membership_purchase_offer_qr(
    p_organization_id varchar,
    p_customer_user_id varchar,
    p_offer_id varchar,
    p_token_hash varchar
)
RETURNS TABLE (
    "offerId" varchar,
    "displayName" varchar,
    "expiresAt" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_offer_name varchar(255);
    v_expires_at timestamp with time zone;
BEGIN
    IF p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Membership Offer QR is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF NOT customer_membership_purchase_offer_available(
        p_organization_id,
        p_customer_user_id,
        p_offer_id
    ) THEN
        RAISE EXCEPTION 'Membership Offer is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT o.offer_name
      INTO v_offer_name
      FROM offer o
     WHERE o.organization_id = p_organization_id
       AND o.offer_id = p_offer_id
       AND NOT o.is_deleted;

    IF v_offer_name IS NULL THEN
        RAISE EXCEPTION 'Membership Offer is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    -- One currently issued QR per customer/organization/Offer. Generating a
    -- fresh code revokes any earlier unexpired code.
    UPDATE membership_offer_purchase_qr_tokens
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE organization_id = p_organization_id
       AND customer_user_id = p_customer_user_id
       AND offer_id = p_offer_id
       AND revoked_at IS NULL;

    v_expires_at := CURRENT_TIMESTAMP + INTERVAL '5 minutes';

    INSERT INTO membership_offer_purchase_qr_tokens (
        membership_offer_purchase_qr_id,
        organization_id,
        customer_user_id,
        offer_id,
        token_hash,
        expires_at,
        created_by
    ) VALUES (
        generate_runtime_id('MOQ'),
        p_organization_id,
        p_customer_user_id,
        p_offer_id,
        p_token_hash,
        v_expires_at,
        p_customer_user_id
    );

    RETURN QUERY
    SELECT
        p_offer_id,
        v_offer_name,
        v_expires_at::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".resolve_counter_customer_membership_offer_qr(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_token_hash varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "offerId" varchar,
    "displayName" varchar,
    "customerUserId" varchar,
    "firstName" varchar,
    "lastName" varchar,
    "customerDisplayName" varchar,
    "primaryEmail" varchar,
    "primaryPhone" varchar,
    "organizationCustomer" boolean,
    "expiresAt" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_qr membership_offer_purchase_qr_tokens%ROWTYPE;
BEGIN
    IF p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
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

    SELECT q.*
      INTO v_qr
      FROM membership_offer_purchase_qr_tokens q
     WHERE q.organization_id = p_organization_id
       AND q.token_hash = p_token_hash
       AND q.revoked_at IS NULL
       AND q.expires_at > CURRENT_TIMESTAMP
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership Offer QR is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT customer_membership_purchase_offer_available(
        p_organization_id,
        v_qr.customer_user_id,
        v_qr.offer_id
    ) THEN
        RAISE EXCEPTION 'Membership Offer QR is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    UPDATE membership_offer_purchase_qr_tokens
       SET last_resolved_at = CURRENT_TIMESTAMP
     WHERE membership_offer_purchase_qr_id =
           v_qr.membership_offer_purchase_qr_id;

    RETURN QUERY
    SELECT
        o.offer_id,
        o.offer_name,
        u.user_id,
        u.first_name,
        u.last_name,
        NULLIF(u.display_name, ''),
        u.primary_email,
        u.primary_phone,
        EXISTS (
            SELECT 1
              FROM organization_user ou
              JOIN organization_user_types ot
                ON ot.organization_user_type_id =
                   ou.organization_user_type_id
              JOIN entity_status oues
                ON oues.entity_status_id =
                   ou.organization_user_status_id
              JOIN statuses ous
                ON ous.status_id = oues.status_id
             WHERE ou.organization_id = p_organization_id
               AND ou.user_id = u.user_id
               AND ot.organization_user_type_code = 'CUSTOMER'
               AND NOT ou.is_deleted
               AND oues.is_active
               AND ous.status_code = 'ACTIVE'
        ),
        v_qr.expires_at::text
      FROM "user" u
      JOIN entity_status ues
        ON ues.entity_status_id = u.user_status_id
      JOIN statuses us
        ON us.status_id = ues.status_id
      JOIN offer o
        ON o.offer_id = v_qr.offer_id
       AND o.organization_id = p_organization_id
       AND NOT o.is_deleted
     WHERE u.user_id = v_qr.customer_user_id
       AND NOT u.is_deleted
       AND ues.is_active
       AND us.status_code = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership Offer QR is unavailable'
            USING ERRCODE = 'P0002';
    END IF;
END;
$function$;

-- Forward-fix migration 131:
-- Identified pricing may use an ACTIVE GLOBAL Memgine user even when that user
-- does not yet have an organization CUSTOMER relationship. This is required so
-- NEW_CUSTOMER / EXISTING_CUSTOMER can be evaluated correctly before Counter
-- onboarding creates the organization relationship.
CREATE OR REPLACE FUNCTION "${schemaName}".membership_purchase_offer_price(
    p_organization_id varchar,
    p_store_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_explicit_offer_id varchar
) RETURNS TABLE (
    "subscriptionPlanId" varchar,
    "membershipProductId" varchar,
    "baseSubtotalMinor" bigint,
    "appliedOfferId" varchar,
    "adjustmentType" varchar,
    "discountMinor" bigint,
    "netSubtotalMinor" bigint,
    "taxRate" double precision,
    "taxMinor" bigint,
    "finalTotalMinor" bigint,
    "currencyCode" varchar,
    "taxCode" varchar,
    "taxName" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_membership_product_id varchar(64);
    v_base_subtotal_minor bigint;
    v_tax_rate numeric(7,4);
    v_currency_code varchar(10);
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_existing_customer boolean;

    v_offer record;
    v_candidate_discount_minor bigint;
    v_candidate_net_subtotal_minor bigint;
    v_candidate_tax_minor bigint;
    v_candidate_final_minor bigint;

    v_best_offer_id varchar(64);
    v_best_adjustment_type varchar(32);
    v_best_discount_minor bigint;
    v_best_net_subtotal_minor bigint;
    v_best_tax_minor bigint;
    v_best_final_minor bigint;

    v_base_tax_minor bigint;
    v_base_final_minor bigint;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase quote context is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF p_explicit_offer_id IS NOT NULL
       AND NULLIF(btrim(p_explicit_offer_id), '') IS NULL THEN
        RAISE EXCEPTION 'Membership Offer is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        sp.membership_product_id,
        round(q."subtotalAmount"::numeric * 100)::bigint,
        q."taxRate"::numeric(7,4),
        round(q."taxAmount"::numeric * 100)::bigint,
        round(q."totalAmount"::numeric * 100)::bigint,
        q."currencyCode",
        q."taxCode",
        q."taxName"
      INTO
        v_membership_product_id,
        v_base_subtotal_minor,
        v_tax_rate,
        v_base_tax_minor,
        v_base_final_minor,
        v_currency_code,
        v_tax_code,
        v_tax_name
      FROM membership_purchase_quote(
          p_organization_id,
          p_subscription_plan_id
      ) AS q
      JOIN subscription_plans sp
        ON sp.subscription_plan_id = p_subscription_plan_id;

    IF v_membership_product_id IS NULL
       OR v_base_subtotal_minor IS NULL
       OR v_tax_rate IS NULL
       OR v_base_tax_minor IS NULL
       OR v_base_final_minor IS NULL
       OR NULLIF(btrim(v_currency_code), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase pricing is unavailable'
            USING ERRCODE = '22023';
    END IF;

    IF p_customer_user_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM "user" u
             JOIN entity_status ues
               ON ues.entity_status_id = u.user_status_id
             JOIN statuses us
               ON us.status_id = ues.status_id
            WHERE u.user_id = p_customer_user_id
              AND NOT u.is_deleted
              AND ues.is_active
              AND us.status_code = 'ACTIVE'
       ) THEN
        RAISE EXCEPTION 'Customer account is not active'
            USING ERRCODE = '22023';
    END IF;

    IF p_customer_user_id IS NULL THEN
        v_existing_customer := NULL;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM subscriptions s
              JOIN organization_user ou
                ON ou.organization_user_id = s.organization_user_id
             WHERE ou.organization_id = p_organization_id
               AND ou.user_id = p_customer_user_id
               AND NOT s.is_deleted
        ) INTO v_existing_customer;
    END IF;

    IF p_explicit_offer_id IS NOT NULL THEN
        PERFORM 1
          FROM membership_offer_applicability a
          JOIN offer o
            ON o.offer_id = a.offer_id
         WHERE a.offer_id = p_explicit_offer_id
           AND a.organization_id = p_organization_id
           AND o.organization_id = p_organization_id
           AND a.behavior = 'PURCHASE_DISCOUNT'
           AND NOT a.is_deleted
           AND NOT o.is_deleted
         LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Membership Offer is unavailable'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    FOR v_offer IN
        SELECT
            a.offer_id,
            a.adjustment_type,
            a.percentage,
            a.amount_minor,
            a.currency_code
          FROM membership_offer_applicability a
          JOIN offer o
            ON o.offer_id = a.offer_id
          JOIN entity_status oes
            ON oes.entity_status_id = o.status_id
          JOIN statuses os
            ON os.status_id = oes.status_id
         WHERE a.organization_id = p_organization_id
           AND a.behavior = 'PURCHASE_DISCOUNT'
           AND a.is_active
           AND NOT a.is_deleted
           AND o.organization_id = p_organization_id
           AND NOT o.is_deleted
           AND oes.is_active
           AND os.status_code = 'ACTIVE'
           AND (o.store_id IS NULL OR o.store_id = p_store_id)
           AND o.effective_date <= CURRENT_DATE
           AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_DATE)
           AND (p_explicit_offer_id IS NULL OR a.offer_id = p_explicit_offer_id)
           AND (
               a.customer_applicability = 'ALL'
               OR (
                   p_customer_user_id IS NOT NULL
                   AND a.customer_applicability = 'NEW_CUSTOMER'
                   AND NOT v_existing_customer
               )
               OR (
                   p_customer_user_id IS NOT NULL
                   AND a.customer_applicability = 'EXISTING_CUSTOMER'
                   AND v_existing_customer
               )
           )
           AND (
               a.membership_target_mode = 'ALL_MEMBERSHIP_PRODUCTS'
               OR (
                   a.membership_target_mode = 'SELECTED_MEMBERSHIP_PRODUCTS'
                   AND EXISTS (
                       SELECT 1
                         FROM membership_offer_applicability_products ap
                        WHERE ap.membership_offer_applicability_id =
                              a.membership_offer_applicability_id
                          AND ap.organization_id = p_organization_id
                          AND ap.membership_product_id =
                              v_membership_product_id
                          AND NOT ap.is_deleted
                   )
               )
           )
           AND (
               a.target_subscription_plan_id IS NULL
               OR a.target_subscription_plan_id = p_subscription_plan_id
           )
         ORDER BY a.offer_id
         FOR SHARE OF a, o
    LOOP
        v_candidate_discount_minor := NULL;
        v_candidate_net_subtotal_minor := NULL;

        IF v_offer.adjustment_type = 'PRODUCT_PERCENT_OFF' THEN
            v_candidate_discount_minor := round(
                v_base_subtotal_minor::numeric *
                v_offer.percentage / 100
            )::bigint;
            v_candidate_discount_minor := LEAST(
                v_base_subtotal_minor,
                GREATEST(0::bigint, v_candidate_discount_minor)
            );
            v_candidate_net_subtotal_minor :=
                v_base_subtotal_minor - v_candidate_discount_minor;

        ELSIF v_offer.adjustment_type = 'PRODUCT_FIXED_OFF' THEN
            IF upper(v_offer.currency_code)
               IS DISTINCT FROM upper(v_currency_code) THEN
                CONTINUE;
            END IF;
            v_candidate_discount_minor := LEAST(
                v_base_subtotal_minor,
                GREATEST(0::bigint, v_offer.amount_minor)
            );
            v_candidate_net_subtotal_minor :=
                v_base_subtotal_minor - v_candidate_discount_minor;

        ELSIF v_offer.adjustment_type = 'PRODUCT_SPECIAL_PRICE' THEN
            IF upper(v_offer.currency_code)
               IS DISTINCT FROM upper(v_currency_code)
               OR v_offer.amount_minor < 0
               OR v_offer.amount_minor > v_base_subtotal_minor THEN
                CONTINUE;
            END IF;
            v_candidate_net_subtotal_minor := v_offer.amount_minor;
            v_candidate_discount_minor :=
                v_base_subtotal_minor - v_candidate_net_subtotal_minor;

        ELSE
            CONTINUE;
        END IF;

        v_candidate_tax_minor := round(
            v_candidate_net_subtotal_minor::numeric *
            v_tax_rate / 100
        )::bigint;
        v_candidate_tax_minor :=
            GREATEST(0::bigint, v_candidate_tax_minor);
        v_candidate_final_minor :=
            v_candidate_net_subtotal_minor + v_candidate_tax_minor;

        IF v_best_offer_id IS NULL
           OR v_candidate_final_minor < v_best_final_minor
           OR (
               v_candidate_final_minor = v_best_final_minor
               AND v_offer.offer_id < v_best_offer_id
           ) THEN
            v_best_offer_id := v_offer.offer_id;
            v_best_adjustment_type := v_offer.adjustment_type;
            v_best_discount_minor := v_candidate_discount_minor;
            v_best_net_subtotal_minor :=
                v_candidate_net_subtotal_minor;
            v_best_tax_minor := v_candidate_tax_minor;
            v_best_final_minor := v_candidate_final_minor;
        END IF;
    END LOOP;

    IF p_explicit_offer_id IS NOT NULL
       AND v_best_offer_id IS NULL THEN
        RAISE EXCEPTION 'Membership Offer is not eligible for this purchase'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p_subscription_plan_id,
        v_membership_product_id,
        v_base_subtotal_minor,
        v_best_offer_id,
        v_best_adjustment_type,
        COALESCE(v_best_discount_minor, 0::bigint),
        COALESCE(v_best_net_subtotal_minor, v_base_subtotal_minor),
        v_tax_rate::double precision,
        COALESCE(v_best_tax_minor, v_base_tax_minor),
        COALESCE(v_best_final_minor, v_base_final_minor),
        v_currency_code,
        v_tax_code,
        v_tax_name;
END;
$function$;

REVOKE ALL ON TABLE
    "${schemaName}".membership_offer_purchase_qr_tokens
FROM PUBLIC;

REVOKE ALL ON TABLE
    "${schemaName}".membership_offer_purchase_qr_tokens
FROM "${appRole}";

REVOKE ALL ON FUNCTION
    "${schemaName}".customer_membership_purchase_offer_available(
        varchar, varchar, varchar
    ),
    "${schemaName}".get_customer_membership_purchase_offers(
        varchar, varchar
    ),
    "${schemaName}".issue_customer_membership_purchase_offer_qr(
        varchar, varchar, varchar, varchar
    ),
    "${schemaName}".resolve_counter_customer_membership_offer_qr(
        varchar, varchar, varchar, varchar, varchar
    ),
    "${schemaName}".membership_purchase_offer_price(
        varchar, varchar, varchar, varchar, varchar
    )
FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_roles
         WHERE rolname = '${appRole}'
    ) THEN
        REVOKE ALL ON FUNCTION
            "${schemaName}".customer_membership_purchase_offer_available(
                varchar, varchar, varchar
            )
        FROM "${appRole}";

        REVOKE ALL ON FUNCTION
            "${schemaName}".membership_purchase_offer_price(
                varchar, varchar, varchar, varchar, varchar
            )
        FROM "${appRole}";

        GRANT EXECUTE ON FUNCTION
            "${schemaName}".get_customer_membership_purchase_offers(
                varchar, varchar
            )
        TO "${appRole}";

        GRANT EXECUTE ON FUNCTION
            "${schemaName}".issue_customer_membership_purchase_offer_qr(
                varchar, varchar, varchar, varchar
            )
        TO "${appRole}";

        GRANT EXECUTE ON FUNCTION
            "${schemaName}".resolve_counter_customer_membership_offer_qr(
                varchar, varchar, varchar, varchar, varchar
            )
        TO "${appRole}";
    END IF;
END
$grant$;
