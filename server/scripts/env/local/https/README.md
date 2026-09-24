# LOCAL HTTPS (Windows)

LOCAL HTTPS proxies Expo Web (`localhost:8081`) and Ktor (`localhost:8082`) through Nginx. Scripts load the ignored runtime env files automatically.

## Prerequisites

- Nginx for Windows, with `MEMGINE_NGINX_HOME` set to its installation directory.
- `mkcert` on PATH; run `mkcert -install` once.
- An elevated PowerShell session for the first `setup.ps1` hosts-file update.

```powershell
$env:MEMGINE_NGINX_HOME = "C:\tools\nginx"
mkcert -install
.\server\scripts\env\local\https\setup.ps1
```

Start and stop all LOCAL HTTPS components:

```powershell
.\server\scripts\env\local\https\start-all.ps1
.\server\scripts\env\local\https\stop-all.ps1
```

Individual component commands:

```powershell
.\server\scripts\env\local\https\start-backend.ps1
.\server\scripts\env\local\https\stop-backend.ps1
.\server\scripts\env\local\https\start-frontend.ps1
.\server\scripts\env\local\https\stop-frontend.ps1
.\server\scripts\env\local\https\start-nginx.ps1
.\server\scripts\env\local\https\reload-nginx.ps1
.\server\scripts\env\local\https\stop-nginx.ps1
```

`start-all.ps1` leaves an already-running Nginx process alone. Restarting backend or frontend never restarts Nginx. Test <https://memgine.local> and <https://api.memgine.local/health>.