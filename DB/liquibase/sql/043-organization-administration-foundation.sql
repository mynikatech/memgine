-- Memgine organization administration foundation
-- Domain/entity oriented. Rerunnable / idempotent DDL: YES

CREATE UNIQUE INDEX IF NOT EXISTS "ux_organization_user_roles_user_role"
    ON "${schemaName}"."organization_user_roles" ("organization_user_id", "role_id");


CREATE OR REPLACE FUNCTION "${schemaName}".can_administer_organization(
    p_organization_id varchar,
    p_user_id varchar
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM "${schemaName}"."platform_user_role" pur
        JOIN "${schemaName}"."role" r
            ON r."role_id" = pur."role_id"
        WHERE pur."user_id" = p_user_id
          AND pur."is_deleted" = FALSE
          AND pur."status_id" = 'entity-status-platfrm-user-role-active'
          AND r."role_code" = 'PLATFORM_ADMIN'
    ) OR EXISTS (
        SELECT 1
        FROM "${schemaName}"."organization_user" ou
        JOIN "${schemaName}"."organization_user_roles" our
            ON our."organization_user_id" = ou."organization_user_id"
        JOIN "${schemaName}"."role" r
            ON r."role_id" = our."role_id"
        WHERE ou."organization_id" = p_organization_id
          AND ou."user_id" = p_user_id
          AND ou."is_deleted" = FALSE
          AND ou."organization_user_status_id" = 'entity-status-org-user-active'
          AND our."is_deleted" = FALSE
          AND our."assignment_status_id" = 'entity-status-org-user-role-active'
          AND r."role_code" IN ('ADMIN', 'OWNER')
    );
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_users(
    p_organization_id varchar
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
SELECT COALESCE(
    jsonb_agg(
        jsonb_build_object(
            'organizationUserId', ou."organization_user_id",
            'organizationId', ou."organization_id",
            'userId', u."user_id",
            'userCode', u."user_code",
            'firstName', u."first_name",
            'middleName', u."middle_name",
            'lastName', u."last_name",
            'displayName', u."display_name",
            'primaryEmail', u."primary_email",
            'primaryPhone', u."primary_phone",
            'preferredLanguageId', u."preferred_language_id",
            'userStatusId', u."user_status_id",
            'organizationUserTypeId', ou."organization_user_type_id",
            'organizationUserStatusId', ou."organization_user_status_id",
            'joiningDate', ou."joining_date",
            'roles', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'organizationUserRoleId', our."organization_user_role_id",
                            'roleId', r."role_id",
                            'roleCode', r."role_code",
                            'roleName', r."role_name",
                            'assignmentStatusId', our."assignment_status_id"
                        )
                        ORDER BY r."role_name"
                    )
                    FROM "${schemaName}"."organization_user_roles" our
                    JOIN "${schemaName}"."role" r
                        ON r."role_id" = our."role_id"
                    WHERE our."organization_user_id" = ou."organization_user_id"
                      AND our."is_deleted" = FALSE
                ),
                '[]'::jsonb
            )
        )
        ORDER BY COALESCE(u."display_name", u."first_name"), u."user_code"
    ),
    '[]'::jsonb
)
FROM "${schemaName}"."organization_user" ou
JOIN "${schemaName}"."user" u
    ON u."user_id" = ou."user_id"
