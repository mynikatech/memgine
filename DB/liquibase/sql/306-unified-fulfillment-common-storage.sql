-- Unified Fulfillment COMMON STORAGE ONLY (Liquibase changeset 306).
-- All storage required by 307 Organization Admin, 308 Customer, 309 Counter + Support.
-- No persistent business functions, new triggers, background jobs or payment-state changes.
-- Do not apply alongside any other draft of changeset 306; previous drafts were UNAPPLIED.
-- ${schemaName} is supplied by existing Liquibase configuration.
-- PREREQUISITE: inspect preflight notes / run LOCAL updateSQL and structural tests before applying.

ALTER TABLE "${schemaName}".organization_redemption_configurations
  ADD COLUMN IF NOT EXISTS fulfillment_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "${schemaName}".stores
  ADD COLUMN IF NOT EXISTS fulfillment_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Safe on repeat execution: add a CHECK only when absent on this table.
DO $fulfillment_constraints$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='"${schemaName}".organization_redemption_configurations'::regclass
     AND conname='ck_org_fulfillment_policy_object') THEN
   ALTER TABLE "${schemaName}".organization_redemption_configurations
     ADD CONSTRAINT ck_org_fulfillment_policy_object
     CHECK (jsonb_typeof(fulfillment_policy) = 'object');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='"${schemaName}".stores'::regclass
     AND conname='ck_store_fulfillment_overrides_object') THEN
   ALTER TABLE "${schemaName}".stores
     ADD CONSTRAINT ck_store_fulfillment_overrides_object
     CHECK (jsonb_typeof(fulfillment_overrides) = 'object');
 END IF;
END;
$fulfillment_constraints$;

COMMENT ON COLUMN "${schemaName}".organization_redemption_configurations.fulfillment_policy IS
  'Generic per-fulfillment-type enabled journeys and policies. Existing QR/soft-delete policy remains separate.';
COMMENT ON COLUMN "${schemaName}".stores.fulfillment_overrides IS
  'Store-only overrides of organization fulfillment policy; missing keys inherit defaults.';

-- Policy semantics (307 implements validation and authorized updates):
--   fulfillmentTypes.ORDER.enabled = true (initial implemented capability)
--   ORDER: IMMEDIATE+PAY_AT_COUNTER = enabled (default, can be disabled)
--   ORDER: ADVANCE+PAY_NOW = disabled by default
--   ORDER: ADVANCE+PAY_AT_COUNTER = disabled by default
--   Workflow NONE by default; all methods independently configurable.
--   Request channel is independent of timing/payment choice; QR creation/acceptance may differ.
--   Register non-ORDER types as references, NEVER expose them operationally until supported.
--   No forced payment-provider charge when amount due is zero.
--   The policies are defaults/effective resolution rules, not seeded per-org JSON rows.


-- Reference data: stable business IDs and global status codes. No migration-based IDs.
-- Stage exactly the agreed business mappings once per execution; these temporary
-- tables are session-local and explicitly dropped at the end, including when
-- SQL is run with autocommit enabled. They never become product tables.
DROP TABLE IF EXISTS pg_temp.fulfillment_seed_categories;
DROP TABLE IF EXISTS pg_temp.fulfillment_seed_choices;
CREATE TEMP TABLE fulfillment_seed_categories (
 entity_type_id varchar(64) NOT NULL PRIMARY KEY,
 entity_type_code varchar(128) NOT NULL UNIQUE,
 entity_type_name text NOT NULL,
 display_order integer NOT NULL
) ON COMMIT PRESERVE ROWS;
INSERT INTO pg_temp.fulfillment_seed_categories
 (entity_type_id, entity_type_code, entity_type_name, display_order)
