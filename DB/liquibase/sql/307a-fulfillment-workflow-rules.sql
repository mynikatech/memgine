-- Additive follow-on to 307; do not edit the previously previewed/applied 307 changeset.
-- Schema and configuration only: no Customer/Counter order completion, entitlement
-- consumption or Commerce charge/refund runtime is enabled by this migration.
-- Resolves workflow inheritance: Store product > Organization product > Store category
-- > Organization category > Store default > Organization default.

-- Re-define defaults and validator under their original signatures. This is a
-- forward-only changeset, not a modification to the original 307 checksum.
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
      "partialHandoverEnabled": false,
      "notificationEvents": [],
      "pickupReminderLeadMinutes": 15
    }
  }
}'::jsonb;
$function$;


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
      'customerCancellationRequestsEnabled','staffNoShowRecordingEnabled',
       'partialHandoverEnabled') THEN
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


-- Sparse workflow rules. Store NULL means organization scope. Canonical IDs (not names)
-- prevent problems with duplicate product titles or POS catalog renames.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillment_workflow_rules (
  rule_id varchar(64) PRIMARY KEY,
  organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
  store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
  target_kind varchar(16) NOT NULL CHECK (target_kind IN ('CATEGORY','PRODUCT')),
  target_id varchar(64) NOT NULL,
  workflow_code varchar(16) NOT NULL CHECK (workflow_code IN ('NONE','SIMPLE','DETAILED')),
  is_deleted boolean NOT NULL DEFAULT false,
  version_no integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
  updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fulfillment_workflow_rule_scope
 ON "${schemaName}".fulfillment_workflow_rules
 (organization_id,COALESCE(store_id,''),target_kind,target_id);
CREATE INDEX IF NOT EXISTS ix_fulfillment_workflow_rules_target
 ON "${schemaName}".fulfillment_workflow_rules(organization_id,target_kind,target_id)
 WHERE NOT is_deleted;

-- Per-line operational state/snapshot. A NONE workflow does NOT imply in-stock,
-- ready, paid, entitlement-consumed or handed over. All start unverified.
-- The actual 308/309 acceptance and Counter functions populate/mutate these rows
-- after authoritative payment/redemption rules are satisfied.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillment_items (
  fulfillment_item_id varchar(64) PRIMARY KEY,
  fulfillment_id varchar(64) NOT NULL REFERENCES "${schemaName}".fulfillments(fulfillment_id),
  line_reference varchar(128) NOT NULL,
  product_id varchar(40) REFERENCES "${schemaName}".product(product_id),
  product_catalog_category_id varchar(64) REFERENCES "${schemaName}".product_catalog_category(product_catalog_category_id),
  redemption_transaction_item_id varchar(64) REFERENCES "${schemaName}".redemption_transaction_item(redemption_transaction_item_id),
  product_name_snapshot varchar(200) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  handed_over_quantity integer NOT NULL DEFAULT 0 CHECK (handed_over_quantity >= 0),
  workflow_code_snapshot varchar(16) NOT NULL CHECK (workflow_code_snapshot IN ('NONE','SIMPLE','DETAILED')),
  item_status varchar(20) NOT NULL DEFAULT 'PLACED'
    CHECK (item_status IN ('PLACED','PREPARING','READY','FULFILLED','CANCELLED')),
  availability_status varchar(20) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (availability_status IN ('UNKNOWN','AVAILABLE','AWAITING_STOCK','UNAVAILABLE')),
  availability_reason text,
  expected_available_at timestamp without time zone,
  handed_over_at timestamp without time zone,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(policy_snapshot)='object'),
  created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
  updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
  version_no integer NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  CONSTRAINT uq_fulfillment_item_line UNIQUE (fulfillment_id,line_reference),
  CONSTRAINT ck_fulfillment_item_handover_quantity CHECK (handed_over_quantity <= quantity),
  CONSTRAINT ck_fulfillment_item_fulfilled_quantity CHECK (item_status <> 'FULFILLED' OR handed_over_quantity = quantity)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fulfillment_item_redemption_line
 ON "${schemaName}".fulfillment_items(redemption_transaction_item_id)
 WHERE redemption_transaction_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fulfillment_item_order_status
 ON "${schemaName}".fulfillment_items(fulfillment_id,item_status);

-- Append-only item-level audit evidence. No runtime writers are enabled here.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillment_item_actions (
  fulfillment_item_action_id varchar(64) PRIMARY KEY,
  fulfillment_item_id varchar(64) NOT NULL REFERENCES "${schemaName}".fulfillment_items(fulfillment_item_id),
  actor_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
  action_code varchar(40) NOT NULL,
  prior_item_status varchar(20),
  new_item_status varchar(20),
  prior_availability varchar(20),
  new_availability varchar(20),
  handed_over_delta integer NOT NULL DEFAULT 0 CHECK (handed_over_delta >= 0),
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id)
);
CREATE INDEX IF NOT EXISTS ix_fulfillment_item_actions_history
 ON "${schemaName}".fulfillment_item_actions(fulfillment_item_id,created_at,fulfillment_item_action_id);

