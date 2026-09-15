# Dependency audit

Checked on **2026-09-15** with Node.js 24.15.0 and Yarn 4.13.0 against the committed lockfile.

## Result

The full dependency audit reports **zero critical, high, or low findings**, with four moderate entries: one security advisory and three package deprecation notices. Deprecation notices are maintenance concerns; they are not additional confirmed vulnerabilities.

| Dependency | Locked version | Report | Follow-up |
| --- | --- | --- | --- |
| `esbuild` through `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils` | 0.18.20 | Moderate: [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) | Replace the legacy Drizzle CLI loader chain when upstream supports it. |
| `@esbuild-kit/core-utils` | 3.3.2 | Deprecated; merged into `tsx` | Follow the Drizzle CLI update. |
| `@esbuild-kit/esm-loader` | 2.6.5 | Deprecated; merged into `tsx` | Follow the Drizzle CLI update. |
| `eslint` | 9.39.5 | Unsupported release line | Upgrade together with the Next.js lint configuration and plugins. |

The esbuild issue affects its own development server: another website can read responses because of its permissive CORS behavior. Upstream fixes this in esbuild 0.25.0 and later. Adluv starts the Next.js development server and does not invoke esbuild's `serve` feature. Do not run the affected esbuild server from this dependency tree. The package remains in the lockfile, so the full audit intentionally continues to report it. No advisory is allowlisted or hidden.

## Compatibility choices

The lockfile includes Next.js and `eslint-config-next` 16.3.5, React and React DOM 19.2.8, Drizzle ORM 0.45.2, `next-mdx-remote` 6.0.0, and Sharp 0.35.4.

Better Auth is constrained to **`~1.6.33`**. The application currently uses its legacy `mcp` plugin and OAuth database tables; Better Auth 1.7 removes that plugin. Updating to 1.7 requires an explicit migration to the newer OAuth provider with database and login-flow validation. The selected 1.6 release includes the [refresh-token authentication fix](https://github.com/advisories/GHSA-pw9m-5jxm-xr6h), and the registry audit reports no current Better Auth findings for it.

All workspace packages remain `private: true` to prevent accidental npm publication. The original project code uses the MIT license. Dependencies and redistributed assets retain their own licenses; see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Reproduce

```bash
corepack enable
yarn install --immutable
yarn npm audit --all --recursive
yarn npm audit --all --recursive --severity high
```

The full audit exits unsuccessfully while the moderate entries remain. CI uses the second audit command to reject high and critical advisories. Registry results can change after this dated review.

Local validation of this lockfile included 71 passing unit tests with one database integration test skipped, all 12 workspace typechecks and builds, and all 11 lint tasks. Lint still reports existing warnings. Builds used synthetic configuration and did not require external accounts. These checks do not validate every browser flow, live advertising provider, email delivery, or object-storage integration.