VALUES ('ENTITY_TYPE_FULFILLMENT_TYPE', 'FULFILLMENT_TYPE', 'Fulfillment type', 316),
 ('ENTITY_TYPE_FULFILLMENT_REQUEST_CHANNEL', 'FULFILLMENT_REQUEST_CHANNEL', 'Fulfillment request channel', 317),
 ('ENTITY_TYPE_FULFILLMENT_REQUEST_TIMING', 'FULFILLMENT_REQUEST_TIMING', 'Fulfillment request timing', 318),
 ('ENTITY_TYPE_PAYMENT_TIMING', 'PAYMENT_TIMING', 'Payment timing', 319),
 ('ENTITY_TYPE_FULFILLMENT_WORKFLOW', 'FULFILLMENT_WORKFLOW', 'Fulfillment tracking workflow', 320),
 ('ENTITY_TYPE_FULFILLMENT_STATUS', 'FULFILLMENT_STATUS', 'Fulfillment operational status', 321),
 ('ENTITY_TYPE_ENTITLEMENT_RESERVATION_STATUS', 'ENTITLEMENT_RESERVATION_STATUS', 'Entitlement reservation status', 322),
 ('ENTITY_TYPE_FULFILLMENT_ACTION_TYPE', 'FULFILLMENT_ACTION_TYPE', 'Fulfillment action type', 323),
 ('ENTITY_TYPE_FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_NOTIFICATION_EVENT', 'Fulfillment notification event', 324),
 ('ENTITY_TYPE_COLLECTION_SCHEDULING_POLICY', 'COLLECTION_SCHEDULING_POLICY', 'Collection scheduling policy', 325),
 ('ENTITY_TYPE_FULFILLMENT_CREDENTIAL_TYPE', 'FULFILLMENT_CREDENTIAL_TYPE', 'Fulfillment credential type', 326);

CREATE TEMP TABLE fulfillment_seed_choices (
 category varchar(128) NOT NULL,
 code varchar(128) NOT NULL,
 label text NOT NULL,
 description text,
 position integer NOT NULL,
 PRIMARY KEY(category,code)
) ON COMMIT PRESERVE ROWS;
INSERT INTO pg_temp.fulfillment_seed_choices
 (category,code,label,description,position)
