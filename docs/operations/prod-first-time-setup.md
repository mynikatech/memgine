# Memgine — Production First-Time Setup

## Purpose

This document describes the controlled first-time setup of Memgine PROD.

Run all commands from `D:\MynikaTech\memgine` unless stated otherwise.

Do not recreate existing production resources blindly. If AWS resources
already exist, inspect and adopt them into Terraform state before proceeding.

### Environment identity

| Component           | PROD value                        |
| ------------------- | --------------------------------- |
| AWS region          | ca-central-1                      |
| Database            | memgine                           |
| Schema              | memgine                           |
| Liquibase role      | memgine_user                      |
| Application role    | memgine_app                       |
| Backend service     | memgine-prod                      |
| Backend port        | 8082                              |
| Application root    | /opt/memgine                      |
| Web root            | /var/www/memgine-prod             |
| Web URL             | https://memgine.mynikatech.in     |
| API URL             | https://api-memgine.mynikatech.in |
| Terraform state key | prod/terraform.tfstate            |

## 1. Database migration readiness

Historical migrations 076, 084, 202, 262 and 278 were corrected to use
Liquibase environment-specific schema and application-role properties.

LOCAL and DEV database checksums have been reconciled by the operator.
The five records remain EXECUTED with recalculated checksums.

No validCheckSum entries or additional changes to DATABASECHANGELOG are
required for this completed reconciliation.

IMPORTANT:

Before running migrations against the actual PROD database, validate
the complete historical Liquibase chain against an empty disposable
PostgreSQL 17 database using schema `memgine`.

Successful LOCAL/DEV reconciliation does not establish that a complete
fresh production initialization has succeeded.

Do not create schema `memginedev` in PROD.

## 2. AWS prerequisites

Verify the approved AWS account, CLI profile and region.

```powershell
Set-Location D:\MynikaTech\memgine

$env:AWS_PROFILE = "memgine"
$env:AWS_REGION = "ca-central-1"

aws sts get-caller-identity
```

Verify that this is the intended production infrastructure account.

Inspect existing resources:

```powershell
aws s3api head-bucket --bucket memgine-prod-terraform-state-482762107384

aws rds describe-db-instances --db-instance-identifier memgine-prod-postgres

aws ec2 describe-instances --filters Name=tag:Application,Values=memgine Name=tag:Environment,Values=prod

aws secretsmanager list-secrets --filters Key=name,Values=memgine/prod
```

Stop if existing resources are not represented correctly in Terraform state.

The remote Terraform state bucket must exist before backend initialization.

## 3. Terraform configuration

Directory:

`infra/envs/prod`

Files:

- backend.hcl
- prod.tfvars
- .terraform.lock.hcl

The PROD provider lockfile is already committed and pins AWS provider 5.100.0.

Do not overwrite the configured `backend.hcl` with
`backend.hcl.example`.

Review its bucket, key, region and AWS profile.

```powershell
Set-Location D:\MynikaTech\memgine\infra\envs\prod

if (-not (Test-Path .\backend.hcl)) {
    throw "Configure PROD backend.hcl before continuing."
}

if (-not (Test-Path .\prod.tfvars)) {
    Copy-Item .\prod.tfvars.example .\prod.tfvars
}
```

Review and complete prod.tfvars, including:

- Approved AWS profiles.
- EC2 instance type.
- RDS instance class and storage configuration.
- Production Meta WhatsApp phone-number ID.
- Production live-SMS approval.

The required WhatsApp acknowledgement secret must be supplied securely
through TF_VAR_whatsapp_delivery_ack_secret, not prod.tfvars.

The Canadian OTP origination identity is provisioned by sms.tf and
published through Terraform outputs. It is not a tfvars input.

### Initialize and validate

```powershell
$ackSecret = Read-Host "WhatsApp acknowledgement secret" -AsSecureString
$ackPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ackSecret)

try {
    $env:TF_VAR_whatsapp_delivery_ack_secret =
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ackPointer)

    terraform init -input=false -backend-config=backend.hcl
    terraform validate
    terraform plan -input=false -var-file=prod.tfvars -out=prod.tfplan
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ackPointer)
    Remove-Item Env:TF_VAR_whatsapp_delivery_ack_secret -ErrorAction SilentlyContinue
}
```

Review the saved plan carefully.

The plan must not delete or unexpectedly replace existing resources.
It must not create DEV resources.

Saved Terraform plans may contain sensitive inputs. Do not commit or
publish prod.tfplan.

### Apply only after approval

```powershell
terraform apply prod.tfplan
```