WHERE ou."organization_id" = p_organization_id
  AND ou."is_deleted" = FALSE
  AND u."is_deleted" = FALSE;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".upsert_organization_user(
    p_organization_id varchar,
    p_payload jsonb,
    p_actor_user_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id varchar(64) := p_payload->>'userId';
    v_ou_id varchar(64) := p_payload->>'organizationUserId';
    v_role_id varchar(64) := NULLIF(p_payload->>'roleId', '');
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

    IF NULLIF(trim(v_user_id), '') IS NULL
       OR NULLIF(trim(v_ou_id), '') IS NULL THEN
        RAISE EXCEPTION
            'userId and organizationUserId are required'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}"."user" (
        "user_id",
        "user_code",
        "first_name",
        "middle_name",
        "last_name",
        "display_name",
        "primary_email",
        "primary_phone",
        "preferred_language_id",
        "user_status_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_user_id,
        p_payload->>'userCode',
        p_payload->>'firstName',
        NULLIF(p_payload->>'middleName', ''),
        NULLIF(p_payload->>'lastName', ''),
        NULLIF(p_payload->>'displayName', ''),
        NULLIF(p_payload->>'primaryEmail', ''),
        p_payload->>'primaryPhone',
        NULLIF(p_payload->>'preferredLanguageId', ''),
        COALESCE(
            NULLIF(p_payload->>'userStatusId', ''),
            'entity-status-user-active'
        ),
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    )
    ON CONFLICT ("user_id")
    DO UPDATE SET
        "user_code" = EXCLUDED."user_code",
        "first_name" = EXCLUDED."first_name",
        "middle_name" = EXCLUDED."middle_name",
        "last_name" = EXCLUDED."last_name",
        "display_name" = EXCLUDED."display_name",
        "primary_email" = EXCLUDED."primary_email",
        "primary_phone" = EXCLUDED."primary_phone",
        "preferred_language_id" = EXCLUDED."preferred_language_id",
        "user_status_id" = EXCLUDED."user_status_id",
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "is_deleted" = FALSE,
        "version_no" = "${schemaName}"."user"."version_no" + 1;

    INSERT INTO "${schemaName}"."organization_user" (
        "organization_user_id",
        "organization_id",
        "user_id",
        "organization_user_type_id",
        "organization_user_status_id",
        "joining_date",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_ou_id,
        p_organization_id,
        v_user_id,
        p_payload->>'organizationUserTypeId',
        COALESCE(
            NULLIF(p_payload->>'organizationUserStatusId', ''),
            'entity-status-org-user-active'
        ),
        COALESCE(
            NULLIF(p_payload->>'joiningDate', '')::date,
            CURRENT_DATE
        ),
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    )
    ON CONFLICT (
        "organization_id",
        "user_id",
        "organization_user_type_id"
    )
    DO UPDATE SET
        "organization_user_status_id" =
            EXCLUDED."organization_user_status_id",
        "joining_date" = EXCLUDED."joining_date",
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "is_deleted" = FALSE,
        "version_no" =
            "${schemaName}"."organization_user"."version_no" + 1
    RETURNING "organization_user_id" INTO v_ou_id;

    IF v_role_id IS NOT NULL THEN
        INSERT INTO "${schemaName}"."organization_user_roles" (
            "organization_user_role_id",
            "organization_user_id",
            "role_id",
            "assignment_status_id",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
            "is_deleted",
            "version_no"
        )
        VALUES (
            COALESCE(
                NULLIF(p_payload->>'organizationUserRoleId', ''),
                v_ou_id || '-' || v_role_id
            ),
            v_ou_id,
            v_role_id,
            'entity-status-org-user-role-active',
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            FALSE,
            1
        )
        ON CONFLICT ("organization_user_id", "role_id")
        DO UPDATE SET
            "assignment_status_id" =
                'entity-status-org-user-role-active',
            "updated_at" = CURRENT_TIMESTAMP,
            "updated_by" = p_actor_user_id,
            "is_deleted" = FALSE,
            "version_no" =
                "${schemaName}"."organization_user_roles"."version_no" + 1;
    END IF;

    RETURN (
        SELECT elem
        FROM jsonb_array_elements(
            "${schemaName}".get_organization_users(p_organization_id)
        ) elem
        WHERE elem->>'organizationUserId' = v_ou_id
        LIMIT 1
    );
END;
$function$;