VALUES ('FULFILLMENT_TYPE', 'ORDER', 'Order', 'Implemented for current release', 1),
 ('FULFILLMENT_TYPE', 'APPOINTMENT', 'Appointment', 'Registered only; operational capability not implemented', 2),
 ('FULFILLMENT_TYPE', 'SESSION', 'Session', 'Registered only; operational capability not implemented', 3),
 ('FULFILLMENT_TYPE', 'RESERVATION', 'Reservation', 'Registered only; operational capability not implemented', 4),
 ('FULFILLMENT_TYPE', 'SERVICE_REQUEST', 'Service Request', 'Registered only; operational capability not implemented', 5),
 ('FULFILLMENT_TYPE', 'ADMISSION', 'Admission', 'Registered only; operational capability not implemented', 6),
 ('FULFILLMENT_REQUEST_CHANNEL', 'CUSTOMER_APP', 'Customer App', 'Submitted through the customer mobile app', 1),
 ('FULFILLMENT_REQUEST_CHANNEL', 'WEB', 'Web', 'Submitted through a web interface', 2),
 ('FULFILLMENT_REQUEST_CHANNEL', 'COUNTER_STAFF', 'Counter Staff', 'Created by counter staff', 3),
 ('FULFILLMENT_REQUEST_TIMING', 'IMMEDIATE', 'Immediate', 'Immediate fulfillment request', 1),
 ('FULFILLMENT_REQUEST_TIMING', 'ADVANCE', 'Advance', 'Submitted ahead of expected fulfillment', 2),
 ('PAYMENT_TIMING', 'PAY_NOW', 'Pay Now', 'Payment expected during request submission', 1),
 ('PAYMENT_TIMING', 'PAY_AT_COUNTER', 'Pay at Counter', 'Payment expected at the counter', 2),
 ('FULFILLMENT_WORKFLOW', 'NONE', 'None', 'Start and verified completion without intermediate steps', 1),
 ('FULFILLMENT_WORKFLOW', 'SIMPLE', 'Simple', 'Placed to Fulfilled; no Preparing or Ready', 2),
 ('FULFILLMENT_WORKFLOW', 'DETAILED', 'Detailed', 'Placed to Preparing to Ready to Fulfilled; allowed skips', 3),
 ('FULFILLMENT_STATUS', 'PLACED', 'Placed', 'Accepted operational obligation', 1),
 ('FULFILLMENT_STATUS', 'PREPARING', 'Preparing', 'Preparation under way', 2),
 ('FULFILLMENT_STATUS', 'READY', 'Ready', 'Available for fulfillment/collection', 3),
 ('FULFILLMENT_STATUS', 'FULFILLED', 'Fulfilled', 'Handover or service completion verified', 4),
 ('FULFILLMENT_STATUS', 'CANCEL_REQUESTED', 'Cancellation Requested', 'Pending safe cancellation/financial reconciliation', 5),
 ('FULFILLMENT_STATUS', 'CANCELLED', 'Cancelled', 'Safely cancelled', 6),
 ('ENTITLEMENT_RESERVATION_STATUS', 'RESERVED', 'Reserved', 'Entitlement claim is held', 1),
 ('ENTITLEMENT_RESERVATION_STATUS', 'CONSUMED', 'Consumed', 'Entitlement consumed at verified fulfillment', 2),
 ('ENTITLEMENT_RESERVATION_STATUS', 'RELEASED', 'Released', 'Unused entitlement claim released', 3),
 ('FULFILLMENT_ACTION_TYPE', 'ACCEPTED', 'Accepted', 'Accepted fulfillment', 1),
 ('FULFILLMENT_ACTION_TYPE', 'PREPARATION_STARTED', 'Preparation Started', 'Preparation started', 2),
 ('FULFILLMENT_ACTION_TYPE', 'MARKED_READY', 'Marked Ready', 'Ready recorded', 3),
 ('FULFILLMENT_ACTION_TYPE', 'HANDOVER_CONFIRMED', 'Handover Confirmed', 'Verified delivery/collection', 4),
 ('FULFILLMENT_ACTION_TYPE', 'DELAY_RECORDED', 'Delay Recorded', 'Delay recorded with reason', 5),
 ('FULFILLMENT_ACTION_TYPE', 'COMPLETION_TIME_REVISED', 'Completion Time Revised', 'Completion estimate revised', 6),
 ('FULFILLMENT_ACTION_TYPE', 'COLLECTION_CHANGE_REQUESTED', 'Collection Change Requested', 'Customer requested collection change', 7),
 ('FULFILLMENT_ACTION_TYPE', 'COLLECTION_CHANGE_APPROVED', 'Collection Change Approved', 'Staff approved requested change', 8),
 ('FULFILLMENT_ACTION_TYPE', 'COLLECTION_CHANGE_REJECTED', 'Collection Change Rejected', 'Staff rejected requested change', 9),
 ('FULFILLMENT_ACTION_TYPE', 'CANCELLATION_REQUESTED', 'Cancellation Requested', 'Cancellation requested', 10),
 ('FULFILLMENT_ACTION_TYPE', 'CANCELLED', 'Cancelled', 'Cancellation completed', 11),
 ('FULFILLMENT_ACTION_TYPE', 'NO_SHOW_RECORDED', 'No-show Recorded', 'No-show recorded manually; no forfeiture', 12),
 ('FULFILLMENT_ACTION_TYPE', 'OVERRIDE_APPLIED', 'Override Applied', 'Authorized override with reason', 13),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_PLACED', 'Request Placed', 'Request accepted', 1),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_PREPARING', 'Preparation Started', 'Preparation started', 2),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_DELAYED', 'Delayed', 'Delay flagged', 3),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_COMPLETION_REVISED', 'Completion Time Updated', 'Completion estimate revised', 4),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_COLLECTION_REVISED', 'Collection Time Updated', 'Collection estimate revised', 5),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_READY', 'Ready', 'Ready for fulfillment', 6),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_PICKUP_REMINDER', 'Collection Reminder', 'Customer reminder', 7),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_COMPLETED', 'Fulfilled', 'Verified handover completed', 8),
 ('FULFILLMENT_NOTIFICATION_EVENT', 'FULFILLMENT_CANCELLED', 'Cancelled', 'Cancellation completed', 9),
 ('COLLECTION_SCHEDULING_POLICY', 'ASAP_ONLY', 'As Soon As Possible', 'Earliest possible collection', 1),
 ('COLLECTION_SCHEDULING_POLICY', 'ASAP_OR_SCHEDULED', 'ASAP or Scheduled', 'May select future collection', 2),
 ('FULFILLMENT_CREDENTIAL_TYPE', 'PICKUP_QR', 'Pickup QR', 'Pickup QR identifies existing fulfillment', 1),
 ('FULFILLMENT_CREDENTIAL_TYPE', 'PICKUP_CODE', 'Pickup Code', 'Pickup code identifies existing fulfillment', 2);

