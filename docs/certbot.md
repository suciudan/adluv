# TLS certificates

Configure HTTPS for the public app, site, CMS, CDN, and MCP origins you deploy. Use the certificate-management process appropriate to your hosting provider and reverse proxy.

If you use Certbot, follow its current [installation and certificate instructions](https://certbot.eff.org/instructions). DNS challenge credentials belong in protected files outside the repository; use a token scoped to the domains you control. Confirm automated renewal and reverse-proxy reload behavior on your deployment.

Keep the HTTPS origins in the server environment and `NEXT_PUBLIC_*` build settings consistent. See [Deployment](Deployment.md) for the application configuration.
