-- MVP RBAC. All schema and reference-data operations are rerunnable.
ALTER TABLE "${schemaName}".organization_user_roles
    ADD COLUMN IF NOT EXISTS effective_from timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS effective_to timestamp without time zone,
    ADD COLUMN IF NOT EXISTS assignment_reason varchar(500);

ALTER TABLE "${schemaName}".platform_user_role
    ADD COLUMN IF NOT EXISTS effective_from timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS effective_to timestamp without time zone,
    ADD COLUMN IF NOT EXISTS assignment_reason varchar(500);

DO $ddl$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_org_user_role_effective_range' AND conrelid = '"${schemaName}".organization_user_roles'::regclass) THEN
        ALTER TABLE "${schemaName}".organization_user_roles ADD CONSTRAINT ck_org_user_role_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_platform_user_role_effective_range' AND conrelid = '"${schemaName}".platform_user_role'::regclass) THEN
        ALTER TABLE "${schemaName}".platform_user_role ADD CONSTRAINT ck_platform_user_role_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from);
    END IF;
END;
$ddl$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_user_role_user_role
    ON "${schemaName}".platform_user_role (user_id, role_id);
CREATE INDEX IF NOT EXISTS ix_org_user_role_effective
    ON "${schemaName}".organization_user_roles (organization_user_id, assignment_status_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS ix_platform_user_role_effective
    ON "${schemaName}".platform_user_role (user_id, status_id, effective_from, effective_to);
CREATE UNIQUE INDEX IF NOT EXISTS ux_role_privileges_pair
    ON "${schemaName}".role_privileges (role_id, privilege_id);

UPDATE "${schemaName}".role SET role_code = 'BUSINESS_OWNER', role_name = 'Business Owner',
    description = 'Business owner with organization administration, counter access and future owner approval authority.'
WHERE role_id = 'role-owner' AND (role_code, role_name, description) IS DISTINCT FROM
    ('BUSINESS_OWNER', 'Business Owner', 'Business owner with organization administration, counter access and future owner approval authority.');
UPDATE "${schemaName}".role SET role_code = 'ORG_ADMIN', role_name = 'Organization Administrator',
    description = 'Administrator for an organization.'
WHERE role_id = 'role-admin' AND (role_code, role_name, description) IS DISTINCT FROM
    ('ORG_ADMIN', 'Organization Administrator', 'Administrator for an organization.');

-- Preserve referenced MANAGER rows and foreign keys for review; the retired role
-- confers no MVP capability. Existing staff must be explicitly reassigned later.
UPDATE "${schemaName}".role SET role_status_id = 'entity-status-role-retired'
WHERE role_id = 'role-manager' AND role_status_id <> 'entity-status-role-retired';

-- Existing staff.role_id was the UI's single role field. Seed only unambiguous
-- active staff assignments; never overwrite explicit assignments or infer MANAGER.

INSERT INTO "${schemaName}".organization_user_types
(
    organization_user_type_id,
    organization_user_type_code,
    organization_user_type_name,
    description,
    display_order,
    is_active
)
VALUES
(
    'organization-user-type-owner',
    'OWNER',
    'Owner',
    'Organization owner',
    5,
    TRUE
)
ON CONFLICT (organization_user_type_id) DO UPDATE
SET
    organization_user_type_code = EXCLUDED.organization_user_type_code,
    organization_user_type_name = EXCLUDED.organization_user_type_name,
    description = EXCLUDED.description,
    is_active = TRUE;


INSERT INTO "${schemaName}".organization_user_roles
    (organization_user_role_id, organization_user_id, role_id, assignment_status_id,
     effective_from, created_at, created_by, updated_at, updated_by)
SELECT 'our-staff-' || left(md5(s.organization_user_id || ':' || s.role_id), 25),
       s.organization_user_id, s.role_id, 'entity-status-org-user-role-active',
       s.created_at, CURRENT_TIMESTAMP, s.created_by, CURRENT_TIMESTAMP, s.updated_by
FROM "${schemaName}".staff s
JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
WHERE s.role_id IN ('role-owner','role-admin','role-staff')
  AND s.staff_status_id = 'entity-status-staff-active' AND NOT s.is_deleted
  AND ou.organization_id = s.organization_id AND NOT ou.is_deleted
  AND ou.organization_user_status_id = 'entity-status-org-user-active'
ON CONFLICT (organization_user_id, role_id) DO NOTHING;

INSERT INTO "${schemaName}".privileges (privilege_id, privilege_code, privilege_name, description, privilege_status_id)
VALUES
('privilege-platform-admin-access', 'PLATFORM_ADMIN_ACCESS', 'Platform Admin Access', 'Access to Memgine Platform Admin functionality.', 'entity-status-privilege-active'),
('privilege-business-owner-access', 'BUSINESS_OWNER_ACCESS', 'Business Owner Access', 'Business-owner-level organization authority and foundation for future owner-only approval operations.', 'entity-status-privilege-active'),
('privilege-org-admin-access', 'ORG_ADMIN_ACCESS', 'Organization Admin Access', 'Access to Org Admin functionality for the applicable organization.', 'entity-status-privilege-active'),
('privilege-counter-access', 'COUNTER_ACCESS', 'Counter Access', 'Access to Counter functionality for the applicable organization.', 'entity-status-privilege-active'),
('privilege-customer-access', 'CUSTOMER_ACCESS', 'Customer Access', 'Access to Customer functionality for the applicable organization.', 'entity-status-privilege-active')
ON CONFLICT (privilege_id) DO UPDATE SET privilege_code = EXCLUDED.privilege_code,
    privilege_name = EXCLUDED.privilege_name, description = EXCLUDED.description,
    privilege_status_id = EXCLUDED.privilege_status_id;

UPDATE "${schemaName}".privileges SET privilege_status_id = 'entity-status-privilege-retired'
WHERE privilege_code IN ('APPROVE','CONFIGURE','CREATE','DELETE','EXPORT','REJECT','UPDATE','VIEW')
  AND privilege_status_id <> 'entity-status-privilege-retired';

INSERT INTO "${schemaName}".role_privileges (role_privilege_id, role_id, privilege_id)
VALUES
('rp-platform-admin-access', 'role-platform-admin', 'privilege-platform-admin-access'),
('rp-owner-owner-access', 'role-owner', 'privilege-business-owner-access'),
('rp-owner-org-admin-access', 'role-owner', 'privilege-org-admin-access'),
('rp-owner-counter-access', 'role-owner', 'privilege-counter-access'),
('rp-admin-org-admin-access', 'role-admin', 'privilege-org-admin-access'),
('rp-admin-counter-access', 'role-admin', 'privilege-counter-access'),
('rp-staff-counter-access', 'role-staff', 'privilege-counter-access'),
('rp-customer-customer-access', 'role-customer', 'privilege-customer-access')
ON CONFLICT (role_id, privilege_id) DO NOTHING;

-- Authorization-neutral assignment primitive used only by guarded business
-- functions and triggers. Runtime roles receive EXECUTE on those guarded
-- callers, never on this helper directly.
CREATE OR REPLACE FUNCTION "${schemaName}".rbac_ensure_organization_base_role(
    p_organization_user_id varchar, p_role_id varchar, p_actor_user_id varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_assignment_id varchar(64);
BEGIN
    IF p_role_id NOT IN ('role-owner','role-admin','role-staff','role-customer')
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}".role r
           WHERE r.role_id = p_role_id
             AND r.role_status_id = 'entity-status-role-active'
       ) THEN
        RAISE EXCEPTION 'Active base role is unavailable' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization_user ou
        WHERE ou.organization_user_id = p_organization_user_id
          AND ou.organization_user_status_id = 'entity-status-org-user-active'
          AND NOT ou.is_deleted
    ) THEN
        RAISE EXCEPTION 'Active organization user not found' USING ERRCODE = 'P0002';
    END IF;

    v_assignment_id := 'our-' || left(md5(p_organization_user_id || ':' || p_role_id), 32);
    INSERT INTO "${schemaName}".organization_user_roles
        (organization_user_role_id, organization_user_id, role_id,
         assignment_status_id, effective_from, effective_to,
         assignment_reason, created_by, updated_by)
    VALUES (v_assignment_id, p_organization_user_id, p_role_id,
            'entity-status-org-user-role-active', CURRENT_TIMESTAMP, NULL,
            'Base role assigned by business onboarding', p_actor_user_id, p_actor_user_id)
    ON CONFLICT (organization_user_id, role_id) DO UPDATE SET
        assignment_status_id = 'entity-status-org-user-role-active',
        effective_from = CURRENT_TIMESTAMP, effective_to = NULL,
        assignment_reason = EXCLUDED.assignment_reason,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        is_deleted = FALSE,
        version_no = "${schemaName}".organization_user_roles.version_no + 1
    RETURNING organization_user_role_id INTO v_assignment_id;
    RETURN v_assignment_id;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_ensure_organization_base_role(varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_ensure_organization_base_role(varchar, varchar, varchar) FROM "${appRole}";

-- Preserve the existing organization-user contract while routing any requested
-- base role through the shared assignment primitive. The legacy function still
-- owns user/link validation and authorization.
CREATE OR REPLACE FUNCTION "${schemaName}".upsert_organization_user_with_base_role(
    p_organization_id varchar, p_payload jsonb, p_actor_user_id varchar
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
    v_result jsonb;
    v_ou_id varchar(64);
    v_role_id varchar(64) := NULLIF(p_payload->>'roleId', '');
BEGIN
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
        FROM jsonb_array_elements("${schemaName}".get_organization_users(p_organization_id)) elem
        WHERE elem->>'organizationUserId' = v_ou_id LIMIT 1;
    END IF;
    RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".upsert_organization_user_with_base_role(varchar, jsonb, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".upsert_organization_user_with_base_role(varchar, jsonb, varchar) TO "${appRole}";

-- Customer relationships are created by Org Admin/Counter and self-service
-- purchase functions. The trigger covers new links and genuine reactivation
-- transitions without restoring a deliberately revoked role on unrelated edits.
CREATE OR REPLACE FUNCTION "${schemaName}".rbac_customer_base_role_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    IF NEW.is_deleted = FALSE AND NEW.organization_user_status_id = 'entity-status-org-user-active'
       AND EXISTS (SELECT 1 FROM "${schemaName}".organization_user_types t
                   WHERE t.organization_user_type_id = NEW.organization_user_type_id
                     AND t.organization_user_type_code = 'CUSTOMER')
       AND (TG_OP = 'INSERT' OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
            OR OLD.organization_user_status_id IS DISTINCT FROM NEW.organization_user_status_id
            OR OLD.organization_user_type_id IS DISTINCT FROM NEW.organization_user_type_id) THEN
        PERFORM "${schemaName}".rbac_ensure_organization_base_role(
            NEW.organization_user_id, 'role-customer', NEW.updated_by
        );
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rbac_customer_base_role ON "${schemaName}".organization_user;
DROP FUNCTION IF EXISTS "${schemaName}".rbac_customer_base_role_on_insert();
CREATE TRIGGER trg_rbac_customer_base_role
AFTER INSERT OR UPDATE OF is_deleted, organization_user_status_id, organization_user_type_id
ON "${schemaName}".organization_user
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".rbac_customer_base_role_on_change();
REVOKE ALL ON FUNCTION "${schemaName}".rbac_customer_base_role_on_change() FROM PUBLIC;

-- Existing active customer relationships receive the same unambiguous base role.
INSERT INTO "${schemaName}".organization_user_roles
    (organization_user_role_id, organization_user_id, role_id, assignment_status_id,
     effective_from, created_by, updated_by)
SELECT 'our-customer-' || left(md5(ou.organization_user_id), 25),
       ou.organization_user_id, 'role-customer',
       'entity-status-org-user-role-active', CURRENT_TIMESTAMP, ou.created_by, ou.updated_by
FROM "${schemaName}".organization_user ou
JOIN "${schemaName}".organization_user_types t
  ON t.organization_user_type_id = ou.organization_user_type_id
WHERE t.organization_user_type_code = 'CUSTOMER'
  AND ou.organization_user_status_id = 'entity-status-org-user-active'
  AND NOT ou.is_deleted
ON CONFLICT (organization_user_id, role_id) DO NOTHING;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_effective_roles(p_user_id varchar, p_organization_id varchar DEFAULT NULL)
RETURNS TABLE (role_id varchar, role_code varchar, organization_id varchar)
LANGUAGE sql STABLE AS $function$
    SELECT r.role_id, r.role_code, NULL::varchar
    FROM "${schemaName}".platform_user_role pur
    JOIN "${schemaName}".role r ON r.role_id = pur.role_id
    JOIN "${schemaName}"."user" u ON u.user_id = pur.user_id
    WHERE p_organization_id IS NULL AND pur.user_id = p_user_id
      AND u.is_deleted = FALSE AND u.user_status_id = 'entity-status-user-active'
      AND pur.is_deleted = FALSE AND pur.status_id = 'entity-status-platfrm-user-role-active'
      AND pur.effective_from <= CURRENT_TIMESTAMP AND (pur.effective_to IS NULL OR pur.effective_to > CURRENT_TIMESTAMP)
      AND r.role_id = 'role-platform-admin' AND r.role_status_id = 'entity-status-role-active'
    UNION ALL
    SELECT r.role_id, r.role_code, ou.organization_id
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}".organization o ON o.organization_id = ou.organization_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".organization_user_roles our ON our.organization_user_id = ou.organization_user_id
    JOIN "${schemaName}".role r ON r.role_id = our.role_id
    WHERE ou.user_id = p_user_id AND (p_organization_id IS NULL OR ou.organization_id = p_organization_id)
      AND o.is_deleted = FALSE AND o.organization_status_id = 'entity-status-org-active'
      AND u.is_deleted = FALSE AND u.user_status_id = 'entity-status-user-active'
      AND ou.is_deleted = FALSE AND ou.organization_user_status_id = 'entity-status-org-user-active'
      AND our.is_deleted = FALSE AND our.assignment_status_id = 'entity-status-org-user-role-active'
      AND our.effective_from <= CURRENT_TIMESTAMP AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
      AND r.role_id IN ('role-owner','role-admin','role-staff','role-customer')
      AND r.role_status_id = 'entity-status-role-active';
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_effective_capabilities(p_user_id varchar, p_organization_id varchar DEFAULT NULL)
RETURNS TABLE (capability_code varchar, organization_id varchar)
LANGUAGE sql STABLE AS $function$
    SELECT DISTINCT p.privilege_code, er.organization_id
    FROM "${schemaName}".rbac_effective_roles(p_user_id, p_organization_id) er
    JOIN "${schemaName}".role_privileges rp ON rp.role_id = er.role_id
    JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
    WHERE p.privilege_status_id = 'entity-status-privilege-active'
      AND p.privilege_code IN ('PLATFORM_ADMIN_ACCESS','BUSINESS_OWNER_ACCESS','ORG_ADMIN_ACCESS','COUNTER_ACCESS','CUSTOMER_ACCESS');
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_has_capability(p_user_id varchar, p_organization_id varchar, p_capability_code varchar)
RETURNS boolean LANGUAGE sql STABLE AS $function$
    SELECT EXISTS (
        SELECT 1 FROM "${schemaName}".rbac_effective_capabilities(p_user_id, p_organization_id) c
        WHERE c.capability_code = p_capability_code
          AND ((p_organization_id IS NULL AND p_capability_code = 'PLATFORM_ADMIN_ACCESS' AND c.organization_id IS NULL)
            OR (p_organization_id IS NOT NULL AND c.organization_id = p_organization_id))
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_ensure_staff_base_role(
    p_organization_id varchar, p_staff_id varchar, p_actor_user_id varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_ou_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Staff creation is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT s.organization_user_id INTO v_ou_id
    FROM "${schemaName}".staff s
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    WHERE s.staff_id = p_staff_id AND s.organization_id = p_organization_id
      AND ou.organization_id = p_organization_id AND NOT ou.is_deleted
      AND ou.organization_user_status_id = 'entity-status-org-user-active'
      AND s.staff_status_id = 'entity-status-staff-active' AND NOT s.is_deleted;
    IF v_ou_id IS NULL THEN
        RAISE EXCEPTION 'Active staff relationship not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN "${schemaName}".rbac_ensure_organization_base_role(
        v_ou_id, 'role-staff', p_actor_user_id
    );
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_ensure_staff_base_role(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".rbac_ensure_staff_base_role(varchar, varchar, varchar) TO "${appRole}";

-- Existing Org Admin and Counter functions retain this compatibility guard.
-- Its decision now uses the same effective capability chain as new RBAC APIs.
CREATE OR REPLACE FUNCTION "${schemaName}".can_administer_organization(p_organization_id varchar, p_user_id varchar)
RETURNS boolean LANGUAGE sql STABLE AS $function$
    SELECT "${schemaName}".rbac_has_capability(p_user_id, p_organization_id, 'ORG_ADMIN_ACCESS');
$function$;

-- Counter keeps its existing store/staff context checks. Its actor now needs
-- the effective Counter capability, including a direct STAFF assignment.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_can_operate(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE sql STABLE AS $function$
    SELECT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'COUNTER_ACCESS')
       AND EXISTS (
           SELECT 1 FROM "${schemaName}".stores store
           JOIN "${schemaName}".entity_status es ON es.entity_status_id = store.store_status_id
           JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
           WHERE store.store_id = p_store_id AND store.organization_id = p_organization_id
             AND store.is_deleted = false AND st.status_code = 'ACTIVE'
       ) AND EXISTS (
           SELECT 1 FROM "${schemaName}".staff staff
           JOIN "${schemaName}".entity_status es ON es.entity_status_id = staff.staff_status_id
           JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
           WHERE staff.staff_id = p_staff_id AND staff.organization_id = p_organization_id
             AND staff.is_deleted = false AND st.status_code = 'ACTIVE'
             AND ("${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS')
                  OR EXISTS (
                      SELECT 1 FROM "${schemaName}".organization_user actor_link
                      WHERE actor_link.organization_user_id = staff.organization_user_id
                        AND actor_link.user_id = p_actor_user_id
                        AND actor_link.organization_id = p_organization_id
                        AND actor_link.organization_user_status_id = 'entity-status-org-user-active'
                        AND NOT actor_link.is_deleted
                  ))
             AND (staff.store_id = p_store_id OR EXISTS (
                 SELECT 1 FROM "${schemaName}".staff_store_assignment assignment
                 JOIN "${schemaName}".entity_status aes ON aes.entity_status_id = assignment.status_id
                 JOIN "${schemaName}".statuses ast ON ast.status_id = aes.status_id
                 WHERE assignment.staff_id = staff.staff_id AND assignment.store_id = p_store_id
                   AND assignment.is_deleted = false AND ast.status_code = 'ACTIVE'
                   AND assignment.effective_date <= CURRENT_DATE
                   AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
             ))
       );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_assign_organization_role(
    p_organization_id varchar, p_user_id varchar, p_role_code varchar,
    p_effective_from timestamp without time zone, p_effective_to timestamp without time zone,
    p_assignment_reason varchar, p_actor_user_id varchar
)
RETURNS varchar LANGUAGE plpgsql AS $function$
DECLARE v_ou_id varchar(64); v_role_id varchar(64); v_assignment_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization role assignment is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT role_id INTO v_role_id FROM "${schemaName}".role
    WHERE role_code = p_role_code AND role_id IN ('role-owner','role-admin','role-staff','role-customer')
      AND role_status_id = 'entity-status-role-active';
    IF v_role_id IS NULL THEN RAISE EXCEPTION 'Invalid organization role' USING ERRCODE = '22023'; END IF;
    IF v_role_id = 'role-owner' AND NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS') THEN
        RAISE EXCEPTION 'Owner role assignment is not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_effective_to IS NOT NULL AND p_effective_to <= COALESCE(p_effective_from, CURRENT_TIMESTAMP) THEN
        RAISE EXCEPTION 'Effective end must be after effective start' USING ERRCODE = '22023';
    END IF;
    SELECT ou.organization_user_id INTO v_ou_id
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    WHERE ou.organization_id = p_organization_id AND ou.user_id = p_user_id
      AND ou.is_deleted = FALSE AND ou.organization_user_status_id = 'entity-status-org-user-active'
      AND u.is_deleted = FALSE AND u.user_status_id = 'entity-status-user-active'
    ORDER BY ou.organization_user_id LIMIT 1;
    IF v_ou_id IS NULL THEN RAISE EXCEPTION 'Active organization user not found' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO "${schemaName}".organization_user_roles
        (organization_user_role_id, organization_user_id, role_id, assignment_status_id,
         effective_from, effective_to, assignment_reason, created_by, updated_by)
    VALUES ('our-' || left(md5(v_ou_id || ':' || v_role_id), 32), v_ou_id, v_role_id,
        'entity-status-org-user-role-active', COALESCE(p_effective_from, CURRENT_TIMESTAMP),
        p_effective_to, p_assignment_reason, p_actor_user_id, p_actor_user_id)
    ON CONFLICT (organization_user_id, role_id) DO UPDATE SET
        assignment_status_id = 'entity-status-org-user-role-active',
        effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
        assignment_reason = EXCLUDED.assignment_reason, updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, is_deleted = FALSE,
        version_no = organization_user_roles.version_no + 1
    RETURNING organization_user_role_id INTO v_assignment_id;
    RETURN v_assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_revoke_organization_role(
    p_organization_id varchar, p_assignment_id varchar, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE v_role_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Organization role revocation is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT our.role_id INTO v_role_id FROM "${schemaName}".organization_user_roles our
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = our.organization_user_id
    WHERE our.organization_user_role_id = p_assignment_id AND ou.organization_id = p_organization_id
      AND our.is_deleted = FALSE;
    IF v_role_id IS NULL THEN RETURN FALSE; END IF;
    IF v_role_id = 'role-owner' AND NOT "${schemaName}".rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS') THEN
        RAISE EXCEPTION 'Owner role revocation is not permitted' USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".organization_user_roles SET
        assignment_status_id = 'entity-status-org-user-role-revoked',
        effective_to = CASE WHEN effective_from < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
    WHERE organization_user_role_id = p_assignment_id;
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_assign_platform_role(
    p_user_id varchar, p_effective_from timestamp without time zone,
    p_effective_to timestamp without time zone, p_assignment_reason varchar, p_actor_user_id varchar
)
RETURNS varchar LANGUAGE plpgsql AS $function$
DECLARE v_assignment_id varchar(64);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform role assignment is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}"."user" WHERE user_id = p_user_id AND NOT is_deleted AND user_status_id = 'entity-status-user-active') THEN
        RAISE EXCEPTION 'Active user not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_effective_to IS NOT NULL AND p_effective_to <= COALESCE(p_effective_from, CURRENT_TIMESTAMP) THEN
        RAISE EXCEPTION 'Effective end must be after effective start' USING ERRCODE = '22023';
    END IF;
    INSERT INTO "${schemaName}".platform_user_role
        (platform_user_role_id, user_id, role_id, status_id, effective_from, effective_to,
         assignment_reason, created_at, created_by, updated_at, updated_by)
    VALUES ('pur-' || left(md5(p_user_id || ':role-platform-admin'), 32), p_user_id,
        'role-platform-admin', 'entity-status-platfrm-user-role-active',
        COALESCE(p_effective_from, CURRENT_TIMESTAMP), p_effective_to, p_assignment_reason,
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id)
    ON CONFLICT (user_id, role_id) DO UPDATE SET
        status_id = 'entity-status-platfrm-user-role-active', effective_from = EXCLUDED.effective_from,
        effective_to = EXCLUDED.effective_to, assignment_reason = EXCLUDED.assignment_reason,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        is_deleted = FALSE, version_no = platform_user_role.version_no + 1
    RETURNING platform_user_role_id INTO v_assignment_id;
    RETURN v_assignment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_revoke_platform_role(p_assignment_id varchar, p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform role revocation is not permitted' USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".platform_user_role SET
        status_id = 'entity-status-platfrm-user-role-revoked',
        effective_to = CASE WHEN effective_from < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
    WHERE platform_user_role_id = p_assignment_id AND role_id = 'role-platform-admin' AND NOT is_deleted;
    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_roles()
RETURNS TABLE (role_id varchar, role_code varchar, role_name varchar, description varchar)
LANGUAGE sql STABLE AS $function$
    SELECT r.role_id, r.role_code, r.role_name, r.description FROM "${schemaName}".role r
    WHERE r.role_status_id = 'entity-status-role-active'
      AND r.role_id IN ('role-platform-admin','role-owner','role-admin','role-staff','role-customer')
    ORDER BY r.role_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_capabilities()
RETURNS TABLE (capability_code varchar, capability_name varchar, description varchar)
LANGUAGE sql STABLE AS $function$
    SELECT p.privilege_code, p.privilege_name, p.description FROM "${schemaName}".privileges p
    WHERE p.privilege_status_id = 'entity-status-privilege-active'
      AND p.privilege_code IN ('PLATFORM_ADMIN_ACCESS','BUSINESS_OWNER_ACCESS','ORG_ADMIN_ACCESS','COUNTER_ACCESS','CUSTOMER_ACCESS')
    ORDER BY p.privilege_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".rbac_user_assignments(p_user_id varchar)
RETURNS TABLE (assignment_id varchar, organization_id varchar, role_code varchar,
    assignment_status_id varchar, effective_from timestamp without time zone,
    effective_to timestamp without time zone, assignment_reason varchar)
LANGUAGE sql STABLE AS $function$
    SELECT pur.platform_user_role_id, NULL::varchar, r.role_code, pur.status_id,
        pur.effective_from, pur.effective_to, pur.assignment_reason
    FROM "${schemaName}".platform_user_role pur
    JOIN "${schemaName}".role r ON r.role_id = pur.role_id
    WHERE pur.user_id = p_user_id AND NOT pur.is_deleted
    UNION ALL
    SELECT our.organization_user_role_id, ou.organization_id, r.role_code,
        our.assignment_status_id, our.effective_from, our.effective_to, our.assignment_reason
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}".organization_user_roles our ON our.organization_user_id = ou.organization_user_id
    JOIN "${schemaName}".role r ON r.role_id = our.role_id
    WHERE ou.user_id = p_user_id AND NOT ou.is_deleted AND NOT our.is_deleted;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".rbac_effective_roles(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_effective_capabilities(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_has_capability(varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_assign_organization_role(varchar, varchar, varchar, timestamp without time zone, timestamp without time zone, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_revoke_organization_role(varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_assign_platform_role(varchar, timestamp without time zone, timestamp without time zone, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_revoke_platform_role(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_capabilities() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".rbac_user_assignments(varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".rbac_effective_roles(varchar, varchar),
    "${schemaName}".rbac_effective_capabilities(varchar, varchar),
    "${schemaName}".rbac_has_capability(varchar, varchar, varchar),
    "${schemaName}".rbac_assign_organization_role(varchar, varchar, varchar, timestamp without time zone, timestamp without time zone, varchar, varchar),
    "${schemaName}".rbac_revoke_organization_role(varchar, varchar, varchar),
    "${schemaName}".rbac_assign_platform_role(varchar, timestamp without time zone, timestamp without time zone, varchar, varchar),
    "${schemaName}".rbac_revoke_platform_role(varchar, varchar),
    "${schemaName}".rbac_roles(), "${schemaName}".rbac_capabilities(),
    "${schemaName}".rbac_user_assignments(varchar)
TO "${appRole}";

-- The earlier bootstrap function inserts role-admin with the old ADMIN code.
-- Replace it here, preserving its public contract and existing organization setup.
CREATE OR REPLACE FUNCTION "${schemaName}".ensure_default_organization_admin(p_organization_id varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_actor varchar(64) := 'user-platform-admin'; v_ou varchar(64);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization
                   WHERE organization_id = p_organization_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".role WHERE role_id = 'role-admin'
                   AND role_code = 'ORG_ADMIN' AND role_status_id = 'entity-status-role-active') THEN
        RAISE EXCEPTION 'Organization administrator role is unavailable' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO "${schemaName}"."user"
        (user_id, user_code, first_name, last_name, display_name, primary_phone,
         preferred_language_id, user_status_id, created_by, updated_by)
    VALUES ('user-org-admin', 'ORG-ADMIN-DEV', 'Organization', 'Admin', 'Organization Admin',
            '+14165550199', 'language-en', 'entity-status-user-active', v_actor, v_actor)
    ON CONFLICT (user_code) DO UPDATE SET
        user_status_id = EXCLUDED.user_status_id, updated_at = CURRENT_TIMESTAMP,
        updated_by = v_actor, is_deleted = FALSE;
    SELECT organization_user_id INTO v_ou
    FROM "${schemaName}".organization_user
    WHERE organization_id = p_organization_id AND user_id = 'user-org-admin'
      AND organization_user_type_id = 'organization-user-type-admin'
    ORDER BY is_deleted, organization_user_id LIMIT 1 FOR UPDATE;
    IF v_ou IS NULL THEN
        v_ou := 'org-user-default-admin-' || left(md5(p_organization_id), 12);
        INSERT INTO "${schemaName}".organization_user
            (organization_user_id, organization_id, user_id, organization_user_type_id,
             organization_user_status_id, joining_date, created_by, updated_by)
        VALUES (v_ou, p_organization_id, 'user-org-admin',
                'organization-user-type-admin', 'entity-status-org-user-active',
                CURRENT_DATE, v_actor, v_actor);
    ELSE
        UPDATE "${schemaName}".organization_user
        SET organization_user_status_id = 'entity-status-org-user-active',
            updated_at = CURRENT_TIMESTAMP, updated_by = v_actor,
            is_deleted = FALSE, version_no = version_no + 1
        WHERE organization_user_id = v_ou
          AND (is_deleted OR organization_user_status_id <> 'entity-status-org-user-active');
    END IF;
    PERFORM "${schemaName}".rbac_ensure_organization_base_role(v_ou, 'role-admin', v_actor);
    RETURN (SELECT elem FROM jsonb_array_elements("${schemaName}".get_organization_users(p_organization_id)) elem
            WHERE elem->>'organizationUserId' = v_ou LIMIT 1);
END;
$function$;

-- Platform onboarding wrapper. create_organization remains the authoritative
-- aggregate write; the owner identity/link/base-role work participates in the
-- same PostgreSQL transaction and therefore rolls back with it on any failure.
CREATE OR REPLACE FUNCTION "${schemaName}".onboard_organization(
    p_organization jsonb, p_details jsonb, p_branding jsonb,
    p_owner jsonb, p_actor_user_id varchar
) RETURNS TABLE (
    organization_id varchar, organization_details_id varchar,
    organization_branding_id varchar, owner_user_id varchar,
    owner_organization_user_id varchar, owner_role_assignment_id varchar
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
    v_organization_id varchar(64);
    v_details_id varchar(64);
    v_branding_id varchar(64);
    v_owner_user_id varchar(64);
    v_owner_ou_id varchar(64);
    v_owner_assignment_id varchar(64);
    v_owner_type_id varchar(64);
    v_owner_first_name varchar(100) := NULLIF(trim(p_owner->>'firstName'), '');
    v_owner_last_name varchar(100) := NULLIF(trim(p_owner->>'lastName'), '');
    v_owner_email varchar(254) := NULLIF(lower(trim(p_owner->>'email')), '');
    v_owner_phone varchar(20) := regexp_replace(
        COALESCE(trim(p_owner#>>'{phone,callingCode}'), '') ||
        COALESCE(trim(p_owner#>>'{phone,number}'), ''), '\s+', '', 'g'
    );
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Platform organization onboarding is not permitted'
            USING ERRCODE = '42501';
    END IF;
    IF v_owner_first_name IS NULL OR length(v_owner_first_name) > 100
       OR length(COALESCE(v_owner_last_name, '')) > 100
       OR NULLIF(v_owner_phone, '') IS NULL OR length(v_owner_phone) > 20
       OR (v_owner_email IS NOT NULL AND
           (length(v_owner_email) > 254 OR v_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) THEN
        RAISE EXCEPTION 'Invalid Business Owner identity fields' USING ERRCODE = '22023';
    END IF;

    SELECT created.organization_id, created.organization_details_id,
           created.organization_branding_id
      INTO STRICT v_organization_id, v_details_id, v_branding_id
      FROM "${schemaName}".create_organization(
          p_organization, p_details, p_branding, p_actor_user_id
      ) created;

    SELECT organization_user_type_id INTO STRICT v_owner_type_id
    FROM "${schemaName}".organization_user_types
    WHERE organization_user_type_code = 'OWNER' AND is_active = TRUE;

    -- Serialize identity resolution for this unique phone. Reused users keep
    -- their existing names and email; only lifecycle fields are reactivated.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_owner_phone, 0));
    SELECT u.user_id INTO v_owner_user_id
    FROM "${schemaName}"."user" u
    WHERE u.primary_phone = v_owner_phone
    ORDER BY u.is_deleted, u.user_id LIMIT 1 FOR UPDATE;

    IF v_owner_user_id IS NULL THEN
        v_owner_user_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}"."user" (
            user_id, user_code, first_name, last_name, display_name,
            primary_email, primary_phone, preferred_language_id,
            user_status_id, created_by, updated_by
        ) VALUES (
            v_owner_user_id,
            'USR-' || left(replace(v_owner_user_id, '-', ''), 26),
            v_owner_first_name, v_owner_last_name,
            concat_ws(' ', v_owner_first_name, v_owner_last_name),
            v_owner_email, v_owner_phone, 'language-en',
            'entity-status-user-active', p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}"."user"
        SET user_status_id = 'entity-status-user-active', is_deleted = FALSE,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE user_id = v_owner_user_id
          AND (is_deleted OR user_status_id <> 'entity-status-user-active');
    END IF;

    SELECT ou.organization_user_id INTO v_owner_ou_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = v_organization_id
      AND ou.user_id = v_owner_user_id
      AND ou.organization_user_type_id = v_owner_type_id
    ORDER BY ou.is_deleted, ou.organization_user_id LIMIT 1 FOR UPDATE;

    IF v_owner_ou_id IS NULL THEN
        v_owner_ou_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id,
            joining_date, created_by, updated_by
        ) VALUES (
            v_owner_ou_id, v_organization_id, v_owner_user_id,
            v_owner_type_id, 'entity-status-org-user-active', CURRENT_DATE,
            p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user
        SET organization_user_status_id = 'entity-status-org-user-active',
            is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE organization_user_id = v_owner_ou_id
          AND (is_deleted OR organization_user_status_id <> 'entity-status-org-user-active');
    END IF;

    v_owner_assignment_id := "${schemaName}".rbac_ensure_organization_base_role(
        v_owner_ou_id, 'role-owner', p_actor_user_id
    );
    RETURN QUERY SELECT v_organization_id, v_details_id, v_branding_id,
        v_owner_user_id, v_owner_ou_id, v_owner_assignment_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".onboard_organization(jsonb, jsonb, jsonb, jsonb, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".onboard_organization(jsonb, jsonb, jsonb, jsonb, varchar) TO "${appRole}";