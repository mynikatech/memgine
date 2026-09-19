-- Run manually after 059 against a DEV database with two active organizations.
-- Replace the schema name if your DEV schema differs. The transaction always rolls back.
BEGIN;
DO $test$
DECLARE
    v_org_a varchar(64);
    v_org_b varchar(64);
    v_user varchar(64) := 'rbac-test-' || left(md5(clock_timestamp()::text), 20);
    v_phone varchar(20) := '+1' || lpad((floor(random() * 10000000000)::bigint)::text, 10, '0');
    v_ou_a varchar(64);
    v_ou_b varchar(64);
    v_assignment varchar(64);
BEGIN
    SELECT organization_id INTO v_org_a FROM memginedev.organization
    WHERE NOT is_deleted AND organization_status_id = 'entity-status-org-active'
    ORDER BY organization_id LIMIT 1;
    SELECT organization_id INTO v_org_b FROM memginedev.organization
    WHERE NOT is_deleted AND organization_status_id = 'entity-status-org-active'
      AND organization_id <> v_org_a ORDER BY organization_id LIMIT 1;
    IF v_org_a IS NULL OR v_org_b IS NULL THEN
        RAISE EXCEPTION 'RBAC regression test needs two active organizations';
    END IF;

    IF (SELECT role_code FROM memginedev.role WHERE role_id = 'role-admin') <> 'ORG_ADMIN'
       OR (SELECT role_code FROM memginedev.role WHERE role_id = 'role-owner') <> 'BUSINESS_OWNER'
       OR (SELECT role_status_id FROM memginedev.role WHERE role_id = 'role-manager') <> 'entity-status-role-retired' THEN
        RAISE EXCEPTION 'Role conversion or MANAGER retirement failed';
    END IF;
    IF (SELECT count(*) FROM memginedev.role WHERE role_status_id = 'entity-status-role-active') <> 5 THEN
        RAISE EXCEPTION 'Expected exactly five active roles';
    END IF;
    IF EXISTS (SELECT 1 FROM memginedev.privileges WHERE privilege_code IN
        ('APPROVE','CONFIGURE','CREATE','DELETE','EXPORT','REJECT','UPDATE','VIEW')
        AND privilege_status_id = 'entity-status-privilege-active') THEN
        RAISE EXCEPTION 'Legacy CRUD privilege is active';
    END IF;
    IF (SELECT count(*) FROM memginedev.role_privileges rp
        JOIN memginedev.privileges p ON p.privilege_id = rp.privilege_id
        WHERE p.privilege_code IN ('PLATFORM_ADMIN_ACCESS','BUSINESS_OWNER_ACCESS','ORG_ADMIN_ACCESS','COUNTER_ACCESS','CUSTOMER_ACCESS')) <> 8 THEN
        RAISE EXCEPTION 'Expected exactly eight MVP role-capability mappings';
    END IF;
    IF EXISTS (
        SELECT 1 FROM memginedev.staff s
        JOIN memginedev.organization_user ou ON ou.organization_user_id = s.organization_user_id
        WHERE s.role_id IN ('role-owner','role-admin','role-staff')
          AND s.staff_status_id = 'entity-status-staff-active' AND NOT s.is_deleted
          AND ou.organization_id = s.organization_id AND NOT ou.is_deleted
          AND ou.organization_user_status_id = 'entity-status-org-user-active'
          AND NOT EXISTS (SELECT 1 FROM memginedev.organization_user_roles our
                          WHERE our.organization_user_id = s.organization_user_id AND our.role_id = s.role_id)
    ) THEN RAISE EXCEPTION 'Unambiguous active staff role was not backfilled'; END IF;
    IF EXISTS (
        SELECT 1 FROM memginedev.role_privileges rp
        JOIN memginedev.privileges p ON p.privilege_id = rp.privilege_id
        JOIN memginedev.role r ON r.role_id = rp.role_id
        WHERE p.privilege_code IN ('PLATFORM_ADMIN_ACCESS','BUSINESS_OWNER_ACCESS','ORG_ADMIN_ACCESS','COUNTER_ACCESS','CUSTOMER_ACCESS')
        AND (r.role_code, p.privilege_code) NOT IN (
            ('PLATFORM_ADMIN','PLATFORM_ADMIN_ACCESS'),
            ('BUSINESS_OWNER','BUSINESS_OWNER_ACCESS'), ('BUSINESS_OWNER','ORG_ADMIN_ACCESS'),
            ('BUSINESS_OWNER','COUNTER_ACCESS'), ('ORG_ADMIN','ORG_ADMIN_ACCESS'),
            ('ORG_ADMIN','COUNTER_ACCESS'), ('STAFF','COUNTER_ACCESS'), ('CUSTOMER','CUSTOMER_ACCESS')
        )
    ) THEN RAISE EXCEPTION 'Unexpected MVP mapping'; END IF;

    INSERT INTO memginedev."user"
        (user_id, user_code, first_name, primary_phone, user_status_id, created_by, updated_by)
    VALUES (v_user, v_user, 'RBAC Test', v_phone, 'entity-status-user-active',
            'user-platform-admin', 'user-platform-admin');

    -- Platform role needs no organization_user and confers no org capability.
    INSERT INTO memginedev.platform_user_role
        (platform_user_role_id, user_id, role_id, status_id, created_by, updated_by)
    VALUES ('pur-' || v_user, v_user, 'role-platform-admin',
            'entity-status-platfrm-user-role-active', 'user-platform-admin', 'user-platform-admin');
    IF EXISTS (SELECT 1 FROM memginedev.organization_user WHERE user_id = v_user)
       OR NOT memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR memginedev.can_administer_organization(v_org_a, v_user) THEN
        RAISE EXCEPTION 'Platform role isolation failed';
    END IF;
    UPDATE memginedev.platform_user_role SET effective_from = CURRENT_TIMESTAMP + interval '1 day'
    WHERE user_id = v_user;
    IF memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Future platform assignment grants access';
    END IF;
    UPDATE memginedev.platform_user_role SET effective_from = CURRENT_TIMESTAMP - interval '2 days',
        effective_to = CURRENT_TIMESTAMP - interval '1 day' WHERE user_id = v_user;
    IF memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Expired platform assignment grants access';
    END IF;
    UPDATE memginedev.platform_user_role SET effective_to = NULL,
        status_id = 'entity-status-platfrm-user-role-revoked' WHERE user_id = v_user;
    IF memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Revoked platform assignment grants access';
    END IF;
    UPDATE memginedev.platform_user_role SET status_id = 'entity-status-platfrm-user-role-active',
        is_deleted = TRUE WHERE user_id = v_user;
    IF memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Deleted platform assignment grants access';
    END IF;
    UPDATE memginedev.platform_user_role SET is_deleted = FALSE WHERE user_id = v_user;

    INSERT INTO memginedev.organization_user
        (organization_user_id, organization_id, user_id, organization_user_type_id,
         organization_user_status_id, created_by, updated_by)
    VALUES ('ou-a-' || v_user, v_org_a, v_user, 'organization-user-type-admin',
            'entity-status-org-user-active', 'user-platform-admin', 'user-platform-admin')
    RETURNING organization_user_id INTO v_ou_a;
    INSERT INTO memginedev.organization_user
        (organization_user_id, organization_id, user_id, organization_user_type_id,
         organization_user_status_id, created_by, updated_by)
    VALUES ('ou-b-' || v_user, v_org_b, v_user, 'organization-user-type-admin',
            'entity-status-org-user-active', 'user-platform-admin', 'user-platform-admin')
    RETURNING organization_user_id INTO v_ou_b;

    INSERT INTO memginedev.organization_user_roles
        (organization_user_role_id, organization_user_id, role_id, assignment_status_id,
         created_by, updated_by)
    VALUES ('our-owner-' || v_user, v_ou_a, 'role-owner',
            'entity-status-org-user-role-active', 'user-platform-admin', 'user-platform-admin')
    RETURNING organization_user_role_id INTO v_assignment;
    IF NOT memginedev.rbac_has_capability(v_user, v_org_a, 'BUSINESS_OWNER_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_a, 'CUSTOMER_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_b, 'COUNTER_ACCESS') THEN
        RAISE EXCEPTION 'Owner mapping or organization boundary failed';
    END IF;
    UPDATE memginedev.organization_user_roles SET role_id = 'role-admin' WHERE organization_user_role_id = v_assignment;
    IF NOT memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_a, 'BUSINESS_OWNER_ACCESS')
       OR NOT memginedev.can_administer_organization(v_org_a, v_user) THEN
        RAISE EXCEPTION 'Org admin mapping failed';
    END IF;
    UPDATE memginedev.organization_user_roles SET role_id = 'role-staff' WHERE organization_user_role_id = v_assignment;
    IF NOT memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR memginedev.can_administer_organization(v_org_a, v_user) THEN
        RAISE EXCEPTION 'Staff mapping failed';
    END IF;
    UPDATE memginedev.organization_user_roles SET role_id = 'role-customer' WHERE organization_user_role_id = v_assignment;
    IF NOT memginedev.rbac_has_capability(v_user, v_org_a, 'CUSTOMER_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS') THEN
        RAISE EXCEPTION 'Customer mapping failed';
    END IF;

    UPDATE memginedev.organization_user_roles SET role_id = 'role-admin',
        effective_from = CURRENT_TIMESTAMP - interval '2 days',
        effective_to = CURRENT_TIMESTAMP - interval '1 day'
    WHERE organization_user_role_id = v_assignment;
    IF memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'Expired assignment grants access'; END IF;
    UPDATE memginedev.organization_user_roles SET effective_from = CURRENT_TIMESTAMP + interval '1 day',
        effective_to = NULL WHERE organization_user_role_id = v_assignment;
    IF memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'Future assignment grants access'; END IF;
    UPDATE memginedev.organization_user_roles SET effective_from = CURRENT_TIMESTAMP - interval '1 day',
        assignment_status_id = 'entity-status-org-user-role-revoked' WHERE organization_user_role_id = v_assignment;
    IF memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'Revoked assignment grants access'; END IF;
    UPDATE memginedev.organization_user_roles SET assignment_status_id = 'entity-status-org-user-role-active',
        is_deleted = TRUE WHERE organization_user_role_id = v_assignment;
    IF memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'Deleted assignment grants access'; END IF;

    UPDATE memginedev.organization_user_roles SET is_deleted = FALSE WHERE organization_user_role_id = v_assignment;
    IF memginedev.rbac_assign_organization_role(v_org_a, v_user, 'STAFF', NULL, NULL,
        'regression temporary', v_user) IS NULL THEN
        RAISE EXCEPTION 'Organization role assignment function failed';
    END IF;
    IF NOT memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS') THEN
        RAISE EXCEPTION 'Assigned staff role did not grant Counter access';
    END IF;
    IF NOT memginedev.rbac_revoke_organization_role(v_org_a,
        (SELECT organization_user_role_id FROM memginedev.organization_user_roles
         WHERE organization_user_id = v_ou_a AND role_id = 'role-staff'), v_user) THEN
        RAISE EXCEPTION 'Organization role revoke function failed';
    END IF;
    IF memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS') = FALSE THEN
        -- ORG_ADMIN still grants Counter, so revocation is checked by the row status below.
        RAISE EXCEPTION 'Org admin Counter mapping changed unexpectedly';
    END IF;
    IF EXISTS (SELECT 1 FROM memginedev.organization_user_roles
               WHERE organization_user_id = v_ou_a AND role_id = 'role-staff'
                 AND assignment_status_id <> 'entity-status-org-user-role-revoked') THEN
        RAISE EXCEPTION 'Organization role revocation did not change status';
    END IF;
    PERFORM memginedev.rbac_assign_organization_role(v_org_a, v_user, 'STAFF', NULL, NULL,
        'regression reassignment', v_user);
    INSERT INTO memginedev.organization_user_roles
        (organization_user_role_id, organization_user_id, role_id, assignment_status_id, created_by, updated_by)
    VALUES ('our-customer-b-' || left(md5(v_user), 20), v_ou_b, 'role-customer', 'entity-status-org-user-role-active',
            'user-platform-admin', 'user-platform-admin');
    IF NOT memginedev.rbac_has_capability(v_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_user, v_org_a, 'COUNTER_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_user, v_org_b, 'CUSTOMER_ACCESS')
       OR memginedev.rbac_has_capability(v_user, v_org_b, 'ORG_ADMIN_ACCESS')
       OR memginedev.rbac_has_capability(v_user, NULL, 'COUNTER_ACCESS') THEN
        RAISE EXCEPTION 'Multiple roles, cross-org scope, or null-org guard failed';
    END IF;
    INSERT INTO memginedev.organization_user_roles
        (organization_user_role_id, organization_user_id, role_id, assignment_status_id, created_by, updated_by)
    VALUES ('our-manager-' || left(md5(v_user), 20), v_ou_b, 'role-manager', 'entity-status-org-user-role-active',
            'user-platform-admin', 'user-platform-admin');
    IF (SELECT count(*) FROM memginedev.rbac_effective_roles(v_user, v_org_b)) <> 1 THEN
        RAISE EXCEPTION 'Retired MANAGER must not become an effective role';
    END IF;
    INSERT INTO memginedev.role_privileges (role_privilege_id, role_id, privilege_id)
    VALUES ('rp-test-legacy-' || left(md5(v_user), 20), 'role-admin', 'privilege-view');
    IF (SELECT count(*) FROM memginedev.rbac_effective_capabilities(v_user, v_org_a)) <> 2 THEN
        RAISE EXCEPTION 'Legacy CRUD privilege affected MVP capabilities';
    END IF;
    IF NOT memginedev.rbac_revoke_platform_role('pur-' || v_user, 'user-platform-admin')
       OR memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform role revoke function failed';
    END IF;
    IF memginedev.rbac_assign_platform_role(v_user, NULL, NULL, 'regression reassignment',
        'user-platform-admin') IS NULL
       OR NOT memginedev.rbac_has_capability(v_user, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform role assignment function failed';
    END IF;
END;
$test$;

DO $onboarding_test$
DECLARE
    v_suffix varchar := left(md5(clock_timestamp()::text || random()::text), 12);
    v_org_type varchar(64);
    v_org_a varchar(64) := 'rbac-onboard-a-' || v_suffix;
    v_org_b varchar(64) := 'rbac-onboard-b-' || v_suffix;
    v_failed_org varchar(64) := 'rbac-onboard-f-' || v_suffix;
    v_owner_phone varchar(20) := '+1416' || lpad((floor(random() * 10000000)::bigint)::text, 7, '0');
    v_contact_phone varchar(20) := '+1647' || lpad((floor(random() * 10000000)::bigint)::text, 7, '0');
    v_owner_user varchar(64);
    v_owner_ou varchar(64);
    v_admin_user varchar(64) := 'rbac-admin-' || v_suffix;
    v_admin_ou varchar(64) := 'rbac-admin-ou-' || v_suffix;
    v_staff_user varchar(64) := 'rbac-staff-' || v_suffix;
    v_staff_ou varchar(64) := 'rbac-staff-ou-' || v_suffix;
    v_staff_id varchar(64) := 'rbac-staff-row-' || v_suffix;
    v_customer_ou varchar(64);
    v_customer_user varchar(64);
    v_created record;
    v_owner_first_name varchar(100);
    v_failed boolean := false;
BEGIN
    SELECT organization_type_id INTO STRICT v_org_type
    FROM memginedev.organization_types WHERE is_active ORDER BY display_order LIMIT 1;

    SELECT * INTO STRICT v_created FROM memginedev.onboard_organization(
        jsonb_build_object(
            'id', v_org_a, 'code', 'RBAC-A-' || upper(v_suffix),
            'name', 'RBAC Onboarding A', 'displayName', 'RBAC Onboarding A',
            'organizationTypeId', v_org_type, 'organizationStatusId', 'status-active',
            'primaryEmail', 'org-a-' || v_suffix || '@example.test',
            'primaryPhone', jsonb_build_object('countryId', 'country-ca', 'callingCode', '+1', 'number', substring(v_contact_phone from 3)),
            'website', NULL
        ),
        jsonb_build_object(
            'id', 'rbac-details-a-' || v_suffix, 'organizationId', v_org_a,
            'supportPhone', jsonb_build_object('countryId', '', 'callingCode', '', 'number', ''),
            'address', jsonb_build_object('line1', '', 'line2', '', 'city', '', 'region', '', 'postalCode', '', 'countryCode', '')
        ),
        jsonb_build_object(
            'id', 'rbac-brand-a-' || v_suffix, 'organizationId', v_org_a,
            'brandingName', 'RBAC Onboarding A', 'themeTemplateId', 'template-cafe',
            'brandingStatusId', 'entity-status-branding-active'
        ),
        jsonb_build_object(
            'firstName', 'Original', 'lastName', 'Owner',
            'email', 'owner-' || v_suffix || '@example.test',
            'phone', jsonb_build_object('countryId', 'country-ca', 'callingCode', '+1', 'number', substring(v_owner_phone from 3))
        ),
        'user-platform-admin'
    );
    v_owner_user := v_created.owner_user_id;
    v_owner_ou := v_created.owner_organization_user_id;

    IF NOT memginedev.rbac_has_capability(v_owner_user, v_org_a, 'BUSINESS_OWNER_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_owner_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_owner_user, v_org_a, 'COUNTER_ACCESS')
       OR (SELECT count(*) FROM memginedev.organization_user_roles
           WHERE organization_user_id = v_owner_ou AND role_id = 'role-owner') <> 1 THEN
        RAISE EXCEPTION 'New owner onboarding did not create the effective Business Owner role';
    END IF;
    IF (SELECT primary_phone FROM memginedev.organization WHERE organization_id = v_org_a) = v_owner_phone THEN
        RAISE EXCEPTION 'Organization and owner phone were not kept separate';
    END IF;
    SELECT first_name INTO v_owner_first_name FROM memginedev."user" WHERE user_id = v_owner_user;

    -- Same owner phone must reuse the global identity without replacing profile data.
    SELECT * INTO STRICT v_created FROM memginedev.onboard_organization(
        jsonb_build_object(
            'id', v_org_b, 'code', 'RBAC-B-' || upper(v_suffix),
            'name', 'RBAC Onboarding B', 'organizationTypeId', v_org_type,
            'organizationStatusId', 'status-active',
            'primaryEmail', 'org-b-' || v_suffix || '@example.test',
            'primaryPhone', jsonb_build_object('countryId', 'country-ca', 'callingCode', '+1', 'number', substring(v_contact_phone from 3)),
            'website', NULL
        ),
        jsonb_build_object(
            'id', 'rbac-details-b-' || v_suffix, 'organizationId', v_org_b,
            'supportPhone', jsonb_build_object('countryId', '', 'callingCode', '', 'number', ''),
            'address', jsonb_build_object('line1', '', 'line2', '', 'city', '', 'region', '', 'postalCode', '', 'countryCode', '')
        ),
        jsonb_build_object(
            'id', 'rbac-brand-b-' || v_suffix, 'organizationId', v_org_b,
            'brandingName', 'RBAC Onboarding B', 'themeTemplateId', 'template-cafe',
            'brandingStatusId', 'entity-status-branding-active'
        ),
        jsonb_build_object(
            'firstName', 'Replacement', 'lastName', 'Name',
            'email', 'replacement-' || v_suffix || '@example.test',
            'phone', jsonb_build_object('countryId', 'country-ca', 'callingCode', '+1', 'number', substring(v_owner_phone from 3))
        ),
        'user-platform-admin'
    );
    IF v_created.owner_user_id <> v_owner_user
       OR (SELECT count(*) FROM memginedev."user" WHERE primary_phone = v_owner_phone) <> 1
       OR (SELECT first_name FROM memginedev."user" WHERE user_id = v_owner_user) <> v_owner_first_name
       OR NOT memginedev.rbac_has_capability(v_owner_user, v_org_b, 'BUSINESS_OWNER_ACCESS') THEN
        RAISE EXCEPTION 'Existing owner identity was not safely reused';
    END IF;

    -- Org Admin creation uses the existing atomic upsert contract with roleId.
    PERFORM memginedev.upsert_organization_user_with_base_role(v_org_a, jsonb_build_object(
        'userId', v_admin_user, 'userCode', upper(v_admin_user),
        'firstName', 'Org', 'lastName', 'Admin',
        'primaryPhone', '+1514' || lpad((floor(random() * 10000000)::bigint)::text, 7, '0'),
        'organizationUserId', v_admin_ou,
        'organizationUserTypeId', 'organization-user-type-admin',
        'roleId', 'role-admin', 'organizationUserRoleId', 'rbac-admin-role-' || v_suffix
    ), v_owner_user);
    IF NOT memginedev.rbac_has_capability(v_admin_user, v_org_a, 'ORG_ADMIN_ACCESS')
       OR NOT memginedev.rbac_has_capability(v_admin_user, v_org_a, 'COUNTER_ACCESS')
       OR memginedev.rbac_has_capability(v_admin_user, v_org_a, 'BUSINESS_OWNER_ACCESS') THEN
        RAISE EXCEPTION 'New Org Admin base access is incorrect';
    END IF;

    -- Staff service performs these calls in one JDBI transaction.
    PERFORM memginedev.upsert_organization_user_with_base_role(v_org_a, jsonb_build_object(
        'userId', v_staff_user, 'userCode', upper(v_staff_user),
        'firstName', 'Staff', 'lastName', 'Member',
        'primaryPhone', '+1905' || lpad((floor(random() * 10000000)::bigint)::text, 7, '0'),
        'organizationUserId', v_staff_ou,
        'organizationUserTypeId', 'organization-user-type-employee'
    ), v_owner_user);
    PERFORM * FROM memginedev.create_staff(
        v_org_a, v_staff_id, v_staff_ou, upper(v_staff_id), 'STAFF',
        'Regression Staff', NULL, CURRENT_DATE, NULL,
        'entity-status-staff-active', v_owner_user
    );
    PERFORM memginedev.rbac_ensure_staff_base_role(v_org_a, v_staff_id, v_owner_user);
    PERFORM memginedev.rbac_ensure_staff_base_role(v_org_a, v_staff_id, v_owner_user);
    IF NOT memginedev.rbac_has_capability(v_staff_user, v_org_a, 'COUNTER_ACCESS')
       OR (SELECT count(*) FROM memginedev.organization_user_roles
           WHERE organization_user_id = v_staff_ou AND role_id = 'role-staff') <> 1 THEN
        RAISE EXCEPTION 'New Staff base role is missing or duplicated';
    END IF;

    v_customer_ou := memginedev.create_organization_prospective_customer(
        v_org_a, 'Customer', NULL, 'Regression', NULL,
        'customer-' || v_suffix || '@example.test',
        '+1604' || lpad((floor(random() * 10000000)::bigint)::text, 7, '0'),
        v_owner_user
    );
    SELECT user_id INTO STRICT v_customer_user FROM memginedev.organization_user
    WHERE organization_user_id = v_customer_ou;
    IF NOT memginedev.rbac_has_capability(v_customer_user, v_org_a, 'CUSTOMER_ACCESS') THEN
        RAISE EXCEPTION 'New Customer base role is missing';
    END IF;

    -- The bootstrap remains idempotent and grants Org Admin, never owner access.
    PERFORM memginedev.ensure_default_organization_admin(v_org_a);
    PERFORM memginedev.ensure_default_organization_admin(v_org_a);
    IF NOT memginedev.rbac_has_capability('user-org-admin', v_org_a, 'ORG_ADMIN_ACCESS')
       OR NOT memginedev.rbac_has_capability('user-org-admin', v_org_a, 'COUNTER_ACCESS')
       OR memginedev.rbac_has_capability('user-org-admin', v_org_a, 'BUSINESS_OWNER_ACCESS')
       OR (SELECT count(*) FROM memginedev.organization_user_roles our
           JOIN memginedev.organization_user ou ON ou.organization_user_id = our.organization_user_id
           WHERE ou.organization_id = v_org_a AND ou.user_id = 'user-org-admin'
             AND our.role_id = 'role-admin') <> 1 THEN
        RAISE EXCEPTION 'Default Org Admin bootstrap is incorrect or duplicated';
    END IF;

    -- Force a failure after create_organization has run; the exception block's
    -- subtransaction must leave no partial organization or owner records.
    UPDATE memginedev.role SET role_status_id = 'entity-status-role-retired'
    WHERE role_id = 'role-owner';
    BEGIN
        PERFORM * FROM memginedev.onboard_organization(
            jsonb_build_object(
                'id', v_failed_org, 'code', 'RBAC-F-' || upper(v_suffix),
                'name', 'RBAC Failed Onboarding', 'organizationTypeId', v_org_type,
                'organizationStatusId', 'status-active',
                'primaryEmail', 'failed-' || v_suffix || '@example.test',
                'primaryPhone', jsonb_build_object('countryId', 'country-ca', 'callingCode', '+1', 'number', '4165550198')
            ),
            jsonb_build_object(
                'id', 'rbac-details-f-' || v_suffix, 'organizationId', v_failed_org,
                'supportPhone', jsonb_build_object('countryId', '', 'callingCode', '', 'number', ''),
                'address', jsonb_build_object('line1', '', 'line2', '', 'city', '', 'region', '', 'postalCode', '', 'countryCode', '')
            ),
            jsonb_build_object(
                'id', 'rbac-brand-f-' || v_suffix, 'organizationId', v_failed_org,
                'brandingName', 'Failed', 'themeTemplateId', 'template-cafe',
                'brandingStatusId', 'entity-status-branding-active'
            ),
            jsonb_build_object(
                'firstName', 'Failed',
                'phone', jsonb_build_object('countryId', 'country-ca', 'callingCode', '+1', 'number', '4165550197')
            ),
            'user-platform-admin'
        );
    EXCEPTION WHEN OTHERS THEN
        v_failed := true;
    END;
    UPDATE memginedev.role SET role_status_id = 'entity-status-role-active'
    WHERE role_id = 'role-owner';
    IF NOT v_failed OR EXISTS (
        SELECT 1 FROM memginedev.organization WHERE organization_id = v_failed_org
    ) THEN
        RAISE EXCEPTION 'Failed atomic onboarding left a partial organization';
    END IF;
END;
$onboarding_test$;
ROLLBACK;
