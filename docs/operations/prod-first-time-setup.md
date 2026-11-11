# Memgine production first-time setup

This runbook is for a reviewed production setup only. It never authorizes a
blind recreation of existing resources. Run every discovery command first and
stop if a resource or database already exists without matching Terraform state.

## Current source gate

Do **not** run the database bootstrap, Liquibase update, Terraform apply, or
release deployment until the historical Liquibase checksum-reconciliation gate
is resolved. The shared migrations `076`, `084`, `202`, `262`, and `278` have
been made schema-neutral for clean PROD initialization, but existing LOCAL/DEV
checksums must be read and reconciled before the corrected historical files can
be deployed safely.

The commands below are the approved sequence once that gate has been resolved
and validated against both an empty disposable PostgreSQL database and an
existing DEV-compatible changelog history.

Before adding any `validCheckSum` values for the corrected historical files,
an authorized operator must obtain the actual stored checksums from both LOCAL
and DEV. This query is read-only and must be run against each environment's
`memginedev` schema:

```sql
SELECT id, author, filename, md5sum
FROM memginedev.databasechangelog
WHERE author = 'mynikatech'
  AND id IN (
    '076-poynt-timestamps-utc',
    '084-standardize-internal-code-columns',
    '202-fix-counter-redemption-pricing-reconciliation-actor',
    '262-staff-assisted-payment-finalization',
    '278-organization-announcement-configuration'
  )
ORDER BY id;
```

Do not set `MD5SUM` to `NULL`, use `clearCheckSums`, or add guessed checksum
values. The retrieved values must be reviewed before adding one exact
`validCheckSum` entry per historical changeset (or both values if LOCAL and
DEV differ).

## 1. Prerequisites and account discovery

Use PowerShell from the repository root. Replace profile placeholders only with
approved production profiles; never enter secret values into `prod.tfvars`.

```powershell
Set-Location D:\MynikaTech\memgine
$env:AWS_PROFILE = 'REPLACE_WITH_PRODUCTION_AWS_PROFILE'
$env:AWS_REGION = 'ca-central-1'
aws sts get-caller-identity
aws s3api head-bucket --bucket memgine-prod-terraform-state-482762107384
aws rds describe-db-instances --db-instance-identifier memgine-prod-postgres
aws ec2 describe-instances --filters Name=tag:Application,Values=memgine Name=tag:Environment,Values=prod
aws secretsmanager list-secrets --filters Key=name,Values=memgine/prod
```

Expected before a first setup: caller identity is the approved production
account; the Terraform state bucket exists; and no unadopted `memgine-prod-*`
RDS, EC2, or secret resources exist. `DBInstanceNotFound` is expected only for
a genuinely new RDS installation. If any existing resource is found, stop and
either import it into reviewed Terraform state or use the existing deployment
process. Never apply a plan that proposes a replacement/deletion of an existing
production resource.

## 2. Terraform backend and configuration

Review `infra/envs/prod/backend.hcl` and `prod.tfvars` first. `prod.tfvars`
must contain the approved non-secret production values, including the real
Meta phone-number ID and verified Canadian OTP origination identity. Supply the
WhatsApp acknowledgement secret only through the process environment.

```powershell
Set-Location D:\MynikaTech\memgine\infra\envs\prod
Copy-Item backend.hcl.example backend.hcl -ErrorAction Stop
Copy-Item prod.tfvars.example prod.tfvars -ErrorAction Stop
# Edit the two files using the approved account, DNS and non-secret values.
$ackSecret = Read-Host 'WhatsApp acknowledgement secret' -AsSecureString
$ackPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ackSecret)
try {
  $env:TF_VAR_whatsapp_delivery_ack_secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ackPointer)
  terraform init -input=false -reconfigure -backend-config=backend.hcl
  terraform validate
  terraform plan -input=false -var-file=prod.tfvars -out=prod.tfplan
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ackPointer)
  Remove-Item Env:TF_VAR_whatsapp_delivery_ack_secret -ErrorAction SilentlyContinue
}
```

Expected: `validate` succeeds and the plan creates only reviewed production
resources. The plan must not show DEV resources, replacements of discovered
production resources, or deletion of state infrastructure. If it does, stop;
do not use `-replace`, `-target`, or `apply` to force progress.

After a second-person review of `prod.tfplan`, the authorized operator may run:

```powershell
terraform apply prod.tfplan
```

Then capture only non-secret outputs needed by subsequent commands:

```powershell
terraform output app_database_endpoint
terraform output app_database_port
terraform output app_elastic_ip
terraform output app_database_liquibase_secret_arn
terraform output app_database_runtime_secret_arn
terraform output app_otp_pepper_secret_arn
terraform output -raw app_poynt_payment_bridge_callback_secret_arn
```

## 3. Populate approved secrets and provider configuration

Terraform creates containers, not credential values. Populate values through
the approved Secrets Manager console or approved CLI procedure only after
reviewing each ARN. Required production entries include the Liquibase/runtime
database credentials, OTP pepper, Poynt Cloud integration credentials, and the
Poynt Payment Bridge callback secret. Do not put a callback value in
`memgine.env`, Terraform source, release properties, or `prod.tfvars`.

The Poynt callback secret must be distinct from DEV. Confirm the production
Poynt callback URL is:

```text
https://api-memgine.mynikatech.in/api/v1/commerce/providers/poynt/payment-bridge/callback
```

Expected: `aws secretsmanager get-secret-value --secret-id <approved-arn>`
returns a non-empty value only to an authorized operator. Do not print it.

