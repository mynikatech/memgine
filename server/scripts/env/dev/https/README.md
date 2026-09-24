# DEV HTTPS (Linux)

DEV uses Nginx for static Expo Web output and `memgine-dev.service` for the Ktor backend. The ignored `memgine.env` and `frontend.env` files are loaded by systemd/build scripts; do not place secrets in `.example` files.

First host preparation, after real env files, certificates, the backend fat JAR, Nginx, Java 21, Node/npm, and the non-root `memgine` user exist:

```bash
sudo ./server/scripts/env/dev/https/setup.sh
```

Build static frontend output, then start/stop normally:

```bash
./server/scripts/env/dev/https/build-frontend.sh
sudo ./server/scripts/env/dev/https/start-all.sh
sudo ./server/scripts/env/dev/https/stop-all.sh
```

Individual operations:

```bash
sudo ./server/scripts/env/dev/https/start-backend.sh
sudo ./server/scripts/env/dev/https/stop-backend.sh
sudo ./server/scripts/env/dev/https/restart-backend.sh
sudo ./server/scripts/env/dev/https/start-nginx.sh
sudo ./server/scripts/env/dev/https/reload-nginx.sh
sudo ./server/scripts/env/dev/https/stop-nginx.sh
```

Normal redeployment builds frontend, restarts backend, and reloads Nginx only when Nginx configuration changes. Let's Encrypt certificate paths remain the planned TLS source.