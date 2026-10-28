-- Org Product Offer Store availability is independent of canonical Product
-- eligibility and external Commerce Product mappings. The legacy offer.store_id
-- remains a compatibility projection only; this table is authoritative.

DO $migration$
DECLARE
    v_constraint_definition text;
BEGIN
    SELECT pg_get_constraintdef(c.oid)
      INTO v_constraint_definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = '${schemaName}'
       AND t.relname = 'offer'
       AND c.conname = 'uq_offer_id_organization';

    IF v_constraint_definition IS NOT NULL
       AND v_constraint_definition <> 'UNIQUE (offer_id, organization_id)' THEN
        RAISE EXCEPTION
            'Existing uq_offer_id_organization has an incompatible definition';
    END IF;

    IF v_constraint_definition IS NULL
       AND NOT EXISTS (
           SELECT 1
             FROM pg_index i
             JOIN pg_class t ON t.oid = i.indrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = '${schemaName}'
              AND t.relname = 'offer'
              AND i.indisunique
              AND i.indisvalid
              AND i.indnkeyatts = 2
              AND i.indpred IS NULL
              AND pg_get_indexdef(i.indexrelid, 1, true) = 'offer_id'
              AND pg_get_indexdef(i.indexrelid, 2, true) = 'organization_id'
       ) THEN
        ALTER TABLE "${schemaName}".offer
            ADD CONSTRAINT uq_offer_id_organization
            UNIQUE (offer_id, organization_id);
    END IF;
END;
$migration$;

CREATE TABLE "${schemaName}".offer_store_availability (
    offer_id varchar(40) NOT NULL,
    organization_id varchar(64) NOT NULL,
    availability_mode varchar(20) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (offer_id),
    UNIQUE (offer_id, organization_id),
    CONSTRAINT ck_offer_store_availability_mode
        CHECK (availability_mode IN ('ALL_STORES', 'SELECTED_STORES')),
    CONSTRAINT fk_offer_store_availability_offer
        FOREIGN KEY (offer_id, organization_id)
        REFERENCES "${schemaName}".offer(offer_id, organization_id)
);

CREATE TABLE "${schemaName}".offer_store_availability_store (
    offer_id varchar(40) NOT NULL,
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    organization_id varchar(64) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (offer_id, store_id),
    CONSTRAINT fk_offer_store_availability_store_parent
        FOREIGN KEY (offer_id, organization_id)
        REFERENCES "${schemaName}".offer_store_availability(offer_id, organization_id)
);

CREATE INDEX ix_offer_store_availability_store_active
    ON "${schemaName}".offer_store_availability_store(organization_id, store_id)
    WHERE NOT is_deleted;

-- Preserve every existing Offer's current effective legacy restriction. A NULL
-- legacy Store meant no Store restriction; a non-NULL Store meant that one Store.
INSERT INTO "${schemaName}".offer_store_availability (
    offer_id,
    organization_id,
    availability_mode,
    created_at,
    created_by,
    updated_at,
    updated_by,
    version_no
)
SELECT o.offer_id,
       o.organization_id,
       CASE WHEN o.store_id IS NULL THEN 'ALL_STORES' ELSE 'SELECTED_STORES' END,
       o.created_at,
       o.created_by,
       o.updated_at,
       o.updated_by,
       o.version_no
  FROM "${schemaName}".offer o
 WHERE o.organization_id IS NOT NULL
ON CONFLICT (offer_id) DO NOTHING;