-- Resolve the canonical product + category before selecting a workflow.
-- Only callable by privileged future acceptance routines; no app-role grant.
CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(
 p_organization_id varchar, p_store_id varchar, p_product_id varchar
) RETURNS varchar LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
 v_category_id varchar(64);
 v_workflow varchar(16);
 v_org_default jsonb;
 v_store_default jsonb;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "${schemaName}".stores s
   WHERE s.store_id=p_store_id AND s.organization_id=p_organization_id AND NOT s.is_deleted) THEN
   RAISE EXCEPTION 'Store not found for fulfillment workflow' USING ERRCODE='P0002';
 END IF;
 SELECT p.product_catalog_category_id INTO v_category_id
 FROM "${schemaName}".product p
 JOIN "${schemaName}".product_catalog pc
   ON pc.product_catalog_id=p.product_catalog_id AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
 WHERE p.product_id=p_product_id AND p.organization_id=p_organization_id AND NOT p.is_deleted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found for fulfillment workflow' USING ERRCODE='P0002'; END IF;
 SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND r.store_id=p_store_id
   AND r.target_kind='PRODUCT' AND r.target_id=p_product_id AND NOT r.is_deleted;
 IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
 SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND r.store_id IS NULL
   AND r.target_kind='PRODUCT' AND r.target_id=p_product_id AND NOT r.is_deleted;
 IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
 IF v_category_id IS NOT NULL THEN
   SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
   WHERE r.organization_id=p_organization_id AND r.store_id=p_store_id
     AND r.target_kind='CATEGORY' AND r.target_id=v_category_id AND NOT r.is_deleted;
   IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
   SELECT r.workflow_code INTO v_workflow FROM "${schemaName}".fulfillment_workflow_rules r
   WHERE r.organization_id=p_organization_id AND r.store_id IS NULL
     AND r.target_kind='CATEGORY' AND r.target_id=v_category_id AND NOT r.is_deleted;
   IF v_workflow IS NOT NULL THEN RETURN v_workflow; END IF;
 END IF;
 v_org_default := "${schemaName}".fulfillment_resolve_org_policy(p_organization_id);
 SELECT "${schemaName}".fulfillment_apply_store_overrides(v_org_default,s.fulfillment_overrides)
 INTO v_store_default FROM "${schemaName}".stores s
 WHERE s.organization_id=p_organization_id AND s.store_id=p_store_id;
 RETURN COALESCE(v_store_default #>> '{fulfillmentTypes,ORDER,workflow}',
                 v_org_default #>> '{fulfillmentTypes,ORDER,workflow}','NONE');
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_fulfillment_workflow_rules(
 p_organization_id varchar, p_store_id varchar, p_search varchar, p_actor_user_id varchar
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE v_categories jsonb; v_products jsonb; v_rules jsonb; v_store_id varchar(64);
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Fulfillment rules access denied' USING ERRCODE='42501'; END IF;
 v_store_id := NULLIF(btrim(p_store_id),'');
 IF v_store_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".stores WHERE store_id=v_store_id AND organization_id=p_organization_id AND NOT is_deleted)
 THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'categoryId',x.product_catalog_category_id,'categoryName',x.category_name,
   'catalogId',x.product_catalog_id,'catalogName',x.catalog_name,'productCount',x.product_count)
   ORDER BY x.catalog_name,x.category_name,x.product_catalog_category_id),'[]'::jsonb)
 INTO v_categories FROM (
   SELECT cat.product_catalog_category_id,cat.category_name,cat.product_catalog_id,
     pc.catalog_name, count(p.product_id)::integer AS product_count
   FROM "${schemaName}".product_catalog_category cat
   JOIN "${schemaName}".product_catalog pc
     ON pc.product_catalog_id=cat.product_catalog_id AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
   LEFT JOIN "${schemaName}".product p
     ON p.product_catalog_category_id=cat.product_catalog_category_id
       AND p.organization_id=p_organization_id AND NOT p.is_deleted
   WHERE cat.organization_id=p_organization_id AND NOT cat.is_deleted
   GROUP BY cat.product_catalog_category_id,cat.category_name,cat.product_catalog_id,pc.catalog_name
 ) x;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'productId',x.product_id,'productName',x.product_name,'categoryId',x.product_catalog_category_id,
   'categoryName',x.category_name,'catalogName',x.catalog_name)
   ORDER BY x.product_name,x.product_id),'[]'::jsonb)
 INTO v_products FROM (
   SELECT p.product_id,p.product_name,p.product_catalog_category_id,cat.category_name,pc.catalog_name
   FROM "${schemaName}".product p
   JOIN "${schemaName}".product_catalog pc ON pc.product_catalog_id=p.product_catalog_id
     AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
   LEFT JOIN "${schemaName}".product_catalog_category cat
     ON cat.product_catalog_category_id=p.product_catalog_category_id AND NOT cat.is_deleted
   WHERE p.organization_id=p_organization_id AND NOT p.is_deleted
     AND NULLIF(btrim(p_search),'') IS NOT NULL
     AND (p.product_name ILIKE '%'||btrim(p_search)||'%'
       OR p.product_code ILIKE '%'||btrim(p_search)||'%'
       OR COALESCE(p.sku,'') ILIKE '%'||btrim(p_search)||'%')
   ORDER BY p.product_name,p.product_id LIMIT 100
 ) x;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'targetKind',r.target_kind,'targetId',r.target_id,
   'storeId',r.store_id,'workflow',r.workflow_code,'versionNo',r.version_no)
   ORDER BY r.target_kind,r.target_id,r.store_id),'[]'::jsonb)
 INTO v_rules FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND NOT r.is_deleted
   AND (r.store_id IS NULL OR r.store_id=v_store_id);
 RETURN jsonb_build_object('categories',v_categories,'products',v_products,'rules',v_rules);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_fulfillment_workflow_rule(
 p_organization_id varchar, p_store_id varchar, p_target_kind varchar,
 p_target_id varchar, p_workflow_code varchar, p_expected_version integer, p_actor_user_id varchar
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE v_store varchar(64); v_existing "${schemaName}".fulfillment_workflow_rules%ROWTYPE;
 v_next_version integer;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Fulfillment rule update denied' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version < 0 THEN
   RAISE EXCEPTION 'Expected version is required' USING ERRCODE='22023'; END IF;
 IF p_target_kind NOT IN ('CATEGORY','PRODUCT') OR NULLIF(btrim(p_target_id),'') IS NULL THEN
   RAISE EXCEPTION 'Invalid rule target' USING ERRCODE='22023'; END IF;
 IF p_workflow_code IS NOT NULL AND p_workflow_code NOT IN ('NONE','SIMPLE','DETAILED') THEN
   RAISE EXCEPTION 'Invalid workflow' USING ERRCODE='22023'; END IF;
 v_store:=NULLIF(btrim(p_store_id),'');
 -- Serialize rule creation even for a previously absent rule.
 PERFORM 1 FROM "${schemaName}".organization o
 WHERE o.organization_id=p_organization_id AND NOT o.is_deleted FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002'; END IF;
 IF v_store IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".stores s
   WHERE s.organization_id=p_organization_id AND s.store_id=v_store AND NOT s.is_deleted
 ) THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 IF p_target_kind='CATEGORY' AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".product_catalog_category cat
   JOIN "${schemaName}".product_catalog pc ON pc.product_catalog_id=cat.product_catalog_id
   WHERE cat.product_catalog_category_id=p_target_id AND cat.organization_id=p_organization_id
     AND NOT cat.is_deleted AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
 ) THEN RAISE EXCEPTION 'Category not found' USING ERRCODE='P0002'; END IF;
 IF p_target_kind='PRODUCT' AND NOT EXISTS (
   SELECT 1 FROM "${schemaName}".product p
   JOIN "${schemaName}".product_catalog pc ON pc.product_catalog_id=p.product_catalog_id
   WHERE p.product_id=p_target_id AND p.organization_id=p_organization_id
     AND NOT p.is_deleted AND pc.organization_id=p_organization_id AND NOT pc.is_deleted
 ) THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_existing FROM "${schemaName}".fulfillment_workflow_rules r
 WHERE r.organization_id=p_organization_id AND r.store_id IS NOT DISTINCT FROM v_store
   AND r.target_kind=p_target_kind AND r.target_id=p_target_id FOR UPDATE;
 IF NOT FOUND THEN
   IF p_expected_version<>0 THEN RAISE EXCEPTION 'Rule changed' USING ERRCODE='40001'; END IF;
   IF p_workflow_code IS NOT NULL THEN
     INSERT INTO "${schemaName}".fulfillment_workflow_rules
       (rule_id,organization_id,store_id,target_kind,target_id,workflow_code,created_by,updated_by)
     VALUES ("${schemaName}".generate_runtime_id('FWR'),p_organization_id,v_store,
       p_target_kind,p_target_id,p_workflow_code,p_actor_user_id,p_actor_user_id);
     v_next_version:=1;
   ELSE v_next_version:=0; END IF;
 ELSE
   IF (NOT v_existing.is_deleted AND p_expected_version<>v_existing.version_no)
      OR (v_existing.is_deleted AND p_expected_version<>0) THEN
     RAISE EXCEPTION 'Rule changed' USING ERRCODE='40001'; END IF;
   UPDATE "${schemaName}".fulfillment_workflow_rules SET
     workflow_code=COALESCE(p_workflow_code,workflow_code),
     is_deleted=(p_workflow_code IS NULL),
     updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC',updated_by=p_actor_user_id,
     version_no=version_no+1
   WHERE rule_id=v_existing.rule_id
   RETURNING version_no INTO v_next_version;
 END IF;
 RETURN jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,
    'storeId',v_store,'workflow',p_workflow_code,'versionNo',v_next_version);
END;
$function$;

-- Absolutely no direct application-role writes to new configuration or item state.
REVOKE ALL PRIVILEGES ON TABLE "${schemaName}".fulfillment_workflow_rules,
 "${schemaName}".fulfillment_items,"${schemaName}".fulfillment_item_actions FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "${schemaName}".fulfillment_workflow_rules,
 "${schemaName}".fulfillment_items,"${schemaName}".fulfillment_item_actions FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_policy_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_validate_policy(jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_resolve_product_workflow(varchar,varchar,varchar) FROM "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_fulfillment_workflow_rules(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_fulfillment_workflow_rule(varchar,varchar,varchar,varchar,varchar,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_fulfillment_workflow_rules(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_fulfillment_workflow_rule(varchar,varchar,varchar,varchar,varchar,integer,varchar) TO "${appRole}";
