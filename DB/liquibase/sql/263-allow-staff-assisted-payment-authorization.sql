-- Extend the existing payment authorization mode check for Staff-Assisted Counter purchases.
-- Existing OTP and CUSTOMER_SESSION modes remain valid.
-- Does not mutate any existing payment/payment-attempt records.

ALTER TABLE payment_intents
    DROP CONSTRAINT ck_payment_intent_authorization;

ALTER TABLE payment_intents
    ADD CONSTRAINT ck_payment_intent_authorization
    CHECK (authorization_mode IN ('OTP', 'CUSTOMER_SESSION', 'STAFF_ASSISTED'));