-- Fail on divergent ID/code mappings; never silently accept a conflicting ID.
DO $fulfillment_seed_guard$
DECLARE bad text;
BEGIN
 IF (SELECT count(*) FROM pg_temp.fulfillment_seed_categories) <> 11
    OR (SELECT count(*) FROM pg_temp.fulfillment_seed_choices) <> 51 THEN
   RAISE EXCEPTION 'Fulfillment seed definition count mismatch (categories %, choices %)',
     (SELECT count(*) FROM pg_temp.fulfillment_seed_categories),
     (SELECT count(*) FROM pg_temp.fulfillment_seed_choices);
 END IF;

 SELECT format('%s: expected code %s, existing code %s', e.entity_type_id, c.entity_type_code, e.entity_type_code)
 INTO bad FROM pg_temp.fulfillment_seed_categories c
 JOIN "${schemaName}".entity_type e ON e.entity_type_id=c.entity_type_id
 WHERE e.entity_type_code IS DISTINCT FROM c.entity_type_code LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment category ID collision: %',bad; END IF;

 SELECT format('%s: expected ID %s, existing ID %s', c.entity_type_code, c.entity_type_id, e.entity_type_id)
 INTO bad FROM pg_temp.fulfillment_seed_categories c
 JOIN "${schemaName}".entity_type e ON e.entity_type_code=c.entity_type_code
 WHERE e.entity_type_id IS DISTINCT FROM c.entity_type_id LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment category code collision: %',bad; END IF;

 -- A new status code can use its deterministic domain ID only if that ID is unused.
 -- Existing globally shared status codes keep their existing stable IDs.
 SELECT format('%s: generated status ID already belongs to %s', c.code, s.status_code)
 INTO bad FROM (SELECT DISTINCT code FROM pg_temp.fulfillment_seed_choices) c
 JOIN "${schemaName}".statuses s ON s.status_id=('STATUS_' || md5(c.code))::varchar(64)
 WHERE s.status_code IS DISTINCT FROM c.code
   AND NOT EXISTS (SELECT 1 FROM "${schemaName}".statuses same_code
                   WHERE same_code.status_code=c.code) LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment status ID collision: %',bad; END IF;

 -- An existing association pair must use its expected stable business ID.
 SELECT format('%s/%s: expected association ID %s, found %s', c.category,c.code,
   'ENTITY_STATUS_' || md5(c.category || ':' || c.code), es.entity_status_id)
 INTO bad
 FROM pg_temp.fulfillment_seed_choices c
 JOIN "${schemaName}".entity_type et ON et.entity_type_code=c.category
 JOIN "${schemaName}".statuses st ON st.status_code=c.code
 JOIN "${schemaName}".entity_status es ON es.entity_type_id=et.entity_type_id AND es.status_id=st.status_id
 WHERE es.entity_status_id <> ('ENTITY_STATUS_' || md5(c.category || ':' || c.code)) LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment association pair collision: %',bad; END IF;

 -- Conversely, a generated association ID must not point at a different pair.
 SELECT format('%s/%s: association ID already belongs to another pair', c.category,c.code)
 INTO bad
 FROM pg_temp.fulfillment_seed_choices c
 JOIN "${schemaName}".entity_status es
   ON es.entity_status_id=('ENTITY_STATUS_' || md5(c.category || ':' || c.code))
 LEFT JOIN "${schemaName}".entity_type et ON et.entity_type_id=es.entity_type_id
 LEFT JOIN "${schemaName}".statuses st ON st.status_id=es.status_id
 WHERE et.entity_type_code IS DISTINCT FROM c.category OR st.status_code IS DISTINCT FROM c.code
 LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment association ID collision: %',bad; END IF;
