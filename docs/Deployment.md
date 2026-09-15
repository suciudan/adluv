# Deployment

AdLuv needs a deployment you operate: a Node.js runtime, MySQL, persistent asset storage, and the external services you enable. The repository supplies source and example service units; it does not provision a hosted instance.

## Topology

| Process | Default port | Production command from the repository root |
| --- | --- | --- |
| Product app | 3001 | `yarn workspace @adluv/app start` |
| Worker | None | `yarn workspace @adluv/worker start` |
| Marketing site | 3000 | `yarn workspace @adluv/site start` |
| CMS | 3002 | `yarn workspace @adluv/cms start` |
| Asset server | 3101 | `yarn workspace @adluv/cdn start` |
| HTTP MCP | 3010 | `yarn workspace @adluv/mcp serve` |

The proxy lab is an operator tool, not a persistent production service. The stdio MCP command is intended for a client-launched process.

Use Node.js 24 LTS and the pinned Yarn release. Keep workspace sources and dependencies in deployments: shared packages expose TypeScript source, and the worker/MCP start scripts use `tsx`. Copying only each workspace's `dist` directory is insufficient.

## Configure and build

Review and adapt the included branding, contact addresses, legal pages, pricing, and waitlist copy before making your instance public. Those pages describe the original product and do not establish policies or support arrangements for your deployment.

1. Create a MySQL 8 database and credentials for your instance. Back up any existing database before a schema change.
2. Set secrets outside version control. Configure the process environment or protected env files, optionally using `ADLUV_ENV_DIR` to select them.
3. Set production app, site, CMS, auth, and CDN origins. Set `NODE_ENV=production` and a unique `BETTER_AUTH_SECRET`. Public origin variables must match the server configuration before building.
4. Provide a persistent writable `CDN_STORAGE_ROOT` shared by the worker and CMS and served by your asset host. Configure B2 and the ad asset origin if using object storage.
5. Configure Brevo if building/running the site, Resend for email, and the source-access services needed by the worker. Optional analytics, support chat, and webhooks should point to your accounts.
6. Install and validate the code:

```sh
yarn install --immutable
yarn db:check
yarn typecheck
yarn test
yarn build
```

`yarn deploy:preflight` combines migration metadata checks, typechecks, and builds. It does not verify live provider behavior or back up your database.

Install Chromium with its system dependencies on workers that capture landing pages. Preserve the bundled OCR data in `apps/worker/assets/tessdata`. Native media dependencies must match the deployment platform; review their redistribution licenses before shipping a prebuilt image.

## Schema and rollout

Read [Database workflow](database-workflow.md) before initializing or upgrading a database. The historical migration chain is incomplete for fresh installations. Existing databases need an individually reviewed migration plan; do not run the historical journal or direct schema push blindly against them.

Inspect pending SQL and rehearse on a restored or disposable database. `yarn db:migrate` applies checked-in journal entries and has baseline detection for some older schemas. Baseline detection is not a complete schema-drift audit. MySQL DDL may implicitly commit, so a failed migration is not guaranteed to roll back.

Use a maintenance window where required, stop incompatible workers/app versions, apply the reviewed changes, and run `yarn db:verify`. Start the newly built processes and provision your initial owner with the [account CLI](private-beta-account-provisioning.md). Do not use `db:push` or the migration-journal repair helper as an automatic production recovery step.

## Network and process management

Place web services behind your reverse proxy with TLS. Keep database access private. Configure cookie domains only for domains you control; the app infers a shared parent cookie domain from its configured site/app/CMS origins. Use consistent HTTPS origins in production.

[Example systemd units](units/) use `/srv/adluv` and an unprivileged `adluv` account. Adapt the paths, executable location, environment file, and permissions to your machine. [Systemd notes](systemctl.md) and [reverse-proxy notes](sites.md) describe the layout. The units are examples, not an automated installation.

The lightweight CDN server binds to `0.0.0.0` by default. Set `CDN_HOST=127.0.0.1` when a local reverse proxy fronts it. The asset directory is public content: keep secrets, credentials, and private files elsewhere. For production, a static file server or object-storage/CDN setup may be more suitable.

For HTTP MCP, set `MCP_BASE_URL` to its public HTTPS origin and allow only the browser origins you need. Forward authorization headers. `/mcp` accepts POST; it does not expose a standalone SSE stream. Avoid running browser OAuth login as part of server startup.

## Verify an instance

- Request app `/api/health`, asset server `/health`, and MCP `/healthz` for the processes you deploy.
- Run `yarn db:verify` and inspect worker/service logs.
- Sign in with a provisioned account and exercise account settings and access controls.
- With a permitted test advertiser, verify discovery, queued fetching, stored media, and any configured email delivery.
- For CMS/site changes, publish test content and inspect both the initial page load and client-side navigation.

Health endpoints and static checks cover only part of the system. Keep database and storage backups, monitor failed jobs, and document your own restore procedure. There is no managed deployment or service-level commitment attached to this source release.