-- IMPORTANT:
-- Preserve the existing RETURNS TABLE contract used by the Store backend.

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_stores(
    p_organization_id varchar
)
RETURNS TABLE(
    id varchar,
    "organizationId" varchar,
    "storeCode" varchar,
    name varchar,
    "storeTypeId" varchar,
    "phoneNumber" varchar,
    "emailAddress" varchar,
    "addressLine1" varchar,
    "addressLine2" varchar,
    city varchar,
    state varchar,
    "postalCode" varchar,
    country varchar,
    timezone varchar,
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
        s."phone_number"::varchar            AS "phoneNumber",
        s."email_address"::varchar            AS "emailAddress",
        s."address_line1"::varchar            AS "addressLine1",
        s."address_line2"::varchar            AS "addressLine2",
        s."city"::varchar                    AS "city",
        s."state"::varchar                   AS "state",
        s."postal_code"::varchar             AS "postalCode",
        s."country"::varchar                 AS "country",
        s."timezone"::varchar                AS "timezone",
        s."store_status_id"::varchar         AS "storeStatusId",
        s."opening_date"::varchar            AS "openingDate",
        s."closing_date"::varchar            AS "closingDate",
        s."created_at"::varchar              AS "createdAt",
        s."created_by"::varchar              AS "createdBy",
        s."updated_at"::varchar              AS "updatedAt",
        s."updated_by"::varchar              AS "updatedBy",
        s."is_deleted"                       AS "isDeleted",
        s."version_no"                       AS "versionNo"
    FROM "${schemaName}"."stores" s
    WHERE s."organization_id" = p_organization_id
      AND s."is_deleted" = FALSE
    ORDER BY
        s."store_name",
        s."store_code";
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".upsert_store(
    p_organization_id varchar,
    p_store jsonb,
    p_actor_user_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id varchar(64) := p_store->>'id';
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
        v_id,
        p_organization_id,
        p_store->>'code',
        p_store->>'name',
        p_store->>'storeTypeId',
        NULLIF(p_store->>'phoneNumber', ''),
        NULLIF(p_store->>'emailAddress', ''),
        p_store->>'addressLine1',
        NULLIF(p_store->>'addressLine2', ''),
        p_store->>'city',
        p_store->>'state',
        p_store->>'postalCode',
        p_store->>'country',
        p_store->>'timezone',
        COALESCE(
            NULLIF(p_store->>'storeStatusId', ''),
            'entity-status-store-active'
        ),
        NULLIF(p_store->>'openingDate', '')::date,
        NULLIF(p_store->>'closingDate', '')::date,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    )
    ON CONFLICT ("store_id")
    DO UPDATE SET
        "store_code" = EXCLUDED."store_code",
        "store_name" = EXCLUDED."store_name",
        "store_type_id" = EXCLUDED."store_type_id",
        "phone_number" = EXCLUDED."phone_number",
        "email_address" = EXCLUDED."email_address",
        "address_line1" = EXCLUDED."address_line1",
        "address_line2" = EXCLUDED."address_line2",
        "city" = EXCLUDED."city",
        "state" = EXCLUDED."state",
        "postal_code" = EXCLUDED."postal_code",
        "country" = EXCLUDED."country",
        "timezone" = EXCLUDED."timezone",
        "store_status_id" = EXCLUDED."store_status_id",
        "opening_date" = EXCLUDED."opening_date",
        "closing_date" = EXCLUDED."closing_date",
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "is_deleted" = FALSE,
        "version_no" = "${schemaName}"."stores"."version_no" + 1
    WHERE "${schemaName}"."stores"."organization_id" = p_organization_id;

    RETURN (
        SELECT to_jsonb(s)
        FROM "${schemaName}"."stores" s
        WHERE s."store_id" = v_id
          AND s."organization_id" = p_organization_id
    );
END;
$function$;


