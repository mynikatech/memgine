-- ============================================================================
-- Memgine
-- Batch 2A - Store Functions
--
-- Purpose:
--   Server-side persistence functions for Organization Store administration.
--
-- Design:
--   - Relational parameters for writes
--   - RETURNS TABLE for reads and write responses
--   - No JSON / JSONB API contract
--   - Soft delete
--   - Organization administration authorization enforced in DB
--   - Safe to rerun
-- ============================================================================


-- ============================================================================
-- DROP OLD FUNCTION SIGNATURES
--
-- 043 created JSON-based Store functions. They must be removed because
-- get_organization_stores() changes its return type from jsonb to TABLE.
-- PostgreSQL CREATE OR REPLACE cannot change a function return type.
-- ============================================================================

DROP FUNCTION IF EXISTS
    "${schemaName}".get_organization_stores(varchar);

DROP FUNCTION IF EXISTS
    "${schemaName}".upsert_store(varchar, jsonb, varchar);

DROP FUNCTION IF EXISTS
    "${schemaName}".get_organization_store(varchar, varchar);

DROP FUNCTION IF EXISTS
    "${schemaName}".create_store(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        date,
        date,
        varchar
    );

DROP FUNCTION IF EXISTS
    "${schemaName}".update_store(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        date,
        date,
        varchar
    );

DROP FUNCTION IF EXISTS
    "${schemaName}".delete_store(varchar, varchar, varchar);


-- ============================================================================
-- GET ALL STORES FOR ORGANIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    "${schemaName}".get_organization_stores(
        p_organization_id varchar(64)
    )
