# Development

## Prerequisites

- Node.js 24 LTS and Yarn 4.13.0, pinned by the repository.
- MySQL 8 on a host you control; MySQL holds both application data and queued jobs.
- Chromium and its system libraries for Playwright tests and worker landing-page screenshots.
- Network access during dependency installation. Media processing uses native dependencies including Sharp and FFmpeg; availability depends on your operating system and CPU architecture.

Shell examples use a POSIX shell (Linux, macOS, or WSL). Windows users can run them in WSL. `docker-compose.yml` does not provision database services, and `yarn services:up` only prints a reminder to start MySQL separately.

```sh
corepack enable
yarn install --immutable
cp .env.example .env.local
yarn playwright install chromium
```

On a Linux machine that lacks browser libraries, use `yarn playwright install --with-deps chromium` with the privileges required to install system packages.

## Database and configuration

Create a dedicated development schema and account using your MySQL administrator connection:

```sql
CREATE DATABASE adluv CHARACTER SET utf8mb4;
CREATE USER 'adluv'@'localhost' IDENTIFIED BY 'replace-with-a-local-password';
GRANT ALL PRIVILEGES ON adluv.* TO 'adluv'@'localhost';
```

Set `DATABASE_URL` to that database, for example `mysql://adluv:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:3306/adluv`. URL-encode special characters in credentials. Use a database account appropriate for your connection host.

Set a unique `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://127.0.0.1:3001`, and matching `APP_URL` / `NEXT_PUBLIC_APP_URL`. Keep `SITE_URL`, `CMS_URL`, and their public counterparts on the same local hostname. Local cookie domain overrides can remain empty and local HTTP uses non-secure cookies.

Set both `CDN_URL` and `NEXT_PUBLIC_CDN_URL` to `http://127.0.0.1:3101`. Set `CDN_STORAGE_ROOT` to an absolute writable path, such as `/absolute/path/to/adluv/apps/cdn/storage`. The worker, CMS, and asset server must agree on this path. If you launch the standalone CDN process with custom settings, supply those values in its process environment; its entry point does not load dotenv files itself.

Most app and database entry points use the shared environment loader. It checks `.env.local` before `.env`, with explicit `ADLUV_ENV_DIR` or workspace-local configuration ahead of root configuration. Existing process variables win. Keep one root `.env.local` for a simple local setup and avoid conflicting workspace env files. Client-visible values must exist when Next.js builds; restarting a server does not replace values already embedded in the browser bundle.

```sh
yarn db:push
yarn db:verify
yarn auth:provision-user -- --email "owner@example.com" --username "owner" --name "Local Owner" --role owner
```

The commands above initialize an empty database from the current schema. The historical migration chain cannot bootstrap a fresh installation; see [Database workflow](database-workflow.md).

The provisioning CLI prompts for a password in an interactive terminal. It creates or updates an account, marks email verified, assigns a role, and initializes entitlements, notification settings, and a default workspace. See [Account provisioning](private-beta-account-provisioning.md). There is no public signup flow.

## Processes

Run each command in a separate terminal as needed:

| Command | Local address | Purpose |
| --- | --- | --- |
| `yarn app` | `http://127.0.0.1:3001` and port 3101 | Product app plus CDN |
| `yarn worker` | No HTTP listener | Queue consumer and scheduler |
| `yarn site` | `http://127.0.0.1:3000` | Marketing site; Brevo required |
| `yarn cms` | `http://127.0.0.1:3002` | Blog/media administration |
| `yarn cdn` | `http://127.0.0.1:3101` | Asset server alone |
| `yarn mcp:serve` | `http://127.0.0.1:3010/mcp` | HTTP MCP endpoint |

`yarn web` aliases `yarn app`. `yarn dev` starts all workspace development processes and needs their combined configuration.

Sign in at `/login` using the provisioned username. Use an `owner` or `admin` account for administrative features. Optional development quick login requires explicitly configured `LOCAL_DEV_AUTH_USERNAME` and `LOCAL_DEV_AUTH_PASSWORD`; normal account provisioning works without it.