-- IMPORTANT:
-- Preserve the existing RETURNS TABLE contract used by the Staff backend.

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_staff(
    p_organization_id varchar
)
RETURNS TABLE(
    id varchar,
    organization_id varchar,
    organization_user_id varchar,
    staff_code varchar,
    designation varchar,
    store_id varchar,
    joining_date text,
    relieving_date text,
    staff_status_id varchar,
    role_code varchar,
    created_at text,
    created_by varchar,
    updated_at text,
    updated_by varchar,
    is_deleted boolean,
    version_no integer
)
LANGUAGE sql
STABLE
AS $function$
    SELECT
        s."staff_id"::varchar,
        s."organization_id"::varchar,
        s."organization_user_id"::varchar,
        s."staff_code"::varchar,
        s."designation"::varchar,
        s."store_id"::varchar,
        s."joining_date"::text,
        s."relieving_date"::text,
        s."staff_status_id"::varchar,
        r."role_code"::varchar,
        s."created_at"::text,
        s."created_by"::varchar,
        s."updated_at"::text,
        s."updated_by"::varchar,
        s."is_deleted",
        s."version_no"
    FROM "${schemaName}"."staff" s
    JOIN "${schemaName}"."role" r
      ON r."role_id" = s."role_id"
    WHERE s."organization_id" = p_organization_id
      AND s."is_deleted" = FALSE
    ORDER BY s."staff_code";
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".upsert_staff(
    p_organization_id varchar,
    p_staff jsonb,
    p_actor_user_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id varchar(64) := p_staff->>'staffId';
    v_ou varchar(64) := p_staff->>'organizationUserId';
    v_store varchar(64) := NULLIF(p_staff->>'storeId', '');
    v_asg varchar(64) := NULLIF(p_staff->>'staffStoreAssignmentId', '');
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
        FROM "${schemaName}"."organization_user"
        WHERE "organization_user_id" = v_ou
          AND "organization_id" = p_organization_id
          AND "is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION
            'Organization user % does not belong to organization %',
            v_ou,
            p_organization_id
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO "${schemaName}"."staff" (
        "staff_id",
        "organization_user_id",
        "staff_code",
        "organization_id",
        "role_id",
        "designation",
        "store_id",
        "joining_date",
        "relieving_date",
        "staff_status_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_id,
        v_ou,
        p_staff->>'staffCode',
        p_organization_id,
        p_staff->>'roleId',
        NULLIF(p_staff->>'designation', ''),
        v_store,
        COALESCE(
            NULLIF(p_staff->>'joiningDate', '')::date,
            CURRENT_DATE
        ),
        NULLIF(p_staff->>'relievingDate', '')::date,
        COALESCE(
            NULLIF(p_staff->>'staffStatusId', ''),
            'entity-status-staff-active'
        ),
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    )
    ON CONFLICT ("staff_id")
    DO UPDATE SET
        "staff_code" = EXCLUDED."staff_code",
        "role_id" = EXCLUDED."role_id",
        "designation" = EXCLUDED."designation",
        "store_id" = EXCLUDED."store_id",
        "joining_date" = EXCLUDED."joining_date",
        "relieving_date" = EXCLUDED."relieving_date",
        "staff_status_id" = EXCLUDED."staff_status_id",
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = p_actor_user_id,
        "is_deleted" = FALSE,
        "version_no" = "${schemaName}"."staff"."version_no" + 1
    WHERE "${schemaName}"."staff"."organization_id" = p_organization_id
      AND "${schemaName}"."staff"."organization_user_id" = v_ou;

    IF v_store IS NOT NULL AND v_asg IS NOT NULL THEN
        INSERT INTO "${schemaName}"."staff_store_assignment" (
            "staff_store_assignment_id",
            "staff_id",
            "store_id",
            "status_id",
            "effective_date",
            "end_date",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
            "is_deleted",
            "version_no"
        )
        VALUES (
            v_asg,
            v_id,
            v_store,
            COALESCE(
                NULLIF(p_staff->>'assignmentStatusId', ''),
                'entity-status-staff-assignment-active'
            ),
            COALESCE(
                NULLIF(p_staff->>'joiningDate', '')::date,
                CURRENT_DATE
            ),
            NULLIF(p_staff->>'assignmentEndDate', '')::date,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            FALSE,
            1
        )
        ON CONFLICT ("staff_store_assignment_id")
        DO UPDATE SET
            "store_id" = EXCLUDED."store_id",
            "status_id" = EXCLUDED."status_id",
            "effective_date" = EXCLUDED."effective_date",
            "end_date" = EXCLUDED."end_date",
            "updated_at" = CURRENT_TIMESTAMP,
            "updated_by" = p_actor_user_id,
            "is_deleted" = FALSE,
            "version_no" =
                "${schemaName}"."staff_store_assignment"."version_no" + 1;
    END IF;

    RETURN (
        SELECT to_jsonb(x)
        FROM "${schemaName}".get_organization_staff(p_organization_id) x
        WHERE x.id = v_id
        LIMIT 1
    );
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".ensure_default_organization_admin(
    p_organization_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_actor varchar(64) := 'user-platform-admin';
    v_ou varchar(64) :=
        'org-user-default-admin-' || left(md5(p_organization_id), 12);
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."organization"
        WHERE "organization_id" = p_organization_id
          AND "is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION
            'Organization not found: %',
            p_organization_id
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO "${schemaName}"."role" (
        "role_id",
        "role_code",
        "role_name",
        "description",
        "role_status_id"
    )
    VALUES (
        'role-admin',
        'ADMIN',
        'Administrator',
        'Organization administrator',
        'entity-status-role-active'
    )
    ON CONFLICT ("role_code")
    DO UPDATE SET
        "role_name" = EXCLUDED."role_name",
        "description" = EXCLUDED."description",
        "role_status_id" = EXCLUDED."role_status_id";

    INSERT INTO "${schemaName}"."user" (
        "user_id",
        "user_code",
        "first_name",
        "middle_name",
        "last_name",
        "display_name",
        "primary_email",
        "primary_phone",
        "preferred_language_id",
        "user_status_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        'user-org-admin',
        'ORG-ADMIN-DEV',
        'Organization',
        NULL,
        'Admin',
        'Organization Admin',
        NULL,
        '+14165550199',
        'language-en',
        'entity-status-user-active',
        CURRENT_TIMESTAMP,
        v_actor,
        CURRENT_TIMESTAMP,
        v_actor,
        FALSE,
        1
    )
    ON CONFLICT ("user_code")
    DO UPDATE SET
        "user_status_id" = 'entity-status-user-active',
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = v_actor,
        "is_deleted" = FALSE;

    INSERT INTO "${schemaName}"."organization_user" (
        "organization_user_id",
        "organization_id",
        "user_id",
        "organization_user_type_id",
        "organization_user_status_id",
        "joining_date",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_ou,
        p_organization_id,
        'user-org-admin',
        'organization-user-type-admin',
        'entity-status-org-user-active',
        CURRENT_DATE,
        CURRENT_TIMESTAMP,
        v_actor,
        CURRENT_TIMESTAMP,
        v_actor,
        FALSE,
        1
    )
    ON CONFLICT (
        "organization_id",
        "user_id",
        "organization_user_type_id"
    )
    DO UPDATE SET
        "organization_user_status_id" = 'entity-status-org-user-active',
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = v_actor,
        "is_deleted" = FALSE
    RETURNING "organization_user_id" INTO v_ou;

    INSERT INTO "${schemaName}"."organization_user_roles" (
        "organization_user_role_id",
        "organization_user_id",
        "role_id",
        "assignment_status_id",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        'org-user-role-admin-' || left(md5(p_organization_id), 12),
        v_ou,
        'role-admin',
        'entity-status-org-user-role-active',
        CURRENT_TIMESTAMP,
        v_actor,
        CURRENT_TIMESTAMP,
        v_actor,
        FALSE,
        1
    )
    ON CONFLICT ("organization_user_id", "role_id")
    DO UPDATE SET
        "assignment_status_id" = 'entity-status-org-user-role-active',
        "updated_at" = CURRENT_TIMESTAMP,
        "updated_by" = v_actor,
        "is_deleted" = FALSE;

    RETURN (
        SELECT elem
        FROM jsonb_array_elements(
            "${schemaName}".get_organization_users(p_organization_id)
        ) elem
        WHERE elem->>'organizationUserId' = v_ou
        LIMIT 1
    );
END;
$function$;


REVOKE ALL ON FUNCTION "${schemaName}".can_administer_organization(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_organization_users(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".upsert_organization_user(varchar,jsonb,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_organization_stores(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".upsert_store(varchar,jsonb,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_organization_staff(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".upsert_staff(varchar,jsonb,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".ensure_default_organization_admin(varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".can_administer_organization(varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_users(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".upsert_organization_user(varchar,jsonb,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_stores(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".upsert_store(varchar,jsonb,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_staff(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".upsert_staff(varchar,jsonb,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".ensure_default_organization_admin(varchar) TO "${appRole}";