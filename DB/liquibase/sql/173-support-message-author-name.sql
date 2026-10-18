-- Add a display-only author name for authorized internal support-note viewers.
-- The function argument signature remains unchanged; the result projection adds authorName.
DROP FUNCTION IF EXISTS "${schemaName}".support_messages(varchar, varchar, varchar);

CREATE FUNCTION "${schemaName}".support_messages(
    p_request_id varchar,
    p_actor_user_id varchar,
    p_viewer varchar
)
RETURNS TABLE(
    "supportMessageId" varchar,
    "supportRequestId" varchar,
    "organizationId" varchar,
    "authorUserId" varchar,
    "authorRole" varchar,
    "messageType" varchar,
    "messageBody" text,
    "isInternal" boolean,
    "createdAt" timestamp without time zone,
    "authorName" varchar
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT
    m.support_message_id,
    m.support_request_id,
    m.organization_id,
    m.author_user_id,
    m.author_role,
    m.message_type,
    m.message_body,
    m.is_internal,
    m.created_at,
    CASE
      WHEN m.is_internal AND p_viewer IN ('ORG_ADMIN','PLATFORM_ADMIN')
        THEN NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '')
      ELSE NULL
    END::varchar
 FROM customer_support_messages m
 JOIN customer_support_requests r ON r.support_request_id=m.support_request_id
 LEFT JOIN "user" u ON u.user_id=m.author_user_id
 WHERE m.support_request_id=p_request_id
   AND (
     (p_viewer='CUSTOMER' AND r.customer_user_id=p_actor_user_id AND NOT m.is_internal)
     OR (p_viewer='ORG_ADMIN' AND can_administer_organization(r.organization_id,p_actor_user_id))
     OR (p_viewer='PLATFORM_ADMIN' AND support_is_platform_admin(p_actor_user_id))
   )
 ORDER BY m.created_at,m.support_message_id
$f$;

REVOKE ALL ON FUNCTION "${schemaName}".support_messages(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".support_messages(varchar, varchar, varchar) TO "${appRole}";