Do not proceed if the plan is unexpected.

## 4. Terraform outputs

After successful provisioning:

```powershell
terraform output app_ec2_instance_id
terraform output app_elastic_ip
terraform output app_database_endpoint
terraform output app_database_port
terraform output -raw app_database_master_secret_arn
terraform output -raw app_database_liquibase_secret_arn
terraform output -raw app_database_runtime_secret_arn
terraform output -raw app_otp_pepper_secret_arn
terraform output -raw app_poynt_payment_bridge_callback_secret_arn
terraform output otp_sms_canada_origination_identity
```

Check that these outputs refer to the approved production AWS account.

## 5. Production Secrets Manager configuration

Terraform creates secret containers; it does not automatically populate
all application credentials.

Populate and verify the approved production secrets.

Required secrets include:

- Database Liquibase credentials.
- Database runtime credentials.
- OTP pepper.
- Poynt production Cloud Application credentials.
- Poynt Payment Bridge callback credential.
- Other provider credentials required by enabled integrations.

PROD callback secret name:

`memgine/prod/poynt/payment-bridge-callback`

Production callback URL:

`https://api-memgine.mynikatech.in/api/v1/commerce/providers/poynt/payment-bridge/callback`

Never use the DEV callback credential for PROD.

Do not place secret values in:

- memgine.env
- frontend.env
- deployment.properties
- prod.tfvars
- Git
- S3 release artifacts

Review the production SMS origination identity and provider eligibility
before allowing live messages.

## 6. PostgreSQL bootstrap

The intended production identities are:

- Database: memgine
- Schema: memgine
- Liquibase role: memgine_user
- Runtime role: memgine_app

Run from the repository root after reviewing RDS provisioning and
Secrets Manager outputs.

```powershell
Set-Location D:\MynikaTech\memgine

.\DB\env\prod\bootstrap-prod-memgine.ps1 `
    -MasterSecretArn "<approved-rds-master-secret-arn>" `
    -LiquibaseSecretArn (terraform -chdir=infra/envs/prod output -raw app_database_liquibase_secret_arn) `
    -RuntimeSecretArn (terraform -chdir=infra/envs/prod output -raw app_database_runtime_secret_arn) `
    -AwsProfile $env:AWS_PROFILE `
    -AwsRegion "ca-central-1"
```

Before executing:

- Verify the target RDS endpoint.
- Verify the selected AWS account.
- Ensure the database does not already contain production data.
- Verify both database-role passwords are supplied securely.

Do not reset an existing PROD database.

## 7. Liquibase validation and update

Only proceed once the corrected migrations have passed the disposable
empty-PROD-schema test.

### Preview

```powershell
Set-Location D:\MynikaTech\memgine

.\DB\scripts\liquibase-update-sql.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE `
    -AwsRegion "ca-central-1" `
    -DatabaseHost "<approved-rds-endpoint>" `
    -DatabasePort 5432
```

Generated file:

`DB/build/liquibase/update-prod.sql`

Review the generated SQL and confirm:

- The target schema is memgine.
- No memginedev objects are created.
- No DEV-specific roles are referenced.
- All required migration files are included.
- There are no unresolved schema-property placeholders.

### Apply

```powershell
.\DB\scripts\liquibase-update.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE `
    -AwsRegion "ca-central-1" `
    -DatabaseHost "<approved-rds-endpoint>" `
    -DatabasePort 5432
```

The operator must explicitly approve the production update.

Stop immediately on migration, ownership or permission errors.

Do not use clearCheckSums or changelogSync to bypass failures.

## 8. EC2 host prerequisites and setup

Before initial host setup, verify the following are installed/configured
on the production EC2 instance:

- Java 21.
- Nginx.
- AWS CLI.
- jq.
- Certbot.
- curl.
- OpenSSL.
- memgine Linux user.
- /opt/memgine application directories.
- /var/www/memgine-prod directory.
- SSM connectivity and the memgine-sync-scripts bootstrap utility.

The shared setup-host script validates these prerequisites; it does not
install missing OS packages or create all required users/directories.

Set up the host through the approved provisioning/bootstrap process.

Configure DNS for both production domains to point to the Terraform
Elastic IP before requesting certificates.

### Initial setup

From the Windows deployment workstation:

```powershell
Set-Location D:\MynikaTech\memgine

.\server\scripts\setup-host.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE
```

This synchronizes the deployment scripts and invokes production host
initialization, including HTTPS configuration.

Only after initial setup succeeds, validate:

```powershell
.\server\scripts\setup-host.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE `
    -CheckOnly
```

