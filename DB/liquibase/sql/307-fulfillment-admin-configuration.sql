-- Memgine Unified Fulfillment: Organization Admin configuration functions.
-- Prerequisite: applied 306 common storage.
-- No new tables, triggers, overloaded function names or payment changes.
-- SECURITY DEFINER functions authorize actor at the database boundary.

CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_policy_defaults()
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
SELECT '{
  "fulfillmentTypes": {
    "ORDER": {
      "enabled": true,
      "workflow": "NONE",
      "journeys": {
        "IMMEDIATE_PAY_AT_COUNTER": true,
        "ADVANCE_PAY_NOW": false,
        "ADVANCE_PAY_AT_COUNTER": false
      },
      "customerLabel": "Order",
      "defaultPreparationMinutes": 15,
      "minimumLeadMinutes": 0,
      "maximumHorizonMinutes": 10080,
      "collectionPolicy": "ASAP_ONLY",
      "collectionWindowMinutes": 30,
      "showExpectedCompletion": true,
      "showExpectedCollection": true,
      "customerExtensionRequestsEnabled": false,
      "recommendedExtensionMinutes": 15,
      "recommendedExtensionCount": 2,
      "recommendedTotalExtensionMinutes": 30,
      "extensionOverrideAdminOnly": false,
      "customerCancellationRequestsEnabled": true,
      "cancellationCutoffMinutes": 0,
      "noShowGraceMinutes": 30,
      "staffNoShowRecordingEnabled": true,
      "notificationEvents": [],
      "pickupReminderLeadMinutes": 15
    }
  }
}'::jsonb;
$function$;

-- Merge only the supported object hierarchy; arrays and scalars replace whole values.
-- Key deletion uses omitted override keys, never JSON null.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_merge_policy(
  p_base jsonb, p_override jsonb
)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH d AS (
 SELECT COALESCE(p_base, '{}'::jsonb) AS base, COALESCE(p_override, '{}'::jsonb) AS patch
), merged AS (
 SELECT
   d.base || d.patch AS outer_policy,
   COALESCE(d.base->'fulfillmentTypes','{}'::jsonb) AS base_types,
   COALESCE(d.patch->'fulfillmentTypes','{}'::jsonb) AS patch_types
 FROM d
), order_merged AS (
 SELECT
  m.outer_policy,
  m.base_types || m.patch_types AS types,
  COALESCE(m.base_types->'ORDER','{}'::jsonb) AS bo,
  COALESCE(m.patch_types->'ORDER','{}'::jsonb) AS po
 FROM merged m
)
SELECT jsonb_set(om.outer_policy, '{fulfillmentTypes}',
  jsonb_set(om.types, '{ORDER}',
    (om.bo || om.po) || jsonb_build_object('journeys',
      COALESCE(om.bo->'journeys','{}'::jsonb) || COALESCE(om.po->'journeys','{}'::jsonb)
    ), true), true)
FROM order_merged om;
$function$;

-- Store overrides may disable but never enable what the organization has disabled.
-- Always enforce that rule when READING, even if org policy changes after
-- an existing store override was originally saved.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_apply_store_overrides(
 p_org_policy jsonb, p_store_overrides jsonb
)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_effective jsonb;
 v_journeys jsonb;
 v_key text;