## Integrations

| Feature | Configuration and requirements |
| --- | --- |
| Advertiser discovery and live ads | `WEBSCRAPINGAPI_API_KEY`; some paths use direct requests or proxy settings. Configure only providers you have permission to use. Source endpoints can change, reject requests, or rate-limit. |
| Proxy-backed source access | `WEBSCRAPINGAPI_PROXY_*`, `PROXIES_LIST`, `GOOGLE_RPC_PROXY_*`, or `META_PROXY_*` as applicable; see [Proxy lab](../apps/proxy-lab/README.md). No proxy credentials are included. |
| Alert email | Resend API key and verified `RESEND_FROM` sender. Without these, email delivery is unavailable. |
| Marketing waitlist | Brevo API key and list ID. Site startup validation requires both, including when building that surface. Use an account/list intended for your instance. |
| Operational Discord messages | Optional waitlist and error webhook URLs. Enabling them sends event/error information to the configured channels. |
| Ad object storage | Optional B2 endpoint, bucket, and application keys. Without B2, the worker stores assets on the local filesystem. Set `AD_ASSET_CDN_URL` and its public counterpart when serving these through a separate public origin. |
| Video transcription | Optional `OPENAI_API_KEY`; transcription sends media to the configured API and can incur provider charges. |
| Analytics and support chat | PostHog, Crisp, and the site's `GTM_CONTAINER_ID` are optional and disabled until configured. Use your own accounts. |

The app and worker fail startup when `DATABASE_URL` is missing; several incomplete integration settings produce warnings instead. A successful startup or health response does not prove that live collection, storage, or delivery works.

### Archive seeding

The checked-in `apps/worker/sources/initial-seed.csv` contains company names and industries, not ads. Seeding performs live discovery and writes collected records to your database. Inspect a dry run and start with a small selection:

```sh
yarn seed:initial-archive -- --dry-run
yarn seed:initial-archive -- --company "OpenAI" --sources linkedin
```

Other flags include `--sources linkedin,google`, `--offset`, `--limit`, and `--concurrency`. Review provider costs and collection rights before using bulk jobs. Backfill and migration scripts modify data; read their implementation and flags before running them.

### MCP

MCP uses the instance's database directly. The process needs `DATABASE_URL` as well as the configured app/auth origin; it is not a database-free remote client.

```sh
yarn workspace @adluv/mcp login
yarn workspace @adluv/mcp start
```

The first command opens browser OAuth login; the second starts the stdio server. Tokens are stored in `$XDG_CONFIG_HOME/adluv/mcp-auth.json`, or `~/.config/adluv/mcp-auth.json` by default. Run `yarn workspace @adluv/mcp logout` to clear that login. `ADLUV_MCP_ACCESS_TOKEN` supports manual token configuration.

For HTTP transport, use `yarn mcp:serve`. `MCP_HOST` and `MCP_PORT` control binding, `MCP_BASE_URL` advertises the public origin, and `MCP_ALLOWED_ORIGINS` extends allowed browser origins. HTTP calls require valid bearer tokens.

## Testing

```sh
yarn test
yarn typecheck
yarn lint
yarn build
```

Some workspaces have no unit suite. Database integration tests are opt-in; inspect their environment flags before enabling them. Production builds require configuration for the surfaces being built.

For browser coverage, create a separate disposable MySQL schema and set `E2E_DATABASE_URL`, for example `mysql://adluv_test:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:3306/adluv_e2e`. Provision a user with privileges limited to that test schema and initialize the empty schema with `yarn db:push` before running tests. Use a temporary process environment or isolated env directory to target that schema when initializing it.

```sh
yarn playwright install chromium
yarn test:e2e
```

Playwright starts the app on port 3100 and its setup starts the worker. Tests truncate their database and use fixture-mode ad fetching and fake email delivery. The reset helper requires the database name to contain `e2e` or `test`; still verify the full connection string yourself. Do not use the development or production schema. `yarn test:release` runs the unit and browser layers together.
