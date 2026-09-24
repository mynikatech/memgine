# PROD HTTPS (Linux)

PROD uses Nginx for static Expo Web output and `memgine-prod.service` for the Ktor backend. The ignored `memgine.env` and `frontend.env` files are loaded by systemd/build scripts; do not place secrets in `.example` files.

First host preparation, after real env files, certificates, the backend fat JAR, Nginx, Java 21, Node/npm, and the non-root `memgine` user exist:

```bash
sudo ./server/scripts/env/prod/https/setup.sh
```

Build static frontend output, then start/stop normally:

```bash
./server/scripts/env/prod/https/build-frontend.sh
sudo ./server/scripts/env/prod/https/start-all.sh
sudo ./server/scripts/env/prod/https/stop-all.sh
```

Individual operations:

```bash
sudo ./server/scripts/env/prod/https/start-backend.sh
sudo ./server/scripts/env/prod/https/stop-backend.sh
sudo ./server/scripts/env/prod/https/restart-backend.sh
sudo ./server/scripts/env/prod/https/start-nginx.sh
sudo ./server/scripts/env/prod/https/reload-nginx.sh
sudo ./server/scripts/env/prod/https/stop-nginx.sh
```

Normal redeployment builds frontend, restarts backend, and reloads Nginx only when Nginx configuration changes. Let's Encrypt certificate paths remain the planned TLS source.