# DEV HTTPS (Linux)

The DEV host uses the shared deployment and TLS scripts under `server/scripts/common`. This directory holds only DEV values: domains, non-secret frontend configuration, and Nginx runtime configuration.

After Terraform creates the host, upload a release, then use SSM to run:

```bash
sudo /usr/local/bin/memgine-sync-scripts
sudo /opt/memgine/scripts/setup-https.sh dev
sudo /opt/memgine/scripts/deploy.sh dev <release-id>
```

Run the separate Liquibase step from the approved deployment workstation before `deploy.sh`:

```powershell
.\infra\scripts\deploy-db.ps1 dev
```

The ignored files `memgine.env`, `frontend.env`, and `deployment.properties` are initialized from their examples by `memgine-sync-scripts`. Set `MEMGINE_EXPECTED_PUBLIC_IP` from Terraform's `app_elastic_ip` output before TLS setup. Secrets are supplied through Secrets Manager/SSM or protected host files, never through S3 config.

Certificate maintenance:

```bash
sudo /opt/memgine/scripts/check-certificates.sh dev
sudo /opt/memgine/scripts/renew-certificates.sh dev
sudo certbot renew --dry-run
```
