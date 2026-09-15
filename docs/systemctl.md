# Example systemd services

The files in [units/](units/) are adaptable examples for the app, CMS, marketing site, worker, and HTTP MCP service. Each assumes an unprivileged `adluv` account, a checkout at `/srv/adluv`, Yarn at `/usr/bin/yarn`, and a protected process environment file at `/etc/adluv/adluv.env`.

Create and permission those resources for your host before installing a unit. Replace the executable path with the actual Yarn path. Build the required workspaces before starting production services. Add a CDN/static-server service appropriate to your storage setup if needed.

Install and enable only the units you have configured. For example, after adapting the app unit:

```sh
sudo cp docs/units/adluv-app.service /etc/systemd/system/adluv-app.service
sudo systemctl daemon-reload
sudo systemctl enable --now adluv-app.service
sudo systemctl status adluv-app.service
journalctl -u adluv-app.service
```

Repeat for the other configured services. Avoid wildcard restarts on a host that may run additional AdLuv instances. See [Deployment](Deployment.md) for prerequisites, migration ordering, and health checks.
