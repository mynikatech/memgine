CREATE TABLE IF NOT EXISTS "${schemaName}".pos_devices (
    pos_device_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    device_name varchar(150) NOT NULL,
    device_token_hash char(64) NOT NULL UNIQUE,
    last_seen_at timestamp without time zone,
    revoked_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL, updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL, is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS "${schemaName}".staff_pin_credentials (
    staff_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".staff(staff_id),
    pin_hash varchar(255) NOT NULL, failed_attempt_count integer NOT NULL DEFAULT 0,
    locked_until timestamp without time zone, pin_changed_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by varchar(64) NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by varchar(64) NOT NULL,
    version_no integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS "${schemaName}".pos_session_context (
    session_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".authentication_sessions(session_id),
    pos_device_id varchar(64) NOT NULL REFERENCES "${schemaName}".pos_devices(pos_device_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    staff_id varchar(64) NOT NULL REFERENCES "${schemaName}".staff(staff_id),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_pos_devices_org_store ON "${schemaName}".pos_devices(organization_id, store_id);

CREATE OR REPLACE FUNCTION "${schemaName}".pos_register_device(p_device_id varchar,p_organization_id varchar,p_store_id varchar,p_device_name varchar,p_token_hash varchar,p_actor_user_id varchar)
RETURNS TABLE("deviceId" varchar,"organizationId" varchar,"storeId" varchar,"deviceName" varchar,"revokedAt" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
 IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'POS device administration is not permitted' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM stores s JOIN entity_status es ON es.entity_status_id=s.store_status_id JOIN statuses st ON st.status_id=es.status_id WHERE s.store_id=p_store_id AND s.organization_id=p_organization_id AND NOT s.is_deleted AND st.status_code='ACTIVE') THEN RAISE EXCEPTION 'Store is unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO pos_devices(pos_device_id,organization_id,store_id,device_name,device_token_hash,created_by,updated_by) VALUES(p_device_id,p_organization_id,p_store_id,trim(p_device_name),p_token_hash,p_actor_user_id,p_actor_user_id);
 RETURN QUERY SELECT p_device_id,p_organization_id,p_store_id,trim(p_device_name),NULL::text;
END;$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_list_devices(p_organization_id varchar,p_actor_user_id varchar)
RETURNS TABLE("deviceId" varchar,"organizationId" varchar,"storeId" varchar,"storeName" varchar,"deviceName" varchar,"revokedAt" text,"lastSeenAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
 SELECT d.pos_device_id,d.organization_id,d.store_id,s.store_name,d.device_name,d.revoked_at::text,d.last_seen_at::text FROM "${schemaName}".pos_devices d JOIN "${schemaName}".stores s ON s.store_id=d.store_id WHERE d.organization_id=p_organization_id AND NOT d.is_deleted AND "${schemaName}".rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') ORDER BY d.created_at DESC;$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_revoke_device(p_organization_id varchar,p_device_id varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
 IF NOT "${schemaName}".rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') THEN RAISE EXCEPTION 'POS device administration is not permitted' USING ERRCODE='42501'; END IF;
 UPDATE pos_devices SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=p_actor_user_id,version_no=version_no+1 WHERE pos_device_id=p_device_id AND organization_id=p_organization_id AND NOT is_deleted AND revoked_at IS NULL;
 RETURN FOUND;
END;$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_set_staff_pin_hash(
    p_organization_id varchar,
    p_staff_id varchar,
    p_pin_hash varchar,
    p_actor_user_id varchar
)
RETURNS boolean
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
        RAISE EXCEPTION 'POS PIN administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".staff s
        JOIN "${schemaName}".entity_status ses
          ON ses.entity_status_id = s.staff_status_id
        JOIN "${schemaName}".statuses ss
          ON ss.status_id = ses.status_id
        JOIN "${schemaName}".organization_user ou
          ON ou.organization_user_id = s.organization_user_id
        JOIN "${schemaName}".entity_status oues
          ON oues.entity_status_id = ou.organization_user_status_id
        JOIN "${schemaName}".statuses ous
          ON ous.status_id = oues.status_id
        JOIN "${schemaName}"."user" u
          ON u.user_id = ou.user_id
        JOIN "${schemaName}".entity_status ues
          ON ues.entity_status_id = u.user_status_id
        JOIN "${schemaName}".statuses us
          ON us.status_id = ues.status_id
        WHERE s.staff_id = p_staff_id
          AND s.organization_id = p_organization_id
          AND NOT s.is_deleted
          AND ss.status_code = 'ACTIVE'
          AND ou.organization_id = p_organization_id
          AND NOT ou.is_deleted
          AND ous.status_code = 'ACTIVE'
          AND NOT u.is_deleted
          AND us.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'POS PIN administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO "${schemaName}".staff_pin_credentials (
        staff_id,
        pin_hash,
        created_by,
        updated_by
    )
    VALUES (
        p_staff_id,
        p_pin_hash,
        p_actor_user_id,
        p_actor_user_id
    )
    ON CONFLICT (staff_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        failed_attempt_count = 0,
        locked_until = NULL,
        pin_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = EXCLUDED.updated_by,
        version_no =
            "${schemaName}".staff_pin_credentials.version_no + 1;

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_resolve_device(p_token_hash varchar)
RETURNS TABLE("deviceId" varchar,"organizationId" varchar,"organizationName" varchar,"storeId" varchar,"storeName" varchar,"deviceName" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
 SELECT d.pos_device_id,d.organization_id,o.organization_name,d.store_id,s.store_name,d.device_name FROM "${schemaName}".pos_devices d JOIN "${schemaName}".organization o ON o.organization_id=d.organization_id JOIN "${schemaName}".stores s ON s.store_id=d.store_id JOIN "${schemaName}".entity_status oes ON oes.entity_status_id=o.organization_status_id JOIN "${schemaName}".statuses os ON os.status_id=oes.status_id JOIN "${schemaName}".entity_status ses ON ses.entity_status_id=s.store_status_id JOIN "${schemaName}".statuses ss ON ss.status_id=ses.status_id WHERE d.device_token_hash=p_token_hash AND NOT d.is_deleted AND d.revoked_at IS NULL AND NOT o.is_deleted AND os.status_code='ACTIVE' AND NOT s.is_deleted AND ss.status_code='ACTIVE';$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_touch_device(
    p_token_hash varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".pos_resolve_device(p_token_hash)
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE "${schemaName}".pos_devices
       SET last_seen_at = CURRENT_TIMESTAMP
     WHERE device_token_hash = p_token_hash
       AND NOT is_deleted
       AND revoked_at IS NULL;

    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_eligible_staff(
    p_token_hash varchar
)
RETURNS TABLE (
    "staffId" varchar,
    "displayName" varchar,
    "staffCode" varchar,
    designation varchar,
    "pinConfigured" boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        st.staff_id,
        COALESCE(
            NULLIF(u.display_name, ''),
            concat_ws(' ', u.first_name, u.last_name)
        ),
        st.staff_code,
        st.designation,
        (pc.staff_id IS NOT NULL)
    FROM "${schemaName}".pos_resolve_device(p_token_hash) d
    JOIN "${schemaName}".staff st
      ON st.organization_id = d."organizationId"
    JOIN "${schemaName}".entity_status stes
      ON stes.entity_status_id = st.staff_status_id
    JOIN "${schemaName}".statuses sts
      ON sts.status_id = stes.status_id
    JOIN "${schemaName}".organization_user ou
      ON ou.organization_user_id = st.organization_user_id
     AND ou.organization_id = d."organizationId"
    JOIN "${schemaName}".entity_status oues
      ON oues.entity_status_id = ou.organization_user_status_id
    JOIN "${schemaName}".statuses ous
      ON ous.status_id = oues.status_id
    JOIN "${schemaName}"."user" u
      ON u.user_id = ou.user_id
    JOIN "${schemaName}".entity_status ues
      ON ues.entity_status_id = u.user_status_id
    JOIN "${schemaName}".statuses us
      ON us.status_id = ues.status_id
    LEFT JOIN "${schemaName}".staff_pin_credentials pc
      ON pc.staff_id = st.staff_id
    WHERE NOT st.is_deleted
      AND sts.status_code = 'ACTIVE'
      AND NOT ou.is_deleted
      AND ous.status_code = 'ACTIVE'
      AND NOT u.is_deleted
      AND us.status_code = 'ACTIVE'
      AND "${schemaName}".rbac_has_capability(
          u.user_id,
          d."organizationId",
          'COUNTER_ACCESS'
      )
      AND (
          st.store_id = d."storeId"
          OR EXISTS (
              SELECT 1
              FROM "${schemaName}".staff_store_assignment a
              JOIN "${schemaName}".entity_status aes
                ON aes.entity_status_id = a.status_id
              JOIN "${schemaName}".statuses ast
                ON ast.status_id = aes.status_id
              WHERE a.staff_id = st.staff_id
                AND a.store_id = d."storeId"
                AND NOT a.is_deleted
                AND ast.status_code = 'ACTIVE'
                AND a.effective_date <= CURRENT_DATE
                AND (
                    a.end_date IS NULL
                    OR a.end_date >= CURRENT_DATE
                )
          )
      )
    ORDER BY st.staff_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_pin_candidate(p_token_hash varchar,p_staff_id varchar)
RETURNS TABLE("staffId" varchar,"userId" varchar,"displayName" varchar,"pinHash" varchar,"failedAttemptCount" integer,"lockedUntil" text,"deviceId" varchar,"organizationId" varchar,"storeId" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
 SELECT s."staffId",ou.user_id,s."displayName",pc.pin_hash,pc.failed_attempt_count,pc.locked_until::text,d."deviceId",d."organizationId",d."storeId" FROM "${schemaName}".pos_resolve_device(p_token_hash) d JOIN "${schemaName}".pos_eligible_staff(p_token_hash) s ON s."staffId"=p_staff_id JOIN "${schemaName}".staff st ON st.staff_id=s."staffId" JOIN "${schemaName}".organization_user ou ON ou.organization_user_id=st.organization_user_id JOIN "${schemaName}".staff_pin_credentials pc ON pc.staff_id=s."staffId";$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_record_pin_failure(p_staff_id varchar,p_max_attempts integer,p_lock_minutes integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_attempts integer; BEGIN UPDATE staff_pin_credentials SET failed_attempt_count=failed_attempt_count+1,locked_until=CASE WHEN failed_attempt_count+1>=p_max_attempts THEN CURRENT_TIMESTAMP+make_interval(mins=>p_lock_minutes) ELSE locked_until END,updated_at=CURRENT_TIMESTAMP,version_no=version_no+1 WHERE staff_id=p_staff_id RETURNING failed_attempt_count INTO v_attempts; RETURN COALESCE(v_attempts,0); END;$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".pos_record_pin_success(p_staff_id varchar) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$ UPDATE "${schemaName}".staff_pin_credentials SET failed_attempt_count=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP,version_no=version_no+1 WHERE staff_id=p_staff_id RETURNING TRUE;$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".pos_create_session(
    p_session_id varchar,
    p_user_id varchar,
    p_token_hash varchar,
    p_expires_at timestamp without time zone,
    p_client_ip varchar,
    p_user_agent varchar,
    p_device_token_hash varchar,
    p_device_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".pos_pin_candidate(
            p_device_token_hash,
            p_staff_id
        ) c
        WHERE c."userId" = p_user_id
          AND c."deviceId" = p_device_id
          AND c."organizationId" = p_organization_id
          AND c."storeId" = p_store_id
          AND (
              c."lockedUntil" IS NULL
              OR c."lockedUntil"::timestamp <= CURRENT_TIMESTAMP
          )
    ) THEN
        RAISE EXCEPTION 'POS session is unavailable'
            USING ERRCODE = '42501';
    END IF;

    PERFORM "${schemaName}".auth_create_session(
        p_session_id,
        p_user_id,
        p_token_hash,
        p_expires_at,
        p_client_ip,
        p_user_agent
    );

    INSERT INTO "${schemaName}".pos_session_context (
        session_id,
        pos_device_id,
        organization_id,
        store_id,
        staff_id
    )
    VALUES (
        p_session_id,
        p_device_id,
        p_organization_id,
        p_store_id,
        p_staff_id
    );

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_resolve_pos_session_context(
    p_session_id varchar
)
RETURNS TABLE (
    "posSession" boolean,
    valid boolean,
    "deviceId" varchar,
    "organizationId" varchar,
    "storeId" varchar,
    "staffId" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        TRUE,
        EXISTS (
            SELECT 1
            FROM "${schemaName}".pos_devices d

            JOIN "${schemaName}".organization o
              ON o.organization_id = c.organization_id
            JOIN "${schemaName}".entity_status oes
              ON oes.entity_status_id = o.organization_status_id
            JOIN "${schemaName}".statuses os
              ON os.status_id = oes.status_id

            JOIN "${schemaName}".stores store_row
              ON store_row.store_id = c.store_id
             AND store_row.organization_id = c.organization_id
            JOIN "${schemaName}".entity_status store_es
              ON store_es.entity_status_id = store_row.store_status_id
            JOIN "${schemaName}".statuses store_status
              ON store_status.status_id = store_es.status_id

            JOIN "${schemaName}".staff st
              ON st.staff_id = c.staff_id
             AND st.organization_id = c.organization_id
            JOIN "${schemaName}".entity_status staff_es
              ON staff_es.entity_status_id = st.staff_status_id
            JOIN "${schemaName}".statuses staff_status
              ON staff_status.status_id = staff_es.status_id

            JOIN "${schemaName}".organization_user ou
              ON ou.organization_user_id = st.organization_user_id
             AND ou.organization_id = c.organization_id
            JOIN "${schemaName}".entity_status ou_es
              ON ou_es.entity_status_id = ou.organization_user_status_id
            JOIN "${schemaName}".statuses ou_status
              ON ou_status.status_id = ou_es.status_id

            JOIN "${schemaName}"."user" u
              ON u.user_id = ou.user_id
            JOIN "${schemaName}".entity_status user_es
              ON user_es.entity_status_id = u.user_status_id
            JOIN "${schemaName}".statuses user_status
              ON user_status.status_id = user_es.status_id

            WHERE d.pos_device_id = c.pos_device_id
              AND d.organization_id = c.organization_id
              AND d.store_id = c.store_id
              AND NOT d.is_deleted
              AND d.revoked_at IS NULL

              AND NOT o.is_deleted
              AND os.status_code = 'ACTIVE'

              AND NOT store_row.is_deleted
              AND store_status.status_code = 'ACTIVE'

              AND NOT st.is_deleted
              AND staff_status.status_code = 'ACTIVE'

              AND NOT ou.is_deleted
              AND ou_status.status_code = 'ACTIVE'

              AND NOT u.is_deleted
              AND user_status.status_code = 'ACTIVE'

              AND "${schemaName}".rbac_has_capability(
                  u.user_id,
                  c.organization_id,
                  'COUNTER_ACCESS'
              )

              AND (
                  st.store_id = c.store_id
                  OR EXISTS (
                      SELECT 1
                      FROM "${schemaName}".staff_store_assignment a
                      JOIN "${schemaName}".entity_status aes
                        ON aes.entity_status_id = a.status_id
                      JOIN "${schemaName}".statuses ast
                        ON ast.status_id = aes.status_id
                      WHERE a.staff_id = st.staff_id
                        AND a.store_id = c.store_id
                        AND NOT a.is_deleted
                        AND ast.status_code = 'ACTIVE'
                        AND a.effective_date <= CURRENT_DATE
                        AND (
                            a.end_date IS NULL
                            OR a.end_date >= CURRENT_DATE
                        )
                  )
              )
        ),
        c.pos_device_id,
        c.organization_id,
        c.store_id,
        c.staff_id
    FROM "${schemaName}".pos_session_context c
    WHERE c.session_id = p_session_id;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".pos_register_device(varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".pos_list_devices(varchar,varchar),"${schemaName}".pos_revoke_device(varchar,varchar,varchar),"${schemaName}".pos_set_staff_pin_hash(varchar,varchar,varchar,varchar),"${schemaName}".pos_resolve_device(varchar),"${schemaName}".pos_eligible_staff(varchar),"${schemaName}".pos_pin_candidate(varchar,varchar),"${schemaName}".pos_record_pin_failure(varchar,integer,integer),"${schemaName}".pos_record_pin_success(varchar),"${schemaName}".pos_create_session(varchar,varchar,varchar,timestamp without time zone,varchar,varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".auth_resolve_pos_session_context(varchar),"${schemaName}".pos_touch_device(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".pos_register_device(varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".pos_list_devices(varchar,varchar),"${schemaName}".pos_revoke_device(varchar,varchar,varchar),"${schemaName}".pos_set_staff_pin_hash(varchar,varchar,varchar,varchar),"${schemaName}".pos_resolve_device(varchar),"${schemaName}".pos_eligible_staff(varchar),"${schemaName}".pos_pin_candidate(varchar,varchar),"${schemaName}".pos_record_pin_failure(varchar,integer,integer),"${schemaName}".pos_record_pin_success(varchar),"${schemaName}".pos_create_session(varchar,varchar,varchar,timestamp without time zone,varchar,varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".auth_resolve_pos_session_context(varchar),"${schemaName}".pos_touch_device(varchar) TO "${appRole}";