END;
$fulfillment_seed_guard$;

INSERT INTO "${schemaName}".entity_type
 (entity_type_id,entity_type_code,entity_type_name,display_order)
SELECT entity_type_id,entity_type_code,entity_type_name,display_order
FROM pg_temp.fulfillment_seed_categories c
WHERE NOT EXISTS (SELECT 1 FROM "${schemaName}".entity_type et
                  WHERE et.entity_type_code=c.entity_type_code);

-- Existing status codes are globally shared. Insert each missing code only once.
INSERT INTO "${schemaName}".statuses
 (status_id,status_code,status_name,description,display_order)
SELECT ('STATUS_' || md5(c.code))::varchar(64), c.code, c.label, c.description, c.position
FROM (SELECT DISTINCT ON (code) code,label,description,position
      FROM pg_temp.fulfillment_seed_choices ORDER BY code,category) c
WHERE NOT EXISTS (SELECT 1 FROM "${schemaName}".statuses s WHERE s.status_code=c.code);

INSERT INTO "${schemaName}".entity_status
 (entity_status_id,entity_type_id,status_id,display_order,system_managed)
SELECT ('ENTITY_STATUS_' || md5(c.category || ':' || c.code))::varchar(64),
       et.entity_type_id, st.status_id,c.position,true
FROM pg_temp.fulfillment_seed_choices c
JOIN "${schemaName}".entity_type et ON et.entity_type_code=c.category
JOIN "${schemaName}".statuses st ON st.status_code=c.code
WHERE NOT EXISTS (SELECT 1 FROM "${schemaName}".entity_status es
                  WHERE es.entity_type_id=et.entity_type_id AND es.status_id=st.status_id);

-- Verify the exact expected category IDs/codes and all category/status associations.
DO $fulfillment_seed_verify$
DECLARE missing text;
BEGIN
 SELECT string_agg(c.entity_type_code,', ') INTO missing
 FROM pg_temp.fulfillment_seed_categories c
 LEFT JOIN "${schemaName}".entity_type et
   ON et.entity_type_id=c.entity_type_id AND et.entity_type_code=c.entity_type_code
 WHERE et.entity_type_id IS NULL;
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment categories missing: %',missing; END IF;

 SELECT string_agg(c.category || '/' || c.code,', ') INTO missing
 FROM pg_temp.fulfillment_seed_choices c
 LEFT JOIN "${schemaName}".entity_type et ON et.entity_type_code=c.category
 LEFT JOIN "${schemaName}".statuses st ON st.status_code=c.code
 LEFT JOIN "${schemaName}".entity_status es
  ON es.entity_type_id=et.entity_type_id AND es.status_id=st.status_id
 WHERE es.entity_status_id IS NULL;
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Fulfillment reference associations missing: %',missing; END IF;
END;
$fulfillment_seed_verify$;


