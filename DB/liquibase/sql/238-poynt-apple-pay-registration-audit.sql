-- Extend the existing append-only activity audit vocabulary for explicit,
-- Platform Admin initiated Poynt Apple Pay registration operations.
ALTER TABLE "${schemaName}".activity_audit_events
    DROP CONSTRAINT IF EXISTS activity_audit_events_event_type_check;

ALTER TABLE "${schemaName}".activity_audit_events
    ADD CONSTRAINT ck_activity_audit_events_event_type CHECK (event_type IN (
        'LOGIN_SUCCESS',
        'BUY_MEMBERSHIP_CLICKED',
        'COUNTER_SELL_MEMBERSHIP_CLICKED',
        'COUNTER_REDEEM_CLICKED',
        'REDEMPTION_QR_GENERATED',
        'PURCHASE_COMPLETED',
        'REDEMPTION_COMPLETED',
        'POYNT_APPLE_PAY_REGISTRATION_REQUESTED',
        'POYNT_APPLE_PAY_REGISTRATION_RESULT'
    ));
