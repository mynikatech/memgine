# Memgine PROD HTTPS Deployment

This directory contains production environment configuration examples
and service-management scripts.

PROD uses the shared Memgine deployment infrastructure, with
production-specific domain names, database identities and secrets.

## Canonical setup guide

Follow:

`docs/operations/prod-first-time-setup.md`

The guide covers:

- AWS and Terraform initialization.
- RDS provisioning and PostgreSQL bootstrap.
- Liquibase preview and update.
- EC2 host initialization.
- HTTPS and Nginx.
- Backend and frontend builds.
- Production release publication and deployment.
- Health checks and mobile build prerequisites.

## Production configuration

The following files must contain reviewed production values:

- `memgine.env`
- `frontend.env`
- `deployment.properties`

The `.example` files are templates only.

Do not copy DEV runtime credentials or callback secrets into PROD.

## Host setup

From the repository root on the authorized Windows workstation:

```powershell
.\server\scripts\setup-host.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE
```

The initial setup requires all host prerequisites and DNS configuration
to be in place.

## Liquibase

Preview production SQL:

```powershell
.\DB\scripts\liquibase-update-sql.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE `
    -DatabaseHost "<approved-rds-endpoint>" `
    -DatabasePort 5432
```

After reviewing and approving the SQL:

```powershell
.\DB\scripts\liquibase-update.ps1 `
    -Environment prod `
    -AwsProfile $env:AWS_PROFILE `
    -DatabaseHost "<approved-rds-endpoint>" `
    -DatabasePort 5432
```

The alternative `infra/scripts/deploy-db.ps1` requires
`-LiquibaseSecretArn` and cannot be invoked with only `prod`.

## Production builds

```powershell
.\server\scripts\build-backend.ps1 -Environment prod
.\server\scripts\build-frontend.ps1 -Environment prod
```

The frontend must be built using the environment-aware script rather
than a direct Expo export from an inherited LOCAL or DEV shell.

## Deployment

Publish and deploy using the approved PowerShell release scripts:

- `server/scripts/publish-release.ps1`
- `server/scripts/deploy-release.ps1`

Follow the canonical setup guide for full command arguments.

Never publish secrets, database passwords, callback header values,
private keys or TLS private keys into Git or S3 release artifacts.