## 4. PostgreSQL bootstrap

Use an approved RDS master secret ARN and a direct RDS/approved administrative
connection. The bootstrap creates database `memgine`, schema `memgine`,
Liquibase role `memgine_user`, and runtime role `memgine_app`.

```powershell
Set-Location D:\MynikaTech\memgine
.\DB\env\prod\bootstrap-prod-memgine.ps1 `
  -MasterSecretArn '<approved-rds-master-secret-arn>' `
  -LiquibaseSecretArn (terraform -chdir=infra/envs/prod output -raw app_database_liquibase_secret_arn) `
  -RuntimeSecretArn (terraform -chdir=infra/envs/prod output -raw app_database_runtime_secret_arn) `
  -AwsProfile $env:AWS_PROFILE `
  -AwsRegion ca-central-1
```

Expected: bootstrap completes without printing passwords. It grants default
DML and sequence privileges only to `memgine_app`; it does not grant schema
ownership or DDL rights to that runtime role. If the database/schema already
exists, stop and inspect its ownership and migration history before rerunning.

## 5. Liquibase preview and update

Only run these after the historical migration gate is resolved.

```powershell
Set-Location D:\MynikaTech\memgine
.\DB\scripts\liquibase-update-sql.ps1 `
  -Environment prod `
  -AwsProfile $env:AWS_PROFILE `
  -AwsRegion ca-central-1 `
  -DatabaseHost '<approved-rds-endpoint>' `
  -DatabasePort 5432
```

Expected: a non-mutating `DB/build/liquibase/update-prod.sql` with every
statement reviewed. Validate that `DATABASECHANGELOG` is empty only for a new
database and that the target schema is `memgine`.

After DBA review, run:

```powershell
.\DB\scripts\liquibase-update.ps1 `
  -Environment prod `
  -AwsProfile $env:AWS_PROFILE `
  -AwsRegion ca-central-1 `
  -DatabaseHost '<approved-rds-endpoint>' `
  -DatabasePort 5432
```

Expected: the operator must type `APPLY-PROD`; Liquibase uses `memgine_user`.
On any validation, checksum, ownership, or schema error, stop. Do not run
`clearCheckSums`, `changelogSync`, or manual `DATABASECHANGELOG` updates.

## 6. EC2 host, TLS, and Nginx

After Terraform creates or adopts the EC2 host, connect through the approved
administrative path. Install Java 21, Nginx, AWS CLI, jq, Certbot, curl, and
OpenSSL, then run the repository’s setup validation. Configure DNS only after
the reviewed Terraform output supplies the Elastic IP.

```bash
sudo /opt/memgine/scripts/common/deployment/linux/setup-host.sh prod --check-only
sudo /opt/memgine/scripts/common/https/linux/check-certificates.sh /opt/memgine/scripts/env/prod/https
sudo nginx -t
sudo systemctl is-active --quiet nginx
```

Expected: `memgine-prod` uses `/opt/memgine`, `/var/www/memgine-prod`, and
port `8082`. Nginx proxies the API to `127.0.0.1:8082`; the health check uses
that same port. Certificate failure, DNS mismatch, or Nginx test failure is a
stop condition.

## 7. Build, publish, and deploy the first release

Build artifacts from a reviewed commit. The production EAS and web settings use
`https://memgine.mynikatech.in` and `https://api-memgine.mynikatech.in`; Poynt
simulator settings must remain disabled.

```powershell
Set-Location D:\MynikaTech\memgine
.\gradlew.bat :server:shadowJar --no-daemon --console=plain
Set-Location frontend
npx tsc --noEmit
npx expo export --platform web
Set-Location ..
.\server\scripts\publish-release.ps1 `
  -Environment prod `
  -ReleaseId '<approved-release-id>' `
  -FrontendOutputDirectory '.\frontend\dist' `
  -AwsProfile $env:AWS_PROFILE
```

Expected: release publication contains no direct secret values. The generated
deployment properties contain only the production callback secret ARN. On EC2,
run the approved remote deployment command for that release; it retrieves the
callback secret into `backend-secrets.env` and fails closed if unavailable.

## 8. Post-deployment checks and payment readiness

```bash
sudo systemctl status memgine-prod --no-pager
sudo /opt/memgine/scripts/common/deployment/linux/health-check.sh /opt/memgine/scripts/env/prod/https
curl --fail --silent --show-error https://api-memgine.mynikatech.in/health
curl --fail --silent --show-error -I https://memgine.mynikatech.in
```

Confirm the callback route returns unauthorized without its header and that a
controlled authorized integration test is approved before any real terminal
transaction. Do not enable LIVE messaging, refunds, Apple Pay registration, or
support workers as part of this runbook.

## 9. Android and iOS release prerequisites

Before a store build, verify the production EAS profile, production API URL,
Android package ID, iOS bundle ID, signing credentials, associated domains,
privacy metadata, and store listing ownership. Missing Apple/Google signing
identities are a release blocker; never fabricate them in source or EAS config.

```powershell
Set-Location D:\MynikaTech\memgine\frontend
npx tsc --noEmit
npx eas build:configure
# Submit only after an approved production binary and store-account review.
```

## Failure handling

Stop at the failing stage, preserve logs without secrets, and return to the
last successful Terraform state/release. Terraform apply failures require a
reviewed recovery plan; do not delete resources or state. Deployment failures
use the existing release rollback path and must not delete a working callback
credential or database.
