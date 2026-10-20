-- Phase 2: support recipient/channel policy. Replaces only the resolver introduced in 195.
-- A missing organization notification configuration is fail-closed for WhatsApp.
-- Explicit consent is required for each recipient, including employees/platform admins.
-- Business recipients remain limited to holders of ORG_ADMIN_ACCESS; staff without
-- that permission are intentionally not broadcast support cases.
CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_recipients(p_outbox_event_id varchar)
RETURNS TABLE(
 "recipientUserId" varchar,"email" varchar,"phone" varchar,"isCustomer" boolean,
 "recipientName" varchar,"recipientKind" varchar,"ticketNumber" varchar,
 "organizationName" varchar,"recipientDeliveryMode" varchar,
 "whatsappOptedIn" boolean,"emailOptedIn" boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
WITH item AS (
 SELECT o.event_type,r.support_destination,r.organization_id,r.customer_user_id,
        o.actor_user_id,r.ticket_number
 FROM support_notification_outbox o
 JOIN customer_support_requests r ON r.support_request_id=o.support_request_id
 WHERE o.outbox_event_id=p_outbox_event_id
), recipients AS (
 SELECT i.customer_user_id AS user_id,true AS is_customer
 FROM item i
 WHERE i.event_type IN ('SUPPORT_BUSINESS_REPLY','SUPPORT_PLATFORM_REPLY',
                        'SUPPORT_REQUEST_RESOLVED','SUPPORT_REQUEST_CLOSED')
 UNION
 SELECT DISTINCT ou.user_id,false
 FROM item i
 JOIN organization_user ou ON ou.organization_id=i.organization_id
 JOIN organization_user_roles our ON our.organization_user_id=ou.organization_user_id
 JOIN role r ON r.role_id=our.role_id
 JOIN role_privileges rp ON rp.role_id=r.role_id
 JOIN privileges p ON p.privilege_id=rp.privilege_id
 WHERE i.support_destination='BUSINESS'
   AND i.event_type IN ('SUPPORT_REQUEST_CREATED','SUPPORT_CUSTOMER_REPLY','SUPPORT_REQUEST_REOPENED')
   AND NOT ou.is_deleted AND ou.organization_user_status_id='entity-status-org-user-active'
   AND NOT our.is_deleted AND our.assignment_status_id='entity-status-org-user-role-active'
   AND our.effective_from<=CURRENT_TIMESTAMP AND (our.effective_to IS NULL OR our.effective_to>CURRENT_TIMESTAMP)
   AND r.role_status_id='entity-status-role-active'
   AND p.privilege_code='ORG_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
 UNION
 SELECT DISTINCT pur.user_id,false
 FROM item i
 JOIN platform_user_role pur ON true
 JOIN role r ON r.role_id=pur.role_id
 JOIN role_privileges rp ON rp.role_id=r.role_id
 JOIN privileges p ON p.privilege_id=rp.privilege_id
 WHERE i.support_destination='PLATFORM'
   AND i.event_type IN ('SUPPORT_REQUEST_CREATED','SUPPORT_CUSTOMER_REPLY','SUPPORT_REQUEST_REOPENED')
   AND NOT pur.is_deleted AND r.role_status_id='entity-status-role-active'
   AND pur.status_id='entity-status-platfrm-user-role-active'
   AND pur.effective_from<=CURRENT_TIMESTAMP AND (pur.effective_to IS NULL OR pur.effective_to>CURRENT_TIMESTAMP)
   AND p.privilege_code='PLATFORM_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
)
SELECT DISTINCT r.user_id,u.primary_email,u.primary_phone,r.is_customer,
 coalesce(nullif(btrim(u.display_name),''),nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Memgine user')::varchar,
 CASE WHEN r.is_customer THEN 'CUSTOMER'
      WHEN i.support_destination='PLATFORM' THEN 'PLATFORM_ADMIN'
      ELSE 'BUSINESS_ADMIN' END::varchar,
 i.ticket_number,
 coalesce(nullif(btrim(org.organization_name),''),'Memgine Support')::varchar,
 coalesce(pref.delivery_mode,'DEFAULT')::varchar,
 (
   -- Organization channel policy applies to *all* organization-scoped WhatsApp messages,
   -- including customer updates and notifications sent to admins.
   (i.organization_id IS NULL OR EXISTS (
     SELECT 1 FROM notification_configurations nc
     WHERE nc.organization_id=i.organization_id AND NOT nc.is_deleted
       AND nc.whatsapp_enabled
   ))
   AND CASE WHEN r.is_customer THEN
     coalesce(pref.whatsapp_enabled,true)
     AND coalesce(pref.whatsapp_opted_in,false)
     AND pref.whatsapp_consent_at IS NOT NULL
     AND pref.whatsapp_consent_withdrawn_at IS NULL
   ELSE
     -- Employees and platform admins lack self-service consent UI for now.
     -- Their explicit consent must be recorded separately before LIVE sends.
     coalesce(pref.whatsapp_opted_in,false)
     AND pref.whatsapp_consent_at IS NOT NULL
     AND pref.whatsapp_consent_withdrawn_at IS NULL
   END
 ) AS "whatsappOptedIn",
 (r.is_customer AND coalesce(pref.email_opted_in,false)) AS "emailOptedIn"
FROM recipients r
JOIN "user" u ON u.user_id=r.user_id
CROSS JOIN item i
LEFT JOIN organization org ON org.organization_id=i.organization_id
LEFT JOIN support_notification_user_settings pref ON pref.user_id=r.user_id
WHERE NOT u.is_deleted AND u.user_status_id='entity-status-user-active'
 AND r.user_id IS DISTINCT FROM i.actor_user_id
$f$;
