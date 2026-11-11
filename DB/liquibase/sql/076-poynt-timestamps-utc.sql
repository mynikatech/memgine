-- 076-poynt-timestamps-utc.sql
--
-- Poynt system timestamps are persisted as UTC-aware timestamptz values.
-- Existing timestamp-without-time-zone values created by migration 075
-- were generated as UTC values, so they are explicitly interpreted as UTC
-- during conversion.

-- Do not rerun the UTC interpretation after the column has become timestamptz:
-- `timestamptz AT TIME ZONE 'UTC'` would convert it back to a local timestamp
-- before the type change and could alter the instant under a non-UTC session.
DO $migration$
DECLARE
    v_schema text := '${schemaName}';
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = v_schema
          AND table_name = 'poynt_terminal_pairings'
          AND column_name = 'expires_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I.poynt_terminal_pairings '
            || 'ALTER COLUMN expires_at TYPE timestamp with time zone '
            || 'USING expires_at AT TIME ZONE ''UTC''',
            v_schema
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = v_schema
          AND table_name = 'poynt_terminal_pairings'
          AND column_name = 'consumed_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I.poynt_terminal_pairings '
            || 'ALTER COLUMN consumed_at TYPE timestamp with time zone '
            || 'USING consumed_at AT TIME ZONE ''UTC''',
            v_schema
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = v_schema
          AND table_name = 'poynt_terminal_pairings'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I.poynt_terminal_pairings '
            || 'ALTER COLUMN created_at TYPE timestamp with time zone '
            || 'USING created_at AT TIME ZONE ''UTC''',
            v_schema
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = v_schema
          AND table_name = 'poynt_terminal_pairings'
          AND column_name = 'updated_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I.poynt_terminal_pairings '
            || 'ALTER COLUMN updated_at TYPE timestamp with time zone '
            || 'USING updated_at AT TIME ZONE ''UTC''',
            v_schema
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = v_schema
          AND table_name = 'poynt_terminal_bindings'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I.poynt_terminal_bindings '
            || 'ALTER COLUMN created_at TYPE timestamp with time zone '
            || 'USING created_at AT TIME ZONE ''UTC''',
            v_schema
        );
    END IF;
END;
$migration$;


-- The existing function created in 075 accepts timestamp without time zone.
-- Drop that exact signature before recreating it with timestamptz.

DROP FUNCTION IF EXISTS "${schemaName}".poynt_create_terminal_pairing(
    varchar,
    varchar,
    varchar,
    varchar,
    timestamp without time zone,
    varchar
);


CREATE OR REPLACE FUNCTION "${schemaName}".poynt_create_terminal_pairing(
    p_pairing_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_pairing_code_hash varchar,
    p_expires_at timestamp with time zone,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "pairingId" varchar,
    "organizationId" varchar,
    "storeId" varchar,
    "expiresAt" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id,
        p_organization_id,
        'ORG_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Poynt terminal pairing is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".stores s
        JOIN "${schemaName}".entity_status es
          ON es.entity_status_id = s.store_status_id
        JOIN "${schemaName}".statuses st
          ON st.status_id = es.status_id
        WHERE s.store_id = p_store_id
          AND s.organization_id = p_organization_id
          AND NOT s.is_deleted
          AND st.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Store is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}".poynt_terminal_pairings (
        poynt_terminal_pairing_id,
        organization_id,
        store_id,
        pairing_code_hash,
        expires_at,
        created_by
    )
    VALUES (
        p_pairing_id,
        p_organization_id,
        p_store_id,
        p_pairing_code_hash,
        p_expires_at,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        p_pairing_id,
        p_organization_id,
        p_store_id,
        p_expires_at::text;
END;
$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".poynt_create_terminal_pairing(
        varchar,
        varchar,
        varchar,
        varchar,
        timestamp with time zone,
        varchar
    )
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".poynt_create_terminal_pairing(
        varchar,
        varchar,
        varchar,
        varchar,
        timestamp with time zone,
        varchar
    )
TO "${appRole}";
