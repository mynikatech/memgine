-- Append-only MVP activity audit events. Retain for 180 days by policy.
-- Manual purge, after operational review: DELETE FROM "${schemaName}".activity_audit_events
-- WHERE occurred_at < CURRENT_TIMESTAMP - INTERVAL '180 days';
CREATE TABLE IF NOT EXISTS "${schemaName}".activity_audit_events (
    id varchar(64) PRIMARY KEY,
    event_type varchar(64) NOT NULL CHECK (event_type IN (
        'LOGIN_SUCCESS', 'BUY_MEMBERSHIP_CLICKED', 'COUNTER_SELL_MEMBERSHIP_CLICKED',
        'COUNTER_REDEEM_CLICKED', 'REDEMPTION_QR_GENERATED', 'PURCHASE_COMPLETED',
        'REDEMPTION_COMPLETED'
    )),
    occurred_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_user_id varchar(64),
    actor_role varchar(32),
    organization_id varchar(64),
    store_id varchar(64),
    staff_id varchar(64),
    customer_user_id varchar(64),
    membership_product_id varchar(64),
    subscription_id varchar(64),
    transaction_id varchar(64),
    platform varchar(16) NOT NULL DEFAULT 'UNKNOWN' CHECK (platform IN ('WEB', 'ANDROID', 'IOS', 'UNKNOWN')),
    source varchar(32) NOT NULL CHECK (source IN ('CUSTOMER', 'COUNTER', 'ORG_ADMIN', 'PLATFORM_ADMIN')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    deduplication_key varchar(160)
);

CREATE INDEX IF NOT EXISTS ix_activity_audit_events_type_occurred
    ON "${schemaName}".activity_audit_events (event_type, occurred_at);
CREATE INDEX IF NOT EXISTS ix_activity_audit_events_organization_occurred
    ON "${schemaName}".activity_audit_events (organization_id, occurred_at);
CREATE INDEX IF NOT EXISTS ix_activity_audit_events_actor_occurred
    ON "${schemaName}".activity_audit_events (actor_user_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_activity_audit_events_deduplication_key
    ON "${schemaName}".activity_audit_events (deduplication_key)
    WHERE deduplication_key IS NOT NULL;

REVOKE ALL ON TABLE "${schemaName}".activity_audit_events FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "${schemaName}".activity_audit_events TO "${appRole}";
