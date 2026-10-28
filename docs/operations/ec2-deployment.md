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

## Apple Pay domain association hosting

Apple Pay domain verification is a domain-level static-file concern. It is
separate from organization/provider-specific merchant registration. Memgine is
multi-tenant: a checkout domain can be used by organizations whose payment
providers, Poynt Business IDs, and merchant-registration processes differ.

The deployment supports exactly one explicitly configured association artifact
per deployed checkout domain. It **does not** assume that association files
from distinct Poynt businesses, Stripe accounts, Moneris accounts, or other
providers are interchangeable. Before sharing a checkout domain across
merchants, obtain written provider confirmation that the required association
file is compatible with that domain and every affected merchant. Otherwise the
case is unsupported by this mechanism and needs provider-specific onboarding
design; do not overwrite the configured artifact.

The version-controlled deployment scripts use these non-secret variables in
the environment's `memgine.env`/deployment configuration:

- `MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED` — `true` only after a reviewed
  artifact is available; defaults to `false`.
- `MEMGINE_APPLE_PAY_ASSOCIATION_S3_BUCKET` — bucket containing the approved
  original provider bytes.
- `MEMGINE_APPLE_PAY_ASSOCIATION_S3_KEY` — object key for those bytes.
- `MEMGINE_APPLE_PAY_ASSOCIATION_INSTALL_PATH` — absolute, Nginx-readable path
  outside `MEMGINE_WEB_ROOT`.
- `POYNT_APPLE_PAY_REGISTRATION_ENABLED` — separate, default-disabled Platform
  Admin registration-action gate; it does not enable artifact hosting.

When enabled, deployment downloads the configured S3 object after the frontend
`aws s3 sync --delete`, rejects empty or obvious HTML/JSON error artifacts, and
atomically renames it into the configured install path. The path is deliberately
outside the release frontend directory so repeated release or rollback syncs
cannot delete it. Nginx serves only the exact path
`/.well-known/apple-developer-merchantid-domain-association`; it serves the
configured file or returns `404`, never the Expo `index.html` fallback.

Before a release is recorded successful, deployment requests the public HTTPS
URL without following redirects, requires HTTP 200, rejects obvious HTML/JSON
fallback content, and compares its SHA-256 to the installed artifact. A failed
verification restores the previous artifact (or removes a newly introduced
one where no previous artifact existed) before using the normal last-successful
release rollback path. The deployment never invokes Poynt merchant-registration
operations.

### Initial DEV setup

Use Memgine Test Bakery only as the first validation merchant; it is not a
global merchant default.

1. An authorized Platform Admin retrieves the original bytes using the
   read-only Poynt domain-association diagnostic for the intended DEV
   integration. Save the response without editing, reformatting, or wrapping
   it. Do not use a browser error page as the artifact.
2. Review the file origin and checksum, then upload the exact approved bytes to
   a persistent, non-release S3 key. For example:

   ```powershell
   aws s3 cp .\apple-developer-merchantid-domain-association "s3://memgine-dev-deploy/provider-artifacts/poynt/apple-pay/approved-domain-association" --no-cli-pager
   ```

   This object must not be under `releases/<release-id>/frontend/`.
3. In the version-controlled DEV deployment configuration for the release, set
   `MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED=true`, its bucket/key, and a path
   such as `/var/lib/memgine/apple-pay/domain-association`. The path must remain
   outside `MEMGINE_WEB_ROOT`. Keep the variables disabled in PROD until the
   PROD provider/business and domain compatibility are separately approved.
4. Use the normal Memgine release deployment. It installs and verifies the
   static file automatically; no manual EC2 setup is required.
5. Confirm the deployment log reports the public checksum verification. For a
   read-only later check through the existing controlled host execution path,
   run:

   ```bash
   bash /opt/memgine/scripts/common/deployment/linux/verify-apple-pay-association.sh /opt/memgine/scripts/env/dev/https
   ```

To rotate a file, upload the newly approved original bytes to the configured
object key (or change the key in the environment configuration), then perform a
normal release deployment. Do not alter merchant registration automatically.
The candidate deployment preserves the currently installed artifact until the
new artifact has passed public checksum verification; rollback restores the
previous verified bytes.

### Poynt Apple Pay merchant registration (controlled DEV onboarding)

