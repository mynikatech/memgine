# PROD HTTPS (Linux)

PROD uses the same shared EC2 deployment, Nginx, systemd, and Certbot scripts as DEV. This directory supplies only production domains and non-secret configuration. The Route53 and Terraform backend values remain placeholders until the production account and state bucket are approved.

After the approved production Terraform state configuration exists, the host flow is:

```bash
sudo /usr/local/bin/memgine-sync-scripts
sudo /opt/memgine/scripts/setup-https.sh prod
sudo /opt/memgine/scripts/deploy.sh prod <release-id>
```

Run the separately approved Liquibase deployment from the deployment workstation before application deployment:

```powershell
.\infra\scripts\deploy-db.ps1 prod
```

Do not put certificate keys, database passwords, provider tokens, or any other secrets in the ignored environment files or in the deployment bucket. Certbot maintains private keys below `/etc/letsencrypt` on the EC2 host.
