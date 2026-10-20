-- Phase 1: preference/consent persistence only. Do not alter delivery resolver in this migration.
ALTER TABLE "${schemaName}".support_notification_user_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_withdrawn_at timestamptz;
-- Legacy opted-in values must not be treated as proof of explicit consent.
-- Keep whatsapp_opted_in for Phase 2 compatibility, but do not set it true here.
COMMENT ON COLUMN "${schemaName}".support_notification_user_settings.whatsapp_enabled IS 'Customer preference; not proof of WhatsApp consent';
COMMENT ON COLUMN "${schemaName}".support_notification_user_settings.whatsapp_consent_at IS 'Explicit support WhatsApp consent capture time';