Deploying the domain association file does **not** register any merchant. A
Platform Admin must explicitly register each organization's Poynt Business
through the authorized backend workflow. The backend derives the Business ID,
merchant name, checkout URL, and hostname from the selected integration and
environment configuration; browser callers cannot supply any of those values.

For a controlled DEV rollout, including the first Memgine Test Bakery test:

1. Ensure the selected integration is the intended DEV integration. Confirm its
   configured Poynt Business ID through the existing Platform Admin integration
   view; do not copy a Business ID into an API request.
2. Complete the association-file deployment procedure above with
   `MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED=true`, then confirm its deployment
   checksum verification succeeded.
3. Enable only for the approved DEV maintenance window:
   `POYNT_DIAGNOSTICS_ENABLED=true` and
   `POYNT_APPLE_PAY_REGISTRATION_ENABLED=true`. Registration is additionally
   rejected outside `local`, `dev`, or `development` runtime environments.
4. As a Platform Admin, call the read-only readiness endpoint:

   ```text
   GET /api/v1/platform/payment-configurations/poynt/{integrationId}/apple-pay-readiness
   ```

   Proceed only when `status` is `NOT_REGISTERED` and
   `associationStatus` is `ASSOCIATION_PUBLIC_VERIFIED`. If the status is
   `BLOCKED_DOMAIN_ASSOCIATION_CONFLICT`, the selected merchant's Poynt file
   differs from the deployed file: do not register, overwrite the file, or
   create a subdomain without separate provider review.
5. Obtain an explicit change approval, then call:

   ```text
   POST /api/v1/platform/payment-configurations/poynt/{integrationId}/apple-pay-registration
   Content-Type: application/json

   { "confirmed": true }
   ```

   The backend sends only `registerDomains`, `merchantName`, and `merchantUrl`;
   it never sends `unregisterDomains`. `ALREADY_REGISTERED` is returned without
   a provider POST. A successful provider response is followed by a read-back
   registration check before reporting `REGISTERED`.
6. Repeat the read-only readiness call and require `READY`. Then perform the
   normal Safari/iOS wallet eligibility check for the actual checkout domain;
   this verifies browser/device eligibility separately from Poynt registration.
7. Disable `POYNT_APPLE_PAY_REGISTRATION_ENABLED` after the maintenance window.

On provider timeout or other ambiguous POST failure, the backend performs only
a registration GET reconciliation and returns
`REGISTRATION_UNKNOWN_REQUIRES_RECONCILIATION` unless the read-back proves the
domain is registered. Do not repeat the registration request blindly. Attempts
and results are recorded in the append-only activity audit stream with the
Platform Admin actor, organization, integration ID, domain, and sanitized
result—never credentials, tokens, association-file content, or provider bodies.

### Platform Admin Apple Pay artifact workflow

Apple Pay onboarding is managed from the selected **Platform Admin →
Integrations → Payment Provider Integration → Configure** Poynt integration.
The backend stores only artifact metadata/checksums in PostgreSQL; original
provider bytes are private S3 objects under
`MEMGINE_APPLE_PAY_ASSOCIATION_S3_PREFIX`. The Platform Admin sequence is:

1. Retrieve/reuse the merchant-specific association artifact, or explicitly
   refresh it from Poynt. A changed response becomes a candidate; it does not
   replace an already approved artifact.
2. Explicitly approve the candidate, then stage it at
   `MEMGINE_APPLE_PAY_ASSOCIATION_S3_KEY` with **Publish & Verify**.
3. Run a normal controlled deployment to activate the staged object on EC2.
   The deployment installer remains the only component that writes the Nginx
   served file. Public verification must report an exact checksum match.
4. Register the selected merchant only after readiness is `NOT_REGISTERED` and
   hosting is verified, then enable Apple Pay for that exact integration only
   after readiness is `READY`.

`MEMGINE_APPLE_PAY_ASSOCIATION_ENABLED` and
`POYNT_APPLE_PAY_REGISTRATION_ENABLED` both remain `false` until an approved
maintenance window. Different Poynt Business IDs may supply different files;
an incompatible file for an already hosted hostname is blocked rather than
replaced. Multi-provider/domain compatibility requires separate provider
verification and is not assumed by this workflow.

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
