# LOCAL HTTP (Windows)

Direct HTTP runs Expo Web at `http://localhost:8081` and Ktor at `http://localhost:8082`. The scripts load the ignored runtime env files automatically; no manual `$env:` values are required.

```powershell
.\server\scripts\env\local\http\start-all.ps1
.\server\scripts\env\local\http\stop-all.ps1
```

Individual components:

```powershell
.\server\scripts\env\local\http\start-backend.ps1
.\server\scripts\env\local\http\stop-backend.ps1
.\server\scripts\env\local\http\start-frontend.ps1
.\server\scripts\env\local\http\stop-frontend.ps1
```

The backend uses the repository Gradle development task `:server:run --no-daemon`. The frontend uses Expo Web on port 8081. Stop scripts refuse to stop an unrelated listener on the matching port.