INSERT INTO "${schemaName}".offer_store_availability_store (
    offer_id,
    store_id,
    organization_id,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
SELECT o.offer_id,
       o.store_id,
       o.organization_id,
       o.created_at,
       o.created_by,
       o.updated_at,
       o.updated_by,
       false,
       o.version_no
  FROM "${schemaName}".offer o
 WHERE o.store_id IS NOT NULL
ON CONFLICT (offer_id, store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION "${schemaName}".get_offer_store_availability(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "offerId" varchar,
    "availabilityMode" varchar,
    "storeId" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT availability.offer_id,
           availability.availability_mode,
           selected.store_id
      FROM offer_store_availability availability
      JOIN offer o
        ON o.offer_id = availability.offer_id
       AND o.organization_id = availability.organization_id
       AND NOT o.is_deleted
      LEFT JOIN offer_store_availability_store selected
        ON selected.offer_id = availability.offer_id
       AND selected.organization_id = availability.organization_id
       AND NOT selected.is_deleted
     WHERE availability.organization_id = p_organization_id
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY availability.offer_id, selected.store_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_offer_store_availability(
    p_organization_id varchar,
    p_offer_id varchar,
    p_availability_mode varchar,
    p_store_ids varchar[],
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_store_id varchar(64);
    v_store_count integer;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization access denied' USING ERRCODE = '42501';
    END IF;

    IF p_availability_mode IS NULL
    OR p_availability_mode NOT IN ('ALL_STORES', 'SELECTED_STORES') THEN
        RAISE EXCEPTION 'Offer Store availability mode is invalid' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM unnest(COALESCE(p_store_ids, ARRAY[]::varchar[])) selected(store_id)
         WHERE NULLIF(btrim(selected.store_id), '') IS NULL
    ) OR (
        SELECT count(*)
          FROM unnest(COALESCE(p_store_ids, ARRAY[]::varchar[])) selected(store_id)
    ) <> (
        SELECT count(DISTINCT selected.store_id)
          FROM unnest(COALESCE(p_store_ids, ARRAY[]::varchar[])) selected(store_id)
    ) THEN
        RAISE EXCEPTION 'Offer Store availability contains an invalid or duplicate Store id'
            USING ERRCODE = '22023';
    END IF;

    IF p_availability_mode = 'ALL_STORES'
       AND cardinality(COALESCE(p_store_ids, ARRAY[]::varchar[])) <> 0 THEN
        RAISE EXCEPTION 'ALL_STORES availability cannot include Store ids' USING ERRCODE = '22023';
    END IF;

    IF p_availability_mode = 'SELECTED_STORES'
       AND cardinality(COALESCE(p_store_ids, ARRAY[]::varchar[])) = 0 THEN
        RAISE EXCEPTION 'SELECTED_STORES availability requires at least one Store'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
      FROM offer
     WHERE offer_id = p_offer_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_availability_mode = 'SELECTED_STORES' THEN
        PERFORM s.store_id
          FROM stores s
          JOIN entity_status store_entity_status
            ON store_entity_status.entity_status_id = s.store_status_id
           AND store_entity_status.is_active
          JOIN statuses store_status
            ON store_status.status_id = store_entity_status.status_id
           AND store_status.status_code = 'ACTIVE'
         WHERE s.organization_id = p_organization_id
           AND s.store_id = ANY(p_store_ids)
           AND NOT s.is_deleted
         ORDER BY s.store_id
         FOR UPDATE;
        GET DIAGNOSTICS v_store_count = ROW_COUNT;
        IF v_store_count <> cardinality(p_store_ids) THEN
            RAISE EXCEPTION 'Selected Store is unavailable or belongs to another organization'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    PERFORM 1
      FROM offer_store_availability
     WHERE offer_id = p_offer_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    PERFORM 1
      FROM offer_store_availability_store
     WHERE offer_id = p_offer_id
       AND organization_id = p_organization_id
     ORDER BY store_id
     FOR UPDATE;

    INSERT INTO offer_store_availability (
        offer_id,
        organization_id,
        availability_mode,
        created_by,
        updated_by
    ) VALUES (
        p_offer_id,
        p_organization_id,
        p_availability_mode,
        p_actor_user_id,
        p_actor_user_id
    )
    ON CONFLICT (offer_id) DO UPDATE
       SET availability_mode = EXCLUDED.availability_mode,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by,
           version_no = offer_store_availability.version_no + 1
     WHERE offer_store_availability.organization_id = EXCLUDED.organization_id
       AND offer_store_availability.availability_mode IS DISTINCT FROM EXCLUDED.availability_mode;

    UPDATE offer_store_availability_store selected
       SET is_deleted = true,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = selected.version_no + 1
     WHERE selected.offer_id = p_offer_id
       AND selected.organization_id = p_organization_id
       AND NOT selected.is_deleted
       AND (
           p_availability_mode = 'ALL_STORES'
           OR NOT selected.store_id = ANY(p_store_ids)
       );

    IF p_availability_mode = 'SELECTED_STORES' THEN
        FOR v_store_id IN
            SELECT selected.store_id
              FROM unnest(p_store_ids) selected(store_id)
             ORDER BY selected.store_id
        LOOP
            INSERT INTO offer_store_availability_store (
                offer_id,
                store_id,
                organization_id,
                created_by,
                updated_by
            ) VALUES (
                p_offer_id,
                v_store_id,
                p_organization_id,
                p_actor_user_id,
                p_actor_user_id
            )
            ON CONFLICT (offer_id, store_id) DO UPDATE
               SET is_deleted = false,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = EXCLUDED.updated_by,
                   version_no = offer_store_availability_store.version_no + 1
             WHERE offer_store_availability_store.organization_id = EXCLUDED.organization_id
               AND offer_store_availability_store.is_deleted;
        END LOOP;
    END IF;

    RETURN true;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".offer_store_availability,
    "${schemaName}".offer_store_availability_store FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_offer_store_availability(varchar, varchar),
    "${schemaName}".save_offer_store_availability(varchar, varchar, varchar, varchar[], varchar)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_offer_store_availability(varchar, varchar),
    "${schemaName}".save_offer_store_availability(varchar, varchar, varchar, varchar[], varchar)
    TO "${appRole}";