BEGIN
 v_effective := "${schemaName}".fulfillment_merge_policy(p_org_policy,p_store_overrides);
 v_effective := jsonb_set(v_effective, '{fulfillmentTypes,ORDER,enabled}',
    to_jsonb(COALESCE((p_org_policy #>> '{fulfillmentTypes,ORDER,enabled}')::boolean,FALSE)
       AND COALESCE((v_effective #>> '{fulfillmentTypes,ORDER,enabled}')::boolean,FALSE)),true);
 v_journeys := v_effective #> '{fulfillmentTypes,ORDER,journeys}';
 FOR v_key IN SELECT jsonb_object_keys(v_journeys) LOOP
   v_journeys := jsonb_set(v_journeys, ARRAY[v_key],
     to_jsonb(COALESCE((p_org_policy #>> ARRAY['fulfillmentTypes','ORDER','journeys',v_key])::boolean,FALSE)
        AND COALESCE((v_journeys->>v_key)::boolean,FALSE)),true);
 END LOOP;
 RETURN jsonb_set(v_effective,'{fulfillmentTypes,ORDER,journeys}',v_journeys,true);
END;
$function$;

-- Validate the new policy's shape and reference choices. NO runtime client may
-- bypass this through direct table writes (306 revoked direct table privileges).
-- A policy is a PATCH of recognized fields; org reads resolve defaults.
-- Store-only collectionHours shape: {"MONDAY":[{"start":"09:00","end":"17:00"}], ...}
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_validate_policy(
  p_policy jsonb, p_store_override boolean
)
RETURNS boolean LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
  v_key text;
  v_type text;
  v_field text;
  v_value jsonb;
  v_order jsonb;
  v_journeys jsonb;
  v_event jsonb;
  v_day text;
  v_windows jsonb;
  v_window jsonb;
  v_number numeric;
  v_min integer;
  v_max integer;
BEGIN
  IF p_policy IS NULL OR jsonb_typeof(p_policy) <> 'object' THEN
    RAISE EXCEPTION 'Fulfillment policy must be a JSON object' USING ERRCODE='22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_policy) LOOP
    IF v_key <> 'fulfillmentTypes' THEN
      RAISE EXCEPTION 'Unknown fulfillment policy field: %', v_key USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF NOT p_policy ? 'fulfillmentTypes' THEN RETURN TRUE; END IF;
  IF jsonb_typeof(p_policy->'fulfillmentTypes') <> 'object' THEN
    RAISE EXCEPTION 'fulfillmentTypes must be an object' USING ERRCODE='22023';
  END IF;
  FOR v_type IN SELECT jsonb_object_keys(p_policy->'fulfillmentTypes') LOOP
    -- Reference-only future types cannot be operationally configured in this release.
    IF v_type <> 'ORDER' THEN
      RAISE EXCEPTION 'Unsupported fulfillment type for configuration: %',v_type USING ERRCODE='22023';
    END IF;
  END LOOP;
  v_order := p_policy #> '{fulfillmentTypes,ORDER}';
  IF v_order IS NULL THEN RETURN TRUE; END IF;
  IF jsonb_typeof(v_order) <> 'object' THEN
    RAISE EXCEPTION 'ORDER policy must be an object' USING ERRCODE='22023';
  END IF;
  FOR v_field,v_value IN SELECT key,value FROM jsonb_each(v_order) LOOP
    IF v_field IN ('enabled','showExpectedCompletion','showExpectedCollection',
      'customerExtensionRequestsEnabled','extensionOverrideAdminOnly',
      'customerCancellationRequestsEnabled','staffNoShowRecordingEnabled') THEN
      IF jsonb_typeof(v_value) <> 'boolean' THEN
        RAISE EXCEPTION '% must be boolean',v_field USING ERRCODE='22023';
      END IF;
    ELSIF v_field = 'workflow' THEN
      IF jsonb_typeof(v_value) <> 'string' OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_type et
        JOIN "${schemaName}".entity_status es ON es.entity_type_id=et.entity_type_id
        JOIN "${schemaName}".statuses s ON s.status_id=es.status_id
        WHERE et.entity_type_code='FULFILLMENT_WORKFLOW' AND s.status_code=(v_value #>> '{}')
          AND et.is_active AND es.is_active AND s.is_active
      ) THEN RAISE EXCEPTION 'Invalid fulfillment workflow' USING ERRCODE='22023'; END IF;
    ELSIF v_field='collectionPolicy' THEN
      IF jsonb_typeof(v_value) <> 'string' OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_type et
        JOIN "${schemaName}".entity_status es ON es.entity_type_id=et.entity_type_id
        JOIN "${schemaName}".statuses s ON s.status_id=es.status_id
        WHERE et.entity_type_code='COLLECTION_SCHEDULING_POLICY' AND s.status_code=(v_value #>> '{}')
          AND et.is_active AND es.is_active AND s.is_active
      ) THEN RAISE EXCEPTION 'Invalid collection scheduling policy' USING ERRCODE='22023'; END IF;
    ELSIF v_field='customerLabel' THEN
      IF jsonb_typeof(v_value) <> 'string' OR length(trim(v_value #>> '{}')) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'customerLabel must contain 1–60 characters' USING ERRCODE='22023';
      END IF;
    ELSIF v_field IN ('defaultPreparationMinutes','minimumLeadMinutes',
      'maximumHorizonMinutes','collectionWindowMinutes',
      'recommendedExtensionMinutes','recommendedExtensionCount',
      'recommendedTotalExtensionMinutes','cancellationCutoffMinutes',
      'noShowGraceMinutes','pickupReminderLeadMinutes') THEN
      IF jsonb_typeof(v_value) <> 'number' THEN
        RAISE EXCEPTION '% must be a number',v_field USING ERRCODE='22023';
      END IF;
      v_number := (v_value #>> '{}')::numeric;
      v_min := 0;
      v_max := CASE v_field
        WHEN 'recommendedExtensionCount' THEN 100
        ELSE 525600 END;
      IF v_number <> trunc(v_number) OR v_number < v_min OR v_number > v_max THEN
        RAISE EXCEPTION '% must be an integer between % and %',v_field,v_min,v_max USING ERRCODE='22023';
      END IF;
    ELSIF v_field='journeys' THEN
      IF jsonb_typeof(v_value) <> 'object' THEN
        RAISE EXCEPTION 'journeys must be an object' USING ERRCODE='22023';
      END IF;
      FOR v_key IN SELECT jsonb_object_keys(v_value) LOOP
        IF v_key NOT IN ('IMMEDIATE_PAY_AT_COUNTER','ADVANCE_PAY_NOW','ADVANCE_PAY_AT_COUNTER')
           OR jsonb_typeof(v_value->v_key) <> 'boolean' THEN
          RAISE EXCEPTION 'Invalid journey setting %',v_key USING ERRCODE='22023';
        END IF;
      END LOOP;
    ELSIF v_field='notificationEvents' THEN
      IF jsonb_typeof(v_value) <> 'array' THEN
        RAISE EXCEPTION 'notificationEvents must be an array' USING ERRCODE='22023';
      END IF;
      FOR v_event IN SELECT value FROM jsonb_array_elements(v_value) LOOP
        IF jsonb_typeof(v_event) <> 'string' OR NOT EXISTS (
          SELECT 1 FROM "${schemaName}".entity_type et
          JOIN "${schemaName}".entity_status es ON es.entity_type_id=et.entity_type_id
          JOIN "${schemaName}".statuses s ON s.status_id=es.status_id
          WHERE et.entity_type_code='FULFILLMENT_NOTIFICATION_EVENT'
            AND s.status_code=(v_event #>> '{}')
            AND et.is_active AND es.is_active AND s.is_active
        ) THEN RAISE EXCEPTION 'Invalid fulfillment notification event' USING ERRCODE='22023'; END IF;
      END LOOP;
      IF (SELECT count(*) FROM jsonb_array_elements(v_value)) <> (
          SELECT count(DISTINCT x.value) FROM jsonb_array_elements(v_value) AS x(value)) THEN
        RAISE EXCEPTION 'Duplicate notification event' USING ERRCODE='22023';
      END IF;
    ELSIF v_field='collectionHours' AND p_store_override THEN
      IF jsonb_typeof(v_value) <> 'object' THEN
        RAISE EXCEPTION 'collectionHours must be a weekday object' USING ERRCODE='22023';
      END IF;
      FOR v_day,v_windows IN SELECT key,value FROM jsonb_each(v_value) LOOP
        IF v_day NOT IN ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')
           OR jsonb_typeof(v_windows) <> 'array' THEN
          RAISE EXCEPTION 'Invalid collectionHours weekday %',v_day USING ERRCODE='22023';
        END IF;
        FOR v_window IN SELECT value FROM jsonb_array_elements(v_windows) LOOP
          IF jsonb_typeof(v_window) <> 'object'
            OR NOT (v_window ? 'start' AND v_window ? 'end')
            OR (SELECT count(*) FROM jsonb_object_keys(v_window)) <> 2
            OR (v_window->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            OR (v_window->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            OR (v_window->>'start') >= (v_window->>'end') THEN
            RAISE EXCEPTION 'Invalid collection window for %',v_day USING ERRCODE='22023';
          END IF;
        END LOOP;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'Unknown or disallowed ORDER policy field: %',v_field USING ERRCODE='22023';
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$function$;

-- Validated effective policy, without any change to legacy QR-expiry controls.
-- This INTERNAL helper is not executable by the application role.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_resolve_org_policy(p_organization_id varchar)
RETURNS jsonb LANGUAGE sql VOLATILE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
SELECT "${schemaName}".fulfillment_merge_policy(
  "${schemaName}".fulfillment_policy_defaults(),
  COALESCE((SELECT c.fulfillment_policy FROM "${schemaName}".organization_redemption_configurations c
            WHERE c.organization_id=p_organization_id),'{}'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_fulfillment_policy(
  p_organization_id varchar, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_version integer := 0; v_saved jsonb := '{}'::jsonb;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Organization fulfillment configuration access denied' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization o WHERE o.organization_id=p_organization_id AND NOT o.is_deleted) THEN
   RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002';
 END IF;
 SELECT c.version_no,c.fulfillment_policy INTO v_version,v_saved
 FROM "${schemaName}".organization_redemption_configurations c WHERE c.organization_id=p_organization_id;
 RETURN jsonb_build_object('organizationId',p_organization_id,'versionNo',COALESCE(v_version,0),
   'savedPolicy',COALESCE(v_saved,'{}'::jsonb),
   'effectivePolicy',"${schemaName}".fulfillment_resolve_org_policy(p_organization_id));
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_fulfillment_policy(
  p_organization_id varchar, p_policy jsonb, p_expected_version integer, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_current integer; v_result jsonb;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Organization fulfillment configuration update denied' USING ERRCODE='42501';
 END IF;
 IF p_expected_version IS NULL OR p_expected_version < 0 THEN
   RAISE EXCEPTION 'Expected version is required' USING ERRCODE='22023';
 END IF;
 PERFORM "${schemaName}".fulfillment_validate_policy(p_policy,FALSE);
 IF ("${schemaName}".fulfillment_merge_policy("${schemaName}".fulfillment_policy_defaults(),p_policy)
       #>> '{fulfillmentTypes,ORDER,minimumLeadMinutes}')::integer >
    ("${schemaName}".fulfillment_merge_policy("${schemaName}".fulfillment_policy_defaults(),p_policy)
       #>> '{fulfillmentTypes,ORDER,maximumHorizonMinutes}')::integer THEN
   RAISE EXCEPTION 'Minimum lead time cannot exceed booking horizon' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization o WHERE o.organization_id=p_organization_id AND NOT o.is_deleted) THEN
   RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002';
 END IF;
 -- Serialize concurrent first writes even when no config row exists.
 PERFORM 1 FROM "${schemaName}".organization o WHERE o.organization_id=p_organization_id FOR UPDATE;
 SELECT c.version_no INTO v_current
 FROM "${schemaName}".organization_redemption_configurations c
 WHERE c.organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN
   IF p_expected_version <> 0 THEN RAISE EXCEPTION 'Stale fulfillment policy version' USING ERRCODE='40001'; END IF;
   -- QR expiry = 10 retains legacy effective fallback; never use a dummy subscription.
   INSERT INTO "${schemaName}".organization_redemption_configurations
     (organization_id,configuration_key,redemption_qr_expiry_minutes,fulfillment_policy,
      created_by,updated_by,is_deleted,version_no)
   VALUES (p_organization_id,'REDEMPTION_QR_EXPIRY_MINUTES',10,p_policy,
           p_actor_user_id,p_actor_user_id,FALSE,1);
 ELSE
   IF v_current <> p_expected_version THEN
     RAISE EXCEPTION 'Stale fulfillment policy version' USING ERRCODE='40001';
   END IF;
   UPDATE "${schemaName}".organization_redemption_configurations c SET
     fulfillment_policy=p_policy,
     updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
     updated_by=p_actor_user_id,
     version_no=c.version_no+1
   WHERE c.organization_id=p_organization_id;
   -- Preserve redemption_qr_expiry_minutes, configuration_key, and is_deleted EXACTLY.
 END IF;
 RETURN "${schemaName}".get_organization_fulfillment_policy(p_organization_id,p_actor_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_store_fulfillment_overrides(
 p_organization_id varchar, p_store_id varchar, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_store record;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Store fulfillment configuration access denied' USING ERRCODE='42501';
 END IF;
 SELECT s.store_id,s.version_no,s.fulfillment_overrides INTO v_store
 FROM "${schemaName}".stores s
 WHERE s.organization_id=p_organization_id AND s.store_id=p_store_id AND NOT s.is_deleted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('organizationId',p_organization_id,'storeId',p_store_id,
   'versionNo',v_store.version_no,'savedOverrides',v_store.fulfillment_overrides,
   'effectivePolicy',"${schemaName}".fulfillment_apply_store_overrides(
       "${schemaName}".fulfillment_resolve_org_policy(p_organization_id),v_store.fulfillment_overrides));
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_store_fulfillment_overrides(
 p_organization_id varchar, p_store_id varchar, p_overrides jsonb,
 p_expected_version integer, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_store record; v_org jsonb; v_org_order jsonb; v_store_order jsonb;
 v_key text; v_effective jsonb;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Store fulfillment configuration update denied' USING ERRCODE='42501';
 END IF;
 IF p_expected_version IS NULL OR p_expected_version < 1 THEN
   RAISE EXCEPTION 'Expected Store version is required' USING ERRCODE='22023';
 END IF;
 PERFORM "${schemaName}".fulfillment_validate_policy(p_overrides,TRUE);
 SELECT s.store_id,s.version_no,s.fulfillment_overrides INTO v_store
 FROM "${schemaName}".stores s
 WHERE s.organization_id=p_organization_id AND s.store_id=p_store_id AND NOT s.is_deleted
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 IF v_store.version_no <> p_expected_version THEN
   RAISE EXCEPTION 'Stale Store fulfillment configuration version' USING ERRCODE='40001';
 END IF;
 v_org := "${schemaName}".fulfillment_resolve_org_policy(p_organization_id);
 v_org_order := v_org #> '{fulfillmentTypes,ORDER}';
 v_store_order := COALESCE(p_overrides #> '{fulfillmentTypes,ORDER}','{}'::jsonb);
 -- Store cannot make an org-disabled journey or unsupported type available.
 IF COALESCE((v_store_order->>'enabled')::boolean,FALSE) AND NOT (v_org_order->>'enabled')::boolean THEN
   RAISE EXCEPTION 'Store cannot enable an organization-disabled fulfillment type' USING ERRCODE='22023';
 END IF;
 FOR v_key IN SELECT jsonb_object_keys(COALESCE(v_store_order->'journeys','{}'::jsonb)) LOOP
   IF (v_store_order->'journeys'->>v_key)::boolean
      AND NOT COALESCE((v_org_order->'journeys'->>v_key)::boolean,FALSE) THEN
     RAISE EXCEPTION 'Store cannot enable an organization-disabled journey: %',v_key USING ERRCODE='22023';
   END IF;
 END LOOP;
 v_effective := "${schemaName}".fulfillment_apply_store_overrides(v_org,p_overrides);
 PERFORM "${schemaName}".fulfillment_validate_policy(v_effective,TRUE);
 IF (v_effective #>> '{fulfillmentTypes,ORDER,minimumLeadMinutes}')::integer >
    (v_effective #>> '{fulfillmentTypes,ORDER,maximumHorizonMinutes}')::integer THEN
   RAISE EXCEPTION 'Store minimum lead time cannot exceed booking horizon' USING ERRCODE='22023';
 END IF;
 UPDATE "${schemaName}".stores s SET
   fulfillment_overrides=p_overrides,
   updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC', updated_by=p_actor_user_id,
   version_no=s.version_no+1
 WHERE s.store_id=p_store_id AND s.organization_id=p_organization_id;
 RETURN "${schemaName}".get_store_fulfillment_overrides(p_organization_id,p_store_id,p_actor_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_fulfillment_policy_reference_choices(
 p_organization_id varchar, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Fulfillment references access denied' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_object_agg(category,choices) INTO v_result FROM (
  SELECT et.entity_type_code AS category,
     COALESCE(jsonb_agg(jsonb_build_object(
        'code',s.status_code,'label',s.status_name,
        'supported',CASE WHEN et.entity_type_code='FULFILLMENT_TYPE' THEN s.status_code='ORDER' ELSE TRUE END
      ) ORDER BY es.display_order) FILTER (WHERE s.status_id IS NOT NULL),'[]'::jsonb) AS choices
  FROM "${schemaName}".entity_type et
  JOIN "${schemaName}".entity_status es ON es.entity_type_id=et.entity_type_id AND es.is_active
  JOIN "${schemaName}".statuses s ON s.status_id=es.status_id AND s.is_active
  WHERE et.is_active AND et.entity_type_code IN (
   'FULFILLMENT_TYPE','FULFILLMENT_REQUEST_CHANNEL','FULFILLMENT_REQUEST_TIMING',
   'PAYMENT_TIMING','FULFILLMENT_WORKFLOW','FULFILLMENT_NOTIFICATION_EVENT',
   'COLLECTION_SCHEDULING_POLICY')
  GROUP BY et.entity_type_code
 ) q;
 RETURN COALESCE(v_result,'{}'::jsonb);
END;
$function$;

-- Internal helpers: no direct application-role access.
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_policy_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_merge_policy(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_apply_store_overrides(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_validate_policy(jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_org_policy(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_policy_defaults() FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_merge_policy(jsonb,jsonb) FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_apply_store_overrides(jsonb,jsonb) FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_validate_policy(jsonb,boolean) FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_org_policy(varchar) FROM "${appRole}";

-- Publicly callable SQL functions: actor is required and authorization enforced.
REVOKE ALL ON FUNCTION "${schemaName}".get_organization_fulfillment_policy(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_fulfillment_policy(varchar,jsonb,integer,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_store_fulfillment_overrides(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_store_fulfillment_overrides(varchar,varchar,jsonb,integer,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_fulfillment_policy_reference_choices(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_fulfillment_policy(varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_fulfillment_policy(varchar,jsonb,integer,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_store_fulfillment_overrides(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_store_fulfillment_overrides(varchar,varchar,jsonb,integer,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_fulfillment_policy_reference_choices(varchar,varchar) TO "${appRole}";
