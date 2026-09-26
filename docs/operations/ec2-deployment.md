# EC2 release deployment

Use `server/scripts/deploy-release.ps1` from a Windows workstation. It builds
the backend and frontend, publishes a versioned release, obtains the target
instance from Terraform state, and runs the existing Linux deployment through
SSM. It never uses SSH.

## Configuration layers

- `deployment.properties` is generated at publish time from Terraform outputs.
  It contains deployment bucket, runtime DB secret ARN, host paths, and EIP;
  none are secret values.
- `memgine.env` remains environment-specific, non-secret runtime behavior. It
  is copied from its example only when absent, so existing overrides survive.
- `backend-secrets.env` is rendered on EC2 from the runtime DB secret at mode
  `0600`; it is neither published nor logged.

## Runtime variables

The EC2 backend requires non-secret `MEMGINE_ENVIRONMENT`, HTTPS/base URL/CORS,
database schema/pool settings, and OTP configuration. It also requires DB URL,
user, and password from the runtime DB secret. `MEMGINE_OTP_PEPPER` is required
by the backend but no DEV/PROD secret container or wiring currently supplies it.
Payment secrets such as `STRIPE_SECRET_KEY`, `MONERIS_CLIENT_SECRET`, and
`MONERIS_CLIENT_ID` are optional in code and need approved Secrets Manager
wiring before a production provider uses them.

The Kotlin server publishes notification events through
`MEMGINE_NOTIFICATION_EVENTS_TOPIC_ARN`. This non-secret topic ARN is not yet
rendered into DEV/PROD `memgine.env`; external OTP delivery will remain
unavailable until it is configured. Provider credentials remain Lambda-only.

## Lambda configuration

- Email: `RESEND_FROM_EMAIL`, `RESEND_API_KEY_SECRET_ID`; secret value lives in
  `memgine/<env>/resend-api-key`.
- WhatsApp: `META_PHONE_NUMBER_ID`, `META_GRAPH_API_VERSION`, and
  `META_WA_TOKEN_SECRET_ID`; token lives in `memgine/<env>/meta-wa-token`.
- SMS: `SMS_PROVIDER=AWS_END_USER_MESSAGING_SMS` and
  `SMS_MESSAGE_TYPE=TRANSACTIONAL`. DEV currently uses a US simulator ARN.
  PROD has no SMS Lambda/origination Terraform wiring yet and must not reuse
  that DEV resource.

## Provider-secret update commands

After obtaining a new key, replace `REDACTED_VALUE` locally; the command does
not echo the value:

```powershell
aws secretsmanager put-secret-value --profile memgine --region ca-central-1 --secret-id memgine/dev/resend-api-key --secret-string 'REDACTED_VALUE' --no-cli-pager
```

For approved production credentials:

```powershell
aws secretsmanager put-secret-value --profile memgine --region ca-central-1 --secret-id memgine/prod/resend-api-key --secret-string 'REDACTED_VALUE' --no-cli-pager
```