-- 3. Canonical accepted operational obligation. 0 or 1 per originating redemption request.
-- No mandatory subscription FK: public offers and non-membership transactions remain possible later.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillments (
 fulfillment_id varchar(64) PRIMARY KEY,
 organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
 store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
 customer_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 redemption_transaction_id varchar(64) REFERENCES "${schemaName}".redemption_transaction(redemption_transaction_id),
 commerce_transaction_id varchar(64) REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
 fulfillment_number varchar(64) NOT NULL,
 request_channel_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 request_timing_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 payment_timing_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 fulfillment_type_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 workflow_mode_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 fulfillment_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 effective_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 accepted_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 original_expected_completion_at timestamp without time zone,
 expected_completion_at timestamp without time zone,
 original_expected_collection_at timestamp without time zone,
 expected_collection_at timestamp without time zone,
 actual_collection_at timestamp without time zone,
 fulfilled_at timestamp without time zone,
 cancelled_at timestamp without time zone,
 cancellation_requested_at timestamp without time zone,
 no_show_recorded_at timestamp without time zone,
 created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 version_no integer NOT NULL DEFAULT 1,
 CONSTRAINT uq_fulfillment_number_org UNIQUE (organization_id,fulfillment_number),
 CONSTRAINT uq_fulfillment_redemption UNIQUE (redemption_transaction_id),
 CONSTRAINT uq_fulfillment_commerce UNIQUE (commerce_transaction_id),
 CONSTRAINT ck_fulfillment_policy_object CHECK (jsonb_typeof(effective_policy_snapshot)='object'),
 CONSTRAINT ck_fulfillment_version CHECK (version_no >= 1),
 CONSTRAINT ck_fulfillment_original_completion CHECK (original_expected_completion_at IS NULL OR expected_completion_at IS NOT NULL),
 CONSTRAINT ck_fulfillment_original_collection CHECK (original_expected_collection_at IS NULL OR expected_collection_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_fulfillments_store_status ON "${schemaName}".fulfillments(organization_id,store_id,fulfillment_status_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillments_customer ON "${schemaName}".fulfillments(customer_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillments_due_completion ON "${schemaName}".fulfillments(store_id,expected_completion_at) WHERE fulfilled_at IS NULL AND cancelled_at IS NULL;

-- 4. Entitlement reservations are owned by Redemption; link to a fulfillment.
-- One row per request item and acceptance; monetary/discount amounts remain in Commerce.
CREATE TABLE IF NOT EXISTS "${schemaName}".redemption_entitlement_reservations (
 redemption_entitlement_reservation_id varchar(64) PRIMARY KEY,
 fulfillment_id varchar(64) NOT NULL REFERENCES "${schemaName}".fulfillments(fulfillment_id),
 redemption_transaction_item_id varchar(64) NOT NULL REFERENCES "${schemaName}".redemption_transaction_item(redemption_transaction_item_id),
 reservation_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 usage_window_key varchar(160) NOT NULL,
 reserved_quantity integer NOT NULL,
 consumed_quantity integer NOT NULL DEFAULT 0,
 released_quantity integer NOT NULL DEFAULT 0,
 reserved_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 consumed_at timestamp without time zone,
 released_at timestamp without time zone,
 created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 version_no integer NOT NULL DEFAULT 1,
 CONSTRAINT uq_reservation_item UNIQUE (redemption_transaction_item_id),
 CONSTRAINT ck_reservation_quantity CHECK (reserved_quantity > 0 AND consumed_quantity >= 0 AND released_quantity >= 0 AND consumed_quantity + released_quantity <= reserved_quantity),
 CONSTRAINT ck_reservation_version CHECK (version_no >= 1)
);
CREATE INDEX IF NOT EXISTS idx_reservation_fulfillment ON "${schemaName}".redemption_entitlement_reservations(fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_reservation_window_status ON "${schemaName}".redemption_entitlement_reservations(usage_window_key,reservation_status_id);

-- 5. Operational action/evidence history (append-only writes enforced by 309 functions). Actor decisions and customer requests
-- share one log; 309 functions enforce authorization.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillment_actions (
 fulfillment_action_id varchar(64) PRIMARY KEY,
 fulfillment_id varchar(64) NOT NULL REFERENCES "${schemaName}".fulfillments(fulfillment_id),
 action_type_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 actor_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 prior_fulfillment_status_id varchar(64) REFERENCES "${schemaName}".statuses(status_id),
 new_fulfillment_status_id varchar(64) REFERENCES "${schemaName}".statuses(status_id),
 previous_expected_completion_at timestamp without time zone,
 proposed_expected_completion_at timestamp without time zone,
 previous_expected_collection_at timestamp without time zone,
 proposed_expected_collection_at timestamp without time zone,
 reason text,
 action_details jsonb NOT NULL DEFAULT '{}'::jsonb,
 support_reference_id varchar(64),
 action_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 CONSTRAINT ck_fulfillment_action_details CHECK (jsonb_typeof(action_details)='object')
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_action_history ON "${schemaName}".fulfillment_actions(fulfillment_id,action_at,fulfillment_action_id);

-- 6. Separate purpose-scoped pickup credentials. Never reuse short-lived
-- redemption_transaction_qr tokens for multi-hour/day collection verification.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillment_credentials (
 fulfillment_credential_id varchar(64) PRIMARY KEY,
 fulfillment_id varchar(64) NOT NULL REFERENCES "${schemaName}".fulfillments(fulfillment_id),
 credential_type_status_id varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_id),
 token_hash char(64) NOT NULL,
 expires_at timestamp without time zone,
 revoked_at timestamp without time zone,
 used_at timestamp without time zone,
 verified_by varchar(64) REFERENCES "${schemaName}"."user"(user_id),
 created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 version_no integer NOT NULL DEFAULT 1,
 CONSTRAINT uq_fulfillment_credential_token UNIQUE(token_hash),
 CONSTRAINT ck_fulfillment_credential_version CHECK(version_no >= 1),
 CONSTRAINT ck_fulfillment_credential_expiry CHECK(expires_at IS NULL OR expires_at > created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fulfillment_credential_active ON "${schemaName}".fulfillment_credentials(fulfillment_id,credential_type_status_id) WHERE revoked_at IS NULL AND used_at IS NULL;


-- 7. Storage permissions. Until authorized SECURITY DEFINER functions are
-- introduced in 307-309, the application role has no direct access to new
-- fulfillment/entitlement data. The DB owner retains privileges for migrations
-- and SECURITY DEFINER functions. Repeatable: REVOKE is safe on re-execution.
-- Do NOT change grants on existing organization, Store, Redemption or Commerce
-- tables here: they serve the currently operational system.
REVOKE ALL PRIVILEGES ON TABLE
  "${schemaName}".fulfillments,
  "${schemaName}".redemption_entitlement_reservations,
  "${schemaName}".fulfillment_actions,
  "${schemaName}".fulfillment_credentials
FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  "${schemaName}".fulfillments,
  "${schemaName}".redemption_entitlement_reservations,
  "${schemaName}".fulfillment_actions,
  "${schemaName}".fulfillment_credentials
FROM "${appRole}";

-- No GRANT EXECUTE statements in 306: no persistent functions are created.
-- Future migrations MUST follow the existing Memgine convention:
--   REVOKE ALL ON FUNCTION "${schemaName}".function_name(arg_types) FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION "${schemaName}".function_name(arg_types) TO "${appRole}";
-- No direct SELECT/INSERT/UPDATE/DELETE is granted to the application role.

-- Intentional omissions: no triggers; no change to redemption/subscription/Commerce
-- payment or receipt tables; no public-offer eligibility relaxation yet; no
-- appointment/session/admission specialty tables; no automatic expiry/forfeiture.
-- All state transitions, entitlement locks, authoritative payment checks,
-- authorization and notification dispatch are implemented later in 307-309.

-- Release temporary staging data even when executed with autocommit enabled.
DROP TABLE IF EXISTS pg_temp.fulfillment_seed_choices;
DROP TABLE IF EXISTS pg_temp.fulfillment_seed_categories;