Do not run CheckOnly before certificates, runtime files and Nginx have
been established.

Do not attempt backend health checks until the first release is deployed.

## 9. Production runtime configuration

Review the Git-ignored runtime configuration files:

`server/scripts/env/prod/https/memgine.env`

`server/scripts/env/prod/https/frontend.env`

Create them from their corresponding .example files only when absent.

Verify:

- MEMGINE_ENVIRONMENT=prod
- MEMGINE_DB_SCHEMA=memgine
- MEMGINE_SERVER_PORT=8082
- MEMGINE_ENFORCE_HTTPS=true
- MEMGINE_OTP_AWS_REGION=ca-central-1
- MEMGINE_WEB_BASE_URL=https://memgine.mynikatech.in
- MEMGINE_API_BASE_URL=https://api-memgine.mynikatech.in
- MEMGINE_ALLOWED_ORIGINS=https://memgine.mynikatech.in
- Production Poynt Cloud endpoint
- Correct callback URL
- No DEV URLs or credentials
- Production simulator disabled

Ensure all required production-specific settings are supplied before
the backend starts.

## 10. Build the first production release

Use the repository's environment-aware build scripts.

Do not run a direct `npx expo export` from a shell that may contain
LOCAL or DEV environment variables.

### Backend build

```powershell
Set-Location D:\MynikaTech\memgine

.\server\scripts\build-backend.ps1 -Environment prod
```

### Frontend build

```powershell
.\server\scripts\build-frontend.ps1 -Environment prod
```

The frontend build script:

- Clears inherited EXPO*PUBLIC*\* variables.
- Disables automatic dotenv loading.
- Loads the PROD frontend environment.
- Clears the Metro cache.
- Generates a web-only export.
- Verifies the expected API URL.

Expected output:

`frontend/dist-web`

Verify that the bundle targets:

`https://api-memgine.mynikatech.in`

## 11. Publish the approved release

```powershell
.\server\scripts\publish-release.ps1 `
    -Environment prod `
    -ReleaseId "<approved-release-id>" `
    -FrontendOutputDirectory ".\frontend\dist-web" `
    -AwsProfile $env:AWS_PROFILE
```

The release must contain:

- Backend application JAR.
- Web frontend.
- Release manifest.
- Sanitized runtime configuration.
- Non-secret deployment properties.
- Deployment scripts.

The production callback credential must not be published directly.
Only its Secrets Manager ARN may be included.

## 12. Deploy the approved release

```powershell
.\server\scripts\deploy-release.ps1 `
    -Environment prod `
    -ReleaseId "<approved-release-id>" `
    -AwsProfile $env:AWS_PROFILE
```

The deployment runs through SSM, synchronizes scripts, retrieves
production runtime secrets, updates the backend service and web files,
and performs health checks.

Do not deploy using DEV release artifacts.

## 13. Post-deployment verification

On the production EC2 instance:

```bash
sudo systemctl status memgine-prod --no-pager

sudo /opt/memgine/scripts/common/deployment/linux/health-check.sh \
    /opt/memgine/scripts/env/prod/https

sudo nginx -t
```

Verify the public endpoints:

```bash
curl --fail --silent --show-error \
    https://api-memgine.mynikatech.in/health

curl --fail --silent --show-error -I \
    https://memgine.mynikatech.in
```

Verify:

- Backend service is running.
- PostgreSQL connection succeeds.
- Assets use the production S3 bucket.
- OTP configuration is production-specific.
- Production notification resources are selected.
- Payment Bridge rejects unauthenticated callbacks.
- Poynt integrations use approved production credentials.
- No DEV endpoints or simulator settings are active.

Real payment testing requires a separately approved controlled test.

## 14. Android and iOS

Before production builds verify:

- frontend/eas.json production profile.
- Production API and web URL.
- Android package ID.
- iOS bundle ID.
- Android signing credentials.
- iOS provisioning certificates.
- Associated domains and app-link identity values.
- App Store / Play Console account configuration.
- Poynt simulator disabled.

Use the production EAS profile only after these checks.

## 15. Failure and rollback

Stop immediately if any stage fails.

Do not:

- Delete Terraform state.
- Recreate RDS without investigation.
- Force-replace production resources.
- Clear Liquibase history.
- Substitute DEV credentials.
- Publish application secrets.
- Retry a destructive operation without reviewing its effects.

Preserve diagnostic logs without credentials, investigate the failed
stage and use the existing approved deployment rollback process where
applicable.
