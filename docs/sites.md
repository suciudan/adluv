# Reverse proxy and asset hosting

Deploy the public surfaces on domains you control, for example `app.example.com`, `www.example.com`, `cms.example.com`, `cdn.example.com`, and `mcp.example.com`.

| Surface | Upstream |
| --- | --- |
| Product app | `127.0.0.1:3001` |
| Marketing site | `127.0.0.1:3000` |
| CMS | `127.0.0.1:3002` |
| Local asset server | `127.0.0.1:3101` |
| HTTP MCP | `127.0.0.1:3010` |

Configure TLS and forward the original host and protocol headers to web services. Configure request/body limits and timeouts for your workload. Restrict database access to the processes that need it.

MCP uses POST requests to `/mcp`. Preserve the `Authorization` header and configure `MCP_BASE_URL` to match its public HTTPS origin. Its `/healthz` endpoint is a process check, and its OAuth metadata lives under `/.well-known/`. It does not expose a standalone SSE stream.

For assets, either proxy the CDN process or serve `CDN_STORAGE_ROOT` directly through a static file server. Disable directory listing and keep the directory limited to content intended to be public. If using B2 for ad media, configure the separate ad asset origin and leave blog/CMS media on the general CDN origin as appropriate.

This repository does not supply a complete reverse-proxy configuration. See [Deployment](Deployment.md) for environment settings and [TLS certificates](certbot.md) for certificate guidance.
