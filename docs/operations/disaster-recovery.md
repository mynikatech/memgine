# Memgine disaster recovery and rebuild runbook

This runbook is a controlled recovery procedure. It never authorizes a production
cutover, deletion, Terraform state replacement, or secret overwrite by itself.

## Protection model

- Terraform state is remote S3 state. DEV uses
  `memgine-dev-terraform-state-482762107384` with the `dev/terraform.tfstate`
  key, S3 versioning, S3 server-side encryption, public access blocking, and
  S3-native locking (`use_lockfile = true`).
- PROD has an independent backend template with the `prod/terraform.tfstate`
  key. Its state bucket must be created, versioned, encrypted, access-restricted,
  and populated through the approved PROD bootstrap before a PROD deployment.
- Application deployment artifacts and application data use separate private,
  encrypted, versioned S3 buckets. Lifecycle rules remove only noncurrent
  versions and incomplete multipart uploads; they do not delete current
  application-data objects.
- RDS is private and encrypted. Automated-backup, final-snapshot, and deletion
  policy comes from environment tfvars.
- Secret values are not stored in Terraform. RDS manages its master secret;
  separate Liquibase and runtime secrets hold application credentials.

## Mandatory recovery rules

1. Never run `terraform apply` against a damaged state before recovering the
   correct remote-state version.
2. Restore an RDS backup or point-in-time recovery target into a **new** RDS
   instance. Never overwrite or delete the source instance automatically.
3. Validate the restored database, application, and S3 access before changing
   runtime secrets, DNS, or traffic.
4. A production secret endpoint update requires the explicit confirmation value
   enforced by `update-db-secret-endpoint.ps1`.
5. Preserve the original RDS master secret. Use it only for database bootstrap
   or recovery administration, never for normal Liquibase or Ktor runtime use.

## A. EC2/application host lost

1. Stop and confirm RDS and application-data buckets remain healthy.
2. Run the normal Terraform plan for the environment and review replacement
   scope. Terraform keeps RDS and S3 resources in state; do not target them.
3. Apply the approved saved plan using the normal deployment script.
4. Confirm the replacement EC2 instance is online in SSM.
5. Deploy a known-good release from the versioned deployment bucket with the
   existing `server/scripts/deploy.sh <environment> <release-id>` workflow.
6. Run `validate-recovery.ps1`. Cut traffic only after approval.

`rebuild-app-host.ps1` intentionally delegates to `infra/scripts/deploy.ps1`;
it does not define a second infrastructure implementation.

## B. RDS instance failure or corruption

1. Select an approved DB snapshot or use the latest restorable point only after
   confirming the recovery objective. DEV retains seven days; PROD retains
   fourteen days.
2. Obtain the current DB subnet group and database security-group IDs from the
   approved Terraform outputs/state. Choose a unique target identifier such as
   `memgine-prod-postgres-recovery-YYYYMMDD`.
3. Run `restore-rds.ps1` with either `-SnapshotIdentifier` or
   `-UseLatestRestorableTime`. It requires an exact confirmation and creates a
   new private RDS instance. It does not change the source or traffic.
4. Wait until RDS reports `available`; validate schema/data and role access via
   an SSM port-forwarded connection.
5. Do not recreate PostgreSQL application roles unless recovery validation
   proves they are absent. A normal RDS restore carries restored database
   content and roles as applicable.
6. After explicit approval, update the Liquibase and runtime secret endpoints
   separately with `update-db-secret-endpoint.ps1`. This changes only `host`
   and `port` while validating username, database, and schema.
7. Restart/deploy the backend using the normal deployment workflow, validate
   health and data, then obtain separate approval for any DNS/traffic cutover.

## C. Full environment rebuild

1. Recover Terraform state first if necessary; do not create parallel resources
   merely because state is missing.
2. Rebuild disposable host/network resources through the normal Terraform
   environment plan/apply process.
3. Restore RDS to a new instance and validate it as in scenario B.
4. Keep the versioned app-data bucket as the source of runtime assets. Restore
   an S3 object version only when the data-validation step identifies a missing
   or corrupted object.
5. Restore secrets from the approved secret-management process; Terraform
   recreates secret containers only, never their values.
6. Deploy a known-good release, validate HTTPS, API health, RDS reachability,
   SSM, and S3 access, then seek traffic-cutover approval.

## D. Accidental S3 application-data object deletion

1. Confirm the object key and intended prior version.
2. Copy or restore the selected previous S3 object version to the approved
   current key. Do not delete other versions while investigating.
3. Validate application behavior before removing any recovery copies.

## E. Terraform state loss or corruption

1. Stop all applies immediately.
2. Inspect the versioned remote state object and recover the approved previous
   version in a controlled maintenance action.
3. Run a read-only Terraform plan and reconcile it with AWS before any apply.
4. Do not recreate resources blindly and do not use state-move commands during
   incident response without a reviewed recovery plan.

## DR helper scripts

- `infra/scripts/dr/restore-rds.ps1` restores a snapshot/PITR point to a new
  instance only.
- `infra/scripts/dr/update-db-secret-endpoint.ps1` updates one validated
  Liquibase or runtime DB secret endpoint after explicit confirmation.
- `infra/scripts/dr/rebuild-app-host.ps1` references the normal Terraform
  deployment workflow and requires an approved release ID for apply.
- `infra/scripts/dr/validate-recovery.ps1` checks SSM, RDS status, S3 access,
  HTTPS frontend/API health, and optionally a deliberately supplied database
  TCP endpoint.

## Remaining account prerequisites

- Create and protect the PROD Terraform state bucket before first PROD use.
  It must match the DEV protection properties and use the distinct PROD key.
- Grant the recovery operator only the approved RDS restore, SSM, S3, and
  Secrets Manager permissions. The EC2 runtime role must continue to read only
  the runtime DB secret and required application provider secrets.
- Keep an approved catalog of release IDs and tested database recovery points.