RETURNS TABLE (
    "id" varchar,
    "organizationId" varchar,
    "storeCode" varchar,
    "name" varchar,
    "storeTypeId" varchar,
    "phoneNumber" varchar,
    "emailAddress" varchar,
    "addressLine1" varchar,
    "addressLine2" varchar,
    "city" varchar,
    "state" varchar,
    "postalCode" varchar,
    "country" varchar,
    "timezone" varchar,
    "storeStatusId" varchar,
    "openingDate" varchar,
    "closingDate" varchar,
    "createdAt" varchar,
    "createdBy" varchar,
    "updatedAt" varchar,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql
STABLE
AS $function$

    SELECT
        s."store_id"::varchar                AS "id",
        s."organization_id"::varchar         AS "organizationId",
        s."store_code"::varchar              AS "storeCode",
        s."store_name"::varchar              AS "name",
        s."store_type_id"::varchar           AS "storeTypeId",
        s."phone_number"::varchar             AS "phoneNumber",
        s."email_address"::varchar            AS "emailAddress",
        s."address_line1"::varchar            AS "addressLine1",
        s."address_line2"::varchar            AS "addressLine2",
        s."city"::varchar                     AS "city",
        s."state"::varchar                    AS "state",
        s."postal_code"::varchar              AS "postalCode",
        s."country"::varchar                  AS "country",
        s."timezone"::varchar                 AS "timezone",
        s."store_status_id"::varchar          AS "storeStatusId",
        s."opening_date"::varchar             AS "openingDate",
        s."closing_date"::varchar             AS "closingDate",
        s."created_at"::varchar               AS "createdAt",
        s."created_by"::varchar               AS "createdBy",
        s."updated_at"::varchar               AS "updatedAt",
        s."updated_by"::varchar               AS "updatedBy",
        s."is_deleted"                        AS "isDeleted",
        s."version_no"                        AS "versionNo"

    FROM "${schemaName}"."stores" s

    WHERE s."organization_id" = p_organization_id
      AND s."is_deleted" = FALSE

    ORDER BY
        s."store_name",
        s."store_code";

$function$;


-- ============================================================================
-- GET SINGLE STORE
-- ============================================================================

CREATE OR REPLACE FUNCTION
    "${schemaName}".get_organization_store(
        p_organization_id varchar(64),
        p_store_id varchar(64)
    )
RETURNS TABLE (
    "id" varchar,
    "organizationId" varchar,
    "storeCode" varchar,
    "name" varchar,
    "storeTypeId" varchar,
    "phoneNumber" varchar,
    "emailAddress" varchar,
    "addressLine1" varchar,
    "addressLine2" varchar,
    "city" varchar,
    "state" varchar,
    "postalCode" varchar,
    "country" varchar,
    "timezone" varchar,
    "storeStatusId" varchar,
    "openingDate" varchar,
    "closingDate" varchar,
    "createdAt" varchar,
    "createdBy" varchar,
    "updatedAt" varchar,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql
STABLE
AS $function$

    SELECT
        s."store_id"::varchar                AS "id",
        s."organization_id"::varchar         AS "organizationId",
        s."store_code"::varchar              AS "storeCode",
        s."store_name"::varchar              AS "name",
        s."store_type_id"::varchar           AS "storeTypeId",
        s."phone_number"::varchar             AS "phoneNumber",
        s."email_address"::varchar            AS "emailAddress",
        s."address_line1"::varchar            AS "addressLine1",
        s."address_line2"::varchar            AS "addressLine2",
        s."city"::varchar                     AS "city",
        s."state"::varchar                    AS "state",
        s."postal_code"::varchar              AS "postalCode",
        s."country"::varchar                  AS "country",
        s."timezone"::varchar                 AS "timezone",
        s."store_status_id"::varchar          AS "storeStatusId",
        s."opening_date"::varchar             AS "openingDate",
        s."closing_date"::varchar             AS "closingDate",
        s."created_at"::varchar               AS "createdAt",
        s."created_by"::varchar               AS "createdBy",
        s."updated_at"::varchar               AS "updatedAt",
        s."updated_by"::varchar               AS "updatedBy",
        s."is_deleted"                        AS "isDeleted",
        s."version_no"                        AS "versionNo"

    FROM "${schemaName}"."stores" s

    WHERE s."organization_id" = p_organization_id
      AND s."store_id" = p_store_id
      AND s."is_deleted" = FALSE;

$function$;


-- ============================================================================
-- CREATE STORE
-- ============================================================================

CREATE OR REPLACE FUNCTION
    "${schemaName}".create_store(
        p_organization_id varchar(64),
        p_store_id varchar(64),
        p_store_code varchar,
        p_store_name varchar,
        p_store_type_id varchar(64),
        p_phone_number varchar,
        p_email_address varchar,
        p_address_line1 varchar,
        p_address_line2 varchar,
        p_city varchar,
        p_state varchar,
        p_postal_code varchar,
        p_country varchar,
        p_timezone varchar,
        p_store_status_id varchar(64),
        p_opening_date date,
        p_closing_date date,
        p_actor_user_id varchar(64)
    )
RETURNS TABLE (
    "id" varchar,
    "organizationId" varchar,
    "storeCode" varchar,
    "name" varchar,
    "storeTypeId" varchar,
    "phoneNumber" varchar,
    "emailAddress" varchar,
    "addressLine1" varchar,
    "addressLine2" varchar,
    "city" varchar,
    "state" varchar,
    "postalCode" varchar,
    "country" varchar,
    "timezone" varchar,
    "storeStatusId" varchar,
    "openingDate" varchar,
    "closingDate" varchar,
    "createdAt" varchar,
    "createdBy" varchar,
    "updatedAt" varchar,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE plpgsql
AS $function$

BEGIN

    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'User % cannot administer organization %',
            p_actor_user_id,
            p_organization_id
            USING ERRCODE = '42501';
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."organization" o
        WHERE o."organization_id" = p_organization_id
          AND o."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION
            'Organization not found: %',
            p_organization_id
            USING ERRCODE = '23503';
    END IF;


    IF EXISTS (
        SELECT 1
        FROM "${schemaName}"."stores" s
        WHERE s."store_id" = p_store_id
    ) THEN
        RAISE EXCEPTION
            'Store already exists: %',
            p_store_id
            USING ERRCODE = '23505';
    END IF;


    IF EXISTS (
        SELECT 1
        FROM "${schemaName}"."stores" s
        WHERE s."organization_id" = p_organization_id
          AND s."store_code" = p_store_code
          AND s."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION
            'Store code already exists for organization: %',
            p_store_code
            USING ERRCODE = '23505';
    END IF;


    IF p_closing_date IS NOT NULL
       AND p_opening_date IS NOT NULL
       AND p_closing_date < p_opening_date THEN
        RAISE EXCEPTION
            'Closing date cannot be before opening date'
            USING ERRCODE = '22023';
    END IF;


    INSERT INTO "${schemaName}"."stores" (
        "store_id",
        "organization_id",
        "store_code",
        "store_name",
        "store_type_id",
        "phone_number",
        "email_address",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postal_code",
        "country",
        "timezone",
        "store_status_id",
        "opening_date",
        "closing_date",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        p_store_id,
        p_organization_id,
        p_store_code,
        p_store_name,
        p_store_type_id,
        NULLIF(trim(p_phone_number), ''),
        NULLIF(trim(p_email_address), ''),
        p_address_line1,
        NULLIF(trim(p_address_line2), ''),
        p_city,
        p_state,
        p_postal_code,
        p_country,
        p_timezone,
        p_store_status_id,
        p_opening_date,
        p_closing_date,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );


    RETURN QUERY
    SELECT *
    FROM "${schemaName}".get_organization_store(
        p_organization_id,
        p_store_id
    );

END;

$function$;


-- ============================================================================
-- UPDATE STORE
-- ============================================================================

CREATE OR REPLACE FUNCTION
    "${schemaName}".update_store(
        p_organization_id varchar(64),
        p_store_id varchar(64),
        p_store_code varchar,
        p_store_name varchar,
        p_store_type_id varchar(64),
        p_phone_number varchar,
        p_email_address varchar,
        p_address_line1 varchar,
        p_address_line2 varchar,
        p_city varchar,
        p_state varchar,
        p_postal_code varchar,
        p_country varchar,
        p_timezone varchar,
        p_store_status_id varchar(64),
        p_opening_date date,
        p_closing_date date,
        p_actor_user_id varchar(64)
    )
RETURNS TABLE (
    "id" varchar,
    "organizationId" varchar,
    "storeCode" varchar,
    "name" varchar,
    "storeTypeId" varchar,
    "phoneNumber" varchar,
    "emailAddress" varchar,
    "addressLine1" varchar,
    "addressLine2" varchar,
    "city" varchar,
    "state" varchar,
    "postalCode" varchar,
    "country" varchar,
    "timezone" varchar,
    "storeStatusId" varchar,
    "openingDate" varchar,
    "closingDate" varchar,
    "createdAt" varchar,
    "createdBy" varchar,
    "updatedAt" varchar,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE plpgsql
AS $function$

BEGIN

    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'User % cannot administer organization %',
            p_actor_user_id,
            p_organization_id
            USING ERRCODE = '42501';
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."stores" s
        WHERE s."store_id" = p_store_id
          AND s."organization_id" = p_organization_id
          AND s."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION
            'Store not found: %',
            p_store_id
            USING ERRCODE = 'P0002';
    END IF;


    IF EXISTS (
        SELECT 1
        FROM "${schemaName}"."stores" s
        WHERE s."organization_id" = p_organization_id
          AND s."store_code" = p_store_code
          AND s."store_id" <> p_store_id
          AND s."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION
            'Store code already exists for organization: %',
            p_store_code
            USING ERRCODE = '23505';
    END IF;


    IF p_closing_date IS NOT NULL
       AND p_opening_date IS NOT NULL
       AND p_closing_date < p_opening_date THEN
        RAISE EXCEPTION
            'Closing date cannot be before opening date'
            USING ERRCODE = '22023';
    END IF;


    UPDATE "${schemaName}"."stores"
    SET
        "store_code" = p_store_code,
        "store_name" = p_store_name,
        "store_type_id" = p_store_type_id,
        "phone_number" = NULLIF(trim(p_phone_number), ''),
        "email_address" = NULLIF(trim(p_email_address), ''),
        "address_line1" = p_address_line1,
        "address_line2" = NULLIF(trim(p_address_line2), ''),
        "city" = p_city,
        "state" = p_state,
        "postal_code" = p_postal_code,
        "country" = p_country,
        "timezone" = p_timezone,
        "store_status_id" = p_store_status_id,
        "opening_date" = p_opening_date,
        "closing_date" = p_closing_date,
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "version_no" = "version_no" + 1

    WHERE "store_id" = p_store_id
      AND "organization_id" = p_organization_id
      AND "is_deleted" = FALSE;


    RETURN QUERY
    SELECT *
    FROM "${schemaName}".get_organization_store(
        p_organization_id,
        p_store_id
    );

END;

$function$;


-- ============================================================================
-- DELETE STORE
--
-- Soft delete only.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    "${schemaName}".delete_store(
        p_organization_id varchar(64),
        p_store_id varchar(64),
        p_actor_user_id varchar(64)
    )
RETURNS boolean
LANGUAGE plpgsql
AS $function$

DECLARE
    v_deleted boolean;

BEGIN

    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'User % cannot administer organization %',
            p_actor_user_id,
            p_organization_id
            USING ERRCODE = '42501';
    END IF;


    UPDATE "${schemaName}"."stores"
    SET
        "is_deleted" = TRUE,
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "version_no" = "version_no" + 1

    WHERE "store_id" = p_store_id
      AND "organization_id" = p_organization_id
      AND "is_deleted" = FALSE;


    v_deleted := FOUND;

    RETURN v_deleted;

END;

$function$;