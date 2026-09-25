# Dependency audit

Checked on **2026-09-25** with Node.js 24.15.0 and Yarn 4.13.0 against the committed lockfile.

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

The lockfile includes Next.js and `eslint-config-next` 16.3.5, React and React DOM 19.3.0, Motion 13.4.0, Drizzle ORM 0.45.2, `next-mdx-remote` 6.0.0, and Sharp 0.35.4.

Better Auth is constrained to **`~1.6.33`**. The application currently uses its legacy `mcp` plugin and OAuth database tables; Better Auth 1.7 removes that plugin. Updating to 1.7 requires an explicit migration to the newer OAuth provider with database and login-flow validation. The selected 1.6 release includes the [refresh-token authentication fix](https://github.com/advisories/GHSA-pw9m-5jxm-xr6h), and the registry audit reports no current Better Auth findings for it.

All workspace packages remain `private: true` to prevent accidental npm publication. The original project code uses the MIT license. Dependencies and redistributed assets retain their own licenses; see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Automated update policy

Dependabot groups React with React DOM and their types because the runtime packages must have matching versions. A React DOM-only update to 19.3.0 failed the existing server-rendering tests with React 19.2.8; updating both together resolves that failure. Next.js and its lint configuration are also grouped, as are GitHub Actions updates.

Routine version updates have three constraints in [.github/dependabot.yml](../.github/dependabot.yml):

| Dependency | Supported line | Requirement before lifting the constraint |
| --- | --- | --- |
| `@types/node` | 24.x (24.13.6 currently) | Upgrade the Node 24 runtime contract in `.nvmrc`, `package.json`, deployment documentation, and CI together. Node 26 declarations can expose APIs absent from the supported runtime. |
| `eslint` | 9.x (9.39.5 currently) | Wait for compatible Next.js React and accessibility plugins, then rerun the full lint suite. ESLint 10.10.0 currently crashes in `react/display-name` because the plugin calls the removed `context.getFilename()` API. Track [eslint-plugin-react #3977](https://github.com/jsx-eslint/eslint-plugin-react/issues/3977). |
| `better-auth` | 1.6.x (1.6.33 currently) | Follow the [1.7 migration guide](https://better-auth.com/docs/guides/1-7-upgrade-guide), replace the removed MCP plugin and legacy OAuth tables/endpoints, and verify provisioning, sign-in, consent, token exchange, and existing-data migration. The unmodified 1.7.4 update crashes on `mcp()` during app tests. |

These constraints use semantic update types instead of excluding vulnerable version ranges. Compatible patch updates continue, and [Dependabot security updates can still propose the minimum patched version](https://github.blog/changelog/2021-05-21-dependabot-version-updates-can-now-ignore-major-minor-patch-releases/). Any security fix that crosses a compatibility boundary still requires its associated migration and tests. The audit and alerts remain enabled, including the existing esbuild advisory.

## Reproduce

```bash
corepack enable
yarn install --immutable
yarn npm audit --all --recursive
yarn npm audit --all --recursive --severity high
```

The full audit exits unsuccessfully while the moderate entries remain. CI uses the second audit command to reject high and critical advisories. Registry results can change after this dated review.

The September 25 updates include Motion 13.4.0, Lucide React 1.47.0, Turbo 2.11.2, Marked 18.0.13, and Node 24.13.6 type declarations. Local validation passed an immutable install and focused runtime checks: all 89 imported Lucide icons and seven Motion marketing components rendered on the server, and eight CMS Markdown normalization cases passed using the actual editor functions.

The required CI workflow also checks the high/critical audit, public-export tests, unit tests, lint, typechecks, and production builds using synthetic configuration. Database integration tests are disabled in CI. These checks do not validate every browser flow, live advertising provider, email delivery, or object-storage integration.
