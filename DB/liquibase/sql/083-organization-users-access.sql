-- Organization Users & Access. Existing identity, RBAC, staff, store-assignment
-- and PIN tables remain authoritative; this migration adds guarded use cases only.

CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_list(
    p_organization_id varchar,
    p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_result jsonb;
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'displayName', item->>'organizationUserId'), '[]'::jsonb)
      INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'organizationUserId', ou.organization_user_id,
            'userId', u.user_id,
            'displayName', COALESCE(NULLIF(u.display_name, ''), concat_ws(' ', u.first_name, u.last_name)),
            'email', u.primary_email,
            'phone', u.primary_phone,
            'membershipStatusId', ou.organization_user_status_id,
            'membershipStatus', ms.status_code,
            'roles', COALESCE((
                SELECT jsonb_agg(r.role_code ORDER BY r.role_code)
                FROM "${schemaName}".organization_user_roles our
                JOIN "${schemaName}".role r ON r.role_id = our.role_id
                WHERE our.organization_user_id = ou.organization_user_id
                  AND NOT our.is_deleted
                  AND our.assignment_status_id = 'entity-status-org-user-role-active'
                  AND our.effective_from <= CURRENT_TIMESTAMP
                  AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
            ), '[]'::jsonb),
            'capabilities', COALESCE((
                SELECT jsonb_agg(capability_code ORDER BY capability_code)
                FROM (
                    SELECT DISTINCT p.privilege_code AS capability_code
                    FROM "${schemaName}".organization_user_roles our
                    JOIN "${schemaName}".role_privileges rp ON rp.role_id = our.role_id
                    JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
                    WHERE our.organization_user_id = ou.organization_user_id
                      AND ou.organization_user_status_id = 'entity-status-org-user-active'
                      AND u.user_status_id = 'entity-status-user-active'
                      AND NOT our.is_deleted
                      AND our.assignment_status_id = 'entity-status-org-user-role-active'
                      AND our.effective_from <= CURRENT_TIMESTAMP
                      AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
                      AND p.privilege_status_id = 'entity-status-privilege-active'
                ) c
            ), '[]'::jsonb),
            'staffId', st.staff_id,
            'staffCode', st.staff_code,
            'designation', st.designation,
            'counterOperatorEnabled', COALESCE(st.staff_status_id = 'entity-status-staff-active' AND NOT st.is_deleted, FALSE),
            'primaryStore', CASE WHEN ps.store_id IS NULL THEN NULL ELSE jsonb_build_object('storeId', ps.store_id, 'storeName', ps.store_name) END,
            'additionalStoreAssignments', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('assignmentId', a.staff_store_assignment_id, 'storeId', s.store_id, 'storeName', s.store_name) ORDER BY s.store_name)
                FROM "${schemaName}".staff_store_assignment a
                JOIN "${schemaName}".stores s ON s.store_id = a.store_id
                WHERE a.staff_id = st.staff_id AND NOT a.is_deleted
                  AND a.status_id = 'entity-status-staff-assignment-active'
                  AND a.effective_date <= CURRENT_DATE
                  AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
                  AND a.store_id IS DISTINCT FROM st.store_id
            ), '[]'::jsonb),
            'posPinConfigured', (pc.staff_id IS NOT NULL)
        ) AS item
        FROM "${schemaName}".organization_user ou
        JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
        JOIN "${schemaName}".entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
        JOIN "${schemaName}".statuses ms ON ms.status_id = oes.status_id
        LEFT JOIN "${schemaName}".staff st ON st.organization_user_id = ou.organization_user_id
        LEFT JOIN "${schemaName}".stores ps ON ps.store_id = st.store_id
        LEFT JOIN "${schemaName}".staff_pin_credentials pc ON pc.staff_id = st.staff_id
        WHERE ou.organization_id = p_organization_id AND NOT ou.is_deleted AND NOT u.is_deleted
    ) rows;
    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_set_org_admin(
    p_organization_id varchar, p_organization_user_id varchar,
    p_enabled boolean, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id varchar(64);
    v_assignment_id varchar(64);
    v_remaining_admins integer;
    v_retains_admin_access boolean;
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('organization-admin:' || p_organization_id, 0));
    SELECT user_id INTO v_user_id FROM "${schemaName}".organization_user
     WHERE organization_user_id = p_organization_user_id AND organization_id = p_organization_id AND NOT is_deleted FOR UPDATE;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Organization user not found' USING ERRCODE = 'P0002'; END IF;

    IF p_enabled THEN
        PERFORM "${schemaName}".rbac_assign_organization_role(
            p_organization_id, v_user_id, 'ORG_ADMIN', CURRENT_TIMESTAMP, NULL,
            'Granted through Organization Users & Access', p_actor_user_id
        );
    ELSE
        SELECT organization_user_role_id INTO v_assignment_id
          FROM "${schemaName}".organization_user_roles
         WHERE organization_user_id = p_organization_user_id AND role_id = 'role-admin'
           AND NOT is_deleted AND assignment_status_id = 'entity-status-org-user-role-active'
           AND effective_from <= CURRENT_TIMESTAMP AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
         FOR UPDATE;
        IF v_assignment_id IS NULL THEN RETURN TRUE; END IF;
        SELECT EXISTS (
            SELECT 1
            FROM "${schemaName}".organization_user_roles our
            JOIN "${schemaName}".role r ON r.role_id = our.role_id
            JOIN "${schemaName}".role_privileges rp ON rp.role_id = r.role_id
            JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
            WHERE our.organization_user_id = p_organization_user_id
              AND our.organization_user_role_id <> v_assignment_id
              AND NOT our.is_deleted
              AND our.assignment_status_id = 'entity-status-org-user-role-active'
              AND our.effective_from <= CURRENT_TIMESTAMP
              AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
              AND r.role_status_id = 'entity-status-role-active'
              AND p.privilege_status_id = 'entity-status-privilege-active'
              AND p.privilege_code = 'ORG_ADMIN_ACCESS'
        ) INTO v_retains_admin_access;

        SELECT count(DISTINCT ou.user_id) INTO v_remaining_admins
          FROM "${schemaName}".organization_user ou
         WHERE ou.organization_id = p_organization_id
           AND ou.organization_user_id <> p_organization_user_id
           AND "${schemaName}".rbac_has_capability(
               ou.user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
           );
        IF NOT v_retains_admin_access AND v_remaining_admins = 0 THEN
            RAISE EXCEPTION 'The last active organization administrator cannot be removed' USING ERRCODE = 'P0001';
        END IF;
        PERFORM "${schemaName}".rbac_revoke_organization_role(p_organization_id, v_assignment_id, p_actor_user_id);
    END IF;
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_set_membership_active(
    p_organization_id varchar, p_organization_user_id varchar,
    p_active boolean, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id varchar(64);
    v_is_admin boolean;
    v_other_admins integer;
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('organization-admin:' || p_organization_id, 0));
    SELECT user_id INTO v_user_id
      FROM "${schemaName}".organization_user
     WHERE organization_user_id = p_organization_user_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization user not found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT p_active THEN
        SELECT "${schemaName}".rbac_has_capability(
            v_user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
        ) INTO v_is_admin;
        IF v_is_admin THEN
            SELECT count(DISTINCT ou.user_id) INTO v_other_admins
              FROM "${schemaName}".organization_user ou
             WHERE ou.organization_id = p_organization_id AND ou.organization_user_id <> p_organization_user_id
               AND "${schemaName}".rbac_has_capability(
                   ou.user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
               );
            IF v_other_admins = 0 THEN
                RAISE EXCEPTION 'The last active organization administrator cannot be inactivated' USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;
    UPDATE "${schemaName}".organization_user
       SET organization_user_status_id = CASE WHEN p_active THEN 'entity-status-org-user-active' ELSE 'entity-status-org-user-inactive' END,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE organization_user_id = p_organization_user_id AND organization_id = p_organization_id AND NOT is_deleted;
    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_set_counter_operator(
    p_organization_id varchar, p_organization_user_id varchar,
    p_payload jsonb, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_enabled boolean := COALESCE((p_payload->>'enabled')::boolean, FALSE);
    v_staff_id varchar(64); v_staff_code varchar(64); v_store_id varchar(64);
    v_store_code varchar(64); v_next_staff_number integer;
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization_user WHERE organization_user_id = p_organization_user_id AND organization_id = p_organization_id AND NOT is_deleted AND organization_user_status_id = 'entity-status-org-user-active') THEN
        RAISE EXCEPTION 'Active organization user not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT staff_id, staff_code INTO v_staff_id, v_staff_code
      FROM "${schemaName}".staff WHERE organization_user_id = p_organization_user_id FOR UPDATE;
    IF v_enabled THEN
        v_staff_id := COALESCE(v_staff_id, NULLIF(p_payload->>'staffId',''));
        v_store_id := NULLIF(p_payload->>'primaryStoreId','');
        IF v_staff_id IS NULL THEN
            RAISE EXCEPTION 'Staff id is required' USING ERRCODE = '22023';
        END IF;
        IF v_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${schemaName}".stores WHERE store_id = v_store_id AND organization_id = p_organization_id AND NOT is_deleted) THEN
            RAISE EXCEPTION 'Store not found' USING ERRCODE = '23503';
        END IF;
        IF v_staff_code IS NULL THEN
            IF v_store_id IS NULL THEN
                RAISE EXCEPTION 'A primary store is required to enable a new Counter Operator' USING ERRCODE = '22023';
            END IF;
            SELECT store_code INTO v_store_code
              FROM "${schemaName}".stores
             WHERE store_id = v_store_id AND organization_id = p_organization_id AND NOT is_deleted;
            IF v_store_code IS NULL THEN
                RAISE EXCEPTION 'Store code is required to create a Staff profile' USING ERRCODE = '22023';
            END IF;
            -- Match the established Staff form convention: <store-code>-STAFF-###.
            -- Serialize code allocation per organization/store to avoid duplicate codes.
            PERFORM pg_advisory_xact_lock(hashtext(p_organization_id || ':' || v_store_id));
            SELECT COALESCE(MAX((regexp_match(staff_code, '-STAFF-([0-9]+)$'))[1]::integer), 0) + 1
              INTO v_next_staff_number
              FROM "${schemaName}".staff
             WHERE organization_id = p_organization_id
               AND staff_code ~ '-STAFF-[0-9]+$';
            v_staff_code := v_store_code || '-STAFF-' || lpad(v_next_staff_number::text, 3, '0');
        END IF;
        INSERT INTO "${schemaName}".staff
            (staff_id, organization_user_id, staff_code, organization_id, role_id, designation, store_id,
             joining_date, staff_status_id, created_by, updated_by, is_deleted, version_no)
        VALUES (v_staff_id, p_organization_user_id, v_staff_code, p_organization_id, 'role-staff',
                NULLIF(p_payload->>'designation',''), v_store_id, CURRENT_DATE,
                'entity-status-staff-active', p_actor_user_id, p_actor_user_id, FALSE, 1)
        ON CONFLICT (organization_user_id) DO UPDATE SET
            designation = COALESCE(EXCLUDED.designation, staff.designation),
            store_id = COALESCE(EXCLUDED.store_id, staff.store_id), staff_status_id = 'entity-status-staff-active',
            relieving_date = NULL, updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            is_deleted = FALSE, version_no = staff.version_no + 1
        RETURNING staff_id INTO v_staff_id;
        PERFORM "${schemaName}".rbac_ensure_staff_base_role(p_organization_id, v_staff_id, p_actor_user_id);
    ELSE
        IF v_staff_id IS NULL THEN RETURN NULL; END IF;
        UPDATE "${schemaName}".staff SET staff_status_id = 'entity-status-staff-inactive',
            relieving_date = COALESCE(relieving_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1 WHERE staff_id = v_staff_id;
        UPDATE "${schemaName}".organization_user_roles SET
            assignment_status_id = 'entity-status-org-user-role-revoked', effective_to = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
         WHERE organization_user_id = p_organization_user_id AND role_id = 'role-staff'
           AND NOT is_deleted AND assignment_status_id = 'entity-status-org-user-role-active';
    END IF;
    RETURN v_staff_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_set_stores(
    p_organization_id varchar, p_organization_user_id varchar,
    p_primary_store_id varchar, p_additional_store_ids jsonb, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_staff_id varchar(64); v_store_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT s.staff_id INTO v_staff_id FROM "${schemaName}".staff s
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    WHERE ou.organization_user_id = p_organization_user_id AND ou.organization_id = p_organization_id
      AND NOT ou.is_deleted AND NOT s.is_deleted FOR UPDATE OF s;
    IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff profile not found' USING ERRCODE = 'P0002'; END IF;
    IF p_primary_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${schemaName}".stores WHERE store_id = p_primary_store_id AND organization_id = p_organization_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Store not found' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_additional_store_ids, '[]'::jsonb)) requested
        WHERE NOT EXISTS (SELECT 1 FROM "${schemaName}".stores s WHERE s.store_id = requested AND s.organization_id = p_organization_id AND NOT s.is_deleted)
    ) THEN RAISE EXCEPTION 'Store not found' USING ERRCODE = '23503'; END IF;

    UPDATE "${schemaName}".staff SET store_id = p_primary_store_id, updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, version_no = version_no + 1 WHERE staff_id = v_staff_id;
    UPDATE "${schemaName}".staff_store_assignment SET status_id = 'entity-status-staff-assignment-inactive',
        end_date = COALESCE(end_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE staff_id = v_staff_id AND NOT is_deleted AND status_id = 'entity-status-staff-assignment-active'
       AND store_id NOT IN (SELECT value FROM jsonb_array_elements_text(COALESCE(p_additional_store_ids, '[]'::jsonb)));
    FOR v_store_id IN SELECT value FROM jsonb_array_elements_text(COALESCE(p_additional_store_ids, '[]'::jsonb))
    LOOP
        IF v_store_id IS DISTINCT FROM p_primary_store_id THEN
            INSERT INTO "${schemaName}".staff_store_assignment
                (staff_store_assignment_id, staff_id, store_id, status_id, effective_date,
                 created_at, created_by, updated_at, updated_by, is_deleted, version_no)
            VALUES ('ssa-' || left(md5(v_staff_id || ':' || v_store_id), 32), v_staff_id, v_store_id,
                    'entity-status-staff-assignment-active', CURRENT_DATE, CURRENT_TIMESTAMP,
                    p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id, FALSE, 1)
            ON CONFLICT (staff_store_assignment_id) DO UPDATE SET
                status_id = 'entity-status-staff-assignment-active', effective_date = CURRENT_DATE,
                end_date = NULL, updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
                is_deleted = FALSE, version_no = staff_store_assignment.version_no + 1;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_access_staff_id(
    p_organization_id varchar, p_organization_user_id varchar, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE v_staff_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization access administration is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT s.staff_id INTO v_staff_id FROM "${schemaName}".staff s
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    WHERE ou.organization_user_id = p_organization_user_id AND ou.organization_id = p_organization_id
      AND NOT ou.is_deleted AND NOT s.is_deleted;
    IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Staff profile not found' USING ERRCODE = 'P0002'; END IF;
    RETURN v_staff_id;
END;
$function$;

-- Keep the existing Local/Dev RBAC mutation surface from bypassing the same
-- final-active-administrator invariant enforced by the domain endpoint.
CREATE OR REPLACE FUNCTION "${schemaName}".rbac_revoke_organization_role(
    p_organization_id varchar, p_assignment_id varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_role_id varchar(64);
    v_organization_user_id varchar(64);
    v_target_user_id varchar(64);
    v_conveys_admin_access boolean;
    v_retains_admin_access boolean;
    v_other_admins integer;
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Organization role revocation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('organization-admin:' || p_organization_id, 0)
    );

    SELECT our.role_id, ou.organization_user_id, ou.user_id
      INTO v_role_id, v_organization_user_id, v_target_user_id
      FROM "${schemaName}".organization_user_roles our
      JOIN "${schemaName}".organization_user ou
        ON ou.organization_user_id = our.organization_user_id
     WHERE our.organization_user_role_id = p_assignment_id
       AND ou.organization_id = p_organization_id
       AND NOT our.is_deleted
     FOR UPDATE OF our;

    IF v_role_id IS NULL THEN RETURN FALSE; END IF;
    IF v_role_id = 'role-owner'
       AND NOT "${schemaName}".rbac_has_capability(
           p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS'
       ) THEN
        RAISE EXCEPTION 'Owner role revocation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM "${schemaName}".role_privileges rp
          JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
         WHERE rp.role_id = v_role_id
           AND p.privilege_code = 'ORG_ADMIN_ACCESS'
           AND p.privilege_status_id = 'entity-status-privilege-active'
    ) INTO v_conveys_admin_access;

    IF v_conveys_admin_access
       AND "${schemaName}".rbac_has_capability(
           v_target_user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
       ) THEN
        SELECT EXISTS (
            SELECT 1
              FROM "${schemaName}".organization_user_roles our
              JOIN "${schemaName}".role r ON r.role_id = our.role_id
              JOIN "${schemaName}".role_privileges rp ON rp.role_id = r.role_id
              JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
             WHERE our.organization_user_id = v_organization_user_id
               AND our.organization_user_role_id <> p_assignment_id
               AND NOT our.is_deleted
               AND our.assignment_status_id = 'entity-status-org-user-role-active'
               AND our.effective_from <= CURRENT_TIMESTAMP
               AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
               AND r.role_status_id = 'entity-status-role-active'
               AND p.privilege_status_id = 'entity-status-privilege-active'
               AND p.privilege_code = 'ORG_ADMIN_ACCESS'
        ) INTO v_retains_admin_access;

        SELECT count(DISTINCT ou.user_id) INTO v_other_admins
          FROM "${schemaName}".organization_user ou
         WHERE ou.organization_id = p_organization_id
           AND ou.organization_user_id <> v_organization_user_id
           AND "${schemaName}".rbac_has_capability(
               ou.user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
           );

        IF NOT v_retains_admin_access AND v_other_admins = 0 THEN
            RAISE EXCEPTION 'The last active organization administrator cannot be removed'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    UPDATE "${schemaName}".organization_user_roles
       SET assignment_status_id = 'entity-status-org-user-role-revoked',
           effective_to = CASE
               WHEN effective_from < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
               ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE organization_user_role_id = p_assignment_id;
    RETURN TRUE;
END;
$function$;

-- The pre-existing organization-user upsert can also change membership status.
-- Retain its contract while applying the same final-admin invariant before an
-- existing active relationship is made inactive.
CREATE OR REPLACE FUNCTION "${schemaName}".upsert_organization_user_with_base_role(
    p_organization_id varchar, p_payload jsonb, p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
    v_result jsonb;
    v_ou_id varchar(64) := NULLIF(p_payload->>'organizationUserId', '');
    v_target_user_id varchar(64);
    v_requested_status varchar(64) := NULLIF(p_payload->>'organizationUserStatusId', '');
    v_role_id varchar(64) := NULLIF(p_payload->>'roleId', '');
    v_other_admins integer;
BEGIN
    IF v_ou_id IS NOT NULL
       AND v_requested_status IS NOT NULL
       AND v_requested_status <> 'entity-status-org-user-active' THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('organization-admin:' || p_organization_id, 0)
        );
        SELECT user_id INTO v_target_user_id
          FROM "${schemaName}".organization_user
         WHERE organization_user_id = v_ou_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
         FOR UPDATE;

        IF v_target_user_id IS NOT NULL
           AND "${schemaName}".rbac_has_capability(
               v_target_user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
           ) THEN
            SELECT count(DISTINCT ou.user_id) INTO v_other_admins
              FROM "${schemaName}".organization_user ou
             WHERE ou.organization_id = p_organization_id
               AND ou.organization_user_id <> v_ou_id
               AND "${schemaName}".rbac_has_capability(
                   ou.user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
               );
            IF v_other_admins = 0 THEN
                RAISE EXCEPTION 'The last active organization administrator cannot be inactivated'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    v_result := "${schemaName}".upsert_organization_user(
        p_organization_id,
        p_payload - 'roleId' - 'organizationUserRoleId',
        p_actor_user_id
    );
    v_ou_id := v_result->>'organizationUserId';
    IF v_role_id IS NOT NULL THEN
        IF v_role_id = 'role-owner'
           AND NOT "${schemaName}".rbac_has_capability(
               p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS'
           ) THEN
            RAISE EXCEPTION 'Owner role assignment is not permitted'
                USING ERRCODE = '42501';
        END IF;
        PERFORM "${schemaName}".rbac_ensure_organization_base_role(
            v_ou_id, v_role_id, p_actor_user_id
        );
        SELECT elem INTO v_result
          FROM jsonb_array_elements(
              "${schemaName}".get_organization_users(p_organization_id)
          ) elem
         WHERE elem->>'organizationUserId' = v_ou_id
         LIMIT 1;
    END IF;
    RETURN v_result;
END;
$function$;

-- Fixed POS unlock choices require all eligibility conditions, including a PIN.
CREATE OR REPLACE FUNCTION "${schemaName}".pos_eligible_staff(p_token_hash varchar)
RETURNS TABLE ("staffId" varchar, "displayName" varchar, "staffCode" varchar, designation varchar, "pinConfigured" boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT st.staff_id, COALESCE(NULLIF(u.display_name, ''), concat_ws(' ', u.first_name, u.last_name)),
           st.staff_code, st.designation, TRUE
    FROM "${schemaName}".pos_resolve_device(p_token_hash) d
    JOIN "${schemaName}".staff st ON st.organization_id = d."organizationId"
    JOIN "${schemaName}".entity_status stes ON stes.entity_status_id = st.staff_status_id
    JOIN "${schemaName}".statuses sts ON sts.status_id = stes.status_id
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = st.organization_user_id AND ou.organization_id = d."organizationId"
    JOIN "${schemaName}".entity_status oues ON oues.entity_status_id = ou.organization_user_status_id
    JOIN "${schemaName}".statuses ous ON ous.status_id = oues.status_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".entity_status ues ON ues.entity_status_id = u.user_status_id
    JOIN "${schemaName}".statuses us ON us.status_id = ues.status_id
    JOIN "${schemaName}".staff_pin_credentials pc ON pc.staff_id = st.staff_id
    WHERE NOT st.is_deleted AND sts.status_code = 'ACTIVE' AND NOT ou.is_deleted AND ous.status_code = 'ACTIVE'
      AND NOT u.is_deleted AND us.status_code = 'ACTIVE'
      AND "${schemaName}".rbac_has_capability(u.user_id, d."organizationId", 'COUNTER_ACCESS')
      AND (st.store_id = d."storeId" OR EXISTS (
          SELECT 1 FROM "${schemaName}".staff_store_assignment a
          JOIN "${schemaName}".entity_status aes ON aes.entity_status_id = a.status_id
          JOIN "${schemaName}".statuses ast ON ast.status_id = aes.status_id
          WHERE a.staff_id = st.staff_id AND a.store_id = d."storeId" AND NOT a.is_deleted
            AND ast.status_code = 'ACTIVE' AND a.effective_date <= CURRENT_DATE
            AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)))
    ORDER BY st.staff_code;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".organization_access_list(varchar,varchar),
    "${schemaName}".organization_access_set_org_admin(varchar,varchar,boolean,varchar),
    "${schemaName}".organization_access_set_membership_active(varchar,varchar,boolean,varchar),
    "${schemaName}".organization_access_set_counter_operator(varchar,varchar,jsonb,varchar),
    "${schemaName}".organization_access_set_stores(varchar,varchar,varchar,jsonb,varchar),
    "${schemaName}".organization_access_staff_id(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".organization_access_list(varchar,varchar),
    "${schemaName}".organization_access_set_org_admin(varchar,varchar,boolean,varchar),
    "${schemaName}".organization_access_set_membership_active(varchar,varchar,boolean,varchar),
    "${schemaName}".organization_access_set_counter_operator(varchar,varchar,jsonb,varchar),
    "${schemaName}".organization_access_set_stores(varchar,varchar,varchar,jsonb,varchar),
    "${schemaName}".organization_access_staff_id(varchar,varchar,varchar) TO "${appRole}";
