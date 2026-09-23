-- Moneris credentials remain runtime configuration. This only enables the provider code.
INSERT INTO "${schemaName}".payment_provider_configs (
    payment_provider_config_id, organization_id, provider_code, configuration_reference,
    display_name, is_enabled, is_test_mode, created_by, updated_by
) VALUES (
    'payment-provider-moneris', NULL, 'MONERIS', 'environment:MONERIS_CLIENT_ID',
    'Moneris Hosted Tokenization', true, true, 'system', 'system'
) ON CONFLICT (payment_provider_config_id) DO UPDATE
SET provider_code = EXCLUDED.provider_code,
    configuration_reference = EXCLUDED.configuration_reference,
    display_name = EXCLUDED.display_name,
    is_enabled = EXCLUDED.is_enabled,
    is_test_mode = EXCLUDED.is_test_mode,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'